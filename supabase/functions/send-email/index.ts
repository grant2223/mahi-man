// Mahi Man: sends queued emails (public.email_queue) through Resend.
// Runs when an email is queued, and every 15 minutes for anything still waiting.
// Needs the Edge Function secret RESEND_API_KEY; until it's set, emails wait in the queue and go out once it is.
// Invoices, reminders and receipts carry the tax invoice or receipt as a PDF attachment, built from the invoice itself.
import { createClient } from "npm:@supabase/supabase-js@2";
import { render, type Ctx, type Pay } from "./emails.ts";
import { loadAssets, makePdf, type Assets, type DocData, type Line } from "./pdf.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") ?? "Mahi Man <hello@mahiman.app>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://mahiman.app";
const TZ = "Australia/Brisbane";

const day = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleDateString("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).replace(",", "") : "";

async function settings(): Promise<Record<string, string>> {
  const { data } = await db.from("settings").select("key,value");
  return Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value ?? ""]));
}

// The Google Play link only goes in emails once the listing is live (Play answers 404 until then).
async function playLive(url: string): Promise<boolean> {
  if (!url) return false;
  try { const r = await fetch(url, { redirect: "follow" }); await r.body?.cancel(); return r.ok; } catch { return false; }
}

// The PDF for an invoice email, from the invoice in the database. Test emails without a real invoice use their own data.
// deno-lint-ignore no-explicit-any
async function docFor(kind: string, d: Record<string, any>, to: string, pay: Pay): Promise<DocData> {
  const { data: inv } = await db.from("customer_invoices").select("id,number,customer_id,issued_at,due_at,total_cents,paid_at").eq("number", d.number).maybeSingle();
  let lines: Line[] = d.lines ?? [], name = d.name ?? d.first ?? "", issued = d.issued ?? "", due = d.due ?? "", paid = d.paid_on ?? "", total = Number(d.total_cents);
  if (inv) {
    const { data: fees } = await db.from("customer_fees").select("amount_cents,from_balance_cents,created_at,jobs(title,finished_at,cancelled_at,worker_id)").eq("invoice_id", inv.id).order("created_at");
    const workers = [...new Set((fees ?? []).map((f: any) => f.jobs?.worker_id).filter(Boolean))];
    const { data: ws } = workers.length ? await db.from("profiles").select("id,full_name").in("id", workers) : { data: [] };
    const firstOf = (id: string) => ((ws ?? []).find((w: any) => w.id === id)?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
    lines = (fees ?? []).map((f: any) => ({ date: day(f.jobs?.finished_at ?? f.jobs?.cancelled_at ?? f.created_at), job: f.jobs?.title ?? "Your job",
      who: f.jobs?.worker_id ? firstOf(f.jobs.worker_id) : "", cents: f.amount_cents - f.from_balance_cents }));
    const { data: prof } = await db.from("profiles").select("full_name").eq("id", inv.customer_id).maybeSingle();
    name = prof?.full_name || name; issued = day(inv.issued_at); due = day(inv.due_at); paid = day(inv.paid_at) || paid; total = inv.total_cents;
  }
  return kind === "receipt"
    ? { kind: "receipt", number: d.number, issued, paid_on: paid, method: d.method ?? "Bank transfer", to_name: name, to_email: to, lines, total_cents: total, pay }
    : { kind: "invoice", number: d.number, issued, due, to_name: name, to_email: to, lines, total_cents: total, pay };
}

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async () => {
  if (!KEY) return new Response(JSON.stringify({ waiting: "RESEND_API_KEY not set" }), { headers: { "content-type": "application/json" } });
  const { data: queue } = await db.from("email_queue").select("*").is("sent_at", null).lt("tries", 5).order("id").limit(100);
  if (!queue?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { "content-type": "application/json" } });

  const s = await settings();
  const pay: Pay = Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith("pay_")).map(([k, v]) => [k.slice(4), v]));
  const ctx: Ctx = { site: SITE, pay, testflight: s.testflight_url || undefined, appStore: s.app_store_url || undefined,
    play: (await playLive(s.play_store_url)) ? s.play_store_url : undefined };
  let assets: Assets | null = null;

  let sent = 0;
  for (const q of queue) {
    // Claim it first, so two runs never send the same email.
    const { data: claimed } = await db.from("email_queue").update({ sent_at: new Date().toISOString(), tries: q.tries + 1 }).eq("id", q.id).is("sent_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      const d = { ...(q.data ?? {}) };
      // deno-lint-ignore no-explicit-any
      let attachments: any[] | undefined;
      if (["invoice", "invoice_reminder", "receipt"].includes(q.kind)) {
        assets ??= await loadAssets(SITE);
        const doc = await docFor(q.kind, d, q.to_email, pay);
        const { data: inv } = await db.from("customer_invoices").select("id").eq("number", d.number).maybeSingle();
        d.id = inv?.id ?? d.id; d.due = doc.due ?? d.due; d.total_cents = doc.total_cents; d.lines = doc.lines; d.paid_on = doc.paid_on ?? d.paid_on;
        const pdf = await makePdf(doc, assets);
        attachments = [{ filename: `${q.kind === "receipt" ? "Receipt" : "Invoice"} ${d.number}.pdf`, content: b64(pdf) }];
      }
      const { subject, html } = render(q.kind, d, ctx);
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [q.to_email], ...(REPLY_TO ? { reply_to: REPLY_TO } : {}), subject, html, attachments }),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${r.status} ${text}`.slice(0, 300));
      await db.from("email_queue").update({ result: "sent" }).eq("id", q.id);
      sent++;
    } catch (e) {
      // Back in the queue for the next run, up to 5 tries.
      await db.from("email_queue").update({ sent_at: null, result: String(e instanceof Error ? e.message : e).slice(0, 300) }).eq("id", q.id);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "content-type": "application/json" } });
});
