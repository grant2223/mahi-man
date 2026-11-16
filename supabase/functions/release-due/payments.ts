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
  const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).single();
  if (!job) throw new Error("Job not found");
  if (!["finished", "disputed"].includes(job.status)) throw new Error("This job is not ready to pay out");
  // Pilot jobs have no card hold: the customer pays the worker directly, so confirming only closes the job.
  if (!job.payment_intent_id) {
    await admin.from("jobs").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", jobId);
    return;
  }
  const s = stripe();
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

// Marks a fee paid and sends it to the worker's payout account. Without one, admin pays them out.
export async function feePaid(feeId: number | null, payee: string | null, amount: number, charge: unknown, jobId: string | null) {
  if (!feeId) return;
  const chargeId = typeof charge === "string" ? charge : (charge as { id?: string } | null)?.id;
  let paidOut: string | null = null;
  if (payee && chargeId) {
    const { data: w } = await admin.from("workers").select("stripe_account_id").eq("id", payee).single();
    if (w?.stripe_account_id) {
      await stripe().transfers.create({ amount, currency: "aud", destination: w.stripe_account_id, source_transaction: chargeId,
        metadata: { fee_id: String(feeId), job_id: jobId ?? "", kind: "cancel_fee" } }, { idempotencyKey: `fee-out-${feeId}` });
      paidOut = new Date().toISOString();
    }
  }
  await admin.from("fees_owed").update({ status: "paid", paid_at: new Date().toISOString(), payment_ref: chargeId ?? "card", paid_out_at: paidOut }).eq("id", feeId);
}

export async function refreshWorker(id: string) {
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
    // "abn" is the Getting paid step. ABN itself is optional: a PayID or a bank account is enough.
    abn: !!w?.payid || (!!w?.bsb && !!w?.account_number),
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
