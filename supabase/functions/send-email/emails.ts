// Mahi Man emails. One layout for all of them: an emerald header with the mascot and the one thing the email is about,
// a short white body with a single clear button, and a plain footer. Invoices and receipts are PDFs attached to the
// email; the email itself only says what's attached, what's owed and how to pay.

export type Pay = { trading_name?: string; legal_name?: string; abn?: string; payid?: string; bsb?: string; account?: string; account_name?: string };
export type Ctx = { site: string; pay: Pay; testflight?: string; play?: string; appStore?: string };

const C = { emerald: "#0b6b4f", deep: "#064230", hi: "#1a9c72", lime: "#d2e34a", ink: "#2a2d32", body: "#4a4f4c", muted: "#6f7873", ground: "#edf1ef", line: "#e1e8e4" };
const FONT = `'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const money = (c: number) => `$${(c / 100).toFixed(2)}`;

type Hero = { eyebrow?: string; title: string; sub?: string; mascot?: boolean };

function layout(ctx: Ctx, preheader: string, hero: Hero, body: string) {
  const { site } = ctx;
  const apple = ctx.appStore ? { href: ctx.appStore, img: "app-store", w: 153 } : ctx.testflight ? { href: ctx.testflight, img: "testflight", w: 138 } : null;
  const badge = (b: { href: string; img: string; w: number }, alt: string) =>
    `<a href="${esc(b.href)}" style="display:inline-block;text-decoration:none"><img src="${site}/email/${b.img}.png" width="${b.w}" height="44" alt="${alt}" style="display:block;border:0"></a>`;
  const badges = [apple && badge(apple, "Get Mahi Man on iPhone"), ctx.play && badge({ href: ctx.play, img: "google-play", w: 155 }, "Get Mahi Man on Google Play")].filter(Boolean)
    .map((h) => `<td style="padding:0 10px 0 0">${h}</td>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600&display=swap" rel="stylesheet">
<style>
@media (max-width:520px){ .px{padding-left:22px!important;padding-right:22px!important} .h1{font-size:30px!important} .mas{width:112px!important} .stack{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important} .stack + .stack{padding-top:12px!important} }
a{color:${C.emerald}}
</style></head>
<body style="margin:0;padding:0;background:${C.ground};font-family:${FONT};color:${C.ink};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:${C.emerald};background-image:radial-gradient(120% 90% at 85% 0%,${C.hi} 0%,${C.emerald} 50%,${C.deep} 100%);border-radius:4px 4px 0 0;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="px" valign="top" style="padding:24px 0 30px 32px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="${site}/mahi-head.png" width="30" height="30" alt="" style="display:block;border:0"></td>
<td valign="middle" style="padding-left:9px;font-size:17px;font-weight:600;color:#ffffff;letter-spacing:-0.2px">Mahi Man</td></tr></table>
${hero.eyebrow ? `<div style="margin:34px 0 8px;font-size:14px;font-weight:500;color:${C.lime}">${esc(hero.eyebrow)}</div>` : `<div style="height:34px;line-height:34px">&nbsp;</div>`}
<div class="h1" style="font-size:36px;line-height:1.08;font-weight:600;letter-spacing:-0.9px;color:#ffffff">${hero.title}</div>
${hero.sub ? `<div style="margin-top:12px;font-size:16px;line-height:1.45;font-weight:300;color:rgba(255,255,255,0.88)">${hero.sub}</div>` : ""}
</td>
${hero.mascot ? `<td valign="bottom" align="right" width="150" style="padding:18px 0 0 6px"><img class="mas" src="${site}/mascot.png" width="150" alt="" style="display:block;border:0;width:150px;height:auto"></td>` : `<td width="32"></td>`}
</tr></table></td></tr>
<tr><td class="px" style="background:#ffffff;padding:30px 32px 32px;border-radius:0 0 4px 4px">${body}</td></tr>
<tr><td class="px" style="padding:26px 32px 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="${site}/mahi-head.png" width="26" height="26" alt="" style="display:block;border:0"></td>
<td valign="middle" style="padding-left:8px;font-size:16px;font-weight:600;color:${C.ink};letter-spacing:-0.2px">Mahi Man</td></tr></table>
<div style="margin:6px 0 16px;font-size:14px;font-weight:300;color:${C.muted}">Get the help you need within minutes.</div>
${badges ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${badges}</tr></table>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;
}

// Pieces
const p = (t: string, extra = "") => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;font-weight:300;color:${C.body};${extra}">${t}</p>`;
const btn = (href: string, label: string, kind: "primary" | "quiet" = "primary") =>
  `<a href="${esc(href)}" style="display:inline-block;padding:15px 24px;border-radius:4px;font-size:16px;font-weight:500;line-height:1;text-decoration:none;${kind === "primary" ? `background:${C.emerald};color:#ffffff` : `background:${C.ground};color:${C.ink}`}">${label}</a>`;
const fallback = (href: string) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;font-weight:300;color:${C.muted}">Button not working? Open <a href="${esc(href)}" style="color:${C.emerald};word-break:break-all">${esc(href.replace(/^https?:\/\//, ""))}</a></p>`;
const rule = `<div style="height:1px;background:${C.line};margin:26px 0 22px;line-height:1px">&nbsp;</div>`;
const h2 = (t: string) => `<div style="margin:0 0 12px;font-size:19px;font-weight:600;letter-spacing:-0.3px;color:${C.ink}">${t}</div>`;
// Label and value rows, values right-aligned so they line up like a statement.
const rows = (r: [string, string | undefined, boolean?][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${r.filter(([, v]) => v).map(([k, v, strong]) =>
  `<tr><td style="padding:9px 0;font-size:15px;font-weight:300;color:${C.muted};border-bottom:1px solid ${C.line}">${k}</td><td align="right" style="padding:9px 0;font-size:${strong ? 17 : 15}px;font-weight:${strong ? 600 : 400};color:${C.ink};border-bottom:1px solid ${C.line}">${esc(v)}</td></tr>`).join("")}</table>`;
function payBlock(pay: Pay, ref: string) {
  return h2("Pay by bank transfer") + rows([["PayID", pay.payid, true], ["BSB", pay.bsb], ["Account", pay.account], ["Account name", pay.account_name || pay.trading_name], ["Reference", ref, true]])
    + `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;font-weight:300;color:${C.muted}">Use the reference so we can match your payment.</p>`;
}
const pdfNote = (name: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>
<td valign="middle" style="padding-right:12px"><svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 1h12l6 6v17a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="none" stroke="${C.emerald}" stroke-width="1.8"/><path d="M14 1v6h6" fill="none" stroke="${C.emerald}" stroke-width="1.8"/></svg></td>
<td valign="middle" style="font-size:15px;font-weight:400;color:${C.ink}">${esc(name)}<div style="font-size:13px;font-weight:300;color:${C.muted}">Attached to this email</div></td></tr></table>`;

// deno-lint-ignore no-explicit-any
export function render(kind: string, d: Record<string, any>, ctx: Ctx): { subject: string; html: string } {
  const first = esc(d.first ?? "there");
  const site = ctx.site;

  if (kind === "login_code") {
    // Supabase Auth's "Magic link / OTP" template. d.code is {{ .Token }} there.
    const body = `<div style="margin:0 0 22px;padding:22px 0;background:${C.ground};border-radius:4px;text-align:center;font-size:42px;line-height:1;font-weight:600;letter-spacing:10px;color:${C.ink}">${esc(d.code)}</div>`
      + p("Type this code into Mahi Man to sign in. It works for one hour.")
      + p(`Didn't ask for it? You can ignore this email. Nobody can get into your account without the code.`, `font-size:14px;color:${C.muted};margin:0`);
    return { subject: `${d.code} is your Mahi Man code`, html: layout(ctx, `${d.code} is your code. It works for one hour.`, { eyebrow: "Sign in", title: "Your code" }, body) };
  }

  if (kind === "launch_welcome") {
    const ios = d.link || ctx.testflight || ctx.appStore || `${site}/get`;
    const body = p("Mahi Man is open in Cairns and you're one of the first in. Post a job and local people say they're keen within minutes, or pick up work near you.")
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 6px"><tr>
<td class="stack" valign="top" width="50%" style="padding-right:6px">${btn(ios, "Get it on iPhone")}</td>
${ctx.play ? `<td class="stack" valign="top" width="50%" style="padding-left:6px">${btn(ctx.play, "Get it on Android", "quiet")}</td>` : ""}
</tr></table>`
      + (ctx.appStore ? "" : `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;font-weight:300;color:${C.muted}">On iPhone the app opens in TestFlight, Apple's app for early access. Tap Accept, then Install.</p>`)
      + rule
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="stack" valign="top" width="50%" style="padding-right:14px">${h2("Need a hand?")}<div style="font-size:15px;line-height:1.55;font-weight:300;color:${C.body}">Post the job with a photo. Pick from the people who are keen, see them on the way, and pay them when it's done.</div></td>
<td class="stack" valign="top" width="50%" style="padding-left:14px">${h2("Want work?")}<div style="font-size:15px;line-height:1.55;font-weight:300;color:${C.body}">Go online and jobs near you buzz your phone. Say you're keen, do the job, get paid straight to your account.</div></td>
</tr></table>`;
    return { subject: `You're in, ${d.first ?? ""}. Get Mahi Man`.replace(" ,", ","), html: layout(ctx, "Mahi Man is open in Cairns. Get the app.", { eyebrow: "Welcome to Mahi Man", title: `You're in, ${first}.`, sub: "Get the help you need within minutes.", mascot: true }, body) };
  }

  if (kind === "invoice") {
    const total = Number(d.total_cents), n = (d.lines ?? []).length;
    const body = pdfNote(`Invoice ${d.number}.pdf`)
      + p(`Hi ${first}, here are your connection fees for ${n} job${n === 1 ? "" : "s"}. The tax invoice is attached.`)
      + `<div style="margin:4px 0 26px">${btn(`${site}/invoice/${d.id ?? ""}`, "View and pay")}</div>`
      + payBlock(ctx.pay, d.number);
    return { subject: `Invoice ${d.number}: ${money(total)} due ${d.due}`, html: layout(ctx, `${money(total)} due ${d.due}. Your invoice is attached.`, { eyebrow: `Invoice ${esc(d.number)}`, title: `${money(total)}<br><span style="color:${C.lime}">due ${esc(d.due)}</span>` }, body) };
  }

  if (kind === "invoice_reminder") {
    const total = Number(d.total_cents);
    const body = pdfNote(`Invoice ${d.number}.pdf`)
      + p(`Hi ${first}, we haven't seen this payment yet. Pay by <b style="font-weight:500;color:${C.ink}">${esc(d.pause)}</b> to keep booking jobs on Mahi Man.`)
      + `<div style="margin:4px 0 8px">${btn(`${site}/invoice/${d.id ?? ""}`, "Pay now")}</div>`
      + `<p style="margin:0 0 26px;font-size:14px;line-height:1.5;font-weight:300;color:${C.muted}">Already paid? Tap I've paid on the invoice and we'll match it up.</p>`
      + payBlock(ctx.pay, d.number);
    return { subject: `Reminder: ${money(total)} for invoice ${d.number}`, html: layout(ctx, `Pay by ${d.pause} to keep booking jobs.`, { eyebrow: "Payment reminder", title: `${money(total)} is still owing`, sub: `Invoice ${esc(d.number)} was due ${esc(d.due)}.` }, body) };
  }

  if (kind === "receipt") {
    const total = Number(d.total_cents);
    const body = pdfNote(`Receipt ${d.number}.pdf`)
      + rows([["Paid", money(total), true], ["Date", d.paid_on], ["For", `Invoice ${d.number}`], ["Paid by", d.method]])
      + `<div style="margin:24px 0 0">${btn(`${site}/payments`, "See your payments", "quiet")}</div>`;
    return { subject: `Receipt for ${money(total)}: invoice ${d.number}`, html: layout(ctx, `Thanks, ${d.first ?? ""}. Your receipt is attached.`, { eyebrow: "Payment received", title: `Thanks, ${first}.`, sub: `We've got your ${money(total)}. Your receipt is attached.` }, body) };
  }

  if (kind === "gift") {
    const amt = `$${Math.round(Number(d.amount_cents) / 100)}`;
    const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="background:${C.emerald};background-image:radial-gradient(120% 110% at 90% 0%,${C.hi} 0%,${C.emerald} 55%,${C.deep} 100%);border-radius:4px;padding:22px 24px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:15px;font-weight:500;color:#ffffff">Mahi Man gift card</td><td align="right"><img src="${site}/mahi-head.png" width="28" height="28" alt="" style="display:inline-block;border:0"></td></tr></table>
<div style="margin:26px 0 18px;font-size:64px;line-height:1;font-weight:600;letter-spacing:-2px;color:${C.lime}">${amt}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:13px;font-weight:300;color:rgba(255,255,255,0.8)">Code<div style="font-size:17px;font-weight:500;letter-spacing:1.5px;color:#ffffff">${esc(d.code)}</div></td>
<td align="right" valign="bottom" style="font-size:13px;font-weight:300;color:rgba(255,255,255,0.8)">Use by ${esc(d.expires)}</td></tr></table></td></tr></table>`;
    const body = (d.message ? `<div style="margin:0 0 24px;font-size:21px;line-height:1.4;font-weight:400;letter-spacing:-0.2px;color:${C.ink}">“${esc(d.message)}”<div style="margin-top:8px;font-size:15px;font-weight:300;color:${C.muted}">${esc(d.from)}</div></div>` : "")
      + card
      + p("It pays for any job around the house: gutters, lawns, moving, cleaning, anything. Sign up with this email address and it's already in your account.")
      + `<div style="margin:4px 0 0">${btn(d.link ?? `${site}/get`, "Open my gift")}</div>`;
    return { subject: `${d.from} sent you ${amt} of help`, html: layout(ctx, `${d.from} sent you a ${amt} Mahi Man gift card.`, { eyebrow: "A gift for you", title: `${esc(d.from)} sent you ${amt} of help`, mascot: true }, body) };
  }

  if (kind === "staff_invite") {
    const link = d.link ?? site.replace("://", "://admin.");
    const body = p(`${esc(d.from ?? "Mahi Man")} has added you to the Mahi Man admin as <b style="font-weight:500;color:${C.ink}">${esc(d.role ?? "staff")}</b>.`)
      + `<div style="margin:4px 0 0">${btn(link, "Open the admin")}</div>`
      + fallback(link)
      + rule
      + p("Sign in with this email address. We'll email you a code, so there's no password to remember.", `font-size:15px;margin:0 0 8px`)
      + p("Not expecting this? You can ignore this email.", `font-size:14px;color:${C.muted};margin:0`);
    return { subject: "You've been added to the Mahi Man admin", html: layout(ctx, `${d.from ?? "Mahi Man"} added you as ${d.role ?? "staff"}.`, { eyebrow: "Mahi Man admin", title: "You're on the team" }, body) };
  }

  throw new Error(`Unknown email: ${kind}`);
}
