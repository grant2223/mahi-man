// Mahi Man: checks a worker's ABN against the free ABN Lookup (abr.business.gov.au) and stores the registered name.
// Needs the Edge Function secret ABR_GUID (free, from ABN Lookup web services registration). Without it, nothing is looked up.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GUID = Deno.env.get("ABR_GUID");
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Sign in again" }, 401);
  const { data: w } = await db.from("workers").select("id, abn").eq("id", u.user.id).maybeSingle();
  const abn = (w?.abn ?? "").replace(/\D/g, "");
  if (abn.length !== 11) return json({ ok: false });
  if (!GUID) return json({ ok: false, reason: "not_set_up" });
  try {
    const r = await fetch(`https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&guid=${GUID}&callback=x`);
    const t = await r.text();
    const d = JSON.parse(t.replace(/^[^(]*\(/, "").replace(/\)\s*;?\s*$/, ""));
    if (d.Message) return json({ ok: false, reason: d.Message });
    const name = (d.EntityName || (Array.isArray(d.BusinessName) ? d.BusinessName[0] : "") || "").trim();
    const status = d.AbnStatus === "Active" ? "active" : "cancelled";
    await db.rpc("set_abn_lookup", { p_worker: w!.id, p_name: name || null, p_status: status });
    return json({ ok: true, name, status });
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 200) });
  }
});
