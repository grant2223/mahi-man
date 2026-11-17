import { useCallback, useEffect, useState } from "react";
import { mediaUrls, rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { dayTime, money } from "../lib/format";
import { Icon, Screen, SearchPicker, useNow, useToast } from "../ui/kit";
import { ActionBar, Note } from "../ui/Completion";
import { ChatScreen } from "../ui/Chat";
import type { Offer, MyOffer } from "./Work";
import { lc } from "./Skills";

/* Trade jobs for tradespeople. Two ways to pay: per job (free to join, a fee only when a customer picks your quote),
   or monthly/yearly (no fee per job, every new job first). A tradesperson is a tradesperson; only the timing and the fee differ. Customers don't set a budget; tradies quote their price. */

interface Prices { win_fee_cents: number; month_cents: number; year_cents: number; standard_after_minutes: number; standard_early_minutes: number;
  first_quotes: number; more_quotes: number; more_every_minutes: number; max_quotes: number; quiet_hours: number; qbcc_over_cents?: number }
interface Pay { payid?: string; bsb?: string; account?: string; account_name?: string; trading_name?: string }
export interface TradeStatus {
  prices: Prices; licences: string[]; pending_licences: string[]; insured: boolean; abn: boolean; business_name: string | null;
  trades: number[]; can_trade: boolean;
  plan: { plan: "standard" | "premium"; status: "active" | "stopped"; billing: "month" | "year" | null; renews_at: string | null; premium: boolean } | null;
  order: { id: number; billing: "month" | "year"; amount_cents: number; renewal: boolean; created_at: string } | null;
  owed: { id: number; reference: string; amount_cents: number; job: string; created_at: string }[];
  won_this_month: number; premium_now: { n: number; photos: string[] }; pay: Pay;
}

export function useTrade() {
  const [t, setT] = useState<TradeStatus | null>(null);
  const load = useCallback(() => { rpc<TradeStatus>("trade_status").then(setT).catch(() => {}); }, []);
  useEffect(load, [load]);
  return { trade: t, reload: load };
}

const dollars = (c: number) => "$" + Math.round(c / 100).toLocaleString("en-AU");
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
export const joined = (t: TradeStatus | null) => !!t?.plan;
export const premium = (t: TradeStatus | null) => !!t?.plan?.premium;
// What a tradie still needs before they can quote.
export const missing = (t: TradeStatus) => [!t.trades?.length && "trades", !t.business_name?.trim() && "business name", !t.abn && "ABN", !t.insured && "insurance"].filter(Boolean) as string[];
const qbcc = (t: TradeStatus) => dollars(t.prices.qbcc_over_cents ?? 330000);

interface TradeSkill { id: number; name: string; credential_type_id: number | null; credential_types: { name: string; short: string } | null }

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

// Join: monthly as the offer, per job as the free option, the comparison behind a tap.
type Ready = { onChanged: () => void; onAbn: () => void; onCreds: () => void };
export function TradeJoin({ trade, onBack, onJoined, onNeedPay, ready }: { trade: TradeStatus; onBack: () => void; onJoined: (plan: "standard" | "premium") => void; onNeedPay?: () => void; ready: Ready }) {
  const toast = useToast();
  const p = trade.prices;
  const [year, setYear] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const weekly = Math.round((p.win_fee_cents * 52) / 12);
  const premMonth = year ? Math.round(p.year_cents / 12) : p.month_cents;
  const freeMonths = Math.max(0, Math.round((p.month_cents * 12 - p.year_cents) / p.month_cents));
  const after = p.standard_after_minutes >= 60 && p.standard_after_minutes % 60 === 0 ? `${p.standard_after_minutes / 60} hour${p.standard_after_minutes === 60 ? "" : "s"}` : `${p.standard_after_minutes} min`;
  const rows: [string, string, string][] = [
    ["To join", "Free", year ? `${dollars(p.year_cents)} a year` : `${dollars(p.month_cents)} a month`],
    ["Each job you win", dollars(p.win_fee_cents), "$0"],
    ["New jobs", `After ${after}`, "First"],
    ["Win 1 job a week", `${dollars(weekly)} a month`, `${dollars(premMonth)} a month`],
  ];
  const join = async (plan: "standard" | "premium") => {
    if (!trade.trades.length) { toast("Select your trades first"); document.querySelector(".tr")?.scrollIntoView({ behavior: "smooth" }); return; }
    setBusy(true);
    try {
      await rpc("trade_join", { p_plan: plan, p_billing: year ? "year" : "month", p_business: null });
      toast(plan === "premium" ? "Invoice on its way. Monthly starts once it's paid." : "You're in. Trade jobs near you show on your jobs page.");
      onJoined(plan);
    } catch (e) {
      setBusy(false);
      if (e instanceof Error && e.message.startsWith("Add your PayID") && onNeedPay) onNeedPay(); else toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="screen tj" role="dialog" aria-label="Trade jobs" style={{ background: "var(--card)" }}>
      <div className="screen-body">
        <section className="hx">
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <span className="hx-tag">For tradespeople</span>
          <h1>Every local trade job, first.</h1>
          <span className="hx-price">{year ? dollars(p.year_cents) : dollars(p.month_cents)}<small>{year ? " a year" : " a month"}</small></span>
          <div className="hx-term">
            <button className={!year ? "on" : ""} onClick={() => setYear(false)}>Monthly</button>
            <button className={year ? "on" : ""} onClick={() => setYear(true)}>Yearly{freeMonths ? `, ${freeMonths} months free` : ""}</button>
          </div>
          <span className="hx-li">{Icon.tick("var(--gold)", 20)} Unlimited jobs, $0 when you win</span>
          <span className="hx-li">{Icon.tick("var(--gold)", 20)} See new jobs {after === "1 hour" ? "an hour" : after} earlier</span>
          <span className="hx-li">{Icon.tick("var(--gold)", 20)} Win a job a week for {dollars(premMonth)} a month, not {dollars(weekly)}</span>
          <button className="btn hx-go" disabled={busy} onClick={() => join("premium")}>Go monthly {Icon.arrow("#2a2d32")}</button>
        </section>
        {missing(trade).length > 0 && <section className="tj-sec"><TradeReady trade={trade} /></section>}
        <section className="tj-sec last">
          <div className="hx-std">
            <span className="t"><b>Or pay per job, free to join</b><span>{dollars(p.win_fee_cents)} only when a customer picks you. See new jobs after {after}.</span></span>
            <button className="btn stone" disabled={busy} onClick={() => join("standard")}>Select</button>
          </div>
          <button className="cmp-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>Compare per job and monthly</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="tj-table cmp">
              <span /><span className="tj-col"><b>Per job</b></span><span className="tj-col on"><b>Monthly</b></span>
              {rows.map(([k, a, b]) => [<span key={k + "k"} className="tj-k">{k}</span>, <span key={k + "a"} className="tj-v">{a}</span>, <span key={k + "b"} className="tj-v on">{b}</span>])}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// How they pay: per job or monthly, anything to pay and how, and a way to change.
export function TradePlan({ trade, onBack, onChanged, onUpgrade, ready }: { trade: TradeStatus; onBack: () => void; onChanged: () => void; onUpgrade: () => void; ready: Ready }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pl = trade.plan, o = trade.order, pay = trade.pay;
  const owed = trade.owed.reduce((a, x) => a + x.amount_cents, 0);
  const run = async (fn: string, done: string) => {
    setBusy(true);
    try { await rpc(fn, {}); toast(done); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const payRows = ([["PayID", pay.payid], ["BSB", pay.bsb], ["Account", pay.account], ["Account name", pay.account_name || pay.trading_name]] as [string, string | undefined][]).filter(([, v]) => v);
  return (
    <Screen title="How you pay" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div className="cp-sec">
          <span className="cp-title">{pl?.premium ? "Monthly" : "Per job"}</span>
          {pl?.premium
            ? <span className="t15 light muted">{pl.status === "stopped" ? `Stopped. Monthly runs until ${day(pl.renews_at!)}, then you pay per job.` : `${pl.billing === "year" ? "Yearly" : "Monthly"}. Renews ${day(pl.renews_at!)}.`}</span>
            : <span className="t15 light muted">{dollars(trade.prices.win_fee_cents)} when a customer picks your quote. {trade.won_this_month ? `${trade.won_this_month} won this month.` : ""}</span>}
        </div>
        {(o || owed > 0) && (
          <div className="cp-sec">
            <span className="cp-title">To pay</span>
            {o && <div className="row between" style={{ padding: "6px 0" }}><span className="t16">{o.billing === "year" ? "Yearly" : "Monthly"}{o.renewal ? ", renewal" : ""}</span><span className="t17 w5">{money(o.amount_cents)}</span></div>}
            {trade.owed.map((x) => <div key={x.id} className="row between" style={{ padding: "6px 0" }}><span className="t16">{x.job} <span className="light muted">{x.reference}</span></span><span className="t17 w5">{money(x.amount_cents)}</span></div>)}
            {payRows.length > 0 && <div className="tp-pay">
              <span className="t15 light muted">By bank transfer. Use the reference so we can match it.</span>
              {payRows.map(([k, v]) => <div key={k} className="row between"><span className="t15 light">{k}</span><span className="t16 w5">{v}</span></div>)}
              {o && <div className="row between"><span className="t15 light">Reference</span><span className="t16 w5">TR-{o.id}</span></div>}
            </div>}
            {o && !o.renewal && <button className="link quiet" style={{ padding: 0, alignSelf: "flex-start" }} disabled={busy} onClick={() => run("trade_order_cancel", "Invoice cancelled")}>Cancel the monthly invoice</button>}
          </div>
        )}
        {missing(trade).length > 0 && <div className="cp-sec"><TradeReady trade={trade} /></div>}
        <Note icon="clock">{pl?.premium ? "You see every new trade job first." : `Monthly gets you new jobs first and $0 per job. Win a job a week and it costs less.`}</Note>
        <div style={{ flex: 1 }} />
        {pl?.premium && pl.status === "active" && (
          <div style={{ padding: "0 16px 12px" }}><button className="link quiet" style={{ padding: 0 }} disabled={busy} onClick={() => run("trade_stop", "Monthly won't renew")}>Stop monthly</button></div>
        )}
        {!pl?.premium && !o && <ActionBar><button className="btn hx-go" style={{ flex: 1 }} onClick={onUpgrade}>Go monthly</button></ActionBar>}
      </div>
    </Screen>
  );
}

const when = (o: Offer) => (o.asap ? "Today" : dayTime(o.start_at).replace(/^./, (c) => c.toUpperCase()));

// Trade jobs: the photo first, the job, where and when, Send quote. Tradespeople paying per job also see the jobs others can quote on now, blurred.
export function TradeFeed({ trade, jobs, quotes = [], onQuote, covers, onBack, onOpen, onUpgrade, ready }: { trade: TradeStatus; jobs: Offer[]; quotes?: MyOffer[]; onQuote?: (job: string) => void; covers: Record<string, string>; onBack: () => void; onOpen: (o: Offer) => void; onUpgrade: () => void; ready: Ready }) {
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
            <span className="fu-txt"><b>{hidden.n} more job{hidden.n === 1 ? "" : "s"} near you</b><span>Monthly gets you these now</span></span>
            <span className="fu-go">See them</span>
          </button>
        )}
        {jobs.map((o) => (
          <div key={o.id} className="fa" role="button" tabIndex={0} onClick={() => onOpen(o)}>
            <div className="fa-pic" style={o.cover_path && covers[o.cover_path] ? { backgroundImage: `url("${covers[o.cover_path]}")` } : undefined} />
            <div className="fa-body">
              <b>{o.job_name}</b>
              <span className="fa-meta">{o.suburb}, {o.distance_km} km · {when(o)}</span>
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

// Send a quote: the job's photos first, the job, then the quote.
export function TradeJob({ o, trade, onBack, onSent, onGone, onCreds }: { o: Offer; trade: TradeStatus; onBack: () => void; onSent: () => void; onGone: () => void; onCreds: () => void }) {
  const toast = useToast();
  const [pics, setPics] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [price, setPrice] = useState("");
  const [at, setAt] = useState<string | null>(null);
  const [inc, setInc] = useState("");
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const times = comeTimes();
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
    if (inc.trim().length < 3) return setErr("Say what your quote includes.");
    setErr(""); setBusy(true);
    try {
      await rpc("offer_job", { p_job: o.id, p_price_cents: c, p_included: inc.trim(), p_can_come_at: at });
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
          <span className="fa-meta">{o.suburb}, {o.distance_km} km · {when(o)}</span>
          <p className="fq-d">{o.details}</p>
          {o.customer_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}{o.customer_name}, ID verified</span> : <span className="t15 light muted">{o.customer_name}</span>}
        </div>
        <div className="fq-body" style={{ paddingBottom: 130 }}>
          <h2 className="fq-h">Your quote</h2>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}><span className="k">Fixed price</span>
              <span className="row" style={{ gap: 0 }}><span className="v">$</span><input inputMode="numeric" pattern="[0-9]*" value={price} placeholder="180" onChange={(e) => { setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)); setErr(""); }} /></span></label>
            <button className="field sel" style={{ flex: 1.3 }} onClick={() => setPick(true)}><span className="k">Can come</span><span className={at ? "v" : "v ph"}>{at ? times.find((t) => t.id === at)?.label ?? dayTime(at) : "Select a time"}</span></button>
          </div>
          <label className="field" style={{ marginTop: 10, minHeight: 84, justifyContent: "flex-start" }}><span className="k">What's included</span>
            <textarea value={inc} rows={2} maxLength={200} placeholder="Parts and labour" onChange={(e) => { setInc(e.target.value); setErr(""); }} /></label>
          {err && <p className="err" style={{ margin: "10px 0 0" }}>{err}</p>}
          {/QBCC|insurance/i.test(err) && <button className="btn stone small" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={onCreds}>Add your {/QBCC/.test(err) ? "QBCC licence" : "insurance"}</button>}
        </div>
      </div>
      <div className="bottombar">
        <span className="tj-fee">{premium(trade) ? <><b>$0</b> if you win</> : <><b>{dollars(trade.prices.win_fee_cents)}</b> only if you win</>}</span>
        <button className="btn primary" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send quote"} {Icon.arrow("#fff")}</button>
      </div>
      {pick && <SearchPicker title="When can you come?" value={at ? [at] : []} options={times} onClose={() => setPick(false)} onChange={(v) => setAt(String(v[0]))} />}
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

// The business name customers see on each quote. Sole traders can use their own name.
function BusinessName({ value, onBack, onSaved }: { value: string; onBack: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Screen title="Business name" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16, background: "var(--card)" }}>
        <label className="field"><span className="k">Business or trading name</span>
          <input value={v} maxLength={60} autoFocus onChange={(e) => { setV(e.target.value); setErr(""); }} placeholder="Taylor Landscaping" /></label>
        <p className="small light muted" style={{ lineHeight: 1.45 }}>Customers see it on your quotes. A sole trader can use their own name.</p>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn primary" disabled={busy} onClick={async () => {
            if (v.trim().length < 2) return setErr("Add your business name.");
            setBusy(true);
            try { await rpc("trade_set_business", { p_name: v.trim() }); toast("Saved"); onSaved(); }
            catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Screen>
  );
}
