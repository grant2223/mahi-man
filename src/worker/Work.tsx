import { useCallback, useEffect, useRef, useState } from "react";
import { api, mediaUrls, rpc, sb, type IdStatus, type Job } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { hours, money, money2, whenLabel } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { Icon, Logo, Perf, SearchPicker, Tile, useToast } from "../ui/kit";
import { ReportScreen } from "../ui/Report";
import { Signup, type Steps } from "./Signup";
import { WorkerJob } from "./WorkerJob";


interface WorkerStatus { steps: Steps; approved: boolean; suspended: boolean; pilot: boolean; id_status: IdStatus; id_note: string | null }

export function Work() {
  const { session, profile, ready, reload } = useSession();
  const [auth, setAuth] = useState(false);
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [current, setCurrent] = useState<Job | null | undefined>(undefined);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const s = await api<WorkerStatus>("worker_status");
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
          <div className="hero-top" style={{ position: "relative", zIndex: 1 }}>
            <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
            <span className="row t15" style={{ gap: 6 }}>{Icon.pin("#fff")} Cairns</span>
          </div>
          <img className="mascot" src="/mascot.png" alt="" style={{ top: 80, height: 200 }} />
          <h1 style={{ position: "relative" }}>Earn on<br />your time</h1>
          <p className="lede" style={{ position: "relative", maxWidth: 200 }}>Switch on when you're free, take the jobs you want, keep 100% of the job price.</p>
        </section>
        <div className="ticket">
          {[["Cleaning", "Units, houses, Airbnb turnovers"], ["Moving and tip runs", "Lifting, loading, one-ute runs"], ["Flat-pack and yard work", "Assembly, tidy-ups, mowing"]].map(([t, s]) => (
            <div key={t} className="li" style={{ cursor: "default" }}><span className="t"><b>{t}</b><span>{s}</span></span></div>
          ))}
          <Perf />
          <div className="row between" style={{ padding: "8px 16px 18px" }}>
            <span className="small light muted" style={{ maxWidth: 170, lineHeight: 1.4 }}>You'll need a photo and your passport or national ID.</span>
            <button className="btn primary" onClick={async () => {
              if (!session) return setAuth(true);
              await rpc("become_worker"); await reload();
            }}>Start {Icon.arrow("#fff")}</button>
          </div>
        </div>
        <div className="footer"><button className="link quiet" onClick={() => go("/")}>Need a job done instead?</button></div>
        {auth && <AuthScreen title="Earn with More Mahi" reason="Create your account. Next you'll add a photo and verify your ID." onBack={() => setAuth(false)}
          onDone={async () => { setAuth(false); await rpc("become_worker"); await reload(); }} />}
      </div>
    );
  }

  if (!status || current === undefined) return <div className="app"><section className="hero short"><span className="brand"><Logo /> More Mahi</span>{err && <p>{err}</p>}</section></div>;
  if (current) return <div className="app"><WorkerJob job={current} onChanged={refresh} /></div>;
  if (status.suspended) return (
    <div className="app"><section className="hero"><span className="brand"><Logo /> More Mahi</span><h1 className="mid">Account paused</h1>
      <p className="lede">Your worker account is paused. Email hello@moremahi.com and we'll sort it out.</p></section></div>
  );
  if (!status.approved) return <div className="app"><Signup steps={status.steps} pilot={status.pilot} idStatus={status.id_status} idNote={status.id_note} onChanged={refresh} /></div>;
  return <div className="app"><Home pilot={status.pilot} onTaken={refresh} /></div>;
}

interface Offer {
  id: string; job_name: string; category: string | null; suburb: string; distance_km: number; earn_cents: number; max_hours: number;
  asap: boolean; start_at: string; details: string; included: string[]; excluded: string[]; cover_path: string | null; photo_count: number;
  video_path: string | null; customer_id: string; customer_name: string; customer_photo: string | null; customer_verified: boolean;
  customer_rating: number | null; customer_jobs: number; customer_since: string;
}

const startLabel = (o: Offer) => o.asap ? "Now" : new Date(o.start_at).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" });

function Home({ pilot, onTaken }: { pilot: boolean; onTaken: () => void }) {
  const toast = useToast();
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [week, setWeek] = useState(0);
  const [open, setOpen] = useState<Offer | null>(null);
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
        if (seen.current.size > fresh.length) { try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ } }
      }
      const need = list.map((o) => o.cover_path).filter((p): p is string => !!p && !covers[p]);
      if (need.length) { const urls = await mediaUrls(need); setCovers((c) => ({ ...c, ...urls })); }
    } catch { /* keep last list */ }
  }, [covers]);

  useEffect(() => {
    if (!online) return;
    poll();
    const t = window.setInterval(poll, 8000);
    return () => window.clearInterval(t);
  }, [online, poll]);

  async function toggle() {
    try { await rpc("set_online", { p_online: !online }); setOnline(!online); if (online) setOffers([]); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <>
      <section className="hero" style={{ paddingBottom: 20 }}>
        <div className="hero-top" style={{ position: "relative", zIndex: 1 }}>
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          <button className="row" style={{ gap: 10, background: "none", border: 0, color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer" }} onClick={toggle}
            aria-label={online ? "Go offline" : "Go online"}>
            {online ? "Online" : "Offline"}<span className={online ? "switch on" : "switch"} />
          </button>
        </div>
        <img className="mascot" src="/mascot.png" alt="" style={{ top: "auto", bottom: 0, height: 150, right: -30 }} />
        <h1 className="mid" style={{ position: "relative", margin: "18px 0 8px" }}>{online ? <>Jobs<br />near you</> : <>You're<br />offline</>}</h1>
        <p className="lede" style={{ position: "relative", maxWidth: 210 }}>
          {online ? (offers.length ? `${offers.length} open near you. You keep the full price.` : "None open right now. We check every few seconds.") : "Switch on when you're free to take jobs."}
        </p>
      </section>

      {online && offers.map((o) => (
        <button key={o.id} className="job-row" onClick={() => setOpen(o)}>
          <span className={`pic ${o.cover_path && covers[o.cover_path] ? "" : "ph-0"}`} style={o.cover_path && covers[o.cover_path] ? { backgroundImage: `url("${covers[o.cover_path]}")` } : undefined}>
            {o.video_path && <span className="vid"><svg width="10" height="10" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>Video</span>}
          </span>
          <span className="t">
            <b>{o.job_name}</b>
            <span>{o.suburb} · {o.distance_km} km</span>
            <span>{startLabel(o)} · up to {hours(o.max_hours)}</span>
            {o.customer_verified ? <span className="ver">{Icon.shieldTick("var(--emerald)", 15)}{o.customer_name} · Verified</span> : <span className="unver">{o.customer_name} · Not verified</span>}
          </span>
          <span className="p">{money(o.earn_cents)}</span>
        </button>
      ))}

      {!online && (
        <div className="ticket" style={{ marginTop: 16 }}>
          <div className="pad row between">
            <span className="stack" style={{ gap: 2 }}><span className="small muted">Earned this week</span><span className="price" style={{ fontSize: 44 }}>{money2(week)}</span></span>
          </div>
          <Perf />
          <div className="pad t15 light muted" style={{ paddingTop: 8, lineHeight: 1.45 }}>Go online to see jobs. You choose which ones to take, and passing is always fine.</div>
        </div>
      )}
      <History />
      <div className="footer between">
        <button className="link quiet" onClick={() => go("/")}>Book a job</button>
        <span className="row" style={{ gap: 18 }}>
          <button className="link quiet" onClick={() => go("/settings")}>Settings</button>
          <button className="link quiet" onClick={() => sb.auth.signOut()}>Sign out</button>
        </span>
      </div>
      {open && <OfferScreen o={open} pilot={pilot} onBack={() => setOpen(null)}
        onPass={async () => { await rpc("pass_job", { p_job: open.id }); setOpen(null); poll(); }}
        onTaken={() => { setOpen(null); onTaken(); }} onGone={() => { setOpen(null); poll(); }} />}
    </>
  );
}

// Full-bleed job detail: everything a worker needs to decide before taking it.
function OfferScreen({ o, pilot, onBack, onPass, onTaken, onGone }: { o: Offer; pilot: boolean; onBack: () => void; onPass: () => void; onTaken: () => void; onGone: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<{ kind: string; url: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [eta, setEta] = useState(false);
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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

  async function take(mins: number) {
    setBusy(true);
    try { await rpc("accept_job", { p_job: o.id, p_eta_minutes: mins }); toast("It's yours"); onTaken(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); onGone(); } finally { setBusy(false); }
  }

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
          <span className="t15 light muted" style={{ display: "block", marginTop: 6 }}>{pilot ? "Customer pays you directly when it's done. You keep all of it." : "Paid to your bank once the customer confirms. You keep all of it."}</span>
        </div>
        <div className="stat3">
          <span><b>{o.distance_km} km</b><span>{o.suburb}</span></span>
          <span><b>{hours(o.max_hours)}</b><span>at most</span></span>
          <span><b>{o.asap ? "Now" : new Date(o.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</b><span>{o.asap ? "start" : new Date(o.start_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}</span></span>
        </div>
        <div className="poster">
          <Tile name={o.customer_name} photo={o.customer_photo} />
          <span className="t">
            <span className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 500 }}>{o.customer_name}</span>
              {o.customer_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not verified</span>}
            </span>
            <span className="small light muted">{o.customer_rating ? `${o.customer_rating} from workers · ` : ""}{o.customer_jobs} job{o.customer_jobs === 1 ? "" : "s"} posted · Joined {since}</span>
          </span>
        </div>
        <div className="stack" style={{ background: "var(--card)", padding: "20px 20px 24px", gap: 22 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: -0.7 }}>{o.job_name}</h1>
            <h2 style={{ margin: "8px 0 0", fontSize: 17, fontWeight: 600 }}>What they want done</h2>
            <p className="light" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{o.details}</p>
          </div>
          {(o.included.length > 0 || o.excluded.length > 0) && (
            <div className="stack" style={{ gap: 8 }}>
              <h2 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 600 }}>Included</h2>
              <div className="ticks">{o.included.map((x) => <span key={x} style={{ fontSize: 15 }}>{Icon.tick("var(--emerald)", 20)}{x}</span>)}</div>
              {o.excluded.length > 0 && <div className="ticks no"><h3>Not included</h3>{o.excluded.map((x) => <span key={x}>{Icon.cross("var(--faint)")}{x}</span>)}</div>}
            </div>
          )}
          <p className="small light muted" style={{ margin: 0, lineHeight: 1.45 }}>Full street address shows once you take it.</p>
          <button className="link quiet" style={{ alignSelf: "flex-start" }} onClick={() => setReport(true)}>{Icon.flag()} Report this job</button>
        </div>
      </div>
      <div className="bottombar" style={{ justifyContent: "flex-end" }}>
        <button className="btn stone" onClick={onPass}>Pass</button>
        <button className="btn primary" disabled={busy} onClick={() => (o.asap ? setEta(true) : take(30))}>Take the job {Icon.arrow("var(--lime)")}</button>
      </div>
      {eta && <SearchPicker title="When will you get there?" value={[]} options={[10, 15, 20, 30, 45, 60, 90].map((n) => ({ id: n, label: `In ${n} minutes` }))}
        onChange={(v) => take(Number(v[0]))} onClose={() => setEta(false)} />}
      {report && <ReportScreen name={o.customer_name} userId={o.customer_id} jobId={o.id} onBack={() => setReport(false)} onDone={() => { setReport(false); onGone(); }} />}
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
