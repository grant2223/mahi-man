import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { admin, feePaid, refreshWorker, stripe } from "./payments.ts";

// Stripe's own notices. Every payment is recorded here as well as by the app, so money taken is never missed
// if the app closes mid-payment. Each step only changes something that hasn't happened yet, so a notice that
// arrives twice, or after the app already recorded it, changes nothing.
// Two notice streams: Mahi Man's own payments (STRIPE_WEBHOOK_SECRET) and workers' payout accounts (STRIPE_CONNECT_WEBHOOK_SECRET).
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  const secrets = [Deno.env.get("STRIPE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")].filter(Boolean) as string[];
  if (!sig || secrets.length === 0) return new Response("Not set up", { status: 400 });

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try { event = await stripe().webhooks.constructEventAsync(raw, sig, secret, undefined, crypto); break; } catch { /* try the next secret */ }
  }
  if (!event) return new Response("Bad signature", { status: 400 });

  try {
    await handle(event);
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    // A 500 makes Stripe send the notice again later, so a passing hiccup never loses a payment.
    console.error("stripe-webhook", event.type, event.id, e instanceof Error ? e.message : e);
    return new Response("Try again", { status: 500 });
  }
});

async function handle(event: Stripe.Event) {
  switch (event.type) {
    // Card hold approved on a job or an extra (they are captured when the job is confirmed).
    case "payment_intent.amount_capturable_updated": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.status !== "requires_capture") return;
      if (pi.metadata?.kind === "job" && pi.metadata.job_id) {
        await rpc("job_card_held", { p_job: pi.metadata.job_id, p_intent: pi.id });
      } else if (pi.metadata?.kind === "extra" && pi.metadata.request_id) {
        await rpc("extra_card_held", { p_request: pi.metadata.request_id, p_intent: pi.id });
      }
      return;
    }
    // Money taken straight away: top-ups, gift cards, connection fees and cancellation fees.
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const kind = pi.metadata?.kind;
      if (kind === "topup" && pi.metadata.user_id) {
        await rpc("topup_card_paid", { p_user: pi.metadata.user_id, p_amount: pi.amount, p_intent: pi.id });
      } else if (kind === "gift" && pi.metadata.gift_id) {
        await rpc("gift_mark_paid", { p_id: Number(pi.metadata.gift_id), p_intent: pi.id });
      } else if (kind === "booking_fee" && pi.metadata.job_id) {
        // Skip if it was already refunded (booking failed and the app undid the fee).
        const charge = typeof pi.latest_charge === "string" ? await stripe().charges.retrieve(pi.latest_charge) : pi.latest_charge;
        if (charge && charge.amount_refunded > 0) return;
        const { error } = await admin.from("jobs").update({ fee_status: "paid", fee_payment_intent: pi.id, fee_paid_at: new Date().toISOString() })
          .eq("id", pi.metadata.job_id).eq("fee_status", "due").or(`fee_payment_intent.is.null,fee_payment_intent.eq.${pi.id}`);
        if (error) throw new Error(error.message);
      } else if (pi.metadata?.fee_id) {
        const { data: f } = await admin.from("fees_owed").select("*").eq("id", Number(pi.metadata.fee_id)).single();
        if (f && f.status === "open") await feePaid(f.id, f.payee_id, f.amount_cents, pi.latest_charge, f.job_id);
      }
      return;
    }
    // A worker finished (or changed) their payout setup with Stripe.
    case "account.updated": {
      const a = event.data.object as Stripe.Account;
      const { data: w } = await admin.from("workers").select("id").eq("stripe_account_id", a.id).maybeSingle();
      if (w) await refreshWorker(w.id);
      return;
    }
    // A customer's bank disputed a charge. Staff who handle money are emailed straight away; Stripe gives a deadline to respond.
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const amount = `$${(d.amount / 100).toFixed(2)}`;
      const due = d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short" }) : "soon";
      await admin.from("admin_log").insert({ actor_email: "stripe", role: "system", tbl: "stripe", row_id: d.id, action: "dispute", changes: { amount: d.amount, reason: d.reason, charge: d.charge, due } });
      const { data: staff } = await admin.from("admin_roles").select("email").in("role", ["owner", "admin", "finance"]);
      for (const s of staff ?? []) {
        await admin.from("email_queue").insert({ to_email: s.email, kind: "alert", data: {
          eyebrow: "Payment disputed", title: `A customer disputed ${amount}`,
          body: `Reason: ${d.reason.replace(/_/g, " ")}. Respond in Stripe by ${due} or the money goes back to the customer.`,
          url: `https://dashboard.stripe.com/disputes/${d.id}`,
        } });
      }
      return;
    }
  }
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
}
