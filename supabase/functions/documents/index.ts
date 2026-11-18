// Mahi Man documents: the app's invoice, receipt and statement PDFs, on the same branded template as the emailed ones.
// Reads through the signed-in customer's own database functions, so nobody can get someone else's document.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { loadAssets, makePdf, type Assets, type DocData, type Line, type Pay } from "./pdf.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const SITE = Deno.env.get("SITE_URL") ?? "https://mahiman.app";
const TZ = "Australia/Brisbane";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const dayY = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-AU", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }) : "";
const dayS = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).replace(",", "") : "";
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const VIA: Record<string, string> = { credit: "From credit", bank: "Bank transfer", card: "Card", gift: "Gift card" };
let assets: Assets | null = null;
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return json({ error: "Please sign in again" }, 401);
    const body = await req.json();
    const { data: me } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
    const { data: st } = await admin.from("settings").select("key,value").like("key", "pay_%");
    const pay: Pay = Object.fromEntries((st ?? []).map((r: { key: string; value: string }) => [r.key.slice(4), r.value ?? ""]));
    const base = { to_name: me?.full_name ?? "", to_email: user.email ?? "", pay };
    let doc: DocData, name: string;

    if (body.doc === "invoice") {
      const { data: inv, error } = await db.rpc("invoice_detail", { p_id: Number(body.id) });
      if (error || !inv) return json({ error: "Invoice not found" }, 404);
      const lines: Line[] = (inv.lines ?? []).map((l: { date: string; job: string; who: string; cents: number }) => ({ date: dayS(l.date), job: l.job, who: l.who, cents: l.cents }));
      doc = inv.status === "paid"
        ? { ...base, kind: "receipt", number: inv.number, issued: dayS(inv.issued_at), paid_on: dayS(inv.paid_at), method: "Bank transfer", lines, total_cents: inv.total }
        : { ...base, kind: "invoice", number: inv.number, issued: dayS(inv.issued_at), due: dayS(inv.due_at), lines, total_cents: inv.total };
      name = `Mahi-Man-${inv.number}.pdf`;
    } else if (body.doc === "receipt") {
      const { data: r, error } = await db.rpc("payment_receipt", { p_kind: String(body.kind), p_id: String(body.id) });
      if (error || !r) return json({ error: "Receipt not found" }, 404);
      const number = r.ref ?? `MM-${String(body.kind).toUpperCase()}-${body.id}`;
      const pending = r.status === "checking" ? "checking" as const : r.status === "waiting" ? "waiting" as const : undefined;
      doc = { ...base, kind: "payment", number, pending, issued: dayY(r.at), paid_on: dayY(r.confirmed_at ?? r.at), method: VIA[r.via] ?? "Bank transfer", title: r.title,
        heads: { job: "What", who: "Paid by" }, lines: [{ date: dayY(r.at), job: r.title, who: VIA[r.via] ?? "", cents: r.amount }], total_cents: r.amount,
        rows: (r.lines ?? []).map((l: { k: string; v: string }) => [l.k, l.v] as [string, string]) };
      name = `Mahi-Man-receipt-${number}.pdf`;
    } else if (body.doc === "statement") {
      const { data: rows, error } = await db.rpc("payment_history", { p_kind: String(body.kind ?? "all"), p_period: String(body.period ?? "all"), p_limit: 1000 });
      if (error) return json({ error: error.message }, 400);
      const { data: mp } = await db.rpc("my_payments");
      const lines: Line[] = (rows ?? []).map((r: { at: string; title: string; note: string | null; via: string; amount: number; flow: string; status: string }) => ({
        date: dayY(r.at), job: r.title + (r.status === "checking" ? " (checking)" : ""), who: r.note ?? VIA[r.via] ?? "", cents: r.amount,
        amt: `${r.flow === "in" ? "+" : r.flow === "out" ? "−" : ""}${money(r.amount)}` }));
      const label = String(body.label ?? "Your payments");
      doc = { ...base, kind: "statement", number: String(body.period_label ?? "Statement"), issued: dayY(new Date().toISOString()), title: label,
        credit_cents: Number(mp?.balance ?? 0), heads: { job: "What", who: "Detail" }, lines, total_cents: 0,
        note: "+ adds to your connection fee credit, − is taken from it. Other amounts are payments you made to Mahi Man." };
      name = "Mahi-Man-statement.pdf";
    } else return json({ error: "Unknown document" }, 400);

    assets ??= await loadAssets(SITE);
    return json({ pdf: b64(await makePdf(doc, assets)), name });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
