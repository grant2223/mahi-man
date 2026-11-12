import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { api, rpc, sb, myId } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money, money2 } from "../lib/format";
import { Icon, Loading, SearchPicker, StepHero, useToast } from "./kit";
import { ActionBar } from "./Completion";
import { AuthScreen } from "./Auth";
import { stripeFor } from "../customer/Cards";

/* How customers pay Mahi Man: pay as you go (invoiced by bank transfer), a top-up balance, or Plus.
   Every number comes from the live settings through my_payments(). */

export interface PayDetails { trading_name?: string; legal_name?: string; abn?: string; payid?: string; bsb?: string; account?: string; account_name?: string }
interface Line { date: string; job: string; who: string; cents: number }
interface InvoiceRow { id: number; number: string; total: number; status: "due" | "claimed" | "paid"; issued_at: string; due_at: string }
interface TopupRow { id: number; reference: string; amount: number; status: "requested" | "claimed"; created_at: string }
export interface MyPayments {
  mode: string; card_live: boolean;
  rates: { payg: number; payg_max: number; topup: number; topup_max: number; plus: number; plus_max: number; plus_cents: number; auto_topup: number; auto_below: number };
  balance: number; gift_balance: number; gift_from: string | null; plan: "now" | "weekly" | "fortnightly"; payday: number; anchor: string | null;
  plus_until: string | null; plus_renew: boolean; auto_topup: boolean; card: string | null; pay: PayDetails;
  next: { total: number; lines: Line[] }; invoices: InvoiceRow[]; log: { delta: number; kind: string; note: string; at: string }[]; topups: TopupRow[];
  gifts: { id: number; amount: number; to: string; status: string; send_by: string; send_on: string; sent_at: string | null; redeemed: boolean }[];
}

const TZ = "Australia/Brisbane";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayLong = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: TZ });
export const dayShort = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).replace(",", "");
const isPlus = (p: MyPayments) => !!p.plus_until && new Date(p.plus_until) > new Date();
const back = (to: string) => () => (history.length > 1 ? history.back() : go(to));

// Brisbane has no daylight saving, so a date there is UTC+10.
const brisDate = (ms = Date.now()) => { const d = new Date(ms + 10 * 3600_000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const noonIso = (d: Date) => new Date(d.getTime() + 2 * 3600_000).toISOString(); // midday in Brisbane

// The next payday an invoice will be due on. Invoices are made at 6pm the day before.
export function nextPayday(p: Pick<MyPayments, "plan" | "payday" | "anchor">): Date | null {
  if (p.plan === "now") return null;
  const today = brisDate();
  for (let i = 1; i <= 21; i++) {
    const d = new Date(today.getTime() + i * 86400_000);
    if (d.getUTCDay() !== p.payday) continue;
    if (p.plan === "fortnightly" && p.anchor && Math.round((d.getTime() - Date.parse(`${p.anchor}T00:00:00Z`)) / 86400_000 / 7) % 2 !== 0) continue;
    const madeAt = d.getTime() - 86400_000 + 8 * 3600_000; // 6pm Brisbane the day before, in UTC
    if (madeAt > Date.now()) return d;
  }
  return null;
}

let claimed = false;
// Gifts emailed to this account go into its wallet: checked once per app start.
export function claimGifts() { if (claimed) return; claimed = true; rpc("gift_autoclaim").catch(() => {}); }
export function usePayments(enabled = true) {
  const [p, setP] = useState<MyPayments | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    // Gifts emailed to this account go into the wallet the first time payments load.
    const first = claimed ? Promise.resolve(0) : rpc<number>("gift_autoclaim").catch(() => 0);
    claimed = true;
    first.then(() => rpc<MyPayments>("my_payments")).then(setP).catch(() => {});
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  return { p, reload: load };
}

function useCopy() {
  const toast = useToast();
  return (t: string) => navigator.clipboard?.writeText(t).then(() => toast("Copied"), () => toast(t));
}
function PayRow({ k, v, sub, copy }: { k: string; v: string; sub?: string; copy?: string }) {
  const doCopy = useCopy();
  return (
    <div className="iv-pay-row">
      <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}><span className="k">{k}</span><span className="v">{v}</span>{sub && <span className="t14 light muted">{sub}</span>}</span>
      <button className="btn stone small" onClick={() => doCopy(copy ?? v)}>Copy</button>
    </div>
  );
}
// PayID and reference, then BSB and account.
export function BankDetails({ pay, reference }: { pay: PayDetails; reference: string }) {
  const bank = pay.bsb && pay.account ? `${pay.bsb} · ${pay.account}` : "";
  if (!pay.payid && !bank) return <span className="t15 light muted">Our bank details are being set up. Pay this once they show here.</span>;
  return (
    <>
      {pay.payid && <PayRow k="PayID" v={pay.payid} />}
      <PayRow k="Reference" v={reference} />
      {bank && <PayRow k={pay.payid ? "Or BSB and account" : "BSB and account"} v={bank} sub={pay.account_name || pay.legal_name} copy={`BSB ${pay.bsb} Account ${pay.account} ${pay.account_name ?? ""}`.trim()} />}
    </>
  );
}

const STATUS: Record<string, [string, string]> = { due: ["y", "To pay"], late: ["r", "Overdue"], claimed: ["", "Checking"], paid: ["g", "Paid"] };
const invState = (i: { status: string; due_at: string }) => (i.status === "due" && new Date(i.due_at) < new Date() ? "late" : i.status);
const Badge = ({ s }: { s: string }) => <span className={`badge ${STATUS[s]?.[0] ?? ""}`}>{STATUS[s]?.[1] ?? s}</span>;

/* ---------- How you pay (was Pricing) ---------- */
export function HowYouPay() {
  const { session } = useSession();
  const [r, setR] = useState({ payg: 12, payg_max: 3000, topup: 10, topup_max: 2500, plus: 6, plus_max: 1500, plus_cents: 999 });
  const [auth, setAuth] = useState<string | null>(null);
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["booking_fee_percent", "booking_fee_max_cents", "topup_fee_percent", "topup_fee_max_cents", "plus_fee_percent", "plus_fee_max_cents", "plus_cents"]).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((x) => [x.key, Number(x.value)]));
      setR((c) => ({ payg: m.booking_fee_percent || c.payg, payg_max: m.booking_fee_max_cents || c.payg_max, topup: m.topup_fee_percent || c.topup, topup_max: m.topup_fee_max_cents || c.topup_max,
        plus: m.plus_fee_percent || c.plus, plus_max: m.plus_fee_max_cents || c.plus_max, plus_cents: m.plus_cents || c.plus_cents }));
    });
  }, []);
  // A weekly regular: 4 jobs of $80 in a month.
  const eg = (pct: number, max: number) => 4 * Math.min(Math.round((8000 * pct) / 100), max);
  const dollars = (c: number) => `$${Math.round(c / 100)}`;
  const open = (to: string) => (session ? go(to) : setAuth(to));
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <StepHero title="How you pay" sub="Pick what suits how often you book." onBack={back("/")} />
      <div className="pl-table">
        <div className="pl-row pl-head"><span /><b>Pay as you go</b><b>Top-up</b><b><span className="pl-badge">Plus</span></b></div>
        <div className="pl-row"><span>Connection fee</span><b>{r.payg}%</b><b>{r.topup}%</b><b className="pl-plus">{r.plus}%</b></div>
        <div className="pl-row"><span>Fee cap</span><span>{dollars(r.payg_max)}</span><span>{dollars(r.topup_max)}</span><span className="pl-plus">{dollars(r.plus_max)}</span></div>
        <div className="pl-row"><span>Each month</span><span>Nothing</span><span>Nothing</span><span className="pl-plus">{money2(r.plus_cents)}</span></div>
        <div className="pl-row"><span>Priority and fix-it guarantee</span><span>—</span><span>—</span><span className="pl-plus">{Icon.tick("var(--emerald)", 20)}</span></div>
        <div className="pl-row pl-eg"><span>Weekly, 4 jobs of $80</span><b>{money2(eg(r.payg, r.payg_max))}</b><b>{money2(eg(r.topup, r.topup_max))}</b><b className="pl-plus">{money2(eg(r.plus, r.plus_max) + r.plus_cents)}</b></div>
      </div>
      <div className="cp-sec" style={{ paddingBottom: Capacitor.isNativePlatform() ? 18 : "calc(var(--safe-bottom) + 32px)" }}>
        <Li b="Pay as you go" s="Nothing upfront. Pay the fee by bank transfer, after each job, weekly or every 2 weeks on your payday." />
        <Li b="Top-up" s="Add $25, $50 or $100 by card or bank. Fees come off your balance automatically." />
        <Li b="Plus" s="For regulars. Your jobs go to the top, top-rated workers first, and if it's not done as listed we send someone to finish it." />
      </div>
      {Capacitor.isNativePlatform() && (
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={() => open("/topup")}>Top up</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => open("/plus")}>Get Plus</button>
        </ActionBar>
      )}
      {auth && <AuthScreen title={auth === "/plus" ? "Get Plus" : "Top up"} reason="Sign in to add to your balance." onBack={() => setAuth(null)} onDone={() => { const to = auth; setAuth(null); go(to); }} />}
    </div>
  );
}
const Li = ({ b, s }: { b: string; s: string }) => <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>{b}</b>{s}</span></div>;

/* ---------- Payments (Settings) ---------- */
const PLAN_OPTS = [
  { id: "now", label: "Invoice me after each job" },
  { id: "weekly", label: "Invoice me weekly, on payday" },
  { id: "fortnightly", label: "Invoice me every 2 weeks, on payday" },
];

export function PaymentsPage() {
  const toast = useToast();
  const { p, reload } = usePayments();
  const [plan, setPlan] = useState<MyPayments["plan"]>("now");
  const [payday, setPayday] = useState(3);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [pick, setPick] = useState<"plan" | "payday" | "anchor" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p) { setPlan(p.plan); setPayday(p.payday); setAnchor(p.anchor); } }, [p]);
  if (!p) return <Page title="Payments"><Loading /></Page>;

  const plus = isPlus(p);
  const line = plus ? `Plus · fees are ${p.rates.plus}%${p.plus_renew ? `, renews ${dayShort(p.plus_until!)}` : `, ends ${dayShort(p.plus_until!)}`}`
    : p.balance > 0 ? `Top-up · fees are ${p.rates.topup}% instead of ${p.rates.payg}%` : `Pay as you go · fees are ${p.rates.payg}%`;
  // Fortnightly needs to know which week: the next two of that weekday.
  const anchorOpts = [7, 14].map((n) => { const t = brisDate(); const d = new Date(t.getTime() + 86400_000 * (((payday - t.getUTCDay() + 7) % 7) || 7)); return new Date(d.getTime() + (n - 7) * 86400_000); });
  const dirty = plan !== p.plan || (plan !== "now" && payday !== p.payday) || (plan === "fortnightly" && anchor !== p.anchor);
  const pd = nextPayday(p);
  const save = async () => {
    if (plan === "fortnightly" && !anchorOpts.some((d) => isoDay(d) === anchor)) { setPick("anchor"); return; }
    setBusy(true);
    try { await rpc("set_payment_plan", { p_plan: plan, p_payday: payday, p_anchor: plan === "fortnightly" ? anchor : null }); toast("Saved"); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const stopPlus = async () => { try { await rpc("plus_stop"); toast("Plus won't renew"); reload(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } };

  return (
    <Page title="Payments">
      <div className="iv-hero">
        <span className="t15 light">Your balance</span>
        <span className="iv-big">{money2(p.balance)}</span>
        {p.gift_balance > 0 ? (
          <div className="gf-split">
            <span><b className="w5">{money2(p.gift_balance)}</b> gift{p.gift_from ? ` from ${p.gift_from}` : ""}<br /><span className="light muted">Pays jobs and fees</span></span>
            {p.balance - p.gift_balance > 0 && <span><b className="w5">{money2(p.balance - p.gift_balance)}</b> top-up<br /><span className="light muted">Pays fees</span></span>}
          </div>
        ) : <span className="t15 light">{line}</span>}
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn primary small" onClick={() => go("/topup")}>Top up</button>
          <button className="btn stone small" onClick={() => go("/gift")}>Give help</button>
          <button className="btn stone small" onClick={() => go("/gift-code")}>Add a gift code</button>
          {plus && (p.plus_renew ? <button className="btn stone small" onClick={stopPlus}>Stop Plus</button>
            : <button className="btn stone small" onClick={() => go("/plus")}>Keep Plus</button>)}
        </div>
      </div>

      {p.topups.map((t) => (
        <button key={t.id} className="iv-wait" onClick={() => go(`/topup?id=${t.id}`)}>
          <span className="stack" style={{ gap: 2, flex: 1, textAlign: "left" }}><span className="w5">{money(t.amount)} top-up</span>
            <span className="t14 light muted">{t.status === "claimed" ? "Checking your transfer" : `Waiting for your transfer · ${t.reference}`}</span></span>
          {Icon.chevron("var(--faint)")}
        </button>
      ))}

      {p.gifts.length > 0 && (
        <div className="cp-sec iv-band" style={{ gap: 0 }}>
          <span className="cp-title">Gifts you've given</span>
          {p.gifts.map((g) => (
            <button key={g.id} className="iv-past" onClick={() => go(`/gifts/${g.id}`)}>
              <span className="stack" style={{ gap: 2, flex: 1, textAlign: "left" }}><span className="w5">{money(g.amount)} for {g.to}</span>
                <span className="t14 light muted">{g.redeemed ? "In their wallet" : g.status === "requested" ? "Waiting for your transfer" : g.status === "claimed" ? "Checking your transfer"
                  : g.sent_at ? (g.send_by === "email" ? "Emailed" : "Sent") : `Sends ${dayShort(`${g.send_on}T02:00:00Z`)}`}</span></span>
              {Icon.chevron("var(--faint)")}
            </button>
          ))}
        </div>
      )}

      {p.log.length > 0 && (
        <div className="cp-sec iv-band" style={{ gap: 0 }}>
          <span className="cp-title">Recent</span>
          {p.log.slice(0, 5).map((l, i) => (
            <div key={i} className="iv-past" style={{ cursor: "default" }}>
              <span className="stack" style={{ gap: 2, flex: 1, textAlign: "left" }}><span>{l.kind === "gift_job" ? `${l.note}, paid to your worker` : l.kind === "fee" ? `${l.note}, fee` : l.note}</span><span className="t14 light muted">{dayShort(l.at)}</span></span>
              <span className={l.delta > 0 ? "w5 em" : "w5"}>{l.delta > 0 ? "+" : "−"}{money2(Math.abs(l.delta))}</span>
            </div>
          ))}
        </div>
      )}

      {p.next.total > 0 && (
        <div className="cp-sec iv-band">
          <span className="cp-title" style={{ margin: 0 }}>Next invoice</span>
          <div className="iv-next-top"><span className="iv-big">{money2(p.next.total)}</span>
            {pd && <span className="t15 light" style={{ textAlign: "right" }}>Ready {dayLong(noonIso(new Date(pd.getTime() - 86400_000)))}<br />Due {dayLong(noonIso(pd))}</span>}
          </div>
          {p.next.lines.map((l, i) => <div key={i} className="cp-row"><span>{dayShort(l.date)} · {l.job}{l.who ? ` · ${l.who}` : ""}</span><span>{money2(l.cents)}</span></div>)}
        </div>
      )}

      {p.invoices.length > 0 && (
        <div className="cp-sec iv-band" style={{ gap: 0 }}>
          <span className="cp-title">Invoices</span>
          {p.invoices.map((i) => (
            <button key={i.id} className="iv-past" onClick={() => go(`/invoice/${i.id}`)}>
              <span className="stack" style={{ gap: 2, flex: 1, textAlign: "left" }}><span className="w5">{money2(i.total)}</span><span className="t14 light muted">{i.status === "paid" ? `Issued ${dayShort(i.issued_at)}` : `Due ${dayShort(i.due_at)}`} · {i.number}</span></span>
              <Badge s={invState(i)} />{Icon.chevron("var(--faint)")}
            </button>
          ))}
        </div>
      )}

      <div className="cp-sec iv-band" style={{ gap: 8, paddingBottom: "calc(var(--safe-bottom) + 28px)" }}>
        <span className="cp-title" style={{ margin: 0 }}>If your balance runs out</span>
        <span className="t14 light muted" style={{ marginBottom: 4 }}>Fees are invoiced and paid by bank transfer. One transfer covers all your jobs.</span>
        <button className="cp-select" onClick={() => setPick("plan")}><span>{PLAN_OPTS.find((o) => o.id === plan)?.label}</span>{Icon.chevron("var(--muted)")}</button>
        {plan !== "now" && <button className="cp-select" onClick={() => setPick("payday")}><span>Payday: {DAYS[payday]}</span>{Icon.chevron("var(--muted)")}</button>}
        {plan === "fortnightly" && <button className="cp-select" onClick={() => setPick("anchor")}><span className={anchorOpts.some((d) => isoDay(d) === anchor) ? "" : "ph"}>{anchor && anchorOpts.some((d) => isoDay(d) === anchor) ? `Next payday: ${dayLong(noonIso(new Date(`${anchor}T00:00:00Z`)))}` : "Pick your next payday"}</span>{Icon.chevron("var(--muted)")}</button>}
        {dirty && <button className="btn primary" style={{ alignSelf: "flex-start", marginTop: 6 }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>}
      </div>

      {pick === "plan" && <SearchPicker title="How you're invoiced" options={PLAN_OPTS} value={[plan]} onClose={() => setPick(null)} onChange={(v) => setPlan(v[0] as MyPayments["plan"])} />}
      {pick === "payday" && <SearchPicker title="Your payday" options={DAYS.map((d, i) => ({ id: i, label: d }))} value={[payday]} onClose={() => setPick(null)} onChange={(v) => { setPayday(Number(v[0])); setAnchor(null); }} />}
      {pick === "anchor" && <SearchPicker title="Your next payday" options={anchorOpts.map((d) => ({ id: isoDay(d), label: dayLong(noonIso(d)) }))} value={anchor ? [anchor] : []} onClose={() => setPick(null)} onChange={(v) => setAnchor(String(v[0]))} />}
    </Page>
  );
}

function Page({ title, children, onBack }: { title: string; children: ReactNode; onBack?: () => void }) {
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <div className="screen-head brand"><button className="back" onClick={onBack ?? back("/settings")} aria-label="Back">{Icon.back("#fff")}</button><h3>{title}</h3></div>
      {children}
    </div>
  );
}

/* ---------- One invoice ---------- */
interface InvoiceDetail { id: number; number: string; total: number; gst: number; status: string; issued_at: string; due_at: string; paid_at: string | null; to: string; pay: PayDetails; lines: Line[] }

export function InvoicePage({ id }: { id: number }) {
  const toast = useToast();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => rpc<InvoiceDetail | null>("invoice_detail", { p_id: id }).then(setInv).catch(() => {}), [id]);
  useEffect(() => { load(); }, [load]);
  if (!inv) return <Page title="Invoice" onBack={back("/payments")}><Loading /></Page>;
  const st = invState(inv);
  const pay = inv.pay ?? {};
  return (
    <Page title={`Invoice ${inv.number}`} onBack={back("/payments")}>
      <div className="iv-hero">
        <span className="t15 light">{st === "paid" ? `Paid ${dayLong(inv.paid_at ?? inv.due_at)}` : st === "late" ? `Was due ${dayLong(inv.due_at)}` : `Due ${dayLong(inv.due_at)}`}</span>
        <span className="iv-big">{money2(inv.total)}</span>
        <Badge s={st} />
        {st === "claimed" && <span className="t15 light" style={{ marginTop: 6 }}>Thanks. We'll mark it paid as soon as it arrives.</span>}
      </div>
      {(st === "due" || st === "late") && (
        <div className="iv-pay iv-band">
          <span className="cp-title" style={{ margin: 0 }}>Pay by bank transfer</span>
          <BankDetails pay={pay} reference={inv.number} />
        </div>
      )}
      <div className="cp-sec iv-band" style={{ paddingBottom: 24 }}>
        <span className="cp-title">Tax invoice</span>
        <span className="t14 light muted">{pay.legal_name}{pay.trading_name ? `, trading as ${pay.trading_name}` : ""}{pay.abn ? ` · ABN ${pay.abn}` : ""}<br />To {inv.to} · Issued {dayLong(inv.issued_at)}</span>
        <div style={{ marginTop: 10 }}>{inv.lines.map((l, i) => <div key={i} className="cp-row"><span>{dayShort(l.date)} · {l.job}{l.who ? ` · ${l.who}` : ""}</span><span>{money2(l.cents)}</span></div>)}</div>
        <div className="cp-total"><span>Total</span><span>{money2(inv.total)}</span></div>
        <div className="cp-row"><span className="light muted">Includes GST</span><span className="light muted">{money2(inv.gst)}</span></div>
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        <button className="btn stone" style={{ flex: 1 }} onClick={() => savePdf(inv).catch(() => toast("Couldn't save the PDF"))}>Save PDF</button>
        {(st === "due" || st === "late") && (
          <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await rpc("invoice_claim_paid", { p_id: inv.id }); toast("Thanks. We'll match it up."); await load(); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : "I've paid"}</button>
        )}
      </ActionBar>
    </Page>
  );
}

async function savePdf(inv: InvoiceDetail) {
  const { jsPDF } = await import("jspdf");
  const pay = inv.pay ?? {};
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = 56, R = 539;
  let y = 70;
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("Tax invoice", L, y);
  doc.setFontSize(12); doc.text(inv.number, R, y, { align: "right" });
  y += 30; doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
  const from = [`${pay.legal_name ?? ""}${pay.trading_name ? `, trading as ${pay.trading_name}` : ""}`, pay.abn ? `ABN ${pay.abn}` : ""].filter(Boolean);
  from.forEach((t) => { doc.text(t, L, y); y += 15; });
  y += 10;
  doc.text(`To: ${inv.to}`, L, y); y += 15;
  doc.text(`Issued: ${dayLong(inv.issued_at)}`, L, y); y += 15;
  doc.text(`Due: ${dayLong(inv.due_at)}`, L, y); y += 30;
  doc.setFont("helvetica", "bold"); doc.text("Mahi Man connection fees", L, y); y += 8;
  doc.setDrawColor(220); doc.line(L, y, R, y); y += 18;
  doc.setFont("helvetica", "normal");
  for (const l of inv.lines) {
    const t = doc.splitTextToSize(`${dayShort(l.date)} · ${l.job}${l.who ? ` · ${l.who}` : ""}`, 380) as string[];
    doc.text(t, L, y); doc.text(money2(l.cents), R, y, { align: "right" }); y += 15 * t.length + 4;
  }
  doc.line(L, y, R, y); y += 20;
  doc.setFont("helvetica", "bold"); doc.text("Total", L, y); doc.text(money2(inv.total), R, y, { align: "right" }); y += 16;
  doc.setFont("helvetica", "normal"); doc.text("Includes GST", L, y); doc.text(money2(inv.gst), R, y, { align: "right" }); y += 36;
  if (inv.status === "paid") { doc.setFont("helvetica", "bold"); doc.text(`Paid ${dayLong(inv.paid_at ?? inv.due_at)}`, L, y); }
  else {
    doc.setFont("helvetica", "bold"); doc.text("Pay by bank transfer", L, y); y += 18; doc.setFont("helvetica", "normal");
    [pay.payid ? `PayID: ${pay.payid}` : "", pay.bsb ? `BSB: ${pay.bsb}   Account: ${pay.account ?? ""}` : "", pay.account_name ? `Account name: ${pay.account_name}` : "", `Reference: ${inv.number}`]
      .filter(Boolean).forEach((t) => { doc.text(t, L, y); y += 15; });
  }
  const name = `Mahi-Man-${inv.number}.pdf`;
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = doc.output("datauristring").split(",")[1];
    const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ files: [f.uri], dialogTitle: "Save PDF" });
  } else doc.save(name);
}

/* ---------- Top up ---------- */
const AMOUNTS = [2500, 5000, 10000];

export function TopUpPage() {
  const toast = useToast();
  const { p, reload } = usePayments();
  const [amount, setAmount] = useState(5000);
  const [via, setVia] = useState<"card" | "bank" | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [pick, setPick] = useState<"amount" | "via" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [bank, setBank] = useState<{ id: number; reference: string; amount: number; status: string; pay: PayDetails } | null>(null);
  const [key] = useState(() => crypto.randomUUID()); // one charge per visit, even if the button is pressed twice
  const waitingId = Number(new URLSearchParams(location.search).get("id")) || null;
  useEffect(() => {
    if (!p) return;
    const t = waitingId ? p.topups.find((x) => x.id === waitingId) : null;
    if (t) setBank({ ...t, pay: p.pay });
  }, [p, waitingId]);
  if (!p) return <Page title="Top up" onBack={back("/payments")}><Loading /></Page>;

  const canCard = p.card_live && !!p.card;
  const how = via ?? (canCard ? "card" : "bank");
  const autoOn = auto ?? p.auto_topup;

  if (bank) return (
    <Page title="Top up" onBack={back("/payments")}>
      <div className="iv-hero">
        <span className="t15 light">{bank.status === "claimed" ? "We're checking for your transfer" : "Pay by bank transfer"}</span>
        <span className="iv-big">{money2(bank.amount)}</span>
        <span className="t15 light">It's added to your balance as soon as it arrives.</span>
      </div>
      <div className="iv-pay iv-band"><BankDetails pay={bank.pay} reference={bank.reference} /></div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        {bank.status !== "claimed" && <button className="btn stone" style={{ flex: 1 }} disabled={busy} onClick={async () => {
          setBusy(true); try { await rpc("topup_cancel", { p_id: bank.id }); toast("Top-up cancelled"); go("/payments", true); } catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
        }}>Cancel it</button>}
        {bank.status !== "claimed" ? <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
          setBusy(true); try { await rpc("topup_claim_paid", { p_id: bank.id }); toast("Thanks. We'll add it once it arrives."); go("/payments", true); } catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
        }}>I've paid</button> : <button className="btn primary" style={{ flex: 1 }} onClick={() => go("/payments", true)}>Done</button>}
      </ActionBar>
    </Page>
  );

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (how === "bank") {
        const r = await rpc<{ id: number; reference: string; amount: number; pay: PayDetails }>("topup_request", { p_amount: amount });
        setBank({ ...r, status: "requested" });
      } else {
        if (autoOn !== p.auto_topup) await rpc("set_auto_topup", { p_on: autoOn });
        const r = await api<{ done?: boolean; action?: string; client_secret?: string; publishable_key?: string }>("topup_card", { amount, key: `${key}-${amount}` });
        if (r.action === "authenticate" && r.client_secret && r.publishable_key) {
          const stripe = await stripeFor(r.publishable_key);
          const res = await stripe?.confirmCardPayment(r.client_secret);
          if (!res || res.error || !res.paymentIntent) throw new Error(res?.error?.message ?? "Your bank didn't approve it. Try again.");
          await api("topup_card_done", { payment_intent_id: res.paymentIntent.id });
        }
        toast(`${money(amount)} added`); reload(); go("/payments", true);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const viaOpts = [...(p.card_live ? [{ id: "card", label: p.card ?? "Add a card first", disabled: !p.card }] : []), { id: "bank", label: "Bank transfer", hint: "PayID or BSB and account. Added once it arrives." }];
  return (
    <Page title="Top up" onBack={back("/payments")}>
      <div className="iv-hero"><span className="t15 light">Your balance</span><span className="iv-big">{money2(p.balance)}</span>
        <span className="t15 light">Fees on top-up are <b className="w5">{p.rates.topup}% instead of {p.rates.payg}%</b>.</span></div>
      <div className="cp-sec iv-band" style={{ gap: 8 }}>
        <span className="cp-title" style={{ margin: 0 }}>Add</span>
        <button className="cp-select" onClick={() => setPick("amount")}><span>{money(amount)}</span>{Icon.chevron("var(--muted)")}</button>
        <span className="cp-title" style={{ margin: "10px 0 0" }}>Pay with</span>
        <button className="cp-select" onClick={() => setPick("via")}><span>{how === "card" ? p.card : "Bank transfer"}</span>{Icon.chevron("var(--muted)")}</button>
        {how === "card" && (
          <div className="row between" style={{ marginTop: 12, alignItems: "center", gap: 14 }}>
            <span className="stack" style={{ gap: 2 }}><span className="w5">Top up automatically</span><span className="t14 light muted">Add {money(p.rates.auto_topup)} when your balance drops under {money(p.rates.auto_below)}</span></span>
            <button className={`toggle ${autoOn ? "on" : ""}`} aria-pressed={autoOn} aria-label="Top up automatically" onClick={() => setAuto(!autoOn)} />
          </div>
        )}
      </div>
      <div className="cp-sec"><span className="t14 light muted">Your balance only pays Mahi Man fees and Plus. Anything unused is refunded if you ask.</span>{err && <p className="err" style={{ margin: "8px 0 0" }}>{err}</p>}</div>
      <div style={{ flex: 1 }} />
      <ActionBar><button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={submit}>{busy ? "Working…" : `Top up ${money(amount)}`}</button></ActionBar>
      {pick === "amount" && <SearchPicker title="Add" options={AMOUNTS.map((a) => ({ id: a, label: money(a) }))} value={[amount]} onClose={() => setPick(null)} onChange={(v) => setAmount(Number(v[0]))} />}
      {pick === "via" && <SearchPicker title="Pay with" options={viaOpts} value={[how]} onClose={() => setPick(null)} onChange={(v) => setVia(v[0] as "card" | "bank")} />}
    </Page>
  );
}

/* ---------- Get Plus ---------- */
export function PlusPage() {
  const toast = useToast();
  const { p } = usePayments();
  const [busy, setBusy] = useState(false);
  if (!p) return <Page title="Mahi Man Plus" onBack={back("/payments")}><Loading /></Page>;
  const short = p.balance < p.rates.plus_cents;
  const plus = isPlus(p);
  return (
    <Page title="Mahi Man Plus" onBack={back("/payments")}>
      <div className="iv-hero">
        <span className="t15 light">From your balance, each month</span>
        <span className="iv-big">{money2(p.rates.plus_cents)}</span>
        <span className="t15 light">Your balance: {money2(p.balance)}</span>
      </div>
      <div className="cp-sec iv-band">
        <Li b={`Connection fee ${p.rates.plus}%, max ${money(p.rates.plus_max)}`} s={`Instead of ${p.rates.payg}%. Comes off your balance, like top-up.`} />
        <Li b="Priority on every job" s="Your jobs go to the top, and every worker in your category is told." />
        <Li b="Top-rated first" s="Your jobs reach the best-rated workers before anyone else." />
        <Li b="Fix-it guarantee" s="Not done as listed? We send someone to finish it." />
        <Li b="Stop any time" s="In Settings, Payments. Plus runs to the end of the month you've paid for." />
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        {short && !plus
          ? <button className="btn primary" style={{ flex: 1 }} onClick={() => go("/topup")}>Top up first</button>
          : <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
              setBusy(true);
              try { await rpc("plus_join"); toast(plus ? "Plus renews each month" : "You're on Plus"); go("/payments", true); }
              catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
            }}>{busy ? "Working…" : plus ? "Keep Plus each month" : `Join Plus, ${money2(p.rates.plus_cents)}`}</button>}
      </ActionBar>
    </Page>
  );
}

/* ---------- Home: invoices to pay ---------- */
interface DueInvoice { id: number; number: string; total_cents: number; due_at: string; status: string }
export function useDueInvoices(enabled = true) {
  const [list, setList] = useState<DueInvoice[]>([]);
  useEffect(() => {
    if (!enabled) return;
    myId().then((uid) => sb.from("customer_invoices").select("id,number,total_cents,due_at,status").eq("customer_id", uid).eq("status", "due").order("due_at")).then(({ data }) => setList((data ?? []) as DueInvoice[]));
  }, [enabled]);
  // Posting pauses a few days after the due date; the home screen sends them to the invoice instead.
  const paused = list.find((i) => new Date(i.due_at).getTime() < Date.now() - 3 * 86400_000) ?? null;
  return { invoices: list, paused };
}
export function InvoiceBanner({ invoices }: { invoices: DueInvoice[] }) {
  return (
    <>
      {invoices.map((i) => {
        const late = new Date(i.due_at) < new Date();
        return (
          <button key={i.id} className="poster" style={{ background: late ? "#f6dcd9" : "#fbf3e4" }} onClick={() => go(`/invoice/${i.id}`)}>
            {Icon.card(late ? "var(--danger)" : "#8a5a10")}
            <span className="t">
              <span className="t17 w5">Invoice {i.number}, {money2(i.total_cents)}</span>
              <span className="small light muted">{late ? "Overdue. Pay it to keep booking." : `Due ${dayLong(i.due_at)}. Pay by bank transfer.`}</span>
            </span>
            {Icon.chevron("var(--faint)")}
          </button>
        );
      })}
    </>
  );
}

/* ---------- Track: the fee on a finished direct-pay job ---------- */
interface JobFee { amount_cents: number; from_balance_cents: number; tier: string; invoice_id: number | null; customer_invoices: { number: string; due_at: string; status: string } | null }
export function useJobFee(jobId: string, enabled: boolean) {
  const [fee, setFee] = useState<JobFee | null>(null);
  useEffect(() => {
    if (!enabled) return;
    sb.from("customer_fees").select("amount_cents,from_balance_cents,tier,invoice_id,customer_invoices(number,due_at,status)").eq("job_id", jobId).maybeSingle()
      .then(({ data }) => setFee(data as unknown as JobFee | null));
  }, [jobId, enabled]);
  return fee;
}
export function JobFeeSection({ fee }: { fee: JobFee }) {
  const { p } = usePayments();
  const owed = fee.amount_cents - fee.from_balance_cents;
  const inv = fee.customer_invoices;
  const title = (
    <div className="iv-fee-top"><span className="cp-title" style={{ margin: 0 }}>Mahi Man connection fee</span><span className="iv-amt">{money2(fee.amount_cents)}</span></div>
  );
  if (owed <= 0) return <div className="iv-fee">{title}<span className="t15 light">Paid from your balance{p ? `. ${money2(p.balance)} left.` : "."}</span></div>;
  if (inv && inv.status !== "due") return <div className="iv-fee">{title}<span className="t15 light">{inv.status === "paid" ? "Paid" : "We're checking your transfer"}, invoice {inv.number}.</span></div>;
  if (inv) return (
    <div className="iv-fee">
      {title}
      {fee.from_balance_cents > 0 && <span className="t15 light">{money2(fee.from_balance_cents)} came off your balance. {money2(owed)} to pay.</span>}
      {p && <BankDetails pay={p.pay} reference={inv.number} />}
      <span className="t14 light muted">Due {dayLong(inv.due_at)}. Your tax invoice is in Settings, Payments.</span>
    </div>
  );
  if (!p) return null;
  const pd = nextPayday(p);
  return (
    <div className="iv-fee">
      {title}
      <span className="t15 light">{p.plan === "fortnightly" ? "On your invoice every 2 weeks" : "On your weekly invoice"}{pd ? <>, ready {DAYS[(pd.getUTCDay() + 6) % 7]} and due on your payday, <b className="w5">{dayLong(noonIso(pd))}</b>.</> : "."}</span>
    </div>
  );
}

/* ---------- Track: a finished job paid (all or part) by a gift card ---------- */
export function GiftPaidSection({ worker, gift, rest, fee }: { worker: string; gift: number; rest: number; fee: JobFee | null }) {
  const { p } = usePayments();
  const feeFromGift = fee && fee.from_balance_cents >= fee.amount_cents ? fee : null;
  return (
    <div className="iv-fee">
      <div className="iv-fee-top"><span className="cp-title" style={{ margin: 0 }}>Paid from your gift</span><span className="iv-amt">{money2(gift + (feeFromGift?.amount_cents ?? 0))}</span></div>
      <div className="cp-row"><span>{worker}, for the job</span><span>{money2(gift)}</span></div>
      {feeFromGift && <div className="cp-row"><span>Mahi Man connection fee</span><span>{money2(feeFromGift.amount_cents)}</span></div>}
      {rest > 0 && <div className="cp-row"><span className="w5">Pay {worker} the rest</span><span className="w5">{money2(rest)}</span></div>}
      {p && p.gift_balance > 0 && <div className="cp-row"><span className="light muted">Left on your gift</span><span className="light muted">{money2(p.gift_balance)}</span></div>}
    </div>
  );
}
