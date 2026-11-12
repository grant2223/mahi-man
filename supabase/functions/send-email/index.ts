// Mahi Man: sends queued emails (public.email_queue) through Resend.
// Runs when an email is queued, and every 15 minutes for anything still waiting.
// Needs the Edge Function secret RESEND_API_KEY; until it's set, emails wait in the queue and go out once it is.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") ?? "Mahi Man <hello@mahiman.app>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "help@mahiman.app";
const SITE = Deno.env.get("SITE_URL") ?? "https://mahiman.vercel.app";
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

function render(kind: string, d: Record<string, string>) {
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
