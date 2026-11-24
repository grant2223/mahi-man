import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { admin, feePaid, refreshWorker, releaseJob, setting, stripe } from "./payments.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, "Content-Type": "application/json" } });

function validAbn(abn: string): boolean {
  const d = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const n = d.split("").map(Number);
  n[0] -= 1;
  return n.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return fail("Please sign in again", 401);
    const body = await req.json();
    const { data: me } = await admin.from("profiles").select("*").eq("id", user.id).single();
    // Staff roles: which parts of the admin this person may act on (owner, admin, support, finance).
    const can = async (...areas: string[]) => {
      for (const a of areas) { const { data } = await admin.rpc("staff_can_user", { p_user: user.id, p_area: a }); if (data === true) return true; }
      return false;
    };

    switch (body.action) {
      // ---------- Customer ----------
      case "pay_job": {
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).eq("customer_id", user.id).single();
        if (!job) return fail("Job not found");
        if (job.status !== "awaiting_payment") return fail("This job is already paid");
        const s = stripe();
        let pi;
        if (job.payment_intent_id) pi = await s.paymentIntents.retrieve(job.payment_intent_id);
        if (!pi || pi.status === "canceled") {
          pi = await s.paymentIntents.create({
            amount: job.price_cents + job.fee_cents,
            currency: "aud",
            capture_method: "manual",
            automatic_payment_methods: { enabled: true },
            description: "Mahi Man booking",
            metadata: { job_id: job.id, kind: "job" },
          });
          await admin.from("jobs").update({ payment_intent_id: pi.id }).eq("id", job.id);
        }
        return ok({ client_secret: pi.client_secret, publishable_key: await setting("stripe_publishable_key") });
      }
      case "payment_done": {
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).eq("customer_id", user.id).single();
        if (!job?.payment_intent_id) return fail("Job not found");
        if (job.status !== "awaiting_payment") return ok({ status: job.status });
        const pi = await stripe().paymentIntents.retrieve(job.payment_intent_id);
        if (pi.status !== "requires_capture") return fail("Your card was not approved. Try another card.");
        await admin.rpc("job_card_held", { p_job: job.id, p_intent: pi.id });
        return ok({ status: "searching" });
      }
      case "pay_extra": {
        const { data: er } = await admin.from("extra_requests").select("*, jobs!inner(customer_id,status)")
          .eq("id", body.request_id).single();
        if (!er || er.jobs.customer_id !== user.id) return fail("Request not found");
        if (er.status !== "pending") return fail("This request is already answered");
        const s = stripe();
        let pi = er.payment_intent_id ? await s.paymentIntents.retrieve(er.payment_intent_id) : null;
        if (!pi || pi.status === "canceled") {
          pi = await s.paymentIntents.create({
            amount: er.amount_cents,
            currency: "aud",
            capture_method: "manual",
            automatic_payment_methods: { enabled: true },
            description: "Mahi Man extra",
            metadata: { job_id: er.job_id, request_id: er.id, kind: "extra" },
          });
          await admin.from("extra_requests").update({ payment_intent_id: pi.id }).eq("id", er.id);
        }
        return ok({ client_secret: pi.client_secret, publishable_key: await setting("stripe_publishable_key") });
      }
      case "extra_done": {
        const { data: er } = await admin.from("extra_requests").select("*, jobs!inner(customer_id,extra_cents)")
          .eq("id", body.request_id).single();
        if (!er || er.jobs.customer_id !== user.id || !er.payment_intent_id) return fail("Request not found");
        if (er.status === "approved") return ok({});
        const pi = await stripe().paymentIntents.retrieve(er.payment_intent_id);
        if (pi.status !== "requires_capture") return fail("Your card was not approved. Try another card.");
        await admin.rpc("extra_card_held", { p_request: er.id, p_intent: pi.id });
        return ok({});
      }
      case "confirm_job": {
        const { data: job } = await admin.from("jobs").select("customer_id,status").eq("id", body.job_id).single();
        if (!job || job.customer_id !== user.id) return fail("Job not found");
        if (job.status !== "finished") return fail("This job is not finished yet");
        await releaseJob(body.job_id);
        return ok({ status: "confirmed" });
      }
      // The customer cancels. The rules (free, $20 once the worker is on the way, free if they're late) and who owes whom
      // are worked out in the database; this adds the card side when payments are on.
      case "cancel_job": {
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).single();
        if (!job || job.customer_id !== user.id) return fail("Job not found");
        // The reason is required from this build on; older app builds don't send one yet.
        const reason = String(body.reason ?? "").trim().slice(0, 300) || "Not given (older app)";
        const { data: terms, error } = await admin.rpc("do_customer_cancel", { p_job: job.id, p_customer: user.id, p_reason: reason });
        if (error) return fail(error.message);
        const fee = terms.kind === "fee" ? Number(terms.fee_cents) : 0;
        let paid = false;
        // Booking fee: kept once the worker is on the way, refunded otherwise.
        if (job.fee_status === "paid" && fee === 0) await refundFee(job);
        if (job.payment_intent_id) {
          // Paid in the app: release the hold, keeping the cancellation fee (and the booking fee) when there is one.
          const s = stripe();
          const pi = await s.paymentIntents.retrieve(job.payment_intent_id);
          if (pi.status === "requires_capture" && fee > 0) {
            const cap = await s.paymentIntents.capture(pi.id, { amount_to_capture: fee + (job.fee_status === "paid" ? 0 : job.fee_cents) });
            await feePaid(terms.fee_id, job.worker_id, fee, cap.latest_charge, job.id);
            paid = true;
          } else if (["requires_capture", "requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status)) {
            await s.paymentIntents.cancel(pi.id);
          }
        } else if (fee > 0 && terms.fee_id && me?.card_pm && Deno.env.get("STRIPE_SECRET_KEY")) {
          // Saved card: charge it now. If it fails, the customer pays the worker directly, like the job itself.
          paid = await chargeFee(terms.fee_id, user.id, user.email ?? undefined).catch(() => false);
        }
        return ok({ kind: terms.kind, fee_cents: fee, fee_id: terms.fee_id ?? null, paid, cancelled_at: terms.cancelled_at, cancels_30: terms.cancels_30, cancel_limit: terms.cancel_limit, paused_until: terms.paused_until ?? null });
      }
      // Pay a cancellation fee you owe with your saved card.
      case "pay_fee": {
        const { data: f } = await admin.from("fees_owed").select("*").eq("id", body.fee_id).eq("payer_id", user.id).eq("status", "open").single();
        if (!f) return fail("Nothing to pay");
        if (!me?.card_pm) return fail("Add a card first");
        const done = await chargeFee(f.id, user.id, user.email ?? undefined).catch(() => false);
        return done ? ok({ paid: true }) : fail("Your card was declined. Add another card and try again.");
      }
      case "worker_payouts": {
        const { data: w } = await admin.from("workers").select("*").eq("id", user.id).single();
        if (!w) return fail("Start your worker sign-up first");
        const s = stripe();
        let acct = w.stripe_account_id;
        if (!acct) {
          const a = await s.accounts.create({
            type: "express",
            country: "AU",
            email: user.email,
            business_type: "individual",
            capabilities: { transfers: { requested: true } },
            business_profile: { mcc: "7349", product_description: "Jobs booked through Mahi Man" },
            metadata: { user_id: user.id },
          });
          acct = a.id;
          await admin.from("workers").update({ stripe_account_id: acct }).eq("id", user.id);
        }
        const link = await s.accountLinks.create({
          account: acct,
          type: "account_onboarding",
          refresh_url: body.return_url,
          return_url: body.return_url,
        });
        return ok({ url: link.url });
      }
      case "worker_save": {
        // ABN is checked here so a typo never blocks a payout later.
        if (body.abn !== undefined && body.abn !== "" && !validAbn(body.abn)) return fail("That ABN doesn't look right. Check the 11 digits.");
        if (body.payid !== undefined && String(body.payid).trim() !== "") {
          const pid = String(body.payid).trim();
          const phone = pid.replace(/[\s-]/g, "");
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pid);
          const isPhone = /^(\+61|0)4\d{8}$/.test(phone);
          const isAbn = validAbn(pid);
          if (!isEmail && !isPhone && !isAbn) return fail("Enter the mobile number, email or ABN your PayID is set up with.");
          body.payid = isPhone ? phone : isAbn ? pid.replace(/\s/g, "") : pid.toLowerCase();
        }
        // Or a plain bank account: BSB is 6 digits, account number 5 to 10.
        for (const k of ["bsb", "account_number"]) if (body[k] !== undefined) body[k] = String(body[k]).replace(/\D/g, "");
        if (body.bsb && !/^\d{6}$/.test(body.bsb)) return fail("A BSB is 6 digits.");
        if (body.account_number && !/^\d{5,10}$/.test(body.account_number)) return fail("Check your account number.");
        if (!!body.bsb !== !!body.account_number && (body.bsb !== undefined || body.account_number !== undefined)) return fail("Add both your BSB and account number.");
        const patch: Record<string, unknown> = {};
        // Insurance only comes through a checked certificate (Licences and certificates), never straight from the phone.
        for (const k of ["abn", "payid", "bsb", "account_number", "has_vehicle", "base_suburb_id", "radius_km"]) {
          if (body[k] === undefined) continue;
          const v = k === "abn" ? String(body.abn).replace(/\s/g, "") : body[k];
          patch[k] = ["abn", "payid", "bsb", "account_number"].includes(k) && v === "" ? null : v;
        }
        await admin.from("workers").update(patch).eq("id", user.id);
        return ok(await refreshWorker(user.id));
      }
      case "worker_status": {
        return ok(await refreshWorker(user.id));
      }

      // ---------- Admin ----------
      case "admin_resolve": {
        if (!(await can("people"))) return fail("Your staff role can't do this", 403);
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).single();
        if (!job) return fail("Job not found");
        if (job.status !== "disputed") return fail("This job is not in dispute");
        const outcome = String(body.outcome ?? "");
        const note = String(body.note ?? "").trim();
        const now = new Date().toISOString();
        if (!note) return fail("Write a note to both");
        let amount: number | null = null;
        if (outcome === "pay_full") {
          await releaseJob(job.id);
          amount = job.price_cents + job.extra_cents;
        } else if (outcome === "return_finish") {
          await admin.from("jobs").update({ status: "finished", finished_at: now, customer_paid_at: null }).eq("id", job.id);
          amount = job.price_cents + job.extra_cents;
        } else if (outcome === "part") {
          if (job.payment_intent_id) return fail("Part payments aren't available on card jobs yet");
          amount = Math.round(Number(body.amount_cents));
          if (!Number.isFinite(amount) || amount <= 0 || amount >= job.price_cents + job.extra_cents) return fail("Enter a part amount less than the full price");
          await admin.from("jobs").update({ status: "confirmed", confirmed_at: now }).eq("id", job.id);
        } else if (outcome === "nothing") {
          amount = 0;
          if (job.payment_intent_id) {
            const s = stripe();
            const ids = [job.payment_intent_id];
            const { data: extras } = await admin.from("extra_requests").select("payment_intent_id").eq("job_id", job.id).eq("status", "approved");
            for (const e of extras ?? []) if (e.payment_intent_id) ids.push(e.payment_intent_id);
            for (const id of ids) {
              if (!id) continue;
              const pi = await s.paymentIntents.retrieve(id);
              if (pi.status === "requires_capture") await s.paymentIntents.cancel(id);
              else if (pi.status === "succeeded") await s.refunds.create({ payment_intent: id }, { idempotencyKey: `refund-${id}` });
            }
          }
          await admin.from("jobs").update({ status: "refunded" }).eq("id", job.id);
        } else return fail("Pick an outcome");
        const pause = body.pause_user && [job.customer_id, job.worker_id].includes(body.pause_user) ? String(body.pause_user) : null;
        if (pause) {
          await admin.from("profiles").update({ suspended: true }).eq("id", pause);
          await admin.from("workers").update({ suspended: true }).eq("id", pause);
        }
        await admin.from("incidents").update({ resolved: true, outcome, amount_cents: amount, decision_note: note, decided_at: now, paused_user: pause })
          .eq("job_id", job.id).eq("resolved", false);
        return ok({});
      }
      case "admin_approve_worker": {
        if (!(await can("checks"))) return fail("Your staff role can't do this", 403);
        await admin.from("workers").update({ admin_approved: !!body.approved }).eq("id", body.worker_id);
        return ok(await refreshWorker(body.worker_id));
      }
      case "admin_id_decide": {
        if (!(await can("checks"))) return fail("Your staff role can't do this", 403);
        const { data: chk } = await admin.from("id_checks").select("*").eq("id", body.check_id).single();
        if (!chk) return fail("Check not found");
        if (chk.status !== "pending") return fail("This check has already been decided");
        const decision = String(body.decision);
        if (!["approve", "retake", "reject"].includes(decision)) return fail("Pick approve, retake or reject");
        const reason = String(body.reason ?? "").trim();
        if (decision !== "approve" && !reason) return fail("Pick a reason so they know what to fix");
        const status = decision === "approve" ? "approved" : decision === "retake" ? "retake" : "rejected";
        // ID photos are deleted the moment a decision is made: only the result is kept.
        const paths = [chk.doc_path, chk.selfie_path].filter(Boolean) as string[];
        if (paths.length) await admin.storage.from("ids").remove(paths);
        await admin.from("id_checks").update({ status, reason: reason || null, decided_at: new Date().toISOString(), doc_path: null, selfie_path: null }).eq("id", chk.id);
        await admin.from("profiles").update({ id_status: decision === "approve" ? "verified" : status, id_note: reason || null }).eq("id", chk.user_id);
        const { data: w } = await admin.from("workers").select("id").eq("id", chk.user_id).maybeSingle();
        if (w) {
          await admin.from("workers").update({ admin_approved: decision === "approve" }).eq("id", chk.user_id);
          await refreshWorker(chk.user_id);
        }
        return ok({});
      }
      // ---------- Saved card for the booking fee ----------
      case "card_setup": {
        const s = stripe();
        const customer = await customerFor(user.id, user.email ?? "", me?.full_name ?? "");
        const si = await s.setupIntents.create({ customer, usage: "off_session", automatic_payment_methods: { enabled: true }, metadata: { user_id: user.id } });
        return ok({ client_secret: si.client_secret, publishable_key: await setting("stripe_publishable_key") });
      }
      case "card_saved": {
        const s = stripe();
        const si = await s.setupIntents.retrieve(String(body.setup_intent_id));
        if (si.metadata?.user_id !== user.id || si.status !== "succeeded" || !si.payment_method) return fail("That card didn't save. Try again.");
        const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;
        const pm = await s.paymentMethods.retrieve(pmId);
        if (me?.card_pm && me.card_pm !== pmId) await s.paymentMethods.detach(me.card_pm).catch(() => {});
        await s.customers.update(String(si.customer), { invoice_settings: { default_payment_method: pmId } });
        const card = { card_pm: pmId, card_brand: pm.card?.brand ?? pm.type, card_last4: pm.card?.last4 ?? "", card_exp: pm.card ? `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}` : "", card_keep: body.keep !== false };
        await admin.from("profiles").update(card).eq("id", user.id);
        return ok(card);
      }
      case "card_remove": {
        if (me?.card_pm) await stripe().paymentMethods.detach(me.card_pm).catch(() => {});
        await admin.from("profiles").update({ card_pm: null, card_brand: null, card_last4: null, card_exp: null, card_keep: true }).eq("id", user.id);
        return ok({ removed: true });
      }
      // ---------- Top up the balance with the saved card ----------
      case "topup_card": {
        const amount = Number(body.amount);
        const { data: amountOk } = await admin.rpc("topup_amount_ok", { p_amount: amount });
        if (amountOk !== true) return fail("Select one of the top-up amounts");
        if (!me?.card_pm || !me.stripe_customer_id) return fail("Add a card first");
        try {
          const pi = await stripe().paymentIntents.create({
            amount, currency: "aud", customer: me.stripe_customer_id, payment_method: me.card_pm, off_session: true, confirm: true,
            receipt_email: user.email ?? undefined, description: "Mahi Man top-up", metadata: { user_id: user.id, kind: "topup" },
            statement_descriptor_suffix: "MAHI MAN",
          }, { idempotencyKey: `topup-${user.id}-${body.key ?? crypto.randomUUID()}` });
          if (pi.status === "requires_action") return ok({ action: "authenticate", client_secret: pi.client_secret, publishable_key: await setting("stripe_publishable_key") });
          if (pi.status !== "succeeded") return fail("The payment is still going through. Your balance updates once it does.");
          await admin.rpc("topup_card_paid", { p_user: user.id, p_amount: amount, p_intent: pi.id });
          return ok({ done: true });
        } catch (e) {
          const err = e as { code?: string; raw?: { payment_intent?: { client_secret: string } } };
          if (err.code === "authentication_required" && err.raw?.payment_intent) {
            return ok({ action: "authenticate", client_secret: err.raw.payment_intent.client_secret, publishable_key: await setting("stripe_publishable_key") });
          }
          return fail("Your card was declined. Add another card, or top up by bank transfer.");
        }
      }
      // After the bank's own check (3D Secure) on a card top-up.
      case "topup_card_done": {
        const pi = await stripe().paymentIntents.retrieve(String(body.payment_intent_id));
        if (pi.metadata?.user_id !== user.id || pi.metadata?.kind !== "topup") return fail("Top-up not found");
        if (pi.status !== "succeeded") return fail("The payment didn't go through. Try again.");
        await admin.rpc("topup_card_paid", { p_user: user.id, p_amount: pi.amount, p_intent: pi.id });
        return ok({ done: true });
      }
      // ---------- Pay for a gift card with the saved card ----------
      case "gift_card": {
        const { data: g } = await admin.from("gift_cards").select("*").eq("id", body.gift_id).eq("buyer_id", user.id).single();
        if (!g) return fail("Gift card not found");
        if (g.status === "paid") return ok({ done: true });
        if (g.via !== "card" || g.status !== "requested") return fail("This gift card is paid by bank transfer");
        if (!me?.card_pm || !me.stripe_customer_id) return fail("Add a card first");
        try {
          const pi = await stripe().paymentIntents.create({
            amount: g.amount_cents, currency: "aud", customer: me.stripe_customer_id, payment_method: me.card_pm, off_session: true, confirm: true,
            receipt_email: user.email ?? undefined, description: `Mahi Man gift card for ${g.to_name}`, metadata: { user_id: user.id, kind: "gift", gift_id: String(g.id) },
            statement_descriptor_suffix: "MAHI MAN",
          }, { idempotencyKey: `gift-${g.id}` });
          if (pi.status === "requires_action") return ok({ action: "authenticate", client_secret: pi.client_secret, publishable_key: await setting("stripe_publishable_key") });
          if (pi.status !== "succeeded") return fail("The payment is still going through. Your gift sends once it does.");
          await admin.rpc("gift_mark_paid", { p_id: g.id, p_intent: pi.id });
          return ok({ done: true });
        } catch (e) {
          const err = e as { code?: string; raw?: { payment_intent?: { client_secret: string } } };
          if (err.code === "authentication_required" && err.raw?.payment_intent) {
            return ok({ action: "authenticate", client_secret: err.raw.payment_intent.client_secret, publishable_key: await setting("stripe_publishable_key") });
          }
          return fail("Your card was declined. Add another card, or pay by bank transfer.");
        }
      }
      case "gift_card_done": {
        const pi = await stripe().paymentIntents.retrieve(String(body.payment_intent_id));
        if (pi.metadata?.user_id !== user.id || pi.metadata?.kind !== "gift" || pi.metadata?.gift_id !== String(body.gift_id)) return fail("Gift card not found");
        if (pi.status !== "succeeded") return fail("The payment didn't go through. Try again.");
        await admin.rpc("gift_mark_paid", { p_id: Number(body.gift_id), p_intent: pi.id });
        return ok({ done: true });
      }
      // Charge the booking fee to the saved card, then book the worker. If booking fails, the fee goes straight back.
      case "choose_worker": {
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).eq("customer_id", user.id).single();
        if (!job) return fail("Job not found");
        if (job.status !== "searching") return fail("This job already has someone");
        let charged: string | null = null;
        if (job.fee_status === "due" && job.fee_cents > 0) {
          const s = stripe();
          let pi = job.fee_payment_intent ? await s.paymentIntents.retrieve(job.fee_payment_intent) : null;
          if (!pi || !["succeeded", "requires_action", "processing"].includes(pi.status)) {
            if (!me?.card_pm) return fail("Add a card for the booking fee");
            try {
              pi = await s.paymentIntents.create({
                amount: job.fee_cents, currency: "aud", customer: me.stripe_customer_id, payment_method: me.card_pm,
                off_session: true, confirm: true, receipt_email: user.email ?? undefined,
                description: `Mahi Man booking fee: ${job.title ?? "a job"}`, metadata: { job_id: job.id, kind: "booking_fee" },
                statement_descriptor_suffix: "MAHI MAN",
              });
            } catch (e) {
              const err = e as { code?: string; raw?: { payment_intent?: { id: string; client_secret: string } } };
              if (err.code === "authentication_required" && err.raw?.payment_intent) {
                await admin.from("jobs").update({ fee_payment_intent: err.raw.payment_intent.id }).eq("id", job.id);
                return ok({ action: "authenticate", client_secret: err.raw.payment_intent.client_secret, publishable_key: await setting("stripe_publishable_key") });
              }
              return fail("Your card was declined. Add another card and try again.");
            }
          }
          if (pi.status === "requires_action") {
            await admin.from("jobs").update({ fee_payment_intent: pi.id }).eq("id", job.id);
            return ok({ action: "authenticate", client_secret: pi.client_secret, publishable_key: await setting("stripe_publishable_key") });
          }
          if (pi.status !== "succeeded") return fail("The payment is still going through. Try again in a moment.");
          await admin.from("jobs").update({ fee_status: "paid", fee_payment_intent: pi.id, fee_paid_at: new Date().toISOString() }).eq("id", job.id);
          charged = pi.id;
        }
        const { error } = await userClient.rpc("choose_offer", { p_job: job.id, p_worker: body.worker_id });
        if (error) {
          if (charged) {
            await stripe().refunds.create({ payment_intent: charged }, { idempotencyKey: `fee-undo-${charged}` });
            await admin.from("jobs").update({ fee_status: "due", fee_payment_intent: null, fee_paid_at: null }).eq("id", job.id);
          }
          return fail(error.message);
        }
        if (charged && me && !me.card_keep && me.card_pm) {
          await stripe().paymentMethods.detach(me.card_pm).catch(() => {});
          await admin.from("profiles").update({ card_pm: null, card_brand: null, card_last4: null, card_exp: null, card_keep: true }).eq("id", user.id);
        }
        return ok({ booked: true, fee_cents: charged ? job.fee_cents : 0 });
      }
      case "admin_fee_refund": {
        if (!(await can("people", "money"))) return fail("Your staff role can't do this", 403);
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).single();
        if (!job || job.fee_status !== "paid") return fail("No booking fee to refund on this job");
        await refundFee(job);
        return ok({ refunded_cents: job.fee_cents });
      }
      // Short-lived Apple Maps token for the live map.
      case "map_token": {
        return ok({ token: await mapToken() });
      }

      case "delete_account": {
        if (body.confirm !== "DELETE") return fail("Type DELETE to confirm");
        const uid = user.id;
        if (me?.stripe_customer_id) await stripe().customers.del(me.stripe_customer_id).catch(() => {});
        for (const bucket of ["avatars", "ids", "job-media", "insurance", "receipts"]) {
          const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
          const paths = (files ?? []).map((f) => `${uid}/${f.name}`);
          if (paths.length) await admin.storage.from(bucket).remove(paths);
        }
        const { error: purgeErr } = await admin.rpc("purge_user", { p_user: uid });
        if (purgeErr) return fail(purgeErr.message, 500);
        const { error: delErr } = await admin.auth.admin.deleteUser(uid);
        if (delErr) return fail(delErr.message, 500);
        return ok({ deleted: true });
      }
      case "tidy_text": {
        const raw = String(body.text ?? "").trim().slice(0, 4000);
        if (!raw) return fail("Nothing was heard. Try again.");
        const key = Deno.env.get("ANTHROPIC_API_KEY");
        if (!key) return ok({ text: basicTidy(raw), ai: false });
        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-haiku-5-5",
              max_tokens: 400,
              system: "You turn a customer's spoken description of an odd job into a clear, specific job description a worker can follow. Keep every detail they gave, add nothing they did not say, use plain Australian English, 2 to 5 short sentences, no greeting, no bullet points.",
              messages: [{ role: "user", content: `Job type: ${String(body.job_name ?? "")}\nWhat they said: ${raw}` }],
            }),
          });
          const j = await r.json();
          if (!r.ok) console.error("tidy_text: Claude said", r.status, JSON.stringify(j).slice(0, 500));
          const text = replyText(j).trim();
          return ok({ text: text || basicTidy(raw), ai: !!text });
        } catch (e) {
          console.error("tidy_text failed:", e instanceof Error ? e.message : String(e));
          return ok({ text: basicTidy(raw), ai: false });
        }
      }
      // "Just say it" and "Snap it": what they said, typed or showed in photos in; the whole job out —
      // its name, description, kinds of work (main one first), skills, what needs doing, what's not included.
      case "fill_job": {
        const raw = String(body.text ?? "").trim().slice(0, 4000);
        const images = (Array.isArray(body.images) ? body.images : []).map(String).filter((x: string) => x.length > 100 && x.length < 3_000_000).slice(0, 6);
        if (!raw && !images.length) return fail("Nothing was heard. Try again.");
        const cats = (Array.isArray(body.categories) ? body.categories : []) as { id: number; name: string; skills: { id: number; name: string }[] }[];
        const key = Deno.env.get("ANTHROPIC_API_KEY");
        if (!key) return ok({ ai: false });
        try {
          const list = cats.map((c) => `${c.id}: ${c.name} (skills: ${c.skills.map((k) => `${k.id} ${k.name}`).join("; ")})`).join("\n");
          const content: unknown[] = images.map((data: string) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
          content.push({ type: "text", text: `Categories:\n${list}\n\n${raw ? `What they said: ${raw}` : "They only sent the photos above."}` });
          const o = await claudeJson(key, 2000,
            "You turn a customer's description of an odd job (spoken, typed, or shown in photos) into a job post a worker can follow. Keep every detail they gave or that the photos clearly show, and add nothing else. Write it as plain instructions for the worker, like \"Clear the long weeds along the back fence.\", and never mention the photos or the customer. Plain Australian English. Reply with JSON only, no other text: {\"title\": a short name for the whole job, 2 to 4 words, like \"Backyard clean-up\", \"details\": 2 to 5 short sentences, \"category_ids\": ids from the list of every kind of work in the job, the main one first, up to 3 and often just 1, \"skill_ids\": ids of skills from those categories that the job clearly needs (often none), \"included\": the separate tasks the worker must do, one task per item, each under 60 characters, \"excluded\": things they said are not part of the job, often none}.",
            content);
          const ids = (Array.isArray(o.category_ids) ? o.category_ids : [o.category_id]).map(Number).filter((id: number) => cats.some((c) => c.id === id));
          const chosen = [...new Set(ids)].slice(0, 3) as number[];
          const strs = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
          return ok({
            ai: true,
            title: String(o.title ?? "").trim().slice(0, 60) || null,
            details: String(o.details ?? "").trim() || raw,
            category_id: chosen[0] ?? null,
            extra_category_ids: chosen.slice(1),
            skill_ids: (Array.isArray(o.skill_ids) ? o.skill_ids : []).map(Number)
              .filter((id: number) => cats.some((c) => chosen.includes(c.id) && c.skills.some((k) => k.id === id))),
            included: strs(o.included, 12), excluded: strs(o.excluded, 12),
          });
        } catch (e) {
          console.error("fill_job failed:", e instanceof Error ? e.message : String(e));
          return ok({ ai: false });
        }
      }
      // Licence scan: a photo or PDF of a licence or certificate in; its type, number, expiry and name out.
      // The worker checks what was read before it's sent, and admin still approves every one.
      case "read_credential": {
        const data = String(body.file ?? "");
        const media = body.media === "application/pdf" ? "application/pdf" : "image/jpeg";
        if (data.length < 100 || data.length > 8_000_000) return fail("Take the photo again");
        const types = (Array.isArray(body.types) ? body.types : []) as { id: number; name: string }[];
        const key = Deno.env.get("ANTHROPIC_API_KEY");
        if (!key) return ok({ ai: false });
        try {
          const doc = media === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: media, data } }
            : { type: "image", source: { type: "base64", media_type: media, data } };
          const o = await claudeJson(key, 1500,
            "You read a photo or PDF of an Australian licence, card or certificate (for example a Blue Card, White Card, RSA, first aid certificate, trade licence or a public liability insurance certificate of currency). In Queensland a Working with Children Check card is called a Blue Card, and a White Card is the construction induction card. Report only what is printed on it and never guess. Reply with JSON only, no other text: {\"readable\": true or false, \"problem\": null, or one short sentence the person can act on, like \"The photo is blurry. Take it again.\", \"Part of the card is cut off. Get the whole card in.\", \"There's glare over the card. Tilt it away from the light.\" or \"This isn't a licence or certificate.\", \"type_id\": the matching id from the list or null, \"number\": the licence, card or policy number exactly as printed, or null, \"expiry\": the expiry date as YYYY-MM-DD, or null if it has none, \"name\": the holder's or insured's name as printed, or null}.",
            [doc, { type: "text", text: `Types:\n${types.map((t) => `${t.id}: ${t.name}`).join("\n")}` }]);
          const name = o.name ? String(o.name).trim() : null;
          const words = (x: string) => x.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 1);
          const mine = words(String(me?.full_name ?? ""));
          const theirs = name ? words(name) : [];
          const nameMatch = mine.length > 0 && theirs.length > 0 && theirs.includes(mine[0]) && theirs.includes(mine[mine.length - 1]);
          const expiry = typeof o.expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.expiry) ? o.expiry : null;
          return ok({
            ai: true, readable: o.readable !== false, problem: o.problem ? String(o.problem) : null,
            type_id: types.some((t) => t.id === Number(o.type_id)) ? Number(o.type_id) : null,
            number: o.number ? String(o.number).trim().slice(0, 40) : null, expiry, name, name_match: nameMatch,
          });
        } catch (e) {
          console.error("read_credential failed:", e instanceof Error ? e.message : String(e));
          return ok({ ai: false });
        }
      }
      default:
        return fail("Unknown action");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg, 500);
  }
});

// Charges a fee someone owes to their saved card, then passes it on to the worker it's owed to.
async function chargeFee(feeId: number, uid: string, email?: string): Promise<boolean> {
  const { data: f } = await admin.from("fees_owed").select("*").eq("id", feeId).single();
  const { data: p } = await admin.from("profiles").select("stripe_customer_id, card_pm").eq("id", uid).single();
  if (!f || f.status !== "open" || !p?.card_pm || !p.stripe_customer_id) return false;
  const pi = await stripe().paymentIntents.create({
    amount: f.amount_cents, currency: "aud", customer: p.stripe_customer_id, payment_method: p.card_pm, off_session: true, confirm: true,
    receipt_email: email, description: "Mahi Man cancellation fee", metadata: { fee_id: String(f.id), job_id: f.job_id ?? "", kind: f.kind },
    statement_descriptor_suffix: "MAHI MAN",
  }, { idempotencyKey: `fee-${f.id}` });
  if (pi.status !== "succeeded") return false;
  await feePaid(f.id, f.payee_id, f.amount_cents, pi.latest_charge, f.job_id);
  return true;
}

async function customerFor(uid: string, email: string, name: string): Promise<string> {
  const { data: p } = await admin.from("profiles").select("stripe_customer_id").eq("id", uid).single();
  if (p?.stripe_customer_id) return p.stripe_customer_id;
  const c = await stripe().customers.create({ email, name, metadata: { user_id: uid } }, { idempotencyKey: `customer-${uid}` });
  await admin.from("profiles").update({ stripe_customer_id: c.id }).eq("id", uid);
  return c.id;
}

// Booking fee back to the customer's card, and they're told.
async function refundFee(job: { id: string; customer_id: string; fee_payment_intent: string | null; fee_cents: number; title: string | null }) {
  if (job.fee_payment_intent) await stripe().refunds.create({ payment_intent: job.fee_payment_intent }, { idempotencyKey: `fee-refund-${job.id}` });
  await admin.from("jobs").update({ fee_status: "refunded", fee_refunded_at: new Date().toISOString() }).eq("id", job.id);
  await admin.rpc("notify", {
    p_user: job.customer_id, p_title: "Booking fee refunded",
    p_body: `$${(job.fee_cents / 100).toFixed(2)} is on its way back to your card. It can take 5 to 10 days to show.`, p_url: `/job/${job.id}`,
    p_category: null, p_data: { job: job.id },
  });
}

let mapCache: { t: string; exp: number } | null = null;
async function mapToken(): Promise<string | null> {
  const pem = Deno.env.get("MAPKIT_KEY_P8"), kid = Deno.env.get("MAPKIT_KEY_ID");
  if (!pem || !kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (mapCache && mapCache.exp - 300 > now) return mapCache.t;
  const b64url = (b: ArrayBuffer | string) => {
    const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
    let s = ""; for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const exp = now + 3600;
  const input = `${b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }))}.${b64url(JSON.stringify({ iss: Deno.env.get("APNS_TEAM_ID") ?? "3N7J224W53", iat: now, exp }))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  mapCache = { t: `${input}.${b64url(sig)}`, exp };
  return mapCache.t;
}

// Asks Claude (Haiku) and reads its JSON answer. Throws on any error so the caller falls back.
async function claudeJson(key: string, maxTokens: number, system: string, content: unknown[]): Promise<Record<string, unknown>> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude said ${r.status}: ${JSON.stringify(j).slice(0, 500)}`);
  const t = replyText(j);
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
}

// Claude's answer is the text part of its reply. Newer models send a thinking part first, so never assume the first part is the answer.
function replyText(j: { content?: { type: string; text?: string }[] } | null): string {
  return (j?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

function basicTidy(t: string): string {
  const parts = t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const out = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return /[.!?]$/.test(out) ? out : out + ".";
}

