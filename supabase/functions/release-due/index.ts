import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, releaseJob, setting } from "./payments.ts";

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
  return new Response(JSON.stringify({ checked: due?.length ?? 0, results }), { headers: { "Content-Type": "application/json" } });
});
