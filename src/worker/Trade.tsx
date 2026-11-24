import { useCallback, useEffect, useState } from "react";
import { mediaUrls, rpc, sb } from "../lib/supabase";
import { go } from "../lib/router";
import { dayTime, money } from "../lib/format";
import { Icon, Screen, SearchPicker, useNow, useToast } from "../ui/kit";
import { ActionBar, Note } from "../ui/Completion";
import { BankPay, claimArgs } from "../ui/Payments";
import type { Offer, MyOffer } from "./Work";

/* Licensed jobs for businesses, and Premium for everyone who works on Mahi Man.
   Every worker and business: Mahi Man takes a share of the agreed price (capped) when a customer selects them, or Premium, monthly or yearly, keeps 100%.
   Every job alerts everyone available at once. Customers don't set a budget on licensed jobs; businesses quote their price. */

interface Prices { fee_pct?: number; win_pct_bp: number; win_max_cents: number; block_cents?: number; month_cents: number; year_cents: number; quiet_hours: number; qbcc_over_cents?: number }
interface Pay { payid?: string; bsb?: string; account?: string; account_name?: string; trading_name?: string }
export interface TradeStatus {
  prices: Prices; licences: string[]; pending_licences: string[]; insured: boolean; abn: boolean; business_name: string | null;
  trades: number[]; can_trade: boolean;
  plan: { plan: "standard" | "premium"; status: "active" | "stopped"; billing: "month" | "year" | null; renews_at: string | null; premium: boolean; starts_on?: string | null } | null;
  order: { id: number; kind?: "plan" | "offer"; status?: "requested" | "claimed"; billing: "month" | "year"; amount_cents: number; renewal: boolean; created_at: string } | null;
  owed: { id: number; reference: string; amount_cents: number; job: string; created_at: string; status?: "requested" | "claimed" }[];
  // What they owe now, and the line that stops new jobs until it's paid (Admin settings).
  owing_cents?: number; block_cents?: number;
  won_this_month: number; pay: Pay;
}

export function useTrade() {
  const [t, setT] = useState<TradeStatus | null>(null);
  const load = useCallback(() => { rpc<TradeStatus>("trade_status").then(setT).catch(() => {}); }, []);
  useEffect(load, [load]);
  return { trade: t, reload: load };
}

const dollars = (c: number) => "$" + Math.round(c / 100).toLocaleString("en-AU");
const cents2 = (c: number) => "$" + (c / 100).toLocaleString("en-AU", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
// Mahi Man's share when a customer selects them: a share of the agreed price, capped.
export const winFee = (quote: number, p: Prices) => Math.min(p.win_max_cents, Math.round((quote * p.win_pct_bp) / 10000));
export const feeRule = (p: Prices) => `${p.win_pct_bp / 100}%, max ${dollars(p.win_max_cents)}`;
// Owing past the limit: no new jobs or quotes until it's paid.
export const feesBlocked = (t: TradeStatus | null) => !!t && (t.owing_cents ?? 0) > 0 && (t.owing_cents ?? 0) >= (t.block_cents ?? Infinity);
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
export const joined = (t: TradeStatus | null) => !!t?.plan;
export const premium = (t: TradeStatus | null) => !!t?.plan?.premium;
// What a tradie still needs before they can quote.
export const missing = (t: TradeStatus) => [!t.trades?.length && "trades", !t.business_name?.trim() && "business name", !t.abn && "ABN", !t.insured && "insurance"].filter(Boolean) as string[];


/* Before they can quote: anything still missing from their business profile, with one way to fix it.
   The details themselves live in the business profile, so they're never asked twice. */
export function TradeReady({ trade }: { trade: TradeStatus; onChanged?: () => void; onAbn?: () => void; onCreds?: () => void }) {
  const m = missing(trade);
  if (!m.length) return null;
  return (
    <div className="tr-need">
      <span>Add your {m.join(" and ")} to quote</span>
      <button className="btn primary small" onClick={() => go("/work/trade")}>Business profile</button>
    </div>
  );
}

// Premium, for every worker and business: $97 a month (or yearly), 0% on every job. Pay per job is the free default.
// When joining licensed jobs, "Or pay per job" sets them up without Premium.
type Ready = { onChanged: () => void; onAbn: () => void; onCreds: () => void };
export function TradeJoin({ trade, onBack, onJoined, onNeedPay, joining = true }: { trade: TradeStatus; onBack: () => void; onJoined: (plan: "standard" | "premium") => void; onNeedPay?: () => void; ready?: Ready; joining?: boolean }) {
  const toast = useToast();
  const p = trade.prices;
  const [year, setYear] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const freeMonths = Math.max(0, Math.round((p.month_cents * 12 - p.year_cents) / p.month_cents));
  const example = 40000;
  const rows: [string, string, string][] = [
    ["To join", "Free", year ? `${dollars(p.year_cents)} a year` : `${dollars(p.month_cents)} a month`],
    ["Mahi Man takes", feeRule(p), "0%"],
    [`On a ${dollars(example)} job`, cents2(winFee(example, p)), "$0"],
  ];
  const join = async (plan: "standard" | "premium") => {
    if (joining && !trade.trades.length) { toast("Select your trades first"); document.querySelector(".tr")?.scrollIntoView({ behavior: "smooth" }); return; }
    setBusy(true);
    try {
      if (joining) await rpc("trade_join", { p_plan: plan, p_billing: year ? "year" : "month", p_business: null });
      else await rpc("premium_request", { p_billing: year ? "year" : "month" });
      toast(plan === "premium" ? "Invoice on its way. Premium starts once it's paid." : "You're in. Licensed jobs near you show on your jobs page.");
      onJoined(plan);
    } catch (e) {
      setBusy(false);
      if (e instanceof Error && e.message.startsWith("Add your PayID") && onNeedPay) onNeedPay(); else toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="screen tj" role="dialog" aria-label="Premium" style={{ background: "var(--card)" }}>
      <div className="screen-body">
        <section className="hx">
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <span className="hx-tag">Premium</span>
          <h1>Keep 100% of every job.</h1>
          <span className="hx-price">{year ? dollars(p.year_cents) : dollars(p.month_cents)}<small>{year ? " a year" : " a month"}</small></span>
          <div className="hx-term">
            <button className={!year ? "on" : ""} onClick={() => setYear(false)}>Monthly</button>
            <button className={year ? "on" : ""} onClick={() => setYear(true)}>Yearly{freeMonths ? `, ${freeMonths} months free` : ""}</button>
          </div>
          <span className="hx-li">{Icon.tick("var(--gold)", 20)} 0% on every job</span>
          <span className="hx-li">{Icon.tick("var(--gold)", 20)} Instead of {feeRule(p)}</span>
          <span className="hx-li">{Icon.tick("var(--gold)", 20)} Stop any time</span>
          <button className="btn hx-go" disabled={busy} onClick={() => join("premium")}>Go Premium {Icon.arrow("#2a2d32")}</button>
        </section>
        {joining && missing(trade).length > 0 && <section className="tj-sec"><TradeReady trade={trade} /></section>}
        <section className="tj-sec last">
          {joining && (
            <div className="of-alt">
              <span className="of-k">Or pay per job, free to join<button className="of-i" onClick={() => setInfo(true)} aria-label="About paying per job">{Icon.info("var(--muted)", 18)}</button></span>
              <button className="btn stone small" disabled={busy} onClick={() => join("standard")}>Select</button>
            </div>
          )}
          <button className="cmp-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>Compare pay per job and Premium</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="tj-table cmp">
              <span /><span className="tj-col"><b>Per job</b></span><span className="tj-col on"><b>Premium</b></span>
              {rows.map(([k, a, b]) => [<span key={k + "k"} className="tj-k">{k}</span>, <span key={k + "a"} className="tj-v">{a}</span>, <span key={k + "b"} className="tj-v on">{b}</span>])}
            </div>
          )}
        </section>
      </div>
      {info && <Screen title="Pay per job" onBack={() => setInfo(false)}><div className="screen-body of-info">
        <p>Free to join. When a customer selects you, Mahi Man takes {p.fee_pct ?? p.win_pct_bp / 100}% of the agreed price, never more than {dollars(p.win_max_cents)} a job. On a {dollars(example)} job it's {cents2(winFee(example, p))}. We invoice it, and you have 7 days to pay.</p>
      </div></Screen>}
    </div>
  );
}

// What they owe, and paying it: the fees by reference, the bank details, I've paid. Owing past the limit stops new jobs until it's paid.
export function PayFees({ trade, onBack, onChanged }: { trade: TradeStatus; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const owed = trade.owed.reduce((a, x) => a + x.amount_cents, 0);
  const open = trade.owed.filter((x) => x.status !== "claimed");
  const due = open.reduce((a, x) => a + x.amount_cents, 0);
  const blocked = (trade.owing_cents ?? 0) >= (trade.block_cents ?? Infinity);
  const ref = open[0] ? open[0].reference : "";
  return (
    <>
    <div className="app pq pf" role="dialog" aria-label="Pay your fees">
      <button className="back pq-back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
      <div className="up-top">
        <span className="up-k">{blocked ? "Pay to keep taking jobs" : "Mahi Man fees to pay"}</span>
        <b className="up-big">{cents2(owed)}</b>
      </div>
      <div className="pf-list">
        {trade.owed.map((x) => (
          <div key={x.id} className="pf-row"><span><b>{x.job}</b><small>{x.reference}{x.status === "claimed" ? ", we're checking it" : ""}</small></span><b>{cents2(x.amount_cents)}</b></div>
        ))}
      </div>
      <p className="up-line">{blocked ? `Owing ${dollars(trade.block_cents!)} or more stops new jobs and quotes until it's paid.` : "Pay within 7 days of each invoice."}</p>
      <div className="up-btns">
        {due > 0
          ? <button className="pq-gold" onClick={() => setPaying(true)}><span>Pay {cents2(due)} now</span></button>
          : <button className="btn stone" onClick={onBack}>We're checking your payment</button>}
      </div>
    </div>
    {paying && <div className="app pq tp-paying">
      <button className="back pq-back" onClick={() => setPaying(false)} aria-label="Back">{Icon.back("#fff")}</button>
      <BankPay title={open.length === 1 ? `Fee for ${open[0].job}` : `${open.length} Mahi Man fees`} sub={open.map((x) => x.reference).join(", ")} amount={due} pay={trade.pay} reference={ref}
        note="We check your payment within 24 hours, usually faster."
        onConfirm={async (c) => { for (const x of open) await rpc("trade_claim_paid", { p_id: x.id, ...claimArgs(c) }); setPaying(false); toast("Thanks. We're checking your payment."); onChanged(); }} />
    </div>}
    </>
  );
}

// How they pay: per job or Premium, anything to pay and how, and a way to change.
export function TradePlan({ trade, onBack, onChanged, onUpgrade }: { trade: TradeStatus; onBack: () => void; onChanged: () => void; onUpgrade: () => void; ready?: Ready }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pl = trade.plan, o = trade.order, pay = trade.pay;
  const [paying, setPaying] = useState(false);
  const [fees, setFees] = useState(false);
  const oName = o?.billing === "year" ? "Premium, yearly" : "Premium, monthly";
  const owed = trade.owed.reduce((a, x) => a + x.amount_cents, 0);
  const due = o && o.status !== "claimed" ? { id: o.id, amount: o.amount_cents, name: oName } : null;
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
          <span className="cp-title">{pl?.premium ? "Premium" : "Pay per job"}</span>
          {pl?.premium
            ? <span className="t15 light muted">{pl.status === "stopped" ? `Stopped. Premium runs until ${day(pl.renews_at!)}, then it's pay per job.` : `${pl.billing === "year" ? "Yearly" : "Monthly"}. Renews ${day(pl.renews_at!)}. You keep 100%.`}</span>
            : <span className="t15 light muted">Mahi Man takes {feeRule(trade.prices)} a job, invoiced when a customer selects you.</span>}
        </div>
        {owed > 0 && (
          <div className="cp-sec">
            <div className="row between"><span className="cp-title" style={{ margin: 0 }}>Fees to pay</span><span className="t17 w5">{cents2(owed)}</span></div>
            <button className="btn primary" onClick={() => setFees(true)}>{Icon.card("currentColor")}Pay now</button>
          </div>
        )}
        {o && (
          <div className="cp-sec">
            <span className="cp-title">To pay</span>
            <div className="row between" style={{ padding: "6px 0" }}><span className="t16">{oName}{o.renewal ? ", renewal" : ""}</span><span className="t17 w5">{money(o.amount_cents)}</span></div>
            {o.status === "claimed" && <span className="t15 light muted">We're checking your payment, usually within 24 hours.</span>}
            {payRows.length > 0 && due && <div className="tp-pay">
              <span className="t15 light muted">By bank transfer. Use the reference so we can match it.</span>
              {payRows.map(([k, v]) => <div key={k} className="row between"><span className="t15 light">{k}</span><span className="t16 w5">{v}</span></div>)}
              <div className="row between"><span className="t15 light">Reference</span><span className="t16 w5">TR-{due.id}</span></div>
            </div>}
            {due && (!o.renewal
              ? <div className="ps-btns">
                  <button className="btn stone" disabled={busy} onClick={() => run("trade_order_cancel", "Invoice cancelled")}>{Icon.x("currentColor")}Cancel</button>
                  <button className="btn primary" disabled={busy} onClick={() => setPaying(true)}>{Icon.tick("currentColor", 20)}I've paid</button>
                </div>
              : <div className="ps-btns one"><button className="btn primary" disabled={busy} onClick={() => setPaying(true)}>{Icon.tick("currentColor", 20)}I've paid {money(due.amount)}</button></div>)}
          </div>
        )}
        {missing(trade).length > 0 && trade.trades.length > 0 && <div className="cp-sec"><TradeReady trade={trade} /></div>}
        {!pl?.premium && <Note icon="lock">{`Premium is ${dollars(trade.prices.month_cents)} a month and you keep 100%.`}</Note>}
        <div style={{ flex: 1 }} />
        {pl?.premium && pl.status === "active" && (
          <div style={{ padding: "0 16px 12px" }}><button className="btn stone" disabled={busy} onClick={() => run("trade_stop", "Premium won't renew")}>Stop Premium</button></div>
        )}
        {!pl?.premium && !o && <ActionBar><button className="btn hx-go" style={{ flex: 1 }} onClick={onUpgrade}>Go Premium</button></ActionBar>}
      </div>
    </Screen>
      {paying && due && <div className="app pq tp-paying">
          <button className="back pq-back" onClick={() => setPaying(false)} aria-label="Back">{Icon.back("#fff")}</button>
          <BankPay title={due.name} sub={`TR-${due.id}`} amount={due.amount} pay={pay} reference={`TR-${due.id}`}
            note="We check your payment within 24 hours, usually faster."
            onConfirm={async (c) => { await rpc("trade_claim_paid", { p_id: due.id, ...claimArgs(c) }); setPaying(false); toast("Thanks. We're checking your payment."); onChanged(); }} />
        </div>}
      {fees && <PayFees trade={trade} onBack={() => setFees(false)} onChanged={() => { setFees(false); onChanged(); }} />}
    </>
  );
}

const when = (o: Offer) => (o.asap ? "Today" : dayTime(o.start_at).replace(/^./, (c) => c.toUpperCase()));

// Licensed jobs: the photo first, the job, where and when, Send quote.
export function TradeFeed({ trade, jobs, quotes = [], onQuote, covers, onBack, onOpen }: { trade: TradeStatus; jobs: Offer[]; quotes?: MyOffer[]; onQuote?: (job: string) => void; covers: Record<string, string>; onBack: () => void; onOpen: (o: Offer) => void; ready: Ready }) {
  const [view, setView] = useState<"jobs" | "quotes">("jobs");
  const waitingN = quotes.filter((m) => m.status === "pending" && new Date(m.expires_at).getTime() > Date.now()).length;
  return (
    <div className="screen tj" role="dialog" aria-label="Licensed jobs">
      <div className="screen-body" style={{ background: "var(--ground)" }}>
        <section className="step-hero" style={{ paddingBottom: 22 }}>
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <h1>Licensed jobs</h1>
        </section>
        {missing(trade).length > 0 && <div className="tj-sec" style={{ background: "var(--card)" }}><TradeReady trade={trade} /></div>}
        {quotes.length > 0 && (
          <div className="wk-tabs" role="tablist">
            <button role="tab" aria-selected={view === "jobs"} className={view === "jobs" ? "on" : ""} onClick={() => setView("jobs")}>{Icon.pin(view === "jobs" ? "#fff" : "var(--ink)")} Jobs</button>
            <button role="tab" aria-selected={view === "quotes"} className={view === "quotes" ? "on" : ""} onClick={() => setView("quotes")}>{Icon.doc(view === "quotes" ? "#fff" : "var(--ink)")} My quotes{waitingN > 0 && <span className="n">{waitingN}</span>}</button>
          </div>
        )}
        {view === "quotes" && quotes.length > 0 ? <TradeQuotes quotes={quotes} covers={covers} onOpen={(id) => onQuote?.(id)} /> : (<>
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
        {!jobs.length && !missing(trade).length && <p className="t17 light" style={{ padding: "24px 16px", margin: 0, lineHeight: 1.45 }}>No licensed jobs near you right now. You'll get an alert when one comes in.</p>}
        </>)}
      </div>
    </div>
  );
}

// Times a business can offer: the next 7 days, every two hours from 7 am, at least an hour from now.
function comeTimes() {
  const out: { id: string; label: string }[] = [];
  const min = Date.now() + 3600e3;
  for (let d = 0; d < 7; d++) for (const h of [7, 9, 11, 13, 15, 17]) {
    const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0);
    if (t.getTime() >= min) out.push({ id: t.toISOString(), label: dayTime(t.toISOString()).replace(/^./, (c) => c.toUpperCase()) });
  }
  return out;
}

// Send a quote: the job's photos first, the job, then the quote.
export function TradeJob({ o, trade, onBack, onSent, onGone, onCreds, onOwing }: { o: Offer; trade: TradeStatus; onBack: () => void; onSent: () => void; onGone: () => void; onCreds: () => void; onOwing?: () => void }) {
  const toast = useToast();
  const [pics, setPics] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [price, setPrice] = useState("");
  const [at, setAt] = useState<string | null>(null);
  // A note is optional: the quote covers the job as the customer posted it.
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // The customer's own time is selected already.
  const times = [...(o.start_at && !o.asap && new Date(o.start_at).getTime() > Date.now() ? [{ id: o.start_at, label: dayTime(o.start_at).replace(/^./, (c) => c.toUpperCase()) }] : []), ...comeTimes()];
  useEffect(() => { if (!at && times[0]) setAt(times[0].id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    setErr(""); setBusy(true);
    try {
      await rpc("offer_job", { p_job: o.id, p_price_cents: c, p_included: note.trim() || null, p_can_come_at: at });
      toast(`Quote sent to ${o.customer_name.split(" ")[0]}`); onSent();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.startsWith("PAY_FEES") && onOwing) onOwing();
      else if (/taken|not available|all the quotes|opens to you soon/i.test(m)) { toast(m); onGone(); } else setErr(m);
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
          <label className="qk-price">
            <span>Your price</span>
            <span className="qk-amt"><b>$</b><input inputMode="numeric" pattern="[0-9]*" value={price} placeholder="0" style={{ width: `${Math.max(1, price.length) + 0.1}ch` }} onChange={(e) => { setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)); setErr(""); }} /></span>
            <small>{premium(trade) ? "Premium: you keep 100%" : `Mahi Man takes ${Number(price) ? cents2(winFee(Number(price) * 100, trade.prices)) : feeRule(trade.prices)} if you're selected`}</small>
          </label>
          <button className="qk-row" onClick={() => setPick(true)}><span>When</span><b>{at ? times.find((t) => t.id === at)?.label ?? dayTime(at) : "Select a time"}</b>{Icon.chevron("var(--muted)")}</button>
          {noting
            ? <label className="field" style={{ marginTop: 10, minHeight: 84, justifyContent: "flex-start" }}><span className="k">Note</span>
                <textarea autoFocus value={note} rows={2} maxLength={200} placeholder="Anything they should know" onChange={(e) => setNote(e.target.value)} /></label>
            : <button className="qk-row" onClick={() => setNoting(true)}><span>Note</span><b className="ph">Optional</b>{Icon.chevron("var(--muted)")}</button>}
          {err && <p className="err" style={{ margin: "10px 0 0" }}>{err}</p>}
          {/QBCC|insurance/i.test(err) && <button className="btn stone small" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={onCreds}>Add your {/QBCC/.test(err) ? "QBCC licence" : "insurance"}</button>}
        </div>
      </div>
      <div className="bottombar">
        <button className="btn primary" style={{ width: "100%" }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send quote"} {Icon.arrow("#fff")}</button>
      </div>
      {pick && <SearchPicker title="When can you come?" value={at ? [at] : []} options={times} onClose={() => setPick(false)} onChange={(v) => setAt(String(v[0]))} />}
    </div>
  );
}

// Their quotes, with where each one stands. Lost ones stay for 3 days so they know.
export function TradeQuotes({ quotes, covers, onOpen }: { quotes: MyOffer[]; covers: Record<string, string>; onOpen: (job: string) => void }) {
  const now = useNow(60000);
  if (!quotes.length) return null;
  return (
    <div className="tq">
      {quotes.map((m) => {
        const left = Math.max(0, Math.ceil((new Date(m.expires_at).getTime() - now) / 3600e3));
        const live = m.status === "pending" && left > 0;
        const pic = m.cover_path && covers[m.cover_path];
        return (
          <button key={m.job_id} className={`job-row tq-row${live ? "" : " off"}`} onClick={() => live && onOpen(m.job_id)} disabled={!live}>
            <span className="pic" style={pic ? { backgroundImage: `url("${pic}")` } : undefined} />
            <span className="t">
              <b>{m.title}</b>
              <span className="tq-amt">{dollars(m.pay_cents)}</span>
              {live
                ? <span className="tq-st wait">{Icon.clock("currentColor", 16)} Waiting for {m.customer_name}, {left} h left</span>
                : <span className="tq-st lost">{m.status === "expired" || (m.status === "pending" && !left) ? `Closed, ${m.customer_name} didn't choose anyone` : `${m.customer_name} went with someone else`}</span>}
            </span>
            {live && Icon.chevron("var(--faint)")}
          </button>
        );
      })}
    </div>
  );
}

// After sending a quote: waiting for the customer.
export function TradeWaiting({ o, onWithdraw, onClose }: { o: MyOffer; onWithdraw: () => void; onClose: () => void }) {
  const now = useNow(30000);
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
        <span className="t15 light muted">Can come {o.can_come_at ? dayTime(o.can_come_at) : ""}.{o.included ? ` ${o.included}` : ""}</span>
      </div>
      <div className="cp-sec">
        <span className="cp-title" style={{ marginBottom: 2 }}>What happens next</span>
        <span className="t15 light muted" style={{ lineHeight: 1.5 }}>If {o.customer_name} picks you, the job opens straight away.</span>
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        <button className="btn stone" style={{ flex: 1 }} onClick={onWithdraw}>Withdraw quote</button>
      </ActionBar>
    </div>
  );
}

