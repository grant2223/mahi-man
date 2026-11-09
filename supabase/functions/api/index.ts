import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { admin, releaseJob, setting, stripe } from "./payments.ts";

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
            description: "More Mahi booking",
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
        await admin.from("jobs").update({ status: "searching", searching_at: new Date().toISOString() }).eq("id", job.id);
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
            description: "More Mahi extra",
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
        await admin.from("extra_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", er.id);
        await admin.from("jobs").update({ extra_cents: er.jobs.extra_cents + er.amount_cents }).eq("id", er.job_id);
        return ok({});
      }
      case "confirm_job": {
        const { data: job } = await admin.from("jobs").select("customer_id,status").eq("id", body.job_id).single();
        if (!job || job.customer_id !== user.id) return fail("Job not found");
        if (job.status !== "finished") return fail("This job is not finished yet");
        await releaseJob(body.job_id);
        return ok({ status: "confirmed" });
      }
      case "cancel_job": {
        const { data: job } = await admin.from("jobs").select("*").eq("id", body.job_id).single();
        if (!job || job.customer_id !== user.id) return fail("Job not found");
        const now = new Date().toISOString();
        if (!job.payment_intent_id && ["awaiting_payment", "searching", "accepted"].includes(job.status)) {
          // Booking fee: kept once the customer has chosen someone. If the job is searching again because the
          // worker dropped out, it was never done, so the fee comes back.
          let refunded = 0;
          if (job.fee_status === "paid" && job.status === "searching") { await refundFee(job); refunded = job.fee_cents; }
          await admin.from("jobs").update({ status: "cancelled", cancelled_at: now }).eq("id", job.id);
          return ok({ charged_cents: job.fee_status === "paid" && !refunded ? job.fee_cents : 0, refunded_cents: refunded });
        }
        const s = stripe();
        if (["awaiting_payment", "searching"].includes(job.status)) {
          if (job.payment_intent_id) {
            const pi = await s.paymentIntents.retrieve(job.payment_intent_id);
            if (["requires_capture", "requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status)) {
              await s.paymentIntents.cancel(job.payment_intent_id);
            }
          }
          await admin.from("jobs").update({ status: "cancelled", cancelled_at: now }).eq("id", job.id);
          return ok({ charged_cents: 0 });
        }
        if (job.status === "accepted") {
          const callout = Number(await setting("callout_cents"));
          const keep = job.fee_cents + callout;
          const pi = await s.paymentIntents.capture(job.payment_intent_id, { amount_to_capture: keep });
          const { data: w } = await admin.from("workers").select("stripe_account_id").eq("id", job.worker_id).single();
          if (w?.stripe_account_id && callout > 0) {
            await s.transfers.create({
              amount: callout,
              currency: "aud",
              destination: w.stripe_account_id,
              source_transaction: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id,
              metadata: { job_id: job.id, kind: "callout" },
            }, { idempotencyKey: `callout-${job.id}` });
          }
          await admin.from("jobs").update({ status: "cancelled", cancelled_at: now }).eq("id", job.id);
          return ok({ charged_cents: keep });
        }
        return fail("The job has started. Use Get help and we will sort it out.");
      }

      // ---------- Worker ----------
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
            business_profile: { mcc: "7349", product_description: "Odd jobs booked through More Mahi" },
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
        if (body.payid !== undefined) {
          const pid = String(body.payid).trim();
          const phone = pid.replace(/[\s-]/g, "");
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pid);
          const isPhone = /^(\+61|0)4\d{8}$/.test(phone);
          const isAbn = validAbn(pid);
          if (!isEmail && !isPhone && !isAbn) return fail("Enter the mobile number, email or ABN your PayID is set up with.");
          body.payid = isPhone ? phone : isAbn ? pid.replace(/\s/g, "") : pid.toLowerCase();
        }
        const patch: Record<string, unknown> = {};
        // Insurance only comes through a checked certificate (Licences and certificates), never straight from the phone.
        for (const k of ["abn", "payid", "has_vehicle", "base_suburb_id", "radius_km"]) {
          if (body[k] !== undefined) patch[k] = k === "abn" ? String(body.abn).replace(/\s/g, "") : body[k];
        }
        await admin.from("workers").update(patch).eq("id", user.id);
        return ok(await refreshWorker(user.id));
      }
      case "worker_status": {
        return ok(await refreshWorker(user.id));
      }

      // ---------- Admin ----------
      case "admin_resolve": {
        if (!me?.is_admin) return fail("Admins only", 403);
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
        if (!me?.is_admin) return fail("Admins only", 403);
        await admin.from("workers").update({ admin_approved: !!body.approved }).eq("id", body.worker_id);
        return ok(await refreshWorker(body.worker_id));
      }
      case "admin_id_decide": {
        if (!me?.is_admin) return fail("Admins only", 403);
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
                description: `More Mahi booking fee: ${job.title ?? "odd job"}`, metadata: { job_id: job.id, kind: "booking_fee" },
                statement_descriptor_suffix: "MORE MAHI",
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
        if (!me?.is_admin) return fail("Admins only", 403);
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
        for (const bucket of ["avatars", "ids", "job-media", "insurance"]) {
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
          const text = j?.content?.[0]?.text?.trim();
          return ok({ text: text || basicTidy(raw), ai: !!text });
        } catch {
          return ok({ text: basicTidy(raw), ai: false });
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

function basicTidy(t: string): string {
  const parts = t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const out = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return /[.!?]$/.test(out) ? out : out + ".";
}

async function refreshWorker(id: string) {
  const { data: w } = await admin.from("workers").select("*").eq("id", id).single();
  const { data: p } = await admin.from("profiles").select("*").eq("id", id).single();
  const { count } = await admin.from("worker_job_types").select("*", { count: "exact", head: true }).eq("worker_id", id);
  let payoutsReady = false;
  if (w?.stripe_account_id && Deno.env.get("STRIPE_SECRET_KEY")) {
    const a = await stripe().accounts.retrieve(w.stripe_account_id);
    payoutsReady = !!(a.details_submitted && a.payouts_enabled);
  }
  const pilot = (await setting("pilot_mode")) === "true";
  const idVerified = p?.id_status === "verified";
  const steps = {
    photo: !!p?.photo_path && !!p?.full_name,
    id_and_bank: pilot ? idVerified : payoutsReady && idVerified,
    abn: !!w?.abn && (!pilot || !!w?.payid),
    area: !!w?.base_suburb_id,
    jobs: (count ?? 0) > 0,
  };
  const approved = Object.values(steps).every(Boolean) && !w?.suspended;
  await admin.from("workers").update({
    payouts_ready: payoutsReady,
    id_verified: idVerified,
    approved,
    online: approved ? w?.online : false,
  }).eq("id", id);
  return { steps, approved, suspended: w?.suspended ?? false, pilot, id_status: p?.id_status ?? "none", id_note: p?.id_note ?? null };
}
