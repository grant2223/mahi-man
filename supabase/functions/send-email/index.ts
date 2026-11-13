// Mahi Man: sends queued emails (public.email_queue) through Resend.
// Runs when an email is queued, and every 15 minutes for anything still waiting.
// Needs the Edge Function secret RESEND_API_KEY; until it's set, emails wait in the queue and go out once it is.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") ?? "Mahi Man <hello@mahiman.app>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "help@mahiman.app";
const SITE = Deno.env.get("SITE_URL") ?? "https://mahiman.app";
const TESTFLIGHT_APP = "https://apps.apple.com/app/testflight/id899247664";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// One email layout: green band with the mascot, white body, plain footer.
function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#efede7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2a2d32">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efede7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:6px;overflow:hidden">
<tr><td style="background:#0f6e50;padding:22px 28px"><img src="${SITE}/mahi-head.png" width="40" height="40" alt="" style="vertical-align:middle;border:0">
<span style="color:#ffffff;font-size:20px;font-weight:600;vertical-align:middle;margin-left:10px">Mahi Man</span></td></tr>
<tr><td style="padding:30px 28px 8px"><h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;font-weight:600;color:#2a2d32">${title}</h1>${body}</td></tr>
<tr><td style="padding:18px 28px 28px;font-size:13px;color:#8a877e;border-top:1px solid #efede7">Mahi Man · Get the help you need within minutes.</td></tr>
</table></td></tr></table></body></html>`;
}
const p = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;font-weight:300;color:#4a4d52">${t}</p>`;
const btn = (href: string, label: string, primary: boolean) =>
  `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:4px;font-size:15px;font-weight:500;text-decoration:none;${primary ? "background:#0f6e50;color:#ffffff" : "background:#e6e3da;color:#2a2d32"}">${label}</a>`;
const step = (n: number, title: string, text: string, action = "") => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
<td valign="top" style="font-size:30px;font-weight:600;color:#0f6e50;width:38px;line-height:1">${n}</td>
<td valign="top"><div style="font-size:17px;font-weight:600;margin-bottom:3px">${title}</div><div style="font-size:15px;font-weight:300;line-height:1.5;color:#6b6960">${text}</div>${action ? `<div style="margin-top:10px">${action}</div>` : ""}</td>
</tr></table>`;

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
type Pay = { trading_name?: string; legal_name?: string; abn?: string; payid?: string; bsb?: string; account?: string; account_name?: string };
// How to pay: PayID first, BSB and account second, always with the invoice number as the reference.
function payBlock(pay: Pay, ref: string) {
  const row = (k: string, v?: string) => v ? `<tr><td style="padding:7px 0;font-size:14px;color:#8a877e;width:130px">${k}</td><td style="padding:7px 0;font-size:16px;font-weight:500;color:#2a2d32">${esc(v)}</td></tr>` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 22px;border-top:1px solid #efede7;border-bottom:1px solid #efede7">
${row("PayID", pay.payid)}${row("BSB", pay.bsb)}${row("Account", pay.account)}${row("Account name", pay.account_name || pay.trading_name)}${row("Reference", ref)}</table>`;
}
type Line = { date: string; job: string; who: string; cents: number };
function linesBlock(lines: Line[], total: number) {
  const rows = lines.map((l) => `<tr><td style="padding:8px 0;font-size:15px;color:#4a4d52;font-weight:300">${esc(l.date)} · ${esc(l.job)}${l.who ? ` · ${esc(l.who)}` : ""}</td><td align="right" style="padding:8px 0;font-size:15px;color:#2a2d32">${money(l.cents)}</td></tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px">${rows}
<tr><td style="padding:12px 0 4px;font-size:16px;font-weight:600;border-top:1px solid #efede7">Total</td><td align="right" style="padding:12px 0 4px;font-size:16px;font-weight:600;border-top:1px solid #efede7">${money(total)}</td></tr>
<tr><td colspan="2" style="padding:0 0 18px;font-size:13px;color:#8a877e">Includes GST of ${money(Math.round(total / 11))}</td></tr></table>`;
}
function taxFooter(pay: Pay, number: string) {
  return `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#8a877e">Tax invoice ${esc(number)} · ${esc(pay.legal_name ?? "")}${pay.trading_name ? ` trading as ${esc(pay.trading_name)}` : ""}${pay.abn ? ` · ABN ${esc(pay.abn)}` : ""}</p>`;
}

// deno-lint-ignore no-explicit-any
function render(kind: string, d: Record<string, any>) {
  const first = esc(d.first ?? "there");
  if (kind === "launch_welcome") {
    const subject = `Welcome to Mahi Man, ${d.first ?? ""}`.trim();
    const body = p("Thanks for joining the launch. Mahi Man is open to our pilot group on iPhone, and you're in. Here's how to get the app:")
      + step(1, "Get TestFlight", "Apple's free app for trying apps before they're in the App Store.", btn(TESTFLIGHT_APP, "Get TestFlight", false))
      + step(2, "Get Mahi Man", "Opens in TestFlight. Tap Accept, then Install.", btn(d.link, "Get Mahi Man", true))
      + step(3, "Open Mahi Man and sign up", "Add your photo and you're ready to post a job or find work.")
      + p("Open this email on your iPhone so the buttons open straight into the app. On Android? The pilot is iPhone first, and you're on the list for Android.")
      + p("<b style=\"font-weight:600;color:#2a2d32\">Stuck or something not working?</b> Reply to this email and we'll sort it out.");
    return { subject, html: layout(`You're in, ${first}.`, body) };
  }
  if (kind === "invoice") {
    const pay: Pay = d.pay ?? {}, total = Number(d.total_cents);
    const body = p(`Hi ${first}, here are your Mahi Man connection fees.`)
      + linesBlock(d.lines ?? [], total)
      + `<div style="font-size:17px;font-weight:600;margin:0 0 4px">Pay by bank transfer</div>`
      + payBlock(pay, d.number)
      + `<div style="margin:0 0 22px">${btn(`${SITE}/payments`, "See it in the app", true)}</div>`
      + taxFooter(pay, d.number);
    return { subject: `Invoice ${d.number}: ${money(total)} due ${d.due}`, html: layout(`${money(total)} due ${esc(d.due)}`, body) };
  }
  if (kind === "invoice_reminder") {
    const pay: Pay = d.pay ?? {}, total = Number(d.total_cents);
    const body = p(`Hi ${first}, your ${money(total)} hasn't come through yet. If it's not paid by ${esc(d.pause)}, booking new jobs pauses until it is.`)
      + payBlock(pay, d.number)
      + p("Already paid? Tap I've paid on the invoice in the app and we'll match it up.")
      + `<div style="margin:0 0 22px">${btn(`${SITE}/payments`, "Open the invoice", true)}</div>`;
    return { subject: `Reminder: invoice ${d.number} is due`, html: layout(`Invoice ${esc(d.number)} is due`, body) };
  }
  if (kind === "gift") {
    const amt = `$${Math.round(Number(d.amount_cents) / 100)}`;
    const body = (d.message ? `<p style="margin:0 0 18px;font-size:18px;line-height:1.5;font-weight:300;color:#2a2d32">"${esc(d.message)}"</p>` : "")
      + p("It's for any job around the house on Mahi Man: gutters, lawns, moving, cleaning, anything. The gift pays your worker when the job's done.")
      + step(1, "Get Mahi Man", "Free on iPhone and Android.", btn(`${SITE}/get`, "Get Mahi Man", false))
      + step(2, "Sign up with this email address", "Your gift goes straight into your wallet.")
      + step(3, "Post a job", "Your gift pays when it's done.", btn(d.link, "Open my gift", true))
      + `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#8a877e">Gift code ${esc(d.code)} · lasts until ${esc(d.expires)}. Enter the code in You, Payments if you sign up with a different email.</p>`;
    return { subject: `${d.from} sent you ${amt} of help`, html: layout(`${esc(d.from)} sent you ${amt} of help`, body) };
  }
  throw new Error(`Unknown email: ${kind}`);
}

Deno.serve(async () => {
  if (!KEY) return new Response(JSON.stringify({ waiting: "RESEND_API_KEY not set" }), { headers: { "content-type": "application/json" } });
  const { data: queue } = await db.from("email_queue").select("*").is("sent_at", null).lt("tries", 5).order("id").limit(100);
  let sent = 0;
  for (const q of queue ?? []) {
    // Claim it first, so two runs never send the same email.
    const { data: claimed } = await db.from("email_queue").update({ sent_at: new Date().toISOString(), tries: q.tries + 1 }).eq("id", q.id).is("sent_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      const { subject, html } = render(q.kind, q.data ?? {});
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [q.to_email], reply_to: REPLY_TO, subject, html }),
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
