import Stripe from "npm:stripe@17.7.0";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export function stripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Payments are not switched on yet. The Stripe secret key is missing.");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export async function setting(key: string): Promise<string> {
  const { data } = await admin.from("settings").select("value").eq("key", key).single();
  return data?.value ?? "";
}

// Capture every held payment on a job and pay the worker. Used by customer confirm,
// the 48 hour auto-release and admin "pay the worker" on a dispute.
export async function releaseJob(jobId: string): Promise<void> {
  const s = stripe();
  const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).single();
  if (!job) throw new Error("Job not found");
  if (!["finished", "disputed"].includes(job.status)) throw new Error("This job is not ready to pay out");
  const { data: worker } = await admin.from("workers").select("stripe_account_id").eq("id", job.worker_id).single();
  if (!worker?.stripe_account_id) throw new Error("The worker has no payout account");

  const intents: { id: string; payout: number }[] = [{ id: job.payment_intent_id, payout: job.price_cents }];
  const { data: extras } = await admin.from("extra_requests").select("*").eq("job_id", jobId).eq("status", "approved");
  for (const e of extras ?? []) if (e.payment_intent_id) intents.push({ id: e.payment_intent_id, payout: e.amount_cents });

  let firstTransfer: string | null = null;
  for (const it of intents) {
    let pi = await s.paymentIntents.retrieve(it.id);
    if (pi.status === "requires_capture") pi = await s.paymentIntents.capture(it.id);
    if (pi.status !== "succeeded") throw new Error(`Payment ${it.id} could not be collected (${pi.status})`);
    const tr = await s.transfers.create(
      {
        amount: it.payout,
        currency: "aud",
        destination: worker.stripe_account_id,
        source_transaction: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id,
        metadata: { job_id: jobId },
      },
      { idempotencyKey: `transfer-${it.id}` },
    );
    firstTransfer ??= tr.id;
  }
  await admin.from("jobs").update({ status: "confirmed", confirmed_at: new Date().toISOString(), transfer_id: firstTransfer })
    .eq("id", jobId);
}
