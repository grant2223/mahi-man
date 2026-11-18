// Payment history: one list of everything money-related, newest first, the way banks and Airtasker show it.
// Fees taken from credit, top-ups and their bonus, invoices, Plus and gift cards, each with its status and a receipt.
import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc, sb } from "../lib/supabase";
import { go } from "../lib/router";
import { money2 } from "../lib/format";
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

// Every PDF comes from the server's branded template (the same one the emailed invoices use), then is shared or downloaded.
export async function saveDocument(body: Record<string, unknown>) {
  const { data, error } = await sb.functions.invoke("documents", { body });
  if (error || !data?.pdf) throw new Error(data?.error ?? "Couldn't make the PDF");
  const { Capacitor } = await import("@capacitor/core");
  const name = String(data.name ?? "Mahi-Man.pdf");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const f = await Filesystem.writeFile({ path: name, data: data.pdf, directory: Directory.Cache });
    await Share.share({ files: [f.uri], dialogTitle: "Save PDF" });
  } else {
    const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
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
        <span className="ph-sub">{day(r.at)}, {r.note ?? viaText[r.via]}</span></span>
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
  const [saving, setSaving] = useState(false);
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
      <ActionBar><button className="btn stone" style={{ flex: 1 }} disabled={!rows || saving} onClick={async () => {
          setSaving(true);
          try { await saveDocument({ doc: "statement", kind, period, label: `${KINDS.find((k) => k.id === kind)?.label}, ${PERIODS.find((k) => k.id === period)?.label.toLowerCase()}`, period_label: PERIODS.find((k) => k.id === period)?.label }); }
          catch { toast("Couldn't save the statement"); } finally { setSaving(false); }
        }}>{saving ? "Making your statement…" : "Download statement"}</button></ActionBar>
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
  const [saving, setSaving] = useState(false);
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
        <ActionBar><button className="btn stone" style={{ flex: 1 }} disabled={saving} onClick={async () => { setSaving(true); try { await saveDocument({ doc: "receipt", kind, id }); } catch { toast("Couldn't save the PDF"); } finally { setSaving(false); } }}>{saving ? "Making your PDF…" : "Save PDF"}</button></ActionBar>
      </>}
    </div>
  );
}
