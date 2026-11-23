import { useCallback, useEffect, useState } from "react";
import { mediaUrls, rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { dayTime, money } from "../lib/format";
import { Icon, Screen, SearchPicker, useNow, useToast } from "../ui/kit";
import { ActionBar, Note } from "../ui/Completion";
import { ChatScreen } from "../ui/Chat";
import { BankPay, claimArgs } from "../ui/Payments";
import type { Offer, MyOffer } from "./Work";

/* Trade jobs for tradespeople. Standard (free to join, a share of the quote, capped, only when a customer picks your quote),
   or Premium, monthly or yearly (no fee, every new job first). A tradesperson is a tradesperson; only the timing and the fee differ. Customers don't set a budget; tradies quote their price. */

interface Prices { win_pct_bp: number; win_max_cents: number; launch_cents: number; launch_open: boolean; guarantee_days: number; month_cents: number; year_cents: number; standard_after_minutes: number; standard_early_minutes: number;
  first_quotes: number; more_quotes: number; more_every_minutes: number; max_quotes: number; quiet_hours: number; qbcc_over_cents?: number }
interface Pay { payid?: string; bsb?: string; account?: string; account_name?: string; trading_name?: string }
export interface TradeStatus {
  prices: Prices; licences: string[]; pending_licences: string[]; insured: boolean; abn: boolean; business_name: string | null;
  trades: number[]; can_trade: boolean;
  plan: { plan: "standard" | "premium"; status: "active" | "stopped"; billing: "month" | "year" | null; renews_at: string | null; premium: boolean; starts_on?: string | null; offer?: string | null; launch?: boolean } | null;
  order: { id: number; kind?: "plan" | "offer"; launch?: boolean; status?: "requested" | "claimed"; billing: "month" | "year"; amount_cents: number; renewal: boolean; created_at: string;
    offer?: { name: string; months: number; starts_on: string | null } | null } | null;
  // An offer this tradie can claim right now: a price for some months of Premium (set in Admin).
  offer?: { id: number; name: string; price_cents: number; months: number; sale_to: string; starts_on: string | null; left: number | null } | null;
  // The launch offer (lifetime Premium for one payment) while it's open and they haven't had Premium before.
  launch?: { price_cents: number } | null;
  owed: { id: number; reference: string; amount_cents: number; job: string; created_at: string; status?: "requested" | "claimed" }[];
  won_this_month: number; premium_now: { n: number; photos: string[] }; pay: Pay;
}

export function useTrade() {
  const [t, setT] = useState<TradeStatus | null>(null);
  const load = useCallback(() => { rpc<TradeStatus>("trade_status").then(setT).catch(() => {}); }, []);
  useEffect(load, [load]);
  return { trade: t, reload: load };
}

const dollars = (c: number) => "$" + Math.round(c / 100).toLocaleString("en-AU");
const cents2 = (c: number) => "$" + (c / 100).toLocaleString("en-AU", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
// Standard's fee when a customer selects the quote: a share of the quote, capped.
export const winFee = (quote: number, p: Prices) => Math.min(p.win_max_cents, Math.round((quote * p.win_pct_bp) / 10000));
export const feeRule = (p: Prices) => `${p.win_pct_bp / 100}%, max ${dollars(p.win_max_cents)}`;
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
export const joined = (t: TradeStatus | null) => !!t?.plan;
export const premium = (t: TradeStatus | null) => !!t?.plan?.premium;
// What a tradie still needs before they can quote.
export const missing = (t: TradeStatus) => [!t.trades?.length && "trades", !t.business_name?.trim() && "business name", !t.abn && "ABN", !t.insured && "insurance"].filter(Boolean) as string[];


/* Before they can quote: anything still missing from their tradie profile, with one way to fix it.
   The details themselves live in the tradie profile, so they're never asked twice. */
export function TradeReady({ trade }: { trade: TradeStatus; onChanged?: () => void; onAbn?: () => void; onCreds?: () => void }) {
  const m = missing(trade);
  if (!m.length) return null;
  return (
    <div className="tr-need">
      <span>Add your {m.join(" and ")} to quote</span>
      <button className="btn primary small" onClick={() => go("/work/trade")}>Tradie profile</button>
    </div>
  );
}

// Join: Premium (or the launch offer) first, Standard as the free option, the comparison behind a tap.
type Ready = { onChanged: () => void; onAbn: () => void; onCreds: () => void };
const dayShort = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
export function TradeJoin({ trade, onBack, onJoined, onNeedPay }: { trade: TradeStatus; onBack: () => void; onJoined: (plan: "standard" | "premium") => void; onNeedPay?: () => void; ready: Ready }) {
  const toast = useToast();
  const p = trade.prices;
  const [year, setYear] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<null | "offer" | "launch" | "monthly" | "job">(null);
  const of = trade.offer;
  const L = trade.launch ?? null;
  const OFFER = !L && of ? { name: of.name, price: of.price_cents, months: of.months, starts: of.starts_on ? dayShort(of.starts_on) : "today", until: dayShort(of.sale_to), left: of.left } : null;
  const freeMonths = Math.max(0, Math.round((p.month_cents * 12 - p.year_cents) / p.month_cents));
  const after = p.standard_after_minutes >= 60 && p.standard_after_minutes % 60 === 0 ? `${p.standard_after_minutes / 60} hour${p.standard_after_minutes === 60 ? "" : "s"}` : `${p.standard_after_minutes} min`;
  const example = 40000;
  const rows: [string, string, string][] = [
    ["To join", "Free", L ? `${dollars(L.price_cents)} once, for life` : year ? `${dollars(p.year_cents)} a year` : `${dollars(p.month_cents)} a month`],
    ["Fee if you win", feeRule(p), "$0"],
    [`On a ${dollars(example)} job`, cents2(winFee(example, p)), "$0"],
    ["Job alerts", `After ${after}`, "First"],
    ["Your quote", "In the list", "First 10"],
  ];
  const join = async (plan: "standard" | "premium" | "offer" | "launch") => {
    if (!trade.trades.length) { toast("Select your trades first"); document.querySelector(".tr")?.scrollIntoView({ behavior: "smooth" }); return; }
    setBusy(true);
    try {
      if (plan === "offer" && of) await rpc("trade_offer_claim", { p_offer: of.id });
      else await rpc("trade_join", { p_plan: plan === "launch" ? "launch" : plan, p_billing: plan === "launch" || year ? "year" : "month", p_business: null });
      toast(plan === "launch" ? "Invoice on its way. Lifetime Premium starts once it's paid." : plan === "offer" ? "Spot held. Pay the invoice to lock it in." : plan === "premium" ? "Invoice on its way. Premium starts once it's paid." : "You're in. Trade jobs near you show on your jobs page.");
      onJoined(plan === "standard" ? "standard" : "premium");
    } catch (e) {
      setBusy(false);
      if (e instanceof Error && e.message.startsWith("Add your PayID") && onNeedPay) onNeedPay(); else toast(e instanceof Error ? e.message : String(e));
    }
  };
  const perks = <>
    <span className="hx-li">{Icon.tick("var(--gold)", 20)} Job alerts first</span>
    <span className="hx-li">{Icon.tick("var(--gold)", 20)} A place in the first 10 quotes</span>
    <span className="hx-li">{Icon.tick("var(--gold)", 20)} No commission, $0 when you win</span>
  </>;
  const alt = (label: string, k: "monthly" | "job", plan: "premium" | "standard") => (
    <div className="of-alt">
      <span className="of-k">{label}<button className="of-i" onClick={() => setInfo(k)} aria-label={`About ${label}`}>{Icon.info("var(--muted)", 18)}</button></span>
      <button className="btn stone small" disabled={busy} onClick={() => join(plan)}>Select</button>
    </div>
  );
  return (
    <div className="screen tj" role="dialog" aria-label="Trade jobs" style={{ background: "var(--card)" }}>
      <div className="screen-body">
        <section className="hx">
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <span className="hx-tag">{L ? "Limited launch offer" : OFFER ? OFFER.name : "For tradespeople"}</span>
          <h1>Every local trade job, first.</h1>
          {L ? <>
            <span className="hx-price">{dollars(L.price_cents)}<small> once</small></span>
            <span className="hx-off">Premium for life. Money-back guarantee<button className="of-i dark" onClick={() => setInfo("launch")} aria-label="About the launch offer">{Icon.info("rgba(255,255,255,0.8)", 18)}</button></span>
          </> : OFFER ? <>
            <span className="hx-price">{dollars(OFFER.price)}<small> for {OFFER.months} months</small></span>
            <span className="hx-off">{OFFER.starts === "today" ? "Starts when paid" : `From ${OFFER.starts}`}, then {dollars(p.month_cents)} a month<button className="of-i dark" onClick={() => setInfo("offer")} aria-label="About this offer">{Icon.info("rgba(255,255,255,0.8)", 18)}</button></span>
          </> : <>
          <span className="hx-price">{year ? dollars(p.year_cents) : dollars(p.month_cents)}<small>{year ? " a year" : " a month"}</small></span>
          <div className="hx-term">
            <button className={!year ? "on" : ""} onClick={() => setYear(false)}>Monthly</button>
            <button className={year ? "on" : ""} onClick={() => setYear(true)}>Yearly{freeMonths ? `, ${freeMonths} months free` : ""}</button>
          </div></>}
          {!OFFER && perks}
          <button className="btn hx-go" disabled={busy} onClick={() => join(L ? "launch" : OFFER ? "offer" : "premium")}>{L ? `Claim for ${dollars(L.price_cents)}` : OFFER ? `Claim for ${dollars(OFFER.price)}` : "Go Premium"} {Icon.arrow("#2a2d32")}</button>
        </section>
        {missing(trade).length > 0 && <section className="tj-sec"><TradeReady trade={trade} /></section>}
        <section className="tj-sec last">
          {(L || OFFER) && alt(`Or Premium, ${dollars(p.month_cents)} a month`, "monthly", "premium")}
          {alt(`Or Standard, free to join`, "job", "standard")}
          <button className="cmp-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>Compare Standard and Premium</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="tj-table cmp">
              <span /><span className="tj-col"><b>Standard</b></span><span className="tj-col on"><b>Premium</b></span>
              {rows.map(([k, a, b]) => [<span key={k + "k"} className="tj-k">{k}</span>, <span key={k + "a"} className="tj-v">{a}</span>, <span key={k + "b"} className="tj-v on">{b}</span>])}
            </div>
          )}
        </section>
      </div>
      {info && <Screen title={info === "launch" ? "Launch offer" : info === "offer" && OFFER ? OFFER.name : info === "job" ? "Standard" : "Premium"} onBack={() => setInfo(null)}><div className="screen-body of-info">
        {info === "launch" && L
          ? <><p>One payment of {dollars(L.price_cents)} and you're on Premium for life: job alerts first, a guaranteed place in the first 10 quotes, and $0 when you win. No monthly or yearly fee, ever.</p>
            <p>Money-back guarantee: if you're not happy within {p.guarantee_days} days of paying, ask us and we refund the {dollars(L.price_cents)} in full. Premium ends when it's refunded. The full terms are in the Terms of use.</p>
            <p>This is a limited launch offer and can end at any time.</p></>
          : info === "offer" && OFFER
          ? <><p>{dollars(OFFER.price)} covers {OFFER.months} months of Premium, {OFFER.starts === "today" ? "starting when your payment is confirmed" : `from ${OFFER.starts}`}. After that it's {dollars(p.month_cents)} a month. We remind you 7 days before, and you can stop any time. Claim by {OFFER.until}.</p></>
          : info === "job" ? <p>Free to join and free to quote. If a customer selects your quote, the fee is {p.win_pct_bp / 100}% of your quote, never more than {dollars(p.win_max_cents)}. Win a {dollars(example)} job and it's {cents2(winFee(example, p))}. Job alerts come to you after {after}.</p>
          : <p>{dollars(p.month_cents)} a month or {dollars(p.year_cents)} a year. Job alerts first, a guaranteed place in the first 10 quotes, and $0 when you win. Stop any time.</p>}
      </div></Screen>}
    </div>
  );
}
// How they pay: Standard or Premium, anything to pay and how, and a way to change.
export function TradePlan({ trade, onBack, onChanged, onUpgrade }: { trade: TradeStatus; onBack: () => void; onChanged: () => void; onUpgrade: () => void; ready: Ready }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pl = trade.plan, o = trade.order, pay = trade.pay;
  const [paying, setPaying] = useState(false);
  const oName = o?.kind === "offer" && o.offer ? `${o.offer.name}, ${o.offer.months} months` : o?.launch ? "Premium for life, launch offer" : o?.billing === "year" ? "Premium, yearly" : "Premium, monthly";
  const owed = trade.owed.reduce((a, x) => a + x.amount_cents, 0);
  // What "I've paid" pays: the Premium invoice, or else the oldest fee on a won job.
  const fee = trade.owed.find((x) => x.status !== "claimed");
  const due = o && o.status !== "claimed" ? { id: o.id, amount: o.amount_cents, name: oName } : fee ? { id: fee.id, amount: fee.amount_cents, name: `Fee for ${fee.job}` } : null;
  const run = async (fn: string, done: string) => {
    setBusy(true);
    try { await rpc(fn, {}); toast(done); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const payRows = ([["PayID", pay.payid], ["BSB", pay.bsb], ["Account", pay.account], ["Account name", pay.account_name || pay.trading_name]] as [string, string | undefined][]).filter(([, v]) => v);
  return (
    <>
    <Screen title="How you pay" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div className="cp-sec">
          <span className="cp-title">{pl?.premium || pl?.starts_on ? (pl?.offer ?? (pl.launch ? "Premium for life" : "Premium")) : "Standard"}</span>
          {pl?.starts_on && !pl.premium
            ? <span className="t15 light muted">Premium starts {day(pl.starts_on)} and runs until {day(pl.renews_at!)}.</span>
            : pl?.premium
            ? <span className="t15 light muted">{pl.status === "stopped" ? `Stopped. Premium runs until ${day(pl.renews_at!)}, then you're on Standard.` : pl.launch ? "Paid once. Nothing renews." : `${pl.billing === "year" ? "Yearly" : "Monthly"}. Renews ${day(pl.renews_at!)}.`}</span>
            : <span className="t15 light muted">Fee if you win: {trade.prices.win_pct_bp / 100}% of your quote, max {dollars(trade.prices.win_max_cents)}. {trade.won_this_month ? `${trade.won_this_month} won this month.` : ""}</span>}
        </div>
        {(o || owed > 0) && (
          <div className="cp-sec">
            <span className="cp-title">To pay</span>
            {o && <div className="row between" style={{ padding: "6px 0" }}><span className="t16">{oName}{o.renewal ? ", renewal" : ""}</span><span className="t17 w5">{money(o.amount_cents)}</span></div>}
            {trade.owed.map((x) => <div key={x.id} className="row between" style={{ padding: "6px 0" }}><span className="t16">Fee for {x.job} <span className="light muted">{x.reference}{x.status === "claimed" ? ", checking" : ""}</span></span><span className="t17 w5">{money(x.amount_cents)}</span></div>)}
            {(o?.status === "claimed" || trade.owed.some((x) => x.status === "claimed")) && <span className="t15 light muted">We're checking your payment, usually within 24 hours.</span>}
            {payRows.length > 0 && due && <div className="tp-pay">
              <span className="t15 light muted">By bank transfer. Use the reference so we can match it.</span>
              {payRows.map(([k, v]) => <div key={k} className="row between"><span className="t15 light">{k}</span><span className="t16 w5">{v}</span></div>)}
              <div className="row between"><span className="t15 light">Reference</span><span className="t16 w5">TR-{due.id}</span></div>
            </div>}
            {due && (o && o.status !== "claimed" && !o.renewal
              ? <div className="ps-btns">
                  <button className="btn stone" disabled={busy} onClick={() => run("trade_order_cancel", "Invoice cancelled")}>{Icon.x("currentColor")}Cancel</button>
                  <button className="btn primary" disabled={busy} onClick={() => setPaying(true)}>{Icon.tick("currentColor", 20)}I've paid</button>
                </div>
              : <div className="ps-btns one"><button className="btn primary" disabled={busy} onClick={() => setPaying(true)}>{Icon.tick("currentColor", 20)}I've paid {money(due.amount)}</button></div>)}
          </div>
        )}
        {missing(trade).length > 0 && <div className="cp-sec"><TradeReady trade={trade} /></div>}
        <Note icon="clock">{pl?.premium || pl?.starts_on ? "You see every new trade job first." : `Premium gets you job alerts first, a guaranteed place in the first 10 quotes, and $0 when you win.`}</Note>
        <div style={{ flex: 1 }} />
        {pl?.premium && pl.status === "active" && !pl.launch && (
          <div style={{ padding: "0 16px 12px" }}><button className="btn stone" disabled={busy} onClick={() => run("trade_stop", "Premium won't renew")}>Stop Premium</button></div>
        )}
        {!pl?.premium && !pl?.starts_on && !o && <ActionBar><button className="btn hx-go" style={{ flex: 1 }} onClick={onUpgrade}>Go Premium</button></ActionBar>}
      </div>
    </Screen>
      {paying && due && <div className="app pq tp-paying">
          <button className="back pq-back" onClick={() => setPaying(false)} aria-label="Back">{Icon.back("#fff")}</button>
          <BankPay title={due.name} sub={`TR-${due.id}`} amount={due.amount} pay={pay} reference={`TR-${due.id}`}
            note="We check your payment within 24 hours, usually faster."
            onConfirm={async (c) => { await rpc("trade_claim_paid", { p_id: due.id, ...claimArgs(c) }); setPaying(false); toast("Thanks. We're checking your payment."); onChanged(); }} />
        </div>}
    </>
  );
}

const when = (o: Offer) => (o.asap ? "Today" : dayTime(o.start_at).replace(/^./, (c) => c.toUpperCase()));

// Trade jobs: the photo first, the job, where and when, Send quote. Tradespeople paying per job also see the jobs others can quote on now, blurred.
export function TradeFeed({ trade, jobs, quotes = [], onQuote, covers, onBack, onOpen, onUpgrade }: { trade: TradeStatus; jobs: Offer[]; quotes?: MyOffer[]; onQuote?: (job: string) => void; covers: Record<string, string>; onBack: () => void; onOpen: (o: Offer) => void; onUpgrade: () => void; ready: Ready }) {
  const hidden = trade.premium_now;
  const [blur, setBlur] = useState<string[]>([]);
  useEffect(() => { if (hidden.photos.length) mediaUrls(hidden.photos).then((m) => setBlur(hidden.photos.map((p) => m[p]).filter(Boolean))).catch(() => {}); }, [hidden.photos.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="screen tj" role="dialog" aria-label="Trade jobs">
      <div className="screen-body" style={{ background: "var(--ground)" }}>
        <section className="step-hero" style={{ paddingBottom: 22 }}>
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <h1>Trade jobs</h1>
        </section>
        {missing(trade).length > 0 && <div className="tj-sec" style={{ background: "var(--card)" }}><TradeReady trade={trade} /></div>}
        {quotes.length > 0 && (
          <div className="wrap-list">
            {quotes.map((m) => (
              <button key={m.job_id} className="wrap-row" onClick={() => onQuote?.(m.job_id)}>
                <span className="t"><b>Quote sent to {m.customer_name}</b><span>{m.title}, {dollars(m.pay_cents)}</span></span>
                {Icon.chevron("var(--faint)")}
              </button>
            ))}
          </div>
        )}
        {!premium(trade) && hidden.n > 0 && (
          <button className="fu-blur" onClick={onUpgrade}>
            <span className="fu-pics">{(blur.length ? blur : [null, null, null].slice(0, Math.min(3, hidden.n))).map((u, i) => <i key={i} style={u ? { backgroundImage: `url("${u}")` } : undefined} />)}</span>
            <span className="fu-txt"><b>{hidden.n} more job{hidden.n === 1 ? "" : "s"} near you</b><span>Premium gets you these now</span></span>
            <span className="fu-go">See them</span>
          </button>
        )}
        {jobs.map((o) => (
          <div key={o.id} className="fa" role="button" tabIndex={0} onClick={() => onOpen(o)}>
            <div className="fa-pic" style={o.cover_path && covers[o.cover_path] ? { backgroundImage: `url("${covers[o.cover_path]}")` } : undefined} />
            <div className="fa-body">
              <b>{o.job_name}</b>
              <span className="fa-meta">{o.suburb}, {o.distance_km} km, {when(o)}</span>
              <div className="fa-foot"><span /><button className="btn primary small" onClick={(e) => { e.stopPropagation(); onOpen(o); }}>Send quote</button></div>
            </div>
          </div>
        ))}
        {!jobs.length && !missing(trade).length && <p className="t17 light" style={{ padding: "24px 16px", margin: 0, lineHeight: 1.45 }}>No trade jobs near you right now. You'll get an alert when one comes in.</p>}
      </div>
    </div>
  );
}

// Times a tradie can offer: the next 7 days, every two hours from 7 am, at least an hour from now.
function comeTimes() {
  const out: { id: string; label: string }[] = [];
  const min = Date.now() + 3600e3;
  for (let d = 0; d < 7; d++) for (const h of [7, 9, 11, 13, 15, 17]) {
    const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0);
    if (t.getTime() >= min) out.push({ id: t.toISOString(), label: dayTime(t.toISOString()).replace(/^./, (c) => c.toUpperCase()) });
  }
  return out;
}

type QuoteTpl = { id: number; name: string; price_cents: number; items: string[] };

// Send a quote: the job's photos first, the job, then the quote: a saved quote, the price, their time already picked, and a tick list of what's included.
export function TradeJob({ o, trade, onBack, onSent, onGone, onCreds }: { o: Offer; trade: TradeStatus; onBack: () => void; onSent: () => void; onGone: () => void; onCreds: () => void }) {
  const toast = useToast();
  const [pics, setPics] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [price, setPrice] = useState("");
  const [at, setAt] = useState<string | null>(null);
  // What the quote covers: the customer's own list, ticked, plus the tradie's saved items. No typing needed.
  const [items, setItems] = useState<{ t: string; on: boolean }[]>(() => (o.included ?? []).map((t) => ({ t, on: true })));
  const [adding, setAdding] = useState("");
  const [saved, setSaved] = useState<QuoteTpl[]>([]);
  const [tpl, setTpl] = useState(false);
  const [keep, setKeep] = useState(false);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // The customer's own time comes first and is selected already; any other time is one tap away.
  const times = [...(o.start_at && !o.asap && new Date(o.start_at).getTime() > Date.now() ? [{ id: o.start_at, label: `Their time: ${dayTime(o.start_at)}` }] : []), ...comeTimes()];
  useEffect(() => { if (!at && times[0]) setAt(times[0].id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { rpc<QuoteTpl[]>("my_quote_templates", {}).then((r) => setSaved(r ?? [])).catch(() => {}); }, []);
  const useTpl = (t: QuoteTpl) => {
    setPrice(String(Math.round(t.price_cents / 100)));
    setItems((cur) => { const have = new Set(cur.map((x) => x.t.toLowerCase())); return [...cur, ...t.items.filter((x) => !have.has(x.toLowerCase())).map((x) => ({ t: x, on: true }))]; });
    setErr("");
  };
  const inc = items.filter((x) => x.on).map((x) => x.t).join(", ");
  useEffect(() => {
    sb.from("job_media").select("path,kind,sort").eq("job_id", o.id).eq("kind", "photo").order("sort").then(async ({ data }) => {
      const rows = (data ?? []) as { path: string }[];
      const urls = await mediaUrls(rows.map((r) => r.path));
      setPics(rows.map((r) => urls[r.path]).filter(Boolean));
    });
  }, [o.id]);
  async function send() {
    const c = Number(price) * 100;
    if (!c) return setErr("Add your price.");
    if (!at) return setErr("Select when you can come.");
    if (inc.trim().length < 3) return setErr("Tick what your quote includes.");
    setErr(""); setBusy(true);
    try {
      await rpc("offer_job", { p_job: o.id, p_price_cents: c, p_included: inc.trim(), p_can_come_at: at });
      if (keep) await rpc("save_quote_template", { p_name: o.job_name, p_price_cents: c, p_items: items.filter((x) => x.on).map((x) => x.t) }).catch(() => {});
      toast(`Quote sent to ${o.customer_name.split(" ")[0]}`); onSent();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/taken|not available|all the quotes|opens to you soon/i.test(m)) { toast(m); onGone(); } else setErr(m);
    } finally { setBusy(false); }
  }
  return (
    <div className="screen tj" role="dialog" aria-label={o.job_name} style={{ background: "var(--card)" }}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <div className="fq-pic" style={pics[idx] ? { backgroundImage: `url("${pics[idx]}")` } : undefined} onClick={() => pics.length > 1 && setIdx((idx + 1) % pics.length)}>
          <button className="back fq-back" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="Back">{Icon.back("#fff")}</button>
          {pics.length > 1 && <span className="fq-n">{idx + 1} of {pics.length} photos</span>}
        </div>
        <div className="fq-body">
          <h1 className="fq-t">{o.job_name}</h1>
          <span className="fa-meta">{o.suburb}, {o.distance_km} km, {when(o)}</span>
          <p className="fq-d">{o.details}</p>
          {o.customer_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}{o.customer_name}, ID verified</span> : <span className="t15 light muted">{o.customer_name}</span>}
        </div>
        <div className="fq-body" style={{ paddingBottom: 130 }}>
          <h2 className="fq-h">Your quote</h2>
          {saved.length > 0 && (
            <button className="field sel" style={{ marginBottom: 10 }} onClick={() => setTpl(true)}><span className="k">Start from a saved quote</span><span className="v ph">{saved.length} saved</span></button>
          )}
          <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
            <label className="field" style={{ flex: 1 }}><span className="k">Fixed price</span>
              <span className="row" style={{ gap: 0 }}><span className="v">$</span><input inputMode="numeric" pattern="[0-9]*" value={price} placeholder="" onChange={(e) => { setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)); setErr(""); }} /></span></label>
            <button className="field sel" style={{ flex: 1.3 }} onClick={() => setPick(true)}><span className="k">Can come</span><span className={at ? "v" : "v ph"}>{at ? times.find((t) => t.id === at)?.label ?? dayTime(at) : "Select a time"}</span></button>
          </div>
          <h3 className="qq-h">What's included</h3>
          <div className="qq-items">
            {items.map((x, i) => (
              <button key={i} className={x.on ? "qq-i on" : "qq-i"} onClick={() => { setItems(items.map((y, j) => (j === i ? { ...y, on: !y.on } : y))); setErr(""); }}>
                <span className="qq-box">{x.on && Icon.tick("#fff", 16)}</span>{x.t}
              </button>
            ))}
            <label className="qq-add">
              <input value={adding} placeholder="Add an item, like Parts and labour" maxLength={60} onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && adding.trim()) { setItems([...items, { t: adding.trim(), on: true }]); setAdding(""); } }} />
              <button className="btn stone small" disabled={!adding.trim()} onClick={() => { setItems([...items, { t: adding.trim(), on: true }]); setAdding(""); }}>Add</button>
            </label>
          </div>
          <button className={keep ? "qq-keep on" : "qq-keep"} onClick={() => setKeep(!keep)}><span className="qq-box">{keep && Icon.tick("#fff", 16)}</span>Save as a quote for next time</button>
          {err && <p className="err" style={{ margin: "10px 0 0" }}>{err}</p>}
          {/QBCC|insurance/i.test(err) && <button className="btn stone small" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={onCreds}>Add your {/QBCC/.test(err) ? "QBCC licence" : "insurance"}</button>}
        </div>
      </div>
      <div className="bottombar">
        <span className="tj-fee">{premium(trade) ? <><b>$0</b> fee if you win</> : <>Fee if you win: <b>{Number(price) ? cents2(winFee(Number(price) * 100, trade.prices)) : `${trade.prices.win_pct_bp / 100}%`}</b><small>{Number(price) ? feeRule(trade.prices) : `Max ${dollars(trade.prices.win_max_cents)}`}</small></>}</span>
        <button className="btn primary" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send quote"} {Icon.arrow("#fff")}</button>
      </div>
      {pick && <SearchPicker title="When can you come?" value={at ? [at] : []} options={times} onClose={() => setPick(false)} onChange={(v) => setAt(String(v[0]))} />}
      {tpl && <SearchPicker title="Saved quotes" placeholder="Search your quotes" value={[]} options={saved.map((t) => ({ id: t.id, label: t.name, hint: `$${Math.round(t.price_cents / 100)}, ${t.items.join(", ")}` }))}
        onClose={() => setTpl(false)} onChange={(v) => { const t = saved.find((x) => x.id === v[0]); if (t) useTpl(t); setTpl(false); }} />}
    </div>
  );
}

// After sending a quote: waiting for the customer, and a way to message them.
export function TradeWaiting({ o, onWithdraw, onClose }: { o: MyOffer; onWithdraw: () => void; onClose: () => void }) {
  const { session } = useSession();
  const now = useNow(30000);
  const [chat, setChat] = useState(false);
  const hoursLeft = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - now) / 3600e3));
  return (
    <div className="screen" role="dialog" aria-label="Quote sent" style={{ background: "var(--card)" }}>
      <section className="hero cp-hero" style={{ paddingBottom: 26 }}>
        <div className="hero-top cp-top"><button className="back" onClick={onClose} aria-label="Back">{Icon.back("#fff")}</button><span className="jn">{o.title}</span></div>
        <span className="label" style={{ marginTop: 18 }}>Waiting for {o.customer_name} to choose</span>
        <span className="big lime">{money(o.pay_cents)}</span>
        <span className="sub" style={{ marginTop: 6 }}>Open for {hoursLeft} more hour{hoursLeft === 1 ? "" : "s"}.</span>
      </section>
      <div className="cp-sec">
        <span className="t17 w5">Your quote</span>
        <span className="t15 light muted">Can come {o.can_come_at ? dayTime(o.can_come_at) : ""}. Includes {o.included ? o.included.charAt(0).toLowerCase() + o.included.slice(1) : ""}.</span>
      </div>
      <div className="cp-sec">
        <span className="cp-title" style={{ marginBottom: 2 }}>What happens next</span>
        <span className="t15 light muted" style={{ lineHeight: 1.5 }}>If {o.customer_name} picks you, the job opens straight away.</span>
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        <button className="btn stone" style={{ flex: 1 }} onClick={onWithdraw}>Withdraw</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => setChat(true)}>{Icon.msg("#fff")} Message {o.customer_name}</button>
      </ActionBar>
      {chat && session && <ChatScreen jobId={o.job_id} me={session.user.id} workerId={session.user.id} otherName={o.customer_name} sub={`${money(o.pay_cents)}, ${o.title}`} onBack={() => setChat(false)} />}
    </div>
  );
}

