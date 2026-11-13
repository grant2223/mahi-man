import { useCallback, useEffect, useState } from "react";
import { mediaUrls, rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { dayTime, money } from "../lib/format";
import { Icon, Screen, SearchPicker, StepHero, useNow, useToast } from "../ui/kit";
import { ActionBar, Note } from "../ui/Completion";
import { ChatScreen } from "../ui/Chat";
import type { Offer, MyOffer } from "./Work";

/* Trade jobs for licensed tradies: they pay for jobs upfront, see the budget first, and send a fixed price.
   Up to 2 tradies per job. A job comes back if the customer goes quiet or cancels before choosing. */

type PlanKey = "payg" | "trade" | "pro";
interface Price { price_cents: number; jobs: number; extra_cents: number }
export interface TradeStatus {
  prices: Record<PlanKey, Price> & { head_start_minutes: number; quotes_per_job: number; quiet_hours: number };
  licences: string[]; pending_licences: string[]; insured: boolean; abn: boolean; business_name: string | null;
  plan: { plan: PlanKey; status: "active" | "stopped"; jobs_left: number; renews_at: string | null } | null;
  order: { id: number; kind: "plan" | "jobs"; plan: PlanKey; jobs: number; amount_cents: number; renewal: boolean; created_at: string } | null;
  used_this_month: number;
}

export function useTrade() {
  const [t, setT] = useState<TradeStatus | null>(null);
  const load = useCallback(() => { rpc<TradeStatus>("trade_status").then(setT).catch(() => {}); }, []);
  useEffect(load, [load]);
  return { trade: t, reload: load };
}

const PLAN_NAME: Record<PlanKey, string> = { payg: "Pay as you go", trade: "Trade", pro: "Trade Pro" };
const Li = ({ b, s }: { b: string; s: string }) => <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>{b}</b>{s}</span></div>;
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });

// The line on the jobs page: a way in for licensed tradies, or their plan and the trade jobs open now.
export function TradeStrip({ trade, open, onJoin, onFeed, onPlan }: { trade: TradeStatus | null; open: number; onJoin: () => void; onFeed: () => void; onPlan: () => void }) {
  if (!trade || (!trade.licences.length && !trade.plan && !trade.order)) return null;
  const left = trade.plan?.jobs_left ?? 0;
  if (!trade.plan && !trade.order) {
    return (
      <div className="wrap-list"><button className="wrap-row" onClick={onJoin}>
        <span className="t"><b>Get trade jobs</b><span>Licensed jobs near you, budget shown first. From {money(trade.prices.payg.price_cents)} a job.</span></span>
        {Icon.chevron("var(--faint)")}
      </button></div>
    );
  }
  return (
    <div className="wrap-list">
      <button className="wrap-row" onClick={left > 0 ? onFeed : onPlan}>
        <span className="t">
          <b>{left > 0 ? `Trade jobs near you${open ? `, ${open} open` : ""}` : trade.order ? "Trade plan: invoice sent" : "No trade jobs left"}</b>
          <span>{left > 0 ? `${left} job${left === 1 ? "" : "s"} left on your plan` : trade.order ? "Your jobs are added once it's paid." : "Add jobs to send prices."}</span>
        </span>
        {Icon.chevron("var(--faint)")}
      </button>
      {left > 0 && <button className="wrap-row" onClick={onPlan}><span className="t"><b>Your trade plan</b><span>{PLAN_NAME[trade.plan!.plan]}{trade.plan!.renews_at && trade.plan!.status === "active" ? `, renews ${day(trade.plan!.renews_at)}` : ""}</span></span>{Icon.chevron("var(--faint)")}</button>}
    </div>
  );
}

// Why join.
export function TradeJoin({ trade, onBack, onPlans }: { trade: TradeStatus; onBack: () => void; onPlans: () => void }) {
  return (
    <div className="screen" role="dialog" aria-label="Local jobs for tradies" style={{ background: "var(--card)" }}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <section className="step-hero" style={{ paddingBottom: 30 }}>
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <h1>Local jobs for tradies</h1>
          <p>Customers near you who need a licensed tradie now.</p>
        </section>
        <div className="cp-sec">
          <span className="cp-title">How it works</span>
          <Li b="See the job and the budget first." s="Photos, suburb, when, and what the customer wants to spend." />
          <Li b={`Only ${trade.prices.quotes_per_job} tradies per job.`} s="Not 3, not a waitlist." />
          <Li b="Send your price." s="The customer sees it next to one other, and chooses." />
          <Li b="Keep 100% of the job." s="The customer pays you directly. No commission." />
        </div>
        <div className="cp-sec">
          <span className="cp-title">Fair on you</span>
          <Li b="Job back if the customer goes quiet." s={`No reply within ${trade.prices.quiet_hours} hours and the job goes back on your plan.`} />
          <Li b="No contract." s="Month to month. Stop any time." />
          <Li b="Unused jobs roll over." s="For one month." />
        </div>
        <div className="cp-sec" style={{ paddingBottom: 110 }}>
          <span className="cp-title">What you need</span>
          <Li b="Your trade licence and ABN." s={trade.licences.length ? `${trade.licences.join(", ")} checked.` : "We check both before your first job."} />
          <Li b="Public liability insurance." s={trade.insured ? "On file." : "Add the certificate in You, Licences and certificates."} />
        </div>
      </div>
      <div className="bottombar">
        <span className="stack"><span className="k">From</span><span className="v">{money(trade.prices.payg.price_cents)} a job</span></span>
        <button className="btn primary" onClick={onPlans}>See plans {Icon.arrow("#fff")}</button>
      </div>
    </div>
  );
}

// Pick a plan. Paid by invoice until card payments are switched on; the jobs are added once it's paid.
export function TradePlans({ trade, onBack, onDone }: { trade: TradeStatus; onBack: () => void; onDone: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<PlanKey>(trade.plan?.plan && trade.plan.plan !== "payg" ? trade.plan.plan : "trade");
  const [count, setCount] = useState(1);
  const [biz, setBiz] = useState(trade.business_name ?? "");
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = trade.prices;
  const amount = plan === "payg" ? p.payg.price_cents * count : p[plan].price_cents;
  const each = (k: "trade" | "pro") => `$${(p[k].price_cents / p[k].jobs / 100).toFixed(2)} each`;
  const P = ({ k, lines }: { k: PlanKey; lines: string[] }) => (
    <button className={`choice${plan === k ? " on" : ""}`} style={{ alignItems: "flex-start" }} onClick={() => setPlan(k)}>
      <span className="t">
        <span className="row between" style={{ alignItems: "baseline" }}>
          <b style={{ fontSize: 19, fontWeight: 500 }}>{PLAN_NAME[k]}</b>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6 }}>{money(p[k].price_cents)}<span className="t15 light muted" style={{ letterSpacing: 0 }}> {k === "payg" ? "a job" : "a month"}</span></span>
        </span>
        {lines.map((l) => <span key={l} className="t15 light muted">{l}</span>)}
      </span>
      <span style={{ marginTop: 2 }}>{plan === k ? Icon.tick("var(--emerald)", 22) : <span style={{ display: "inline-block", width: 22 }} />}</span>
    </button>
  );
  async function start() {
    setBusy(true);
    try {
      await rpc("trade_order", { p_kind: "plan", p_plan: plan, p_jobs: plan === "payg" ? count : null, p_business: biz });
      toast("Invoice on its way"); onDone();
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="screen" role="dialog" aria-label="Choose your plan" style={{ background: "var(--card)" }}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <StepHero title="Choose your plan" sub="Paid upfront each month. Stop any time." onBack={onBack} />
        <P k="payg" lines={["Buy jobs one at a time", "No monthly fee"]} />
        <P k="trade" lines={[`${p.trade.jobs} jobs a month (${each("trade")})`, `Extra jobs ${money(p.trade.extra_cents)}`]} />
        <P k="pro" lines={[`${p.pro.jobs} jobs a month (${each("pro")})`, `Extra jobs ${money(p.pro.extra_cents)}`, `See new jobs ${p.head_start_minutes} minutes before other tradies`]} />
        <div className="stack" style={{ padding: 16, gap: 10 }}>
          {plan === "payg" && <button className="field sel" onClick={() => setPick(true)}><span className="k">How many jobs</span><span className="v">{count} job{count === 1 ? "" : "s"}</span></button>}
          <label className="field"><span className="k">Business name, shown with your price</span><input value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Optional" /></label>
        </div>
        <p className="t15 light muted" style={{ padding: "0 16px 120px", margin: 0, lineHeight: 1.45 }}>
          We email your invoice. Your jobs are added as soon as it's paid. {plan !== "payg" ? "Renews monthly. " : ""}Unused jobs roll over for one month.
        </p>
      </div>
      <div className="bottombar">
        <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={start}>{busy ? "Sending…" : `Start, ${money(amount)} by invoice`}</button>
      </div>
      {pick && <SearchPicker title="How many jobs" value={[count]} options={[1, 2, 3, 4, 5, 10].map((n) => ({ id: n, label: `${n} job${n === 1 ? "" : "s"}`, hint: money(p.payg.price_cents * n) }))}
        onClose={() => setPick(false)} onChange={(v) => setCount(Number(v[0]))} />}
    </div>
  );
}

// Their plan: jobs left, the invoice waiting, add jobs, change or stop.
export function TradePlan({ trade, onBack, onChanged, onPlans }: { trade: TradeStatus; onBack: () => void; onChanged: () => void; onPlans: () => void }) {
  const toast = useToast();
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const pl = trade.plan, o = trade.order;
  const key: PlanKey = pl?.status === "active" ? pl.plan : "payg";
  const extra = trade.prices[key].extra_cents;
  const run = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true);
    try { await rpc(fn, args); toast(done); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Screen title="Your trade plan" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div className="cp-sec">
          <span className="cp-title">{pl ? PLAN_NAME[pl.plan] : "No plan yet"}</span>
          <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1 }}>{pl?.jobs_left ?? 0}<span className="t17 light muted" style={{ letterSpacing: 0 }}> job{pl?.jobs_left === 1 ? "" : "s"} left</span></span>
          {pl && <span className="t15 light muted">{pl.status === "stopped" ? "Stopped. Jobs you have stay until you use them." : pl.renews_at ? `Renews ${day(pl.renews_at)}. ${trade.used_this_month} used this month.` : `${trade.used_this_month} used this month.`}</span>}
        </div>
        {o && (
          <div className="cp-sec">
            <span className="cp-title">Invoice sent, {money(o.amount_cents)}</span>
            <span className="t15 light muted" style={{ lineHeight: 1.45 }}>{o.kind === "plan" && o.plan !== "payg" ? `${PLAN_NAME[o.plan]}, ${o.jobs} jobs` : `${o.jobs} job${o.jobs === 1 ? "" : "s"}`}{o.renewal ? ", monthly renewal" : ""}. Added as soon as it's paid.</span>
            {!o.renewal && <button className="link quiet" style={{ padding: 0, alignSelf: "flex-start" }} disabled={busy} onClick={() => run("trade_order_cancel", {}, "Cancelled")}>Cancel this invoice</button>}
          </div>
        )}
        <Note icon="clock">A job you sent a price on comes back if the customer doesn't reply in {trade.prices.quiet_hours} hours, or cancels before choosing.</Note>
        <div style={{ flex: 1 }} />
        {pl?.status === "active" && pl.plan !== "payg" && (
          <div style={{ padding: "0 16px 12px" }}><button className="link quiet" style={{ padding: 0 }} disabled={busy} onClick={() => run("trade_stop", {}, "Your plan won't renew")}>Stop my plan</button></div>
        )}
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={onPlans}>{pl ? "Change plan" : "See plans"}</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={() => setPick(true)}>Add jobs</button>
        </ActionBar>
      </div>
      {pick && <SearchPicker title="Add jobs" value={[]} options={[1, 2, 3, 5, 10].map((n) => ({ id: n, label: `${n} job${n === 1 ? "" : "s"}`, hint: money(extra * n) }))}
        onClose={() => setPick(false)} onChange={(v) => run("trade_order", { p_kind: "jobs", p_plan: key, p_jobs: Number(v[0]) }, "Invoice on its way")} />}
    </Screen>
  );
}

const range = (o: Offer) => `${money(o.budget_min_cents ?? 0)}–${(o.budget_max_cents ?? 0) / 100}`;
const whenWanted = (o: Offer) => (o.asap ? "today" : dayTime(o.start_at));

// Trade jobs near them, budget first.
export function TradeFeed({ jobs, covers, left, plan, onBack, onOpen }: { jobs: Offer[]; covers: Record<string, string>; left: number; plan: string; onBack: () => void; onOpen: (o: Offer) => void }) {
  return (
    <div className="screen" role="dialog" aria-label="Trade jobs near you">
      <div className="screen-body">
        <section className="step-hero" style={{ paddingBottom: 26 }}>
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button><span className="count">{plan}</span></div>
          <h1>Trade jobs near you</h1>
          <p>{left} job{left === 1 ? "" : "s"} left on your plan</p>
        </section>
        {jobs.map((o) => (
          <button key={o.id} className="job-row" onClick={() => onOpen(o)}>
            <span className={`pic ${o.cover_path && covers[o.cover_path] ? "" : "ph-0"}`} style={o.cover_path && covers[o.cover_path] ? { backgroundImage: `url("${covers[o.cover_path]}")` } : undefined} />
            <span className="t">
              <b>{o.job_name}</b>
              <span>{o.suburb}, {o.distance_km} km · {whenWanted(o)}</span>
              <span className={o.spots_left === 1 ? "unver" : ""}>{o.spots_left === 1 ? "1 spot left" : `${o.spots_left} spots open`}</span>
            </span>
            <span className="stack" style={{ alignItems: "flex-end", gap: 0 }}><span className="small muted">Budget</span><span className="p" style={{ fontSize: 20 }}>{range(o)}</span></span>
          </button>
        ))}
        {!jobs.length && <p className="t17 light" style={{ padding: "24px 16px", margin: 0, lineHeight: 1.45 }}>No trade jobs open near you right now. You'll get an alert the moment one comes in.</p>}
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

// One trade job: the job, the budget, and the tradie's fixed price.
export function TradeJob({ o, left, onBack, onSent, onGone }: { o: Offer; left: number; onBack: () => void; onSent: () => void; onGone: () => void }) {
  const toast = useToast();
  const [pics, setPics] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [when, setWhen] = useState<string | null>(null);
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
    if (!when) return setErr("Pick when you can come.");
    if (inc.trim().length < 3) return setErr("Say what your price includes.");
    setErr(""); setBusy(true);
    try {
      await rpc("offer_job", { p_job: o.id, p_price_cents: c, p_included: inc.trim(), p_can_come_at: when });
      toast(`Price sent to ${o.customer_name.split(" ")[0]}`); onSent();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/taken|already have|not available/i.test(m)) { toast(m); onGone(); } else setErr(m);
    } finally { setBusy(false); }
  }
  return (
    <div className="screen" role="dialog" aria-label={o.job_name} style={{ background: "var(--card)" }}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <StepHero title={o.job_name} sub={`${o.suburb}, ${o.distance_km} km · ${whenWanted(o)} · ${o.spots_left === 1 ? "1 spot left" : `${o.spots_left} spots open`}`} onBack={onBack} />
        {pics.length > 0 && (
          <div className="row" style={{ gap: 8, padding: "16px 16px 0", overflowX: "auto" }}>
            {pics.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ flex: "none" }}><img src={u} alt="" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 4, display: "block" }} /></a>)}
          </div>
        )}
        <div className="cp-sec">
          <span className="t16 light" style={{ lineHeight: 1.5 }}>{o.details}</span>
          <div style={{ marginTop: 8 }}>
            <div className="row between" style={{ padding: "7px 0" }}><span className="t16 light">Budget</span><span className="t17 w5">{money(o.budget_min_cents ?? 0)}–{money(o.budget_max_cents ?? 0)}</span></div>
            <div className="row between" style={{ padding: "7px 0" }}><span className="t16 light">Customer</span><span className="t16">{o.customer_name}</span></div>
          </div>
          <span className="row" style={{ gap: 12 }}>
            {o.customer_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not verified</span>}
            <span className="t15 light muted">{o.customer_jobs} job{o.customer_jobs === 1 ? "" : "s"} posted</span>
          </span>
        </div>
        <div className="cp-sec" style={{ paddingBottom: 120 }}>
          <span className="cp-title">Your price</span>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}><span className="k">Fixed price</span>
              <span className="row" style={{ gap: 0 }}><span className="v">$</span><input inputMode="numeric" pattern="[0-9]*" value={price} placeholder="180" onChange={(e) => { setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)); setErr(""); }} /></span></label>
            <button className="field sel" style={{ flex: 1.3 }} onClick={() => setPick(true)}><span className="k">Can come</span><span className={when ? "v" : "v ph"}>{when ? times.find((t) => t.id === when)?.label ?? dayTime(when) : "Pick a time"}</span></button>
          </div>
          <label className="field" style={{ marginTop: 10, minHeight: 84, justifyContent: "flex-start" }}><span className="k">What's included</span>
            <textarea value={inc} rows={2} maxLength={200} placeholder="The power point, parts and labour" onChange={(e) => { setInc(e.target.value); setErr(""); }} /></label>
          {err && <p className="err" style={{ margin: "10px 0 0" }}>{err}</p>}
        </div>
      </div>
      <div className="bottombar">
        <span className="t15 light muted">Uses 1 of your {left} job{left === 1 ? "" : "s"}</span>
        <button className="btn primary" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send price"} {Icon.arrow("#fff")}</button>
      </div>
      {pick && <SearchPicker title="When can you come?" value={when ? [when] : []} options={times} onClose={() => setPick(false)} onChange={(v) => setWhen(String(v[0]))} />}
    </div>
  );
}

// After sending a price: waiting for the customer, and a way to message them.
export function TradeWaiting({ o, onWithdraw, onClose }: { o: MyOffer; onWithdraw: () => void; onClose: () => void }) {
  const { session } = useSession();
  const now = useNow(30000);
  const [chat, setChat] = useState(false);
  const hoursLeft = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - now) / 3600e3));
  return (
    <div className="screen" role="dialog" aria-label="Price sent" style={{ background: "var(--card)" }}>
      <section className="hero cp-hero" style={{ paddingBottom: 26 }}>
        <div className="hero-top cp-top"><button className="back" onClick={onClose} aria-label="Back">{Icon.back("#fff")}</button><span className="jn">{o.title}</span></div>
        <span className="label" style={{ marginTop: 18 }}>Waiting for {o.customer_name} to choose</span>
        <span className="big lime">{money(o.pay_cents)}</span>
        <span className="sub" style={{ marginTop: 6 }}>Open for {hoursLeft} more hour{hoursLeft === 1 ? "" : "s"}.</span>
      </section>
      <div className="cp-sec">
        <span className="t17 w5">Your price</span>
        <span className="t15 light muted">Can come {o.can_come_at ? dayTime(o.can_come_at) : ""}. Includes {o.included ? o.included.charAt(0).toLowerCase() + o.included.slice(1) : ""}.</span>
      </div>
      <div className="cp-sec">
        <span className="cp-title" style={{ marginBottom: 2 }}>What happens next</span>
        <span className="t15 light muted" style={{ lineHeight: 1.5 }}>If {o.customer_name} chooses you, the job opens straight away. If they don't reply in time, or cancel, the job goes back on your plan. Withdrawing doesn't.</span>
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
