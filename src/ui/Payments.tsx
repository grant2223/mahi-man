import { pctLabel } from "../lib/fee";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { rpc, sb, myId } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money, money2, shrinkImage } from "../lib/format";
import { Icon, Loading, Screen, SearchPicker, StepHero, useToast } from "./kit";
import { ActionBar } from "./Completion";
import { AuthScreen } from "./Auth";
import { HistList, glyph, saveDocument, useHistory } from "./History";

/* How customers pay Mahi Man: pay as you go (invoiced by bank transfer) or Plus. Credit (gifts, cancellations) still pays fees first.
   Every number comes from the live settings through my_payments(). */

export interface PayDetails { gst?: string; trading_name?: string; legal_name?: string; abn?: string; payid?: string; bsb?: string; account?: string; account_name?: string }
interface Line { date: string; job: string; who: string; cents: number }
interface InvoiceRow { id: number; number: string; total: number; status: "due" | "claimed" | "paid"; issued_at: string; due_at: string }
interface TopupRow { id: number; reference: string; amount: number; status: "requested" | "claimed"; created_at: string }
interface PlusOrder { id: number; reference: string; amount: number; months: number; status: "requested" | "claimed" }
export interface MyPayments {
  mode: string; card_live: boolean;
  rates: { payg: number; payg_min: number; payg_max?: number; plus_max?: number; topup: number; topup_min: number; plus: number; plus_min: number; plus_cents: number; plus_year: number; auto_topup: number; auto_below: number };
  balance: number; gift_balance: number; gift_from: string | null; plan: "now" | "weekly" | "fortnightly"; payday: number; anchor: string | null;
  plus_until: string | null; senior?: boolean; plus_renew: boolean; plus_order: PlusOrder | null; auto_topup: boolean; card: string | null; pay: PayDetails;
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
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    if (!enabled) return;
    setFailed(false);
    // Gifts emailed to this account go into the wallet the first time payments load.
    const first = claimed ? Promise.resolve(0) : rpc<number>("gift_autoclaim").catch(() => 0);
    claimed = true;
    first.then(() => rpc<MyPayments>("my_payments")).then(setP).catch(() => setFailed(true));
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  return { p, reload: load, failed };
}

// When a page can't load (no signal, server hiccup), say so and offer to try again, instead of spinning forever.
function Waiting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) return <Loading />;
  return (
    <div className="stack" style={{ alignItems: "center", gap: 14, padding: "64px 24px", textAlign: "center" }}>
      <span className="t17">Couldn't load this</span>
      <span className="t15 light muted">Check your signal, then try again.</span>
      <button className="btn primary" onClick={onRetry}>Try again</button>
    </div>
  );
}

// Bank details the way people read them: BSB 084-472, ABN 17 640 157 811.
export const fmtBsb = (v?: string) => { const d = (v ?? "").replace(/\D/g, ""); return d.length === 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : v ?? ""; };
export const fmtAbn = (v?: string) => { const d = (v ?? "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : v ?? ""; };

const STATUS: Record<string, [string, string]> = { due: ["y", "To pay"], late: ["r", "Overdue"], claimed: ["", "Checking"], paid: ["g", "Paid"] };
const invState = (i: { status: string; due_at: string }) => (i.status === "due" && new Date(i.due_at) < new Date() ? "late" : i.status);
const Badge = ({ s }: { s: string }) => <span className={`badge ${STATUS[s]?.[0] ?? ""}`}>{STATUS[s]?.[1] ?? s}</span>;

/* ---------- How you pay (was Pricing) ---------- */
export function HowYouPay() {
  const { session } = useSession();
  const [r, setR] = useState({ payg: 15, payg_min: 995, payg_max: 5995, plus: 7.5, plus_min: 495, plus_max: 2995, plus_year: 9900 });
  const [auth, setAuth] = useState<string | null>(null);
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["booking_fee_percent", "booking_fee_min_cents", "booking_fee_max_cents", "plus_fee_percent", "plus_fee_min_cents", "plus_fee_max_cents", "plus_year_cents"]).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((x) => [x.key, Number(x.value)]));
      setR((c) => ({ payg: m.booking_fee_percent || c.payg, payg_min: m.booking_fee_min_cents || c.payg_min, payg_max: m.booking_fee_max_cents || c.payg_max, plus_max: m.plus_fee_max_cents || c.plus_max,
        plus: m.plus_fee_percent || c.plus, plus_min: m.plus_fee_min_cents || c.plus_min, plus_year: m.plus_year_cents || c.plus_year }));
    });
  }, []);
  const dollars = (c: number) => `$${Math.round(c / 100)}`;
  const open = (to: string) => (session ? go(to) : setAuth(to));
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <StepHero title="How payment works" sub="Two payments: one to your worker, one to us." onBack={back("/")} />
      {/* Who gets paid, how and when. The plans below only change the Mahi Man part. */}
      <div className="hp-who">
        <section>
          <h2>Your worker</h2><p className="amt">The job price</p>
          <div className="hp-row"><i>How</i><span>Cash or bank transfer, whichever you picked when you posted</span></div>
          <div className="hp-row"><i>When</i><span>When the job's done, straight to them. It never goes through us.</span></div>
        </section>
        <section>
          <h2>Mahi Man</h2><p className="amt">The connection fee</p>
          <div className="hp-row"><i>How</i><span>An invoice, paid by bank transfer. If you have credit, it comes off your credit instead.</span></div>
          <div className="hp-row"><i>When</i><span>When you select a worker. Pay within 3 days, or weekly or every 2 weeks on your payday. If the job doesn't go ahead, you get it back.</span></div>
        </section>
      </div>
      <h2 className="hp-plans">Pay less with a plan</h2>
      <div className="pl-table pl-two">
        <div className="pl-row pl-head"><span /><b>Pay as you go</b><b><span className="pl-badge">Plus</span></b></div>
        <div className="pl-row"><span>Connection fee</span><b>{pctLabel(r.payg)}</b><b className="pl-plus">{pctLabel(r.plus)}</b></div>
        <div className="pl-row"><span>Minimum fee</span><span>{money2(r.payg_min)}</span><span className="pl-plus">{money2(r.plus_min)}</span></div>
        <div className="pl-row"><span>Most you'll pay</span><span>{money2(r.payg_max)}</span><span className="pl-plus">{money2(r.plus_max)}</span></div>
        <div className="pl-row"><span>To join</span><span>Free</span><span className="pl-plus">{dollars(r.plus_year)} a year</span></div>
        <div className="pl-row"><span>Workers alerted when you post</span><span>—</span><span className="pl-plus">{Icon.tick("var(--emerald)", 20)}</span></div>
        <div className="pl-row"><span>Save your favourites</span><span>—</span><span className="pl-plus">{Icon.tick("var(--emerald)", 20)}</span></div>
      </div>
      <div className="cp-sec" style={{ paddingBottom: Capacitor.isNativePlatform() ? 18 : "calc(var(--safe-bottom) + 32px)" }}>
        <Li b="Pay as you go" s="Nothing upfront. Pay the fee by bank transfer, after each job, weekly or every 2 weeks on your payday." />
        <Li b="Plus" s={`For our loyal customers. Half the connection fee (${pctLabel(r.plus)}, ${money2(r.plus_min)} to ${money2(r.plus_max)}), workers nearby alerted the moment you post, and your favourite workers saved to book again.`} />
      </div>
      {Capacitor.isNativePlatform() && (
        <ActionBar>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => open("/plus")}>Get Plus</button>
        </ActionBar>
      )}
      {auth && <AuthScreen title="Get Plus" reason="Sign in to get Plus." onBack={() => setAuth(null)} onDone={() => { const to = auth; setAuth(null); go(to); }} />}
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
  const { p, reload, failed } = usePayments();
  const [plan, setPlan] = useState<MyPayments["plan"]>("now");
  const [payday, setPayday] = useState(3);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [pick, setPick] = useState<"plan" | "payday" | "anchor" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p) { setPlan(p.plan); setPayday(p.payday); setAnchor(p.anchor); } }, [p]);
  const histRows = useHistory("all", "all", 6);
  if (!p) return <Page title="Payments"><Waiting failed={failed} onRetry={reload} /></Page>;

  const plus = isPlus(p);
  const line = p.senior ? "Plus, no connection fee, as you're 60 or over"
    : plus ? `Plus, fees are ${pctLabel(p.rates.plus)}${p.plus_renew ? `, renews ${dayShort(p.plus_until!)}` : `, ends ${dayShort(p.plus_until!)}`}`
    : p.balance > 0 ? "Connection fees come off your credit first" : `Pay as you go, fees are ${pctLabel(p.rates.payg)}`;
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
  const hist = histRows;
  const tagC = <span className="ph-tag">Checking</span>, tagW = <span className="ph-tag">Not paid yet</span>;
  const soon: { key: string; icon: ReactNode; title: string; sub: string; amount: number; tag: ReactNode; open?: () => void }[] = [
    ...p.invoices.filter((i) => i.status !== "paid").map((i) => { const st = invState(i); return { key: `i${i.id}`, icon: Icon.doc("var(--ink)"), title: `Invoice ${i.number}`,
      sub: st === "claimed" ? "We're checking your transfer" : `${st === "late" ? "Was due" : "Due"} ${dayShort(i.due_at)}`, amount: i.total,
      tag: st === "claimed" ? tagC : st === "late" ? <span className="ph-tag late">Overdue</span> : <span className="ph-tag">Due</span>, open: () => go(`/invoice/${i.id}`) }; }),
    ...p.topups.map((t) => ({ key: `t${t.id}`, icon: Icon.plus("var(--ink)"), title: "Top-up", sub: t.status === "claimed" ? "We're checking your transfer" : `Waiting for your transfer, ${t.reference}`,
      amount: t.amount, tag: t.status === "claimed" ? tagC : tagW, open: () => go(`/topup?id=${t.id}`) })),
    ...(p.plus_order && p.plus_order.status !== undefined ? [{ key: "plus", icon: Icon.star("var(--ink)"), title: "Mahi Man Plus", sub: p.plus_order.status === "claimed" ? "We're checking your transfer" : `Waiting for your transfer, ${p.plus_order.reference}`,
      amount: p.plus_order.amount, tag: p.plus_order.status === "claimed" ? tagC : tagW, open: () => go("/plus") }] : []),
    ...p.gifts.filter((g) => g.status === "requested" || g.status === "claimed").map((g) => ({ key: `g${g.id}`, icon: glyph("gift", "var(--ink)"), title: `Gift card for ${g.to}`,
      sub: g.status === "claimed" ? "We're checking your transfer" : "Waiting for your transfer", amount: g.amount, tag: g.status === "claimed" ? tagC : tagW, open: () => go(`/gifts/${g.id}`) })),
    ...(p.next.total > 0 ? [{ key: "next", icon: Icon.clock("var(--ink)"), title: "Next invoice", sub: `${p.next.lines.length} job${p.next.lines.length === 1 ? "" : "s"}${pd ? `, ready ${dayShort(noonIso(new Date(pd.getTime() - 86400_000)))}` : ""}`,
      amount: p.next.total, tag: null }] : []),
  ];
  const stopPlus = async () => { try { await rpc("plus_stop"); toast("Plus won't renew"); reload(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } };

  return (
    <Page title="Payments">
      <div className="iv-hero">
        <span className="t15 light">Your credit</span>
        <span className="iv-big">{money2(p.balance)}</span>
        {p.gift_balance > 0 ? (
          <div className="gf-split">
            <span><b className="w5">{money2(p.gift_balance)}</b> gift{p.gift_from ? ` from ${p.gift_from}` : ""}<br /><span className="light muted">Pays jobs and fees</span></span>
            {p.balance - p.gift_balance > 0 && <span><b className="w5">{money2(p.balance - p.gift_balance)}</b> credit<br /><span className="light muted">Pays connection fees</span></span>}
          </div>
        ) : <span className="t15 light">{line}</span>}
        {plus && !p.senior && (
          <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {p.plus_renew ? <button className="btn stone small" onClick={stopPlus}>Stop Plus</button>
              : <button className="btn stone small" onClick={() => go("/plus")}>Keep Plus</button>}
          </div>
        )}
      </div>

      {soon.length > 0 && (
        <div className="cp-sec iv-band ph-sec">
          <span className="cp-title">Coming up</span>
          {soon.map((u) => (
            <button key={u.key} className="ph-row" onClick={u.open} disabled={!u.open}>
              <span className="ph-ic">{u.icon}</span>
              <span className="ph-t"><span className="ph-name">{u.title}</span><span className="ph-sub">{u.sub}</span></span>
              <span className="ph-r"><span className="ph-amt">{money2(u.amount)}</span>{u.tag}</span>
            </button>
          ))}
        </div>
      )}

      <div className="cp-sec iv-band ph-sec">
        <div className="ph-head"><span className="cp-title" style={{ margin: 0 }}>History</span>{(hist?.length ?? 0) > 0 && <button className="btn stone small" onClick={() => go("/payments/history")}>See all</button>}</div>
        {!hist ? <Loading /> : hist.length ? <HistList rows={hist} /> : <p className="ph-none">Your payments will show here</p>}
      </div>

      <div className="cp-sec iv-band" style={{ gap: 8, paddingBottom: "calc(var(--safe-bottom) + 28px)" }}>
        <span className="cp-title" style={{ margin: 0 }}>How you get invoiced</span>
        <span className="t14 light muted" style={{ marginBottom: 4 }}>Fees are invoiced and paid by bank transfer. One transfer covers all your jobs.</span>
        <button className="cp-select" onClick={() => setPick("plan")}><span>{PLAN_OPTS.find((o) => o.id === plan)?.label}</span>{Icon.chevron("var(--muted)")}</button>
        {plan !== "now" && <button className="cp-select" onClick={() => setPick("payday")}><span>Payday: {DAYS[payday]}</span>{Icon.chevron("var(--muted)")}</button>}
        {plan === "fortnightly" && <button className="cp-select" onClick={() => setPick("anchor")}><span className={anchorOpts.some((d) => isoDay(d) === anchor) ? "" : "ph"}>{anchor && anchorOpts.some((d) => isoDay(d) === anchor) ? `Next payday: ${dayLong(noonIso(new Date(`${anchor}T00:00:00Z`)))}` : "Select your next payday"}</span>{Icon.chevron("var(--muted)")}</button>}
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
  const { profile } = useSession();
  const [showInv, setShowInv] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { setFailed(false); return rpc<InvoiceDetail | null>("invoice_detail", { p_id: id }).then((d) => { if (d) setInv(d); else setFailed(true); }).catch(() => setFailed(true)); }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!inv) return <Page title="Invoice" onBack={back("/payments")}><Waiting failed={failed} onRetry={load} /></Page>;
  const st = invState(inv);
  const pay = inv.pay ?? {};
  const n = inv.lines.length;
  if (thanks) return (
    <div className="app pq">
      <button className="back pq-back" onClick={() => setThanks(false)} aria-label="Back">{Icon.back("#fff")}</button>
      <PaidThanks first={profile?.full_name?.split(" ")[0]} amount={inv.total} reference={inv.number} what={`${n} connection fee${n === 1 ? "" : "s"}`} last="Invoice marked paid" />
      <div className="pq-foot"><button className="pq-gold" onClick={() => go("/payments", true)}><span>Done</span></button></div>
    </div>
  );
  if ((st === "due" || st === "late") && !showInv) return (
    <div className="app pq">
      <button className="back pq-back" onClick={back("/payments")} aria-label="Back">{Icon.back("#fff")}</button>
      <BankPay title={`Invoice ${inv.number}`} sub={`${n} connection fee${n === 1 ? "" : "s"}, ${st === "late" ? "was due" : "due"} ${dayShort(inv.due_at)}`} amount={inv.total} pay={pay} reference={inv.number}
        note="We confirm your payment within 24 hours, usually faster."
        onConfirm={async (c) => { await rpc("invoice_claim_paid", { p_id: inv.id, ...claimArgs(c) }); setThanks(true); await load(); }}
        onCancel={() => setShowInv(true)} cancelLabel="See the invoice" />
    </div>
  );
  return (
    <Page title={`Invoice ${inv.number}`} onBack={back("/payments")}>
      <div className="iv-hero">
        <span className="t15 light">{st === "paid" ? `Paid ${dayLong(inv.paid_at ?? inv.due_at)}` : st === "late" ? `Was due ${dayLong(inv.due_at)}` : `Due ${dayLong(inv.due_at)}`}</span>
        <span className="iv-big">{money2(inv.total)}</span>
        <Badge s={st} />
        {st === "claimed" && <span className="t15 light" style={{ marginTop: 6 }}>Thanks. We'll mark it paid as soon as it arrives.</span>}
      </div>
      <div className="cp-sec iv-band" style={{ paddingBottom: 24 }}>
        <span className="cp-title">{pay.gst === "yes" ? "Tax invoice" : "Invoice"}</span>
        <span className="t14 light muted">{pay.legal_name}{pay.trading_name ? `, trading as ${pay.trading_name}` : ""}{pay.abn ? `, ABN ${fmtAbn(pay.abn)}` : ""}<br />To {inv.to}, Issued {dayLong(inv.issued_at)}</span>
        <div style={{ marginTop: 10 }}>{inv.lines.map((l, i) => <div key={i} className="cp-row"><span>{dayShort(l.date)}, {l.job}{l.who ? `, ${l.who}` : ""}</span><span>{money2(l.cents)}</span></div>)}</div>
        <div className="cp-total"><span>Total</span><span>{money2(inv.total)}</span></div>
        {pay.gst === "yes" ? <div className="cp-row"><span className="light muted">Includes GST</span><span className="light muted">{money2(inv.gst)}</span></div>
          : <div className="cp-row"><span className="light muted">No GST charged</span><span /></div>}
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        <button className="btn stone" style={{ flex: 1 }} onClick={() => savePdf(inv).catch(() => toast("Couldn't save the PDF"))}>Save PDF</button>
        {(st === "due" || st === "late") && (
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setShowInv(false)}>Pay</button>
        )}
      </ActionBar>
    </Page>
  );
}

const savePdf = (inv: InvoiceDetail) => saveDocument({ doc: "invoice", id: inv.id });

/* ---------- Pay by bank transfer ----------
   One screen for every bank transfer (Plus, top-ups): what it's for and the amount, the details in the order banks ask
   for them, who Mahi Man is, a note, then the declaration and Confirm payment. */
export const claimArgs = (c: PaidClaim) => ({ p_proof: c.proof, p_paid_on: c.paid_on, p_paid_part: c.paid_part, p_paid_from: c.paid_from });
export interface PaidClaim { proof: string; paid_on: string; paid_part: string; paid_from: string }
const PARTS = [{ id: "morning", label: "Morning" }, { id: "afternoon", label: "Afternoon" }, { id: "evening", label: "Evening" }];
const partNow = () => { const h = Number(new Date().toLocaleString("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ })); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };
// The last 7 days as Brisbane dates: Today, Yesterday, then Mon 16 Nov...
const lastDays = () => Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.now() - i * 86400000);
  const id = d.toLocaleDateString("en-CA", { timeZone: TZ });
  return { id, label: i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).replace(",", "") };
});
export function BankPay({ title, sub, amount, pay, reference, note, onConfirm, onCancel, cancelLabel = "Cancel" }: {
  title: string; sub: string; amount: number; pay: PayDetails; reference: string; note?: string; onConfirm: (claim: PaidClaim) => Promise<void>; onCancel?: () => void; cancelLabel?: string;
}) {
  const toast = useToast();
  const { profile } = useSession();
  const days = lastDays();
  const [paidOn, setPaidOn] = useState(days[0].id);
  const [part, setPart] = useState(partNow);
  const [from, setFrom] = useState(profile?.full_name ?? "");
  const [pick, setPick] = useState<"day" | "part" | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  // Proof of transfer: a screenshot or PDF of the bank's receipt, kept private for the money team.
  const [proof, setProof] = useState<{ path: string; name: string; preview: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  // Android's file box only offers Files, so there they choose: camera, or a screenshot/PDF. iPhone's own menu already has both.
  const android = Capacitor.getPlatform() === "android";
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const [pickSrc, setPickSrc] = useState(false);
  const addProof = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast("That file is too big. Use a screenshot."); return; }
    setUploading(true);
    try {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const body: Blob = isPdf ? f : await shrinkImage(f, 1800);
      const uid = await myId();
      const path = `${uid}/${reference}-${Date.now()}.${isPdf ? "pdf" : "jpg"}`;
      const { error } = await sb.storage.from("receipts").upload(path, body, { contentType: isPdf ? "application/pdf" : "image/jpeg" });
      if (error) throw error;
      setProof({ path, name: f.name, preview: isPdf ? null : URL.createObjectURL(body) });
    } catch { toast("Couldn't add the receipt. Try again."); } finally { setUploading(false); }
  };
  const copy = (v: string) => { navigator.clipboard?.writeText(v).then(() => toast("Copied")).catch(() => {}); };
  const rows: [string, string | undefined][] = [["Account name", pay.account_name || pay.legal_name], ["BSB", fmtBsb(pay.bsb)], ["Account number", pay.account], ["Reference", reference]];
  return <>
    <div className="pq-sum">
      <img src="/mahi-head.png" alt="" />
      <span><b>{title}</b><small>{sub}</small></span>
      <strong>{money2(amount)}</strong>
    </div>
    <h2 className="pq-sh">Pay by bank transfer</h2>
    <div className="pq-tbl">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className={k === "Reference" ? "ref" : ""}>
          <span><small>{k}</small><b>{v}</b></span>
          <button onClick={() => copy(String(v))} aria-label={`Copy ${k}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button>
        </div>
      ))}
    </div>
    <p className="pq-trust">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
      <span>Mahi Man is owned and operated by {pay.legal_name || "Find Fit People Pty Ltd"}{pay.abn ? <>, <i>ABN {fmtAbn(pay.abn)}</i></> : ""}.</span>
    </p>
    {note && <p className="pq-trust"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>{note}</span></p>}
    <div className="pq-foot">
      <label className={proof ? "pq-proof on" : "pq-proof"} onClick={(e) => { if (android && !uploading && (e.target as HTMLElement).tagName !== "INPUT") { e.preventDefault(); setPickSrc(true); } }}>
        <input ref={fileIn} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; addProof(f); }} hidden />
        <input ref={camIn} type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; addProof(f); }} hidden />
        {proof?.preview ? <img src={proof.preview} alt="" /> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f5c518" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>}
        <span><b>{uploading ? "Adding…" : proof ? "Transfer receipt added" : "Add your transfer receipt"}</b><small>{proof ? "Tap to change it" : "A screenshot from your banking app"}</small></span>
        {proof && Icon.tick("#f5c518", 20)}
      </label>
      <h2 className="pq-sh">When you sent it</h2>
      <div className="pq-when">
        <button className="pq-sel" onClick={() => setPick("day")}><span><small>Day</small><b>{days.find((d) => d.id === paidOn)?.label}</b></span>{Icon.chevron("rgba(255,255,255,0.6)")}</button>
        <button className="pq-sel" onClick={() => setPick("part")}><span><small>Time</small><b>{PARTS.find((x) => x.id === part)?.label}</b></span>{Icon.chevron("rgba(255,255,255,0.6)")}</button>
      </div>
      <label className="pq-from"><small>Name on the account you paid from</small>
        <input value={from} onChange={(e) => setFrom(e.target.value)} autoComplete="name" placeholder="As it shows on your bank" /></label>
      <button className="pq-agree" role="checkbox" aria-checked={agree} onClick={() => setAgree(!agree)}>
        <i className={agree ? "on" : ""}>{agree && Icon.tick("#1c1400", 16)}</i>
        <span>I declare this payment has been sent. False confirmations may lead to account suspension.</span>
      </button>
      <button className="pq-gold" disabled={busy || uploading || !agree || !proof || from.trim().length < 2} onClick={async () => {
        setBusy(true);
        try { await onConfirm({ proof: proof!.path, paid_on: paidOn, paid_part: part, paid_from: from.trim() }); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
      }}><span>{busy ? "One moment…" : "Confirm payment"}</span></button>
      {onCancel && <button className="pq-cancel" onClick={onCancel}>{cancelLabel}</button>}
    </div>
    {pickSrc && <Screen title="Add your transfer receipt" onBack={() => setPickSrc(false)}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <div className="hl-list">
          <button onClick={() => { setPickSrc(false); camIn.current?.click(); }}>{Icon.camera("var(--emerald)")}<span><b>Take a photo</b><small>Of the receipt on your screen or on paper</small></span>{Icon.chevron("var(--faint)")}</button>
          <button onClick={() => { setPickSrc(false); fileIn.current?.click(); }}>{Icon.doc("var(--emerald)")}<span><b>Choose a screenshot or PDF</b><small>From your phone</small></span>{Icon.chevron("var(--faint)")}</button>
        </div>
      </div>
    </Screen>}
    {pick === "day" && <SearchPicker title="Day you sent it" options={days} value={[paidOn]} onClose={() => setPick(null)} onChange={(v) => setPaidOn(String(v[0]))} />}
    {pick === "part" && <SearchPicker title="Time you sent it" options={PARTS} value={[part]} onClose={() => setPick(null)} onChange={(v) => setPart(String(v[0]))} />}
  </>;
}

/* Thank you, after someone confirms a bank transfer: their payment and where it's up to, like a bank's transfer tracker. */
export function PaidThanks({ first, amount, reference, what, last }: { first?: string; amount: number; reference: string; what: string; last: string }) {
  const now = new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ }).toLowerCase();
  return <>
    <div className="pt-seal" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="url(#ptg)" /><path d="M7.6 12.3l3 3 5.8-6.3" fill="none" stroke="#1c1400" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <defs><linearGradient id="ptg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset=".5" stopColor="#f5c518" /><stop offset="1" stopColor="#c9971a" /></linearGradient></defs></svg>
    </div>
    <h1 className="pt-h">Thank you{first ? `, ${first}` : ""}.</h1>
    <p className="pt-amt">{money2(amount)}<span>{what}, {reference}</span></p>
    <ol className="pt-track">
      <li className="done"><i>{Icon.tick("#1c1400", 14)}</i><span><b>Payment sent</b><small>Today, {now}, receipt attached</small></span></li>
      <li className="now"><i /><span><b>We check it with our bank</b><small>Within 24 hours, usually faster</small></span></li>
      <li><i /><span><b>{last}</b><small>We'll send you an alert when it's done</small></span></li>
    </ol>
  </>;
}

/* ---------- Get Plus ---------- */
// Plus: one payment for a year. In beta it's a bank transfer; card payments switch on when Stripe is connected.
export function PlusPage() {
  const toast = useToast();
  const { profile, reload: reloadMe } = useSession();
  const { p, reload: reloadP, failed } = usePayments();
  const [order, setOrder] = useState<(PlusOrder & { pay: PayDetails }) | null>(null);
  const [busy, setBusy] = useState(false);
  if (!p) return <Page title="Mahi Man Plus" onBack={back("/payments")}><Waiting failed={failed} onRetry={reloadP} /></Page>;
  const plus = isPlus(p);
  const year = p.rates.plus_year;
  const until = p.plus_until ? new Date(p.plus_until).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "";
  const waiting = p.plus_order;

  async function start() {
    setBusy(true);
    try { setOrder(await rpc<PlusOrder & { pay: PayDetails }>("plus_request", { p_months: 12 })); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (order) {
    const pay = order.pay;
    const done = order.status === "claimed";
    return (
      <div className="app pq">
        <button className="back pq-back" onClick={() => setOrder(null)} aria-label="Back">{Icon.back("#fff")}</button>
        {done ? <>
          <div className="pq-card">
            <img src="/mascot.png" alt="" /><i className="pq-sheen" />
            <span className="pq-brand">MAHI MAN</span><span className="pq-word">Plus</span>
            <span className="pq-name">{profile?.full_name || "Member"}</span><span className="pq-since">Member</span>
          </div>
          <h1 className="pq-pt">Thank you for <em>joining Plus.</em></h1>
          <p className="pq-lead">Plus is on for the next 24 hours while we check your transfer. Once it lands, it's yours for the year.</p>
          <div className="pq-steps">
            <div><b className="pq-plus">+</b><span><b>Our team has been notified</b><small>We'll confirm your payment within 24 hours</small></span></div>
            <div><b className="pq-plus">+</b><span><b>Use Plus straight away</b><small>Half fees, faster help and your favourites</small></span></div>
          </div>
          <div className="pq-foot"><button className="pq-gold" onClick={() => go("/")}><span>Post a job</span></button></div>
        </> : <>
          <BankPay title="Mahi Man Plus" sub={`12 months, ${order.reference}`} amount={order.amount} pay={pay} reference={order.reference}
            note="Plus starts as soon as you confirm. We check your payment within 24 hours."
            onConfirm={async (c) => { await rpc("plus_claim", { p_id: order.id, ...claimArgs(c) }); setOrder({ ...order, status: "claimed" }); reloadP(); reloadMe(); }} />
        </>}
      </div>
    );
  }

  const name = profile?.full_name ?? "";
  return (
    <div className="app pq">
      <button className="back pq-back" onClick={back("/payments")} aria-label="Back">{Icon.back("#fff")}</button>

      {/* The membership card: gold foil, a light sweep, Mahi Man pressed into it. */}
      <div className="pq-card">
        <img src="/mascot.png" alt="" />
        <i className="pq-sheen" />
        <span className="pq-brand">MAHI MAN</span>
        <span className="pq-word">Plus</span>
        <span className="pq-name">{name || "Member"}</span>
        <span className="pq-since">{plus ? (p.senior ? "Member" : `Until ${until}`) : "Not a member yet"}</span>
      </div>

      <h1 className="pq-h">For our <em>loyal customers.</em></h1>

      <div className="pq-perks">
        <div><i className="pq-plus" aria-hidden="true">+</i>{p.senior ? <span><b>No connection fee</b><small>As you're 60 or over</small></span> : <span><b>Half the fees</b><small>{pctLabel(p.rates.plus)} instead of {pctLabel(p.rates.payg)}, never more than {money2(p.rates.plus_max ?? 2995)}</small></span>}</div>
        <div><i className="pq-plus" aria-hidden="true">+</i><span><b>Get help faster</b><small>Workers nearby are alerted when you post</small></span></div>
        <div><i className="pq-plus" aria-hidden="true">+</i><span><b>Save your favourites</b><small>Book the workers you like, again and again</small></span></div>
      </div>

      <div className="pq-foot">
        {p.senior ? (
          <p className="pq-lead" style={{ textAlign: "center" }}>Plus is on us.</p>
        ) : waiting ? (
          <button className="pq-waiting" onClick={start}>
            {Icon.clock("#f5c518")}
            <span><b>{waiting.status === "claimed" ? "We're checking for your transfer" : `Waiting for your ${money(waiting.amount)} transfer`}</b>
              <small>{waiting.reference}</small></span>
            {Icon.chevron("rgba(255,255,255,.5)")}
          </button>
        ) : <>
          <button className="pq-gold" disabled={busy} onClick={start}><span>{busy ? "One moment…" : plus ? `Add a year – ${money(year)}` : `Get Plus – ${money(year)} per year`}</span></button>
          <span className="pq-small">About {money(Math.round(year / 52))} a week<br /><b>BETA</b>Bank transfer for now. No auto-renew.</span>
        </>}
      </div>
    </div>
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
  // Fees come off credit first; whatever credit didn't cover goes on an invoice. Say plainly which happened.
  const used = fee.from_balance_cents;
  const hadCredit = !!p && (p.balance > 0 || p.log.some((l) => l.delta > 0));
  if (owed <= 0) return <div className="iv-fee">{title}<span className="t15 light">Taken from your credit{p ? `. ${money2(p.balance)} left.` : "."}</span></div>;
  if (inv && inv.status !== "due") return <div className="iv-fee">{title}<span className="t15 light">{used > 0 ? `${money2(used)} from your credit, ${money2(owed)} ` : ""}{inv.status === "paid" ? "paid" : "we're checking your transfer"} on invoice {inv.number}.</span></div>;
  if (inv) return (
    <div className="iv-fee">
      {title}
      {(used > 0 || hadCredit) && <span className="t15 light">{used > 0 ? `${money2(used)} came off your credit. ${money2(owed)} left to pay.` : "Your credit is $0, so this one's on an invoice."}</span>}
      <span className="t14 light muted">Invoice {inv.number}, due {dayLong(inv.due_at)}.</span>
      {fee.invoice_id && <button className="btn primary" style={{ marginTop: 10 }} onClick={() => go(`/invoice/${fee.invoice_id}`)}>Pay {money2(owed)}</button>}
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
