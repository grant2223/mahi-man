import { recLine, ScoreStrip, type Scores } from "../ui/Ratings";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api, firstPhoto, mediaUrls, rpc, sb, type IdStatus, type Job, myId } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { hours, money, whenLabel } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { Icon, Loading, Logo, SearchPicker, Tile, useNow, useToast } from "../ui/kit";
import { ReportScreen } from "../ui/Report";
import { Signup, type Steps } from "./Signup";
import { WorkerJob } from "./WorkerJob";
import { ActionBar, reviewSkipped } from "../ui/Completion";
import { AlertsAsk } from "../ui/AlertsAsk";
import { alertsState, askedFor } from "../lib/push";
import { SetSide } from "../ui/SideSwitch";
import { TabBar } from "../ui/TabBar";
import { Standby } from "./Standby";
import { Offline } from "./Offline";
import { Feed } from "../customer/Feed";
import { FeedOfferCard, useFeedOffer } from "../ui/LocalOffers";
import { TradeFeed, TradeJob, TradeJoin, TradePlan, TradePlans, TradeStrip, TradeWaiting, useTrade } from "./Trade";


interface WorkerStatus { steps: Steps; approved: boolean; suspended: boolean; pilot: boolean; id_status: IdStatus; id_note: string | null }

function BecomeWorker({ onDone }: { onDone: () => Promise<void> }) {
  const [err, setErr] = useState("");
  useEffect(() => {
    rpc("become_worker").then(onDone).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <div className="app">
      <section className="hero short"><span className="brand"><Logo /> Mahi Man</span>
        {err && <><p className="lede" style={{ marginTop: 16 }}>{err}</p><button className="btn white" style={{ marginTop: 16, alignSelf: "flex-start" }} onClick={() => location.reload()}>Try again</button></>}
      </section>
      {!err && <Loading />}
    </div>
  );
}

export function Work() {
  const { session, profile, ready, reload } = useSession();
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [current, setCurrent] = useState<Job | null | undefined>(undefined);
  const [wrapups, setWrapups] = useState<Job[]>([]);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    // Everything at once. Back from Stripe, the edge function also re-checks payouts with Stripe.
    let back = location.search.includes("payouts=1");
    try { if (localStorage.getItem("mm-payouts")) { back = true; localStorage.removeItem("mm-payouts"); } } catch { /* private mode */ }
    const status = (back ? api<WorkerStatus>("worker_status") : rpc<WorkerStatus>("worker_status"))
      .then(setStatus).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    const [, cur, open, closed] = await Promise.all([
      status,
      sb.from("jobs").select("*").eq("worker_id", uid).in("status", ["accepted", "in_progress"]).order("accepted_at", { ascending: false }).limit(1).maybeSingle(),
      // Jobs still to wrap up: waiting on payment, in dispute, or closed in the last 7 days without my review.
      sb.from("jobs").select("*, job_types(name)").eq("worker_id", uid).in("status", ["finished", "disputed"]).order("finished_at", { ascending: false }).limit(10),
      sb.from("jobs").select("*, job_types(name)").eq("worker_id", uid).eq("status", "confirmed").gt("confirmed_at", since).order("confirmed_at", { ascending: false }).limit(10),
    ]);
    const ids = (closed.data ?? []).map((j) => j.id);
    const { data: mine } = ids.length ? await sb.from("reviews").select("job_id").eq("from_id", uid).in("job_id", ids) : { data: [] };
    const done = new Set((mine ?? []).map((r) => r.job_id));
    const list = [...((open.data ?? []) as Job[]), ...((closed.data ?? []) as Job[]).filter((j) => !done.has(j.id) && !reviewSkipped(j.id))];
    setWrapups(list);
    setCurrent((cur.data as Job | null) ?? list.find((j) => !isHidden(j.id)) ?? null);
  }, [session]);

  useEffect(() => {
    if (session && profile?.is_worker) refresh();
  }, [session, profile?.is_worker, refresh]);

  // Back in the app after setting up payouts in the browser.
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible" && session && profile?.is_worker) refresh(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [session, profile?.is_worker, refresh]);

  useEffect(() => {
    if (location.search.includes("payouts=1")) history.replaceState(null, "", "/work");
  }, []);

  const [setupOpen, setSetupOpen] = useState(false);
  if (!ready) return <div className="app"><section className="hero short"><span className="brand"><Logo /> Mahi Man</span></section><Loading /></div>;

  // Not a worker yet: straight into sign-up. The jobs feed already explains what's needed.
  if (!session) {
    return (
      <div className="app">
        <AuthScreen title="Earn with Mahi Man" reason="Here's what you need to start:"
          need={["A clear photo of yourself", "Your passport or national ID. We verify you, usually within a few hours", "Your PayID or bank account, so customers can pay you"]}
          onBack={() => (history.length > 1 ? history.back() : go("/"))}
          onDone={async () => { await rpc("become_worker"); await reload(); }} />
      </div>
    );
  }
  if (!profile?.is_worker) return <BecomeWorker onDone={reload} />;

  if (!status || current === undefined) return <div className="app"><section className="hero short"><span className="brand"><Logo /> Mahi Man</span>{err && <p className="lede" style={{ marginTop: 16 }}>{err}</p>}</section>{!err && <Loading />}</div>;
  if (current) return <div className="app"><WorkerJob key={current.id} job={current} onChanged={refresh} onLeave={() => { hide(current.id); refresh(); }} /></div>;
  if (status.suspended) return (
    <div className="app"><section className="hero"><span className="brand"><Logo /> Mahi Man</span><h1 className="mid">Account paused</h1>
      <p className="lede">Your worker account is paused. Email hello@mahiman.app and we'll sort it out.</p></section></div>
  );
  // Still setting up: jobs first, so they can see what's on offer, and the checklist one tap away.
  if (!status.approved) {
    const done = Object.values(status.steps).filter(Boolean).length;
    return setupOpen
      ? <div className="app"><Signup steps={status.steps} pilot={status.pilot} idStatus={status.id_status} idNote={status.id_note} onChanged={refresh} onBack={() => setSetupOpen(false)} /></div>
      : <Feed setup={{ done, total: Object.keys(status.steps).length, onFinish: () => setSetupOpen(true) }} />;
  }
  return <div className="app"><Home pilot={status.pilot} onTaken={refresh} wrapups={wrapups} onOpen={(j) => { unhide(j.id); setCurrent(j); }} /></div>;
}

const isHidden = (id: string) => { try { return sessionStorage.getItem(`mm-hide-${id}`) === "1"; } catch { return false; } };
const hide = (id: string) => { try { sessionStorage.setItem(`mm-hide-${id}`, "1"); } catch { /* fine */ } };
const unhide = (id: string) => { try { sessionStorage.removeItem(`mm-hide-${id}`); } catch { /* fine */ } };
const WRAP_LABEL: Record<string, string> = { finished: "Get paid", disputed: "Being looked at", confirmed: "Leave a review" };

export interface Offer {
  id: string; job_name: string; category: string | null; suburb: string; distance_km: number; earn_cents: number; max_hours: number;
  asap: boolean; start_at: string; details: string; included: string[]; excluded: string[]; cover_path: string | null; photo_count: number;
  video_path: string | null; customer_id: string; customer_name: string; customer_photo: string | null; customer_verified: boolean;
  customer_rating: number | null; customer_jobs: number; customer_since: string; others_keen: number; invited_me: boolean; customer_scores?: Scores | null;
  trade?: boolean; budget_min_cents?: number | null; budget_max_cents?: number | null; spots_left?: number | null;
  urgent?: boolean; pay_method?: "cash" | "bank" | null;
}

export interface MyOffer {
  job_id: string; title: string; category: string | null; icon: string; suburb: string; pay_cents: number; eta_minutes: number;
  expires_at: string; status: string; customer_name: string; trade?: boolean; can_come_at?: string | null; included?: string | null;
}

const startLabel = (o: Offer) => o.asap ? "Now" : new Date(o.start_at).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });

function Home({ pilot, onTaken, wrapups, onOpen }: { pilot: boolean; onTaken: () => void; wrapups: Job[]; onOpen: (j: Job) => void }) {
  const toast = useToast();
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Offer | null>(null);
  const [mine, setMine] = useState<MyOffer[]>([]);
  const [waiting, setWaiting] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const pending = useRef(0);
  const { trade, reload: reloadTrade } = useTrade();
  const tradeLeft = trade?.plan?.jobs_left ?? 0;
  const [tradeScreen, setTradeScreen] = useState<null | "join" | "plans" | "plan" | "feed">(null);
  const [tradeOpen, setTradeOpen] = useState<Offer | null>(null);
  const tradeJobs = offers.filter((o) => o.trade);
  const feedOffer = useFeedOffer(online);
  const jobs = offers.filter((o) => !o.trade);

  useEffect(() => {
    myId().then((uid) => sb.from("workers").select("online").eq("id", uid).maybeSingle()).then(({ data }) => setOnline(!!data?.online));
  }, []);

  const poll = useCallback(async () => {
    try {
      const [list, my] = await Promise.all([rpc<Offer[]>("available_jobs"), rpc<MyOffer[]>("my_offers")]);
      setOffers(list);
      setMine(my);
      // When a pending offer disappears the customer may have chosen us: refresh to open the job.
      const p = my.filter((x) => x.status === "pending").length;
      if (p < pending.current) onTaken();
      pending.current = p;
      const fresh = list.filter((o) => !seen.current.has(o.id));
      if (fresh.length) {
        fresh.forEach((o) => seen.current.add(o.id));
        if (seen.current.size > fresh.length) { try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ } }
      }
      const need = list.map((o) => o.cover_path).filter((p): p is string => !!p && !covers[p]);
      if (need.length) { const urls = await mediaUrls(need); setCovers((c) => ({ ...c, ...urls })); }
    } catch { /* keep last list */ }
  }, [covers, onTaken]);

  useEffect(() => {
    if (!online && !mine.length && tradeLeft < 1) return;
    poll();
    const t = window.setInterval(poll, 8000);
    return () => window.clearInterval(t);
  }, [online, poll, mine.length, tradeLeft]);

  useEffect(() => { rpc<MyOffer[]>("my_offers").then((m) => { setMine(m); pending.current = m.filter((x) => x.status === "pending").length; }).catch(() => {}); }, []);

  const [ask, setAsk] = useState(false);
  async function toggle() {
    try {
      await rpc("set_online", { p_online: !online }); setOnline(!online); if (online) setOffers((x) => x.filter((o) => o.trade));
      if (!online && !askedFor("work") && (await alertsState()) === "prompt") setAsk(true);
    }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        {/* The brand, and across from it the switch that says whether they're available for jobs (top corner, clear of the mascot). */}
        <div className="hero-top" style={{ position: "relative", zIndex: 1 }}>
          <button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button>
          <button className="avail-sw" onClick={toggle} aria-label={online ? "Go offline" : "Go online"} aria-pressed={online}>
            <span>{online ? "Online" : "Offline"}</span>
            <span className={online ? "switch on" : "switch"} />
          </button>
        </div>
        <SetSide side="work" />
        <img className="mascot" src="/mascot.png" alt="" style={{ top: "auto", bottom: 0, height: 122, right: -24 }} />
        <div className="title-row">
          <h1 className="mid" style={{ margin: "18px 0 8px" }}>{online ? <>Jobs<br />near you</> : <>You're<br />offline</>}</h1>
        </div>
        {online && jobs.length > 0 && <p className="lede" style={{ position: "relative", maxWidth: 210 }}>Which job could you help with?</p>}
        {!online && <button className="btn of-hero-go" onClick={toggle}>Go online</button>}
      </section>

      <TradeStrip trade={trade} open={tradeJobs.length} onJoin={() => setTradeScreen("join")} onFeed={() => setTradeScreen("feed")} onPlan={() => setTradeScreen("plan")} />

      {wrapups.length > 0 && (
        <div className="wrap-list">
          {wrapups.map((j) => (
            <button key={j.id} className="wrap-row" onClick={() => onOpen(j)}>
              <span className="t"><b>{WRAP_LABEL[j.status] ?? "Open"}</b><span>{j.title || (j as Job & { job_types?: { name: string } }).job_types?.name || "Job"}, {money(j.price_cents + j.extra_cents)}, {new Date(j.finished_at ?? j.created_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span></span>
              {Icon.chevron("var(--faint)")}
            </button>
          ))}
        </div>
      )}

      {mine.filter((m) => m.status === "pending" && new Date(m.expires_at).getTime() > Date.now()).length > 0 && (
        <div className="wrap-list">
          {mine.filter((m) => m.status === "pending" && new Date(m.expires_at).getTime() > Date.now()).map((m) => (
            <button key={m.job_id} className="wrap-row" onClick={() => setWaiting(m.job_id)}>
              <span className="t"><b>Waiting for {m.customer_name}</b><span>{m.title}, {money(m.pay_cents)}, {m.trade ? "price sent" : `offer ends ${new Date(m.expires_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`}</span></span>
              {Icon.chevron("var(--faint)")}
            </button>
          ))}
        </div>
      )}

      {online && jobs.map((o, i) => (<Fragment key={o.id}>
        {i === 2 && feedOffer && <FeedOfferCard o={feedOffer} />}
        <button className="job-row" onClick={() => setOpen(o)}>
          <span className={`pic ${o.cover_path && covers[o.cover_path] ? "" : "ph-0"}`} style={o.cover_path && covers[o.cover_path] ? { backgroundImage: `url("${covers[o.cover_path]}")` } : undefined}>
            {o.video_path && <span className="vid"><svg width="10" height="10" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>Video</span>}
          </span>
          <span className="t">
            {o.invited_me ? <span className="ver" style={{ fontWeight: 500 }}>Sent to you</span> : o.urgent ? <span className="urg">Urgent</span> : null}
            <b>{o.job_name}</b>
            <span>{o.suburb}, {o.distance_km} km</span>
            <span>{startLabel(o)}{o.others_keen > 0 ? `, ${o.others_keen} other${o.others_keen === 1 ? "" : "s"} keen` : ""}</span>
            {o.customer_verified ? <span className="ver">{Icon.shieldTick("var(--emerald)", 15)}{o.customer_name}</span> : <span className="unver">{o.customer_name}, not verified</span>}
          </span>
          <span className="p">{money(o.earn_cents)}</span>
        </button>
      </Fragment>))}
      {online && !jobs.length && <Standby />}
      {online && jobs.length < 3 && feedOffer && <FeedOfferCard o={feedOffer} />}

      {!online && <Offline />}
      <History />
      <TabBar on="work" />
      {open && <OfferScreen o={open} pilot={pilot} onBack={() => setOpen(null)}
        onPass={async () => { await rpc("pass_job", { p_job: open.id }); setOpen(null); poll(); }}
        onOffered={() => { const id = open.id; setOpen(null); setWaiting(id); poll(); }} onGone={() => { setOpen(null); poll(); }} />}
      {waiting && (() => {
        const m = mine.find((x) => x.job_id === waiting);
        if (m?.trade) return <TradeWaiting o={m} onWithdraw={async () => { await rpc("withdraw_offer", { p_job: m.job_id }); setWaiting(null); poll(); }} onClose={() => setWaiting(null)} />;
        return m ? <WaitingScreen o={m} onWithdraw={async () => { await rpc("withdraw_offer", { p_job: m.job_id }); setWaiting(null); poll(); }}
          onClose={() => setWaiting(null)} /> : null;
      })()}
      {ask && <AlertsAsk role="work" onDone={() => setAsk(false)} />}
      {trade && tradeScreen === "join" && <TradeJoin trade={trade} onBack={() => setTradeScreen(null)} onPlans={() => setTradeScreen("plans")} />}
      {trade && tradeScreen === "plans" && <TradePlans trade={trade} onBack={() => setTradeScreen(trade.plan || trade.order ? "plan" : "join")} onDone={() => { reloadTrade(); setTradeScreen("plan"); }} />}
      {trade && tradeScreen === "plan" && <TradePlan trade={trade} onBack={() => setTradeScreen(null)} onChanged={reloadTrade} onPlans={() => setTradeScreen("plans")} />}
      {trade && tradeScreen === "feed" && <TradeFeed jobs={tradeJobs} covers={covers} left={tradeLeft} plan={trade.plan ? ({ payg: "Pay as you go", trade: "Trade plan", pro: "Trade Pro" } as const)[trade.plan.plan] : ""}
        onBack={() => setTradeScreen(null)} onOpen={setTradeOpen} />}
      {tradeOpen && <TradeJob o={tradeOpen} left={tradeLeft} onBack={() => setTradeOpen(null)}
        onSent={() => { const id = tradeOpen.id; setTradeOpen(null); setTradeScreen(null); reloadTrade(); poll(); setWaiting(id); }} onGone={() => { setTradeOpen(null); poll(); }} />}
    </>
  );
}

// Full-bleed job detail: everything a worker needs to decide before taking it.
function OfferScreen({ o, pilot, onBack, onPass, onOffered, onGone }: { o: Offer; pilot: boolean; onBack: () => void; onPass: () => void; onOffered: () => void; onGone: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<{ kind: string; url: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [eta, setEta] = useState(false);
  // Arrival time worked out from the distance (about 2 minutes a km plus 10 to get going); the worker can change it.
  const guess = (() => { const raw = 10 + Math.ceil(Number(o.distance_km ?? 5) * 2); return [10, 15, 20, 30, 45, 60, 90].find((n) => n >= raw) ?? 90; })();
  const [mins, setMins] = useState<number | null>(o.asap ? guess : 30);
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skills, setSkills] = useState<{ name: string; needs: string | null }[]>([]);

  useEffect(() => {
    rpc<{ name: string; needs: string | null }[]>("job_skills", { p_job: o.id }).then((r) => setSkills(r ?? [])).catch(() => {});
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sb.from("job_media").select("path,kind,sort").eq("job_id", o.id).order("sort").then(async ({ data }) => {
      const rows = (data ?? []) as { path: string; kind: string }[];
      const urls = await mediaUrls(rows.map((r) => r.path));
      const list = rows.filter((r) => urls[r.path]).map((r) => ({ kind: r.kind, url: urls[r.path] }));
      list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "photo" ? -1 : 1));
      setItems(list);
    });
    return () => { document.body.style.overflow = prev; };
  }, [o.id]);

  async function offer() {
    if (!mins) { setEta(true); return; }
    setBusy(true);
    try { await rpc("offer_job", { p_job: o.id, p_eta_minutes: mins }); toast(`${o.customer_name.split(" ")[0]} can see you're available`); onOffered(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); onGone(); } finally { setBusy(false); }
  }
  const at = (n: number) => new Date(Date.now() + n * 60000).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

  const cur = items[idx];
  const since = new Date(o.customer_since).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
  return (
    <div className="screen" role="dialog" aria-label={o.job_name}>
      <div className="screen-body" style={{ paddingBottom: 0 }}>
        <div className="gallery">
          {cur ? (cur.kind === "video" ? <video src={cur.url} controls playsInline /> : <img src={cur.url} alt="" />) : <div className="ph-0" style={{ width: "100%", height: "100%" }} />}
          <button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
          {items.length > 1 && <span className="count">{idx + 1} / {items.length}</span>}
        </div>
        {items.length > 1 && (
          <div className="thumbs-row">
            {items.map((it, i) => (
              <button key={it.url} className={i === idx ? "on" : ""} onClick={() => setIdx(i)} aria-label={it.kind === "video" ? "Play video" : `Photo ${i + 1}`}>
                {it.kind === "video"
                  ? <span className="ph-2" style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 500 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>Video</span>
                  : <img src={it.url} alt="" />}
              </button>
            ))}
          </div>
        )}
        <div style={{ background: "var(--card)", padding: "20px 20px 0" }}>
          <span className="em" style={{ display: "block", fontSize: 64, fontWeight: 600, letterSpacing: -3, lineHeight: 0.9 }}>{money(o.earn_cents)}</span>
          <span className="t15 light muted" style={{ display: "block", marginTop: 6 }}>
            {o.pay_method === "cash" ? "Paid to you in cash when it's done. You keep all of it."
              : o.pay_method === "bank" ? "Paid to you by bank transfer when it's done. You keep all of it."
              : pilot ? "Customer pays you directly when it's done. You keep all of it." : "Paid to your bank once the customer confirms. You keep all of it."}</span>
          {o.urgent && <span className="urg" style={{ marginTop: 10 }}>Urgent: the customer wants someone now</span>}
        </div>
        <div className="stat3">
          <span><b>{o.distance_km} km</b><span>{o.suburb}</span></span>
          <span><b>{o.others_keen ? `${o.others_keen} other${o.others_keen === 1 ? "" : "s"}` : "No one"}</b><span>also keen</span></span>
          <span><b>{o.asap ? "Now" : new Date(o.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</b><span>{o.asap ? "start" : new Date(o.start_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}</span></span>
        </div>
        <div className="poster">
          <Tile name={o.customer_name} photo={o.customer_photo} />
          <span className="t">
            <span className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 500 }}>{o.customer_name}</span>
              {o.customer_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not verified</span>}
            </span>
            <span className="small light muted">{o.customer_jobs} job{o.customer_jobs === 1 ? "" : "s"} posted, joined {since}</span>
            {o.customer_scores?.reviewed ? <span className="small em">{recLine(o.customer_scores, "workers")}</span> : null}
          </span>
        </div>
        {o.customer_scores?.reviewed ? <div style={{ background: "var(--card)", padding: "0 20px 4px" }}><ScoreStrip scores={o.customer_scores} worker={false} /></div> : null}
        <div className="stack" style={{ background: "var(--card)", padding: "20px 20px 24px", gap: 22 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: -0.7 }}>{o.job_name}</h1>
            <h2 style={{ margin: "8px 0 0", fontSize: 17, fontWeight: 600 }}>What they want done</h2>
            <p className="light" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{o.details}</p>
          </div>
          {skills.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Skills needed</h2>
              <p className="light" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{skills.map((k) => k.name).join(", ")}</p>
            </div>
          )}
          {(o.included.length > 0 || o.excluded.length > 0) && (
            <div className="stack" style={{ gap: 8 }}>
              <h2 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 600 }}>Included</h2>
              <div className="ticks">{o.included.map((x) => <span key={x} style={{ fontSize: 15 }}>{Icon.tick("var(--emerald)", 20)}{x}</span>)}</div>
              {o.excluded.length > 0 && <div className="ticks no"><h3>Not included</h3>{o.excluded.map((x) => <span key={x}>{Icon.cross("var(--faint)")}{x}</span>)}</div>}
            </div>
          )}
          {o.asap && mins && (
            <div className="row between" style={{ gap: 12, padding: "14px 16px", background: "var(--ground)", borderRadius: "var(--r-control)" }}>
              <span className="stack" style={{ gap: 2 }}>
                <span className="t14 light muted">You can be there by</span>
                <span className="t17 w5">{at(mins)} <span className="light muted" style={{ fontSize: 15 }}>in {mins} min</span></span>
              </span>
              <button className="link" onClick={() => setEta(true)}>Change</button>
            </div>
          )}
          <p className="small light muted" style={{ margin: 0, lineHeight: 1.45 }}>{o.customer_name.split(" ")[0]} sees your profile, scores and this time, and chooses who they want. Your offer lasts 15 minutes. The street address shows once you're chosen.</p>
          <button className="link quiet" style={{ alignSelf: "flex-start" }} onClick={() => setReport(true)}>{Icon.flag()} Report this job</button>
        </div>
      </div>
      <div className="bottombar" style={{ justifyContent: "flex-end" }}>
        <button className="btn stone" style={{ flex: 1 }} onClick={onPass}>Pass</button>
        <button className="btn primary" style={{ flex: 2 }} disabled={busy} onClick={offer}>{busy ? "Sending…" : "I'm available"}</button>
      </div>
      {eta && <SearchPicker title="When can you be there?" value={mins ? [mins] : []} options={[10, 15, 20, 30, 45, 60, 90].map((n) => ({ id: n, label: `In ${n} minutes`, hint: at(n) }))}
        onChange={(v) => setMins(Number(v[0]))} onClose={() => setEta(false)} />}
      {report && <ReportScreen name={o.customer_name} userId={o.customer_id} jobId={o.id} onBack={() => setReport(false)} onDone={() => { setReport(false); onGone(); }} />}
    </div>
  );
}

// After saying "I'm available": the 15 minute countdown while the customer chooses.
function WaitingScreen({ o, onWithdraw, onClose }: { o: MyOffer; onWithdraw: () => void; onClose: () => void }) {
  const now = useNow(1000);
  const left = Math.max(0, new Date(o.expires_at).getTime() - now);
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  useEffect(() => { if (left <= 0) onClose(); }, [left, onClose]);
  return (
    <div className="screen" role="dialog" aria-label="Waiting to be chosen" style={{ background: "var(--card)" }}>
      <section className="hero cp-hero" style={{ paddingBottom: 26 }}>
        <div className="hero-top cp-top">
          <span className="brand"><Logo /> Mahi Man</span>
          <span className="jn">{o.title}, {money(o.pay_cents)}</span>
        </div>
        <span className="label" style={{ marginTop: 18 }}>Waiting for {o.customer_name} to choose</span>
        <span className="big lime" style={{ fontVariantNumeric: "tabular-nums" }}>{mm}:{String(ss).padStart(2, "0")}</span>
        <span className="sub" style={{ marginTop: 6 }}>Your offer runs out when this hits zero.</span>
      </section>
      <div className="cp-sec">
        <span className="cp-title" style={{ marginBottom: 2 }}>What happens next</span>
        <span className="t15 light muted" style={{ lineHeight: 1.5 }}>If {o.customer_name} picks you, the job and your chat with them open straight away. If they pick someone else, or time runs out, you're free for the next one.</span>
      </div>
      <div className="cp-sec">
        <span className="t17 w5">Your offer</span>
        <span className="t15 light muted">Can be there in {o.eta_minutes} minutes, {money(o.pay_cents)}</span>
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar>
        <button className="btn stone" style={{ flex: 1 }} onClick={onWithdraw}>Withdraw</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={onClose}>See other jobs</button>
      </ActionBar>
    </div>
  );
}

function History() {
  const { session } = useSession();
  const [jobs, setJobs] = useState<(Job & { job_types: { name: string }; job_media: { path: string; kind: string; sort: number }[] })[]>([]);
  const [pics, setPics] = useState<Record<string, string>>({});
  useEffect(() => { if (jobs.length) mediaUrls(jobs.map((j) => firstPhoto(j.job_media)).filter(Boolean) as string[]).then(setPics); }, [jobs]);
  useEffect(() => {
    if (!session) return;
    sb.from("jobs").select("*, job_types(name), job_media(path,kind,sort)").eq("worker_id", session.user.id).in("status", ["finished", "confirmed", "disputed", "refunded", "cancelled"])
      .order("accepted_at", { ascending: false }).limit(20).then(({ data }) => setJobs((data ?? []) as never));
  }, [session]);
  if (!jobs.length) return null;
  return (
    <section className="section">
      <h2>Past jobs</h2>
      <div style={{ background: "var(--card)", borderRadius: 6 }}>
        {jobs.map((j) => (
          <div key={j.id} className="li" style={{ cursor: "default" }}>
            {(() => { const p = firstPhoto(j.job_media); return p && pics[p] ? <span className="li-pic" style={{ backgroundImage: `url("${pics[p]}")` }} /> : null; })()}
            <span className="t"><b>{j.title || j.job_types.name}</b><span>{whenLabel(j.asap, j.start_at)}</span></span>
            <span className={j.status === "confirmed" ? "t15 w5 em" : "small muted"}>{j.status === "confirmed" ? money(j.price_cents + j.extra_cents) : j.status === "finished" ? "Awaiting confirm" : j.status === "disputed" ? "Being checked" : j.status === "cancelled" ? "Cancelled" : "Refunded"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export { hours };
