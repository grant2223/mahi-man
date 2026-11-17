// Payment history: one list of everything money-related, newest first, the way banks and Airtasker show it.
// Fees taken from credit, top-ups and their bonus, invoices, Plus and gift cards, each with its status and a receipt.
import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/supabase";
import { go } from "../lib/router";
import { money2 } from "../lib/format";
import { useSession } from "../lib/session";
import { usePayments, fmtAbn } from "./Payments";
import { Icon, Loading, SearchPicker, useToast } from "./kit";
import { ActionBar } from "./Completion";

export type HistKind = "fee" | "topup" | "credit" | "invoice" | "plus" | "gift" | "gift_job" | "refund";
export type HistStatus = "done" | "checking" | "waiting" | "due" | "late";
export interface HistRow {
  kind: HistKind; id: number | string; title: string; at: string; amount: number;
  // "in" adds to credit, "out" comes off credit, "paid" is money you sent us.
  flow: "in" | "out" | "paid"; status: HistStatus; via: "credit" | "bank" | "card" | "gift"; ref: string | null; note: string | null;
}

const TZ = "Australia/Brisbane";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).replace(",", "");
const dayY = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const month = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: TZ });

export const KINDS: { id: "all" | HistKind; label: string }[] = [
  { id: "all", label: "Everything" }, { id: "fee", label: "Connection fees" }, { id: "topup", label: "Credit and top-ups" },
  { id: "invoice", label: "Invoices" }, { id: "plus", label: "Plus" }, { id: "gift", label: "Gift cards" },
];
const PERIODS = [
  { id: "90", label: "Last 3 months" }, { id: "fy", label: "This financial year" }, { id: "lfy", label: "Last financial year" }, { id: "all", label: "All time" },
];

const giftIc = (c: string) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="13" rx="1" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" /></svg>;
export const glyph = (k: HistKind, c: string) =>
  k === "topup" || k === "credit" ? Icon.plus(c) : k === "invoice" ? Icon.doc(c) : k === "plus" ? Icon.star(c) : k === "gift" || k === "gift_job" ? giftIc(c)
    : k === "refund" ? Icon.repeat(c) : Icon.card(c);
const viaText = { credit: "From credit", bank: "Bank transfer", card: "Card", gift: "Gift card" } as const;
const tag = (s: HistStatus) => s === "checking" ? <span className="ph-tag">Checking</span> : s === "waiting" ? <span className="ph-tag">Not paid yet</span>
  : s === "due" ? <span className="ph-tag">Due</span> : s === "late" ? <span className="ph-tag late">Overdue</span> : null;

// Saves a PDF: the share sheet on the phone, a download on the web.
export async function savePdfDoc(doc: { output: (t: "datauristring") => string; save: (n: string) => void }, name: string) {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = doc.output("datauristring").split(",")[1];
    const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ files: [f.uri], dialogTitle: "Save PDF" });
  } else doc.save(name);
}
type PdfPay = { legal_name?: string; trading_name?: string; abn?: string };
async function pdfHead(title: string, pay: PdfPay, to: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 56, R = 539;
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text(title, L, 70);
  doc.setFontSize(12); doc.text("Mahi Man", R, 70, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
  let y = 100;
  [`${pay.legal_name ?? ""}${pay.trading_name ? `, trading as ${pay.trading_name}` : ""}`, pay.abn ? `ABN ${fmtAbn(pay.abn)}` : "", "", `To: ${to}`]
    .forEach((t) => { if (t) doc.text(t, L, y); y += 15; });
  return { doc, L, R, y: y + 10 };
}
const signed = (r: HistRow) => `${r.flow === "in" ? "+" : r.flow === "out" ? "-" : ""}${money2(r.amount)}`;
async function statementPdf(rows: HistRow[], show: string, period: string, pay: PdfPay, to: string) {
  const h = await pdfHead("Statement", pay, to);
  const { doc, L, R } = h; let y = h.y;
  doc.text(`${show} · ${period} · made ${dayY(new Date().toISOString())}`, L, y); y += 26;
  doc.setFont("helvetica", "bold"); doc.text("Date", L, y); doc.text("What", L + 90, y); doc.text("Amount", R, y, { align: "right" }); y += 8;
  doc.setDrawColor(220); doc.line(L, y, R, y); y += 18; doc.setFont("helvetica", "normal");
  for (const r of rows) {
    if (y > 780) { doc.addPage(); y = 70; }
    const what = doc.splitTextToSize(`${r.title} · ${r.note ?? viaText[r.via]}${r.status === "checking" ? " (checking)" : ""}`, 330) as string[];
    doc.text(dayY(r.at), L, y); doc.text(what, L + 90, y); doc.text(signed(r), R, y, { align: "right" }); y += 15 * what.length + 6;
  }
  if (!rows.length) doc.text("Nothing in this period.", L, y);
  y += 10; doc.line(L, y, R, y); y += 18;
  doc.setFontSize(9); doc.text("+ adds to your connection fee credit. - is taken from your credit. Other amounts are payments you made to Mahi Man.", L, y);
  await savePdfDoc(doc, `Mahi-Man-statement.pdf`);
}

export function openRow(r: HistRow) {
  if (r.kind === "invoice") go(`/invoice/${r.id}`);
  else if (r.kind === "gift") go(`/gifts/${r.id}`);
  else go(`/payments/receipt/${r.kind}/${r.id}`);
}

export function HistRowView({ r }: { r: HistRow }) {
  const amt = `${r.flow === "in" ? "+" : r.flow === "out" ? "−" : ""}${money2(r.amount)}`;
  return (
    <button className="ph-row" onClick={() => openRow(r)}>
      <span className="ph-ic">{glyph(r.kind, r.flow === "in" ? "var(--emerald)" : "var(--ink)")}</span>
      <span className="ph-t"><span className="ph-name">{r.title}</span>
        <span className="ph-sub">{day(r.at)} · {r.note ?? viaText[r.via]}</span></span>
      <span className="ph-r"><span className={r.flow === "in" ? "ph-amt in" : "ph-amt"}>{amt}</span>{tag(r.status)}</span>
    </button>
  );
}

// Rows grouped by month, like a bank statement.
export function HistList({ rows }: { rows: HistRow[] }) {
  const groups = useMemo(() => {
    const g: { m: string; rows: HistRow[] }[] = [];
    for (const r of rows) { const m = month(r.at); if (g[g.length - 1]?.m !== m) g.push({ m, rows: [] }); g[g.length - 1].rows.push(r); }
    return g;
  }, [rows]);
  return <>{groups.map((g) => <div key={g.m} className="ph-month"><span className="ph-m">{g.m}</span>{g.rows.map((r) => <HistRowView key={`${r.kind}-${r.id}`} r={r} />)}</div>)}</>;
}

export function useHistory(kind: string, period: string, limit: number) {
  const [rows, setRows] = useState<HistRow[] | null>(null);
  const load = useCallback(() => rpc<HistRow[]>("payment_history", { p_kind: kind, p_period: period, p_limit: limit }).then((r) => setRows(r ?? [])).catch(() => setRows([])), [kind, period, limit]);
  useEffect(() => { load(); }, [load]);
  return rows;
}

/* ---------- All of it, with a filter and a statement ---------- */
export function HistoryPage() {
  const toast = useToast();
  const { profile } = useSession();
  const { p } = usePayments();
  const [kind, setKind] = useState<string>("all");
  const [period, setPeriod] = useState("90");
  const [pick, setPick] = useState<"kind" | "period" | null>(null);
  const rows = useHistory(kind, period, 500);
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <div className="screen-head brand"><button className="back" onClick={() => (history.length > 1 ? history.back() : go("/payments"))} aria-label="Back">{Icon.back("#fff")}</button><h3>History</h3></div>
      <div className="ph-filters">
        <button className="cp-select" onClick={() => setPick("kind")}><span>{KINDS.find((k) => k.id === kind)?.label}</span>{Icon.down("var(--muted)")}</button>
        <button className="cp-select" onClick={() => setPick("period")}><span>{PERIODS.find((k) => k.id === period)?.label}</span>{Icon.down("var(--muted)")}</button>
      </div>
      <div className="ph-list">
        {!rows ? <Loading /> : rows.length ? <HistList rows={rows} /> : <p className="ph-none">Nothing here yet</p>}
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar><button className="btn stone" style={{ flex: 1 }} disabled={!rows} onClick={() => statementPdf(rows ?? [], KINDS.find((k) => k.id === kind)?.label ?? "", PERIODS.find((k) => k.id === period)?.label ?? "", p?.pay ?? {}, profile?.full_name ?? "")
          .catch(() => toast("Couldn't save the statement"))}>Download statement</button></ActionBar>
      {pick === "kind" && <SearchPicker title="Show" options={KINDS} value={[kind]} onClose={() => setPick(null)} onChange={(v) => setKind(String(v[0]))} />}
      {pick === "period" && <SearchPicker title="Period" options={PERIODS} value={[period]} onClose={() => setPick(null)} onChange={(v) => setPeriod(String(v[0]))} />}
    </div>
  );
}

/* ---------- One receipt (top-up, Plus, fee from credit) ---------- */
interface Receipt { kind: HistKind; title: string; amount: number; at: string; status: HistStatus; via: HistRow["via"]; ref: string | null;
  lines: { k: string; v: string }[]; confirmed_at: string | null }

export function ReceiptPage({ kind, id }: { kind: string; id: string }) {
  const toast = useToast();
  const { profile } = useSession();
  const { p } = usePayments();
  const save = async (r: Receipt) => {
    const h = await pdfHead("Receipt", p?.pay ?? {}, profile?.full_name ?? "");
    const { doc, L, R } = h; let y = h.y + 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(r.title, L, y); doc.text(money2(r.amount), R, y, { align: "right" }); y += 26;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    const rows = [[r.status === "done" ? "Confirmed" : "Sent", dayY(r.confirmed_at ?? r.at)], ...r.lines.map((l) => [l.k, l.v]), ["Paid by", viaText[r.via]], ...(r.ref ? [["Reference", r.ref]] : [])];
    for (const [k, v] of rows) { doc.text(k, L, y); doc.text(v, R, y, { align: "right" }); y += 18; }
    y += 10; doc.text(p?.pay?.gst === "yes" ? "Includes GST" : "No GST charged", L, y);
    await savePdfDoc(doc, `Mahi-Man-receipt${r.ref ? `-${r.ref}` : ""}.pdf`);
  };
  const [r, setR] = useState<Receipt | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { rpc<Receipt>("payment_receipt", { p_kind: kind, p_id: id }).then(setR).catch(() => setFailed(true)); }, [kind, id]);
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <div className="screen-head brand"><button className="back" onClick={() => (history.length > 1 ? history.back() : go("/payments"))} aria-label="Back">{Icon.back("#fff")}</button><h3>Receipt</h3></div>
      {!r ? (failed ? <p className="ph-none" style={{ padding: "20px 16px" }}>We couldn't find that receipt.</p> : <Loading />) : <>
        <div className="ph-rc">
          <span className="ph-rc-t">{r.title}</span>
          <span className="iv-big">{money2(r.amount)}</span>
          <span className="ph-rc-s">{r.status === "done" ? `Confirmed ${day(r.confirmed_at ?? r.at)}` : r.status === "checking" ? "We're checking it with our bank" : "Not paid yet"}</span>
        </div>
        <div className="ph-rc-rows">
          {r.lines.map((l) => <div key={l.k} className="ph-rc-row"><span>{l.k}</span><span>{l.v}</span></div>)}
          {r.status !== "done" && <div className="ph-rc-row"><span>Sent</span><span>{day(r.at)}</span></div>}
          <div className="ph-rc-row"><span>Paid by</span><span>{viaText[r.via]}</span></div>
          {r.ref && <div className="ph-rc-row"><span>Reference</span><span>{r.ref}</span></div>}
        </div>
        <div style={{ flex: 1 }} />
        <ActionBar><button className="btn stone" style={{ flex: 1 }} onClick={() => save(r).catch(() => toast("Couldn't save the PDF"))}>Save PDF</button></ActionBar>
      </>}
    </div>
  );
}
