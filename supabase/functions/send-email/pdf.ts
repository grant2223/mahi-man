// Mahi Man tax invoices and receipts as A4 PDFs, attached to the invoice, reminder and receipt emails.
// Meets the ATO's tax invoice rules: the words "Tax invoice", seller name and ABN, issue date, what was sold, and the GST.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import type { Pay } from "./emails.ts";

export type Assets = { fonts: Record<"300" | "400" | "500" | "600", Uint8Array> | null; head: Uint8Array };
export type Line = { date: string; job: string; who?: string; cents: number };
export type DocData = {
  kind: "invoice" | "receipt";
  number: string; issued: string; due?: string; paid_on?: string; method?: string;
  to_name: string; to_email: string; lines: Line[]; total_cents: number; pay: Pay;
};

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = { emerald: hex("#0b6b4f"), deep: hex("#064230"), lime: hex("#d2e34a"), ink: hex("#2a2d32"), body: hex("#4a4f4c"), muted: hex("#6f7873"), ground: hex("#edf1ef"), line: hex("#dfe6e2"), white: rgb(1, 1, 1) };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function makePdf(d: DocData, a: Assets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // The app's font; Helvetica if it couldn't be fetched, so an invoice never waits on a font.
  const F = a.fonts ? {
    light: await doc.embedFont(a.fonts["300"], { subset: true }),
    reg: await doc.embedFont(a.fonts["400"], { subset: true }),
    med: await doc.embedFont(a.fonts["500"], { subset: true }),
    bold: await doc.embedFont(a.fonts["600"], { subset: true }),
  } : {
    light: await doc.embedFont(StandardFonts.Helvetica), reg: await doc.embedFont(StandardFonts.Helvetica),
    med: await doc.embedFont(StandardFonts.HelveticaBold), bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const head = await doc.embedPng(a.head);
  const receipt = d.kind === "receipt";
  doc.setTitle(`${receipt ? "Receipt" : "Tax invoice"} ${d.number}`);
  doc.setAuthor("Mahi Man");
  doc.setCreator("Mahi Man");

  const W = 595.28, H = 841.89, M = 48;
  let page = doc.addPage([W, H]);
  const pages = [page];
  const text = (s: string, x: number, y: number, f: PDFFont, size: number, color = C.ink, align: "left" | "right" = "left") => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === "right" ? x - w : x, y, size, font: f, color });
    return w;
  };
  const fit = (s: string, f: PDFFont, size: number, max: number) => {
    if (f.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1);
    return s.trimEnd() + "…";
  };
  const hr = (y: number, x1 = M, x2 = W - M, c = C.line, t = 0.8) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color: c });

  // Header band
  const band = 112;
  page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: C.emerald });
  page.drawRectangle({ x: 0, y: H - band, width: W, height: 4, color: C.deep });
  drawHead(page, head, M, H - 62, 30);
  text("Mahi Man", M + 38, H - 54, F.bold, 17, C.white);
  text("Get the help you need within minutes.", M + 38, H - 70, F.light, 9.5, hex("#cfe3da"));
  text(receipt ? "Receipt" : "Tax invoice", W - M, H - 50, F.med, 12, C.lime, "right");
  text(d.number, W - M, H - 78, F.bold, 24, C.white, "right");

  // Who and when
  let y = H - band - 44;
  const col = (x: number, label: string, rows: [string, PDFFont, number?][]) => {
    text(label, x, y, F.reg, 8.5, C.muted);
    let yy = y - 17;
    for (const [s, f, sz] of rows) { if (s) { text(fit(s, f, sz ?? 10.5, 150), x, yy, f, sz ?? 10.5, C.ink); yy -= 14.5; } }
  };
  const x2 = M + 180, x3 = M + 360;
  col(M, receipt ? "Received from" : "Bill to", [[d.to_name, F.med], [d.to_email, F.light]]);
  col(x2, "From", [[d.pay.trading_name || "Mahi Man", F.med], [d.pay.legal_name ?? "", F.light], [d.pay.abn ? `ABN ${d.pay.abn}` : "", F.light]]);
  col(x3, receipt ? "Paid" : "Issued", receipt
    ? [[d.paid_on ?? "", F.med], [d.method ? `By ${d.method.toLowerCase()}` : "", F.light]]
    : [[d.issued, F.med]]);

  // The amount, big
  y -= 92;
  const big = money(d.total_cents);
  const bw = text(big, M, y, F.bold, 34, C.ink);
  text(receipt ? "paid in full" : `due ${d.due}`, M + bw + 12, y + 2, F.med, 17, C.emerald);
  y -= 18;
  text(receipt ? "Thank you. This receipt is for the invoice below." : "Connection fees for jobs booked on Mahi Man.", M, y, F.light, 10.5, C.body);

  // Lines. Long invoices carry on to more pages, each with the column headings again.
  y -= 34;
  const cx = { date: M + 12, job: M + 100, who: M + 340, amt: W - M - 12 };
  const heads = () => {
    page.drawRectangle({ x: M, y: y - 9, width: W - 2 * M, height: 26, color: C.ground });
    text("Date", cx.date, y, F.med, 9, C.muted);
    text("Job", cx.job, y, F.med, 9, C.muted);
    text("Worker", cx.who, y, F.med, 9, C.muted);
    text("Amount", cx.amt, y, F.med, 9, C.muted, "right");
    y -= 30;
  };
  const more = () => {
    page = doc.addPage([W, H]); pages.push(page);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.emerald });
    text(`${receipt ? "Receipt" : "Tax invoice"} ${d.number}, continued`, M, H - 52, F.med, 12, C.ink);
    y = H - 90;
  };
  heads();
  for (const l of d.lines) {
    if (y < 90) { more(); heads(); }
    text(l.date, cx.date, y, F.light, 10.5, C.body);
    text(fit(l.job, F.reg, 10.5, cx.who - cx.job - 14), cx.job, y, F.reg, 10.5, C.ink);
    text(l.who || "—", cx.who, y, F.light, 10.5, C.body);
    text(money(l.cents), cx.amt, y, F.reg, 10.5, C.ink, "right");
    hr(y - 11);
    y -= 28;
  }

  // Totals, right side, and the pay box: on a new page if they don't fit.
  const payRows = receipt ? 0 : [d.pay.payid, d.pay.bsb, d.pay.account, d.pay.account_name || d.pay.trading_name, d.number].filter(Boolean).length;
  if (y - 90 - (receipt ? 0 : 68 + payRows * 19) < 70) more();
  const gst = Math.round(d.total_cents / 11);
  const tx = W - M - 220, tr = W - M - 12;
  y -= 6;
  const trow = (k: string, v: string, f = F.light, size = 10.5, color = C.body) => { text(k, tx, y, f, size, color); text(v, tr, y, f === F.light ? F.reg : f, size, C.ink, "right"); y -= 20; };
  trow("Subtotal (excluding GST)", money(d.total_cents - gst));
  trow("GST", money(gst));
  hr(y + 9, tx, W - M);
  y -= 4;
  trow("Total (including GST)", money(d.total_cents), F.bold, 13, C.ink);

  // How to pay (invoice) / thanks (receipt)
  y -= 22;
  if (!receipt) {
    const rows: [string, string | undefined][] = [["PayID", d.pay.payid], ["BSB", d.pay.bsb], ["Account", d.pay.account], ["Account name", d.pay.account_name || d.pay.trading_name], ["Reference", d.number]];
    const shown = rows.filter(([, v]) => v);
    const bh = 46 + shown.length * 19;
    page.drawRectangle({ x: M, y: y - bh, width: W - 2 * M, height: bh, color: C.ground });
    let py = y - 26;
    text("How to pay", M + 18, py, F.bold, 12.5, C.ink);
    text("By bank transfer. Use the reference so we can match your payment.", M + 120, py, F.light, 9.5, C.body);
    py -= 24;
    for (const [k, v] of shown) { text(k, M + 18, py, F.light, 10.5, C.muted); text(v!, M + 120, py, k === "Reference" || k === "PayID" ? F.bold : F.reg, 10.5, C.ink); py -= 19; }
  }

  // Footer on every page
  pages.forEach((pg, i) => {
    page = pg;
    hr(56);
    text(`Mahi Man · mahiman.app`, M, 38, F.reg, 8.5, C.muted);
    text(`${receipt ? "Receipt" : "Tax invoice"} ${d.number} · Page ${i + 1} of ${pages.length}`, W - M, 38, F.light, 8.5, C.muted, "right");
  });
  return await doc.save();
}

function drawHead(page: PDFPage, img: PDFImage, x: number, y: number, size: number) {
  page.drawImage(img, { x, y, width: size, height: size });
}

// The fonts and the mascot head, fetched once per run from the website.
export async function loadAssets(site: string): Promise<Assets> {
  const get = async (p: string) => {
    const r = await fetch(`${site}${p}`);
    if (!r.ok || /text\/html/.test(r.headers.get("content-type") ?? "")) throw new Error(`${p} ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const head = await get("/mahi-head.png");
  try {
    const [a, b, c, e] = await Promise.all(["300", "400", "500", "600"].map((w) => get(`/fonts/bricolage-${w}.ttf`)));
    return { fonts: { "300": a, "400": b, "500": c, "600": e }, head };
  } catch { return { fonts: null, head }; }
}
