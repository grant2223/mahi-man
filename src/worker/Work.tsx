import { useCallback, useEffect, useRef, useState } from "react";
import { api, rpc, sb, type Job } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { hours, money, money2, whenLabel } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { Icon, Perf, SearchPicker, useNow, useToast } from "../ui/kit";
import { Signup, type Steps } from "./Signup";
import { WorkerJob } from "./WorkerJob";

interface Offer { id: string; job_name: string; suburb: string; distance_km: number; earn_cents: number; max_hours: number; asap: boolean; start_at: string; notes: string }
const OFFER_SECONDS = 60;

export function Work() {
  const { session, profile, ready, reload } = useSession();
  const [auth, setAuth] = useState(false);
  const [status, setStatus] = useState<{ steps: Steps; approved: boolean; suspended: boolean } | null>(null);
  const [current, setCurrent] = useState<Job | null | undefined>(undefined);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const s = await api<{ steps: Steps; approved: boolean; suspended: boolean }>("worker_status");
      setStatus(s);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    const { data } = await sb.from("jobs").select("*").eq("worker_id", session.user.id).in("status", ["accepted", "in_progress"])
      .order("accepted_at", { ascending: false }).limit(1).maybeSingle();
    setCurrent(data as Job | null);
  }, [session]);

  useEffect(() => {
    if (session && profile?.is_worker) refresh();
  }, [session, profile?.is_worker, refresh]);

  useEffect(() => {
    if (location.search.includes("payouts=1")) history.replaceState(null, "", "/work");
  }, []);

  if (!ready) return null;

  if (!session || !profile?.is_worker) {
    return (
      <div className="app">
        <section className="hero">
          <span className="deco" aria-hidden="true">$</span>
          <div className="hero-top" style={{ position: "relative" }}>
            <button className="wordmark" onClick={() => go("/")}>oddjobs.</button>
            <span className="row t15" style={{ gap: 6 }}>{Icon.pin("#fff")} Cairns</span>
          </div>
          <h1 style={{ position: "relative" }}>Earn on<br />your time</h1>
          <p className="lede" style={{ position: "relative" }}>Switch on when you're free, take the jobs you want, keep 100% of the job price.</p>
        </section>
        <div className="ticket">
          {[["Cleaning", "Units, houses, Airbnb turnovers"], ["Moving and tip runs", "Lifting, loading, one-ute runs"], ["Flat-pack and yard work", "Assembly, tidy-ups, mowing"]].map(([t, s]) => (
            <div key={t} className="li" style={{ cursor: "default" }}><span className="t"><b>{t}</b><span>{s}</span></span></div>
          ))}
          <Perf />
          <div className="row between" style={{ padding: "8px 16px 18px" }}>
            <span className="small light muted" style={{ maxWidth: 160, lineHeight: 1.4 }}>Paid to your bank after each job is confirmed.</span>
            <button className="btn primary" onClick={async () => {
              if (!session) return setAuth(true);
              await rpc("become_worker"); await reload();
            }}>Start {Icon.arrow("#fff")}</button>
          </div>
        </div>
        <div className="footer"><button className="link quiet" onClick={() => go("/")}>Need a job done instead?</button></div>
        {auth && <AuthScreen title="Earn with oddjobs" reason="Create your account. Next you'll add a photo, check your ID and set up your bank." onBack={() => setAuth(false)}
          onDone={async () => { setAuth(false); await rpc("become_worker"); await reload(); }} />}
      </div>
    );
  }

  if (!status || current === undefined) return <div className="app"><section className="hero short"><span className="wordmark">oddjobs.</span>{err && <p>{err}</p>}</section></div>;
  if (current) return <div className="app"><WorkerJob job={current} onChanged={refresh} /></div>;
  if (status.suspended) return (
    <div className="app"><section className="hero"><span className="wordmark">oddjobs.</span><h1 className="mid">Account paused</h1>
      <p className="lede">Your worker account is paused. Email hello@findfitpeople.com and we'll sort it out.</p></section></div>
  );
  if (!status.approved) return <div className="app"><Signup steps={status.steps} onChanged={refresh} /></div>;
  return <div className="app"><Home onTaken={refresh} /></div>;
}

function Home({ onTaken }: { onTaken: () => void }) {
  const toast = useToast();
  const now = useNow(1000);
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [shownAt, setShownAt] = useState<Record<string, number>>({});
  const [week, setWeek] = useState(0);
  const [eta, setEta] = useState<Offer | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    sb.from("workers").select("online").single().then(({ data }) => setOnline(!!data?.online));
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    sb.auth.getUser().then(({ data: u }) => sb.from("jobs").select("price_cents,extra_cents").eq("worker_id", u.user?.id ?? "").eq("status", "confirmed").gte("confirmed_at", since)
      .then(({ data }) => setWeek((data ?? []).reduce((s, j) => s + j.price_cents + j.extra_cents, 0))));
  }, []);

  const poll = useCallback(async () => {
    try {
      const list = await rpc<Offer[]>("open_offers");
      setOffers(list);
      const fresh = list.filter((o) => !seen.current.has(o.id));
      if (fresh.length) {
        fresh.forEach((o) => seen.current.add(o.id));
        setShownAt((m) => ({ ...m, ...Object.fromEntries(fresh.map((o) => [o.id, Date.now()])) }));
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
      }
    } catch { /* keep last list */ }
  }, []);

  useEffect(() => {
    if (!online) return;
    poll();
    const t = window.setInterval(poll, 8000);
    return () => window.clearInterval(t);
  }, [online, poll]);

  const offer = online ? offers[0] : undefined;
  const left = offer ? Math.max(0, OFFER_SECONDS - Math.floor((now - (shownAt[offer.id] ?? now)) / 1000)) : 0;

  useEffect(() => {
    if (offer && left === 0) rpc("pass_job", { p_job: offer.id }).then(poll);
  }, [offer, left, poll]);

  async function toggle() {
    try { await rpc("set_online", { p_online: !online }); setOnline(!online); if (online) setOffers([]); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }
  async function take(o: Offer, mins: number) {
    try { await rpc("accept_job", { p_job: o.id, p_eta_minutes: mins }); toast("It's yours"); onTaken(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); poll(); }
  }

  if (offer) {
    const m = Math.floor(left / 60), s = left % 60;
    return (
      <>
        <section className="hero" style={{ paddingBottom: 110 }}>
          <div className="hero-top">
            <span className="t17 w5">New job nearby</span>
            <span className="chip-dark">{m}:{String(s).padStart(2, "0")}</span>
          </div>
          <span className="label" style={{ marginBottom: 10 }}>You earn</span>
          <span className="big lime" style={{ fontSize: 120, letterSpacing: -6, marginLeft: -4, display: "block" }}>{money(offer.earn_cents)}</span>
          <span className="sub" style={{ marginTop: 14 }}>Paid to your bank once the customer confirms</span>
        </section>
        <div className="ticket" style={{ marginTop: -80 }}>
          <div className="grid3" style={{ padding: "18px 16px 16px" }}>
            <Stat big={String(offer.distance_km)} unit=" km" label="away" />
            <Stat big={String(Number(offer.max_hours))} unit={Number(offer.max_hours) === 1 ? " hr" : " hrs"} label="up to" />
            <Stat big={offer.asap ? "Now" : new Date(offer.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} label={offer.asap ? "start" : new Date(offer.start_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })} />
          </div>
          <Perf />
          <div className="stack" style={{ padding: "10px 16px 20px", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>{offer.job_name}</h1>
            <span className="row em t15 w5" style={{ gap: 6 }}>{Icon.pin("var(--emerald)")}{offer.suburb}</span>
            <p className="t15 light" style={{ margin: "2px 0 0", lineHeight: 1.45, color: "#4a4943" }}>{offer.notes || "No extra notes."} Full address after you accept.</p>
          </div>
        </div>
        <div className="footer">
          <button className="btn stone" onClick={() => rpc("pass_job", { p_job: offer.id }).then(poll)}>Pass</button>
          <button className="btn primary" onClick={() => (offer.asap ? setEta(offer) : take(offer, 30))}>Take the job {Icon.arrow("var(--lime)")}</button>
        </div>
        {eta && <SearchPicker title="When will you get there?" value={[]} options={[10, 15, 20, 30, 45, 60, 90].map((n) => ({ id: n, label: `In ${n} minutes` }))}
          onChange={(v) => take(eta, Number(v[0]))} onClose={() => setEta(null)} />}
      </>
    );
  }

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <span className="wordmark">oddjobs.</span>
          <button className={online ? "switch on" : "switch"} onClick={toggle} aria-label={online ? "Go offline" : "Go online"} />
        </div>
        <h1 className="mid">{online ? "You're online" : "You're offline"}</h1>
        <p className="lede">{online ? "Keep this screen open. New jobs near you pop up here." : "Switch on when you're free to take jobs."}</p>
      </section>
      <div className="ticket">
        <div className="pad row between">
          <span className="stack" style={{ gap: 2 }}><span className="small muted">Earned this week</span><span className="price" style={{ fontSize: 44 }}>{money2(week)}</span></span>
        </div>
        <Perf />
        <div className="pad t15 light muted" style={{ paddingTop: 8, lineHeight: 1.45 }}>
          {online ? (offers.length ? "" : "No open jobs near you right now. We check every few seconds.") : "Go online to see jobs. You choose which ones to take, and passing is always fine."}
        </div>
      </div>
      <History />
      <div className="footer between">
        <button className="link quiet" onClick={() => go("/")}>Book a job</button>
        <button className="link quiet" onClick={() => sb.auth.signOut()}>Sign out</button>
      </div>
    </>
  );
}

function Stat({ big, unit, label }: { big: string; unit?: string; label: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -1 }}>{big}{unit && <span style={{ fontSize: 16, fontWeight: 500 }}>{unit}</span>}</span>
      <span className="small light muted">{label}</span>
    </div>
  );
}

function History() {
  const { session } = useSession();
  const [jobs, setJobs] = useState<(Job & { job_types: { name: string } })[]>([]);
  useEffect(() => {
    if (!session) return;
    sb.from("jobs").select("*, job_types(name)").eq("worker_id", session.user.id).in("status", ["finished", "confirmed", "disputed", "refunded", "cancelled"])
      .order("accepted_at", { ascending: false }).limit(20).then(({ data }) => setJobs((data ?? []) as never));
  }, [session]);
  if (!jobs.length) return null;
  return (
    <section className="section">
      <h2>Past jobs</h2>
      <div style={{ background: "var(--card)", borderRadius: 6 }}>
        {jobs.map((j) => (
          <div key={j.id} className="li" style={{ cursor: "default" }}>
            <span className="t"><b>{j.job_types.name}</b><span>{whenLabel(j.asap, j.start_at)}</span></span>
            <span className={j.status === "confirmed" ? "t15 w5 em" : "small muted"}>{j.status === "confirmed" ? money(j.price_cents + j.extra_cents) : j.status === "finished" ? "Awaiting confirm" : j.status === "disputed" ? "Being checked" : j.status === "cancelled" ? "Cancelled" : "Refunded"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export { hours };
