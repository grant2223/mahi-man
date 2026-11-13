import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, releaseJob, setting, stripe } from "./payments.ts";

// Runs every 15 minutes. Closes any finished job the customer has not confirmed
// or reported within the auto-release window, or that the customer marked paid 24 hours ago. Safe to call repeatedly: it only
// touches jobs that are already due, and every transfer has an idempotency key.
Deno.serve(async () => {
  const hours = Number(await setting("auto_release_hours")) || 48;
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  // Also close pilot jobs the customer marked paid when the worker hasn't answered within 24 hours.
  const paidCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: due } = await admin.from("jobs").select("id").eq("status", "finished")
    .or(`finished_at.lt.${cutoff},customer_paid_at.lt.${paidCutoff}`).limit(50);
  const results: Record<string, string> = {};
  for (const j of due ?? []) {
    try {
      await releaseJob(j.id);
      results[j.id] = "paid";
    } catch (e) {
      results[j.id] = e instanceof Error ? e.message : String(e);
    }
  }
  const topped = await autoTopups().catch((e) => String(e));
  return new Response(JSON.stringify({ checked: due?.length ?? 0, results, topped }), { headers: { "Content-Type": "application/json" } });
});

// Automatic top-up: when a balance drops under the low mark, add the set amount from the saved card.
// One try per user per hour bucket (idempotency key); a failed card turns automatic top-up off and tells them.
async function autoTopups() {
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return 0;
  const add = Number(await setting("auto_topup_cents")) || 5000;
  const below = Number(await setting("auto_topup_below_cents")) || 1000;
  const { data: people } = await admin.from("profiles").select("id, stripe_customer_id, card_pm").eq("auto_topup", true).not("card_pm", "is", null).limit(200);
  let n = 0;
  for (const p of people ?? []) {
    const { data: bal } = await admin.rpc("balance_of", { p: p.id });
    if (Number(bal) >= below || !p.stripe_customer_id) continue;
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("topups").select("id", { count: "exact", head: true }).eq("customer_id", p.id).eq("via", "card").gte("created_at", since);
    if (count) continue;
    try {
      const pi = await stripe().paymentIntents.create({
        amount: add, currency: "aud", customer: p.stripe_customer_id, payment_method: p.card_pm, off_session: true, confirm: true,
        description: "Mahi Man automatic top-up", metadata: { user_id: p.id, kind: "topup", auto: "1" }, statement_descriptor_suffix: "MAHI MAN",
      }, { idempotencyKey: `auto-topup-${p.id}-${Math.floor(Date.now() / 3600_000)}` });
      if (pi.status !== "succeeded") throw new Error(pi.status);
      await admin.rpc("topup_card_paid", { p_user: p.id, p_amount: add, p_intent: pi.id });
      n++;
    } catch {
      await admin.from("profiles").update({ auto_topup: false }).eq("id", p.id);
      await admin.rpc("notify", { p_user: p.id, p_title: "Automatic top-up is off", p_body: "Your card didn't go through, so we turned it off. Top up in You, Payments.", p_url: "/payments", p_category: null, p_data: {} });
    }
  }
  return n;
}
