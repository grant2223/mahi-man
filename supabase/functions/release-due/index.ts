import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { admin, releaseJob, setting } from "./payments.ts";

// Runs every 15 minutes. Pays out any finished job the customer has not confirmed
// or reported within the auto-release window. Safe to call repeatedly: it only
// touches jobs that are already due, and every transfer has an idempotency key.
Deno.serve(async () => {
  const hours = Number(await setting("auto_release_hours")) || 48;
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data: due } = await admin.from("jobs").select("id").eq("status", "finished").lt("finished_at", cutoff).limit(50);
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
