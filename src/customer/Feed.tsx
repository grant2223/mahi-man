import { useEffect, useMemo, useState } from "react";
import { mediaUrls, rpc, sb, type Category } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money } from "../lib/format";
import { CatIcon, Icon, Loading, Logo, SearchPicker } from "../ui/kit";
import { SideSwitch } from "../ui/SideSwitch";
import { HeaderIcons } from "../ui/HeaderIcons";
import { AreaPin, useArea, useHere } from "../lib/area";

interface FeedJob {
  id: string; job_name: string; category_id: number | null; category: string | null; icon: string; suburb: string;
  asap: boolean; start_at: string; pay_cents: number; has_video: boolean; cover_path: string | null; customer_verified: boolean; distance_km?: number | null;
}

// The last list and categories, so coming back to Do work shows jobs straight away while it refreshes.
let lastJobs: FeedJob[] | null = null;
let lastCats: Category[] = [];

// "Do work": the home screen. Every job open right now, filtered by category.
// A worker still setting up sees the same jobs first, with their progress and one button to finish.
export function Feed({ setup }: { setup?: { done: number; total: number; onFinish: () => void } } = {}) {
  const { session, profile } = useSession();
  const isWorker = !!profile?.is_worker;
  const [jobs, setJobsState] = useState<FeedJob[] | null>(lastJobs);
  const [cats, setCats] = useState<Category[]>(lastCats);
  const setJobs = (j: FeedJob[]) => { lastJobs = j; setJobsState(j); };
  const [cat, setCat] = useState<number | "all">("all");
  const [pick, setPick] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const { area } = useArea();
  const here = useHere();
  // Jobs near where they are now, nearest first. Without their location, the jobs in their area.
  useEffect(() => {
    let live = true;
    if (!area && !here) return;
    const args = here ? { p_lat: here.lat, p_lng: here.lng } : { p_area: area!.id };
    const load = () => rpc<FeedJob[]>("jobs_feed", args).then((r) => { if (live) setJobs(r); }).catch(() => live && setJobs([]));
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, [session?.user.id, area?.id, here?.lat, here?.lng]);

  useEffect(() => {
    if (lastCats.length) return;
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => { lastCats = (data ?? []) as Category[]; setCats(lastCats); });
  }, []);

  useEffect(() => {
    const paths = (jobs ?? []).map((j) => j.cover_path).filter(Boolean) as string[];
    if (paths.length) mediaUrls(paths).then(setUrls);
  }, [jobs]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const j of jobs ?? []) if (j.category_id) m.set(j.category_id, (m.get(j.category_id) ?? 0) + 1);
    return m;
  }, [jobs]);
  const shown = (jobs ?? []).filter((j) => cat === "all" || j.category_id === cat);
  const catName = cat === "all" ? "All jobs" : cats.find((c) => c.id === cat)?.name ?? "All jobs";

  return (
    <div className="app">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-top" style={{ position: "relative", zIndex: 1 }}>
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          {session
            ? <HeaderIcons />
            : <AreaPin />}
        </div>
        <SideSwitch side="work" />
        <img className="mascot" src="/mascot.png" alt="" style={{ top: "auto", bottom: 0, height: 168, right: -32 }} />
        <h1 className="mid" style={{ position: "relative", margin: "22px 0 10px" }}>Want more<br />mahi?</h1>
        <p className="lede" style={{ position: "relative", maxWidth: 200 }}>Local jobs, open now. Keep 100% of the price.</p>
        {setup ? (
          <div className="start-row stack" style={{ gap: 12, alignItems: "flex-start" }}>
            <span className="stack" style={{ gap: 2, position: "relative" }}>
              <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1, color: "var(--lime)", whiteSpace: "nowrap" }}>{setup.done} of {setup.total} done</span>
              <span className="t15 light" style={{ color: "rgba(255,255,255,0.88)" }}>Finish your profile to take jobs.</span>
            </span>
            <button className="btn white" style={{ position: "relative" }} onClick={setup.onFinish}>Finish now {Icon.arrow("var(--emerald)")}</button>
          </div>
        ) : !isWorker && (
          <div className="start-row">
            <button className="btn white" onClick={() => go("/work")}>Start earning {Icon.arrow("var(--emerald)")}</button>
          </div>
        )}
      </section>

      <div className="feed-filter">
        <button className="feed-field" onClick={() => setPick(true)}>
          <span className="stack" style={{ gap: 1 }}>
            <span className="k">Category</span>
            <span className="v">{catName}</span>
          </span>
          {Icon.search("var(--ink)")}
        </button>
        <span className="feed-count">
          <b>{jobs ? shown.length : "–"}</b>
          <span>{here ? "near you" : "open now"}</span>
        </span>
      </div>

      <div className="feed-list">
        {!jobs && <Loading label="Loading jobs" />}
        {shown.map((j) => (
          <button key={j.id} className="job-row" onClick={() => (setup ? setup.onFinish() : go("/work"))}>
            {j.cover_path && urls[j.cover_path]
              ? <span className="pic" style={{ backgroundImage: `url("${urls[j.cover_path]}")` }}>{j.has_video && <span className="vid">{Icon.play("#fff")} Video</span>}</span>
              : <span className="pic cat-pic"><CatIcon name={j.icon} size={34} />{j.has_video && <span className="vid">{Icon.play("#fff")} Video</span>}</span>}
            <span className="t">
              <span className="cat-label">{j.category ?? "Job"}</span>
              <b>{j.job_name}</b>
              <span>{j.suburb}{j.distance_km != null ? `, ${j.distance_km} km` : ""}, {j.asap ? "Now" : dayTime(j.start_at)}</span>
            </span>
            <span className="p">{money(j.pay_cents)}</span>
          </button>
        ))}
        {jobs && shown.length === 0 && (
          <div className="feed-empty">
            <b>{cat === "all" ? "No open jobs right now" : `No ${catName.toLowerCase()} jobs right now`}</b>
            <span>New jobs come in through the day. Get set up to take the next one.</span>
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              {cat !== "all" && <button className="btn stone" onClick={() => setCat("all")}>See all jobs</button>}
              <button className="btn primary" onClick={() => (setup ? setup.onFinish() : go("/work"))}>{setup ? "Finish your profile" : "Get set up"} {Icon.arrow("#fff")}</button>
            </div>
          </div>
        )}
        <p className="small light muted" style={{ margin: "18px 20px calc(var(--safe-bottom) + 24px)", lineHeight: 1.5 }}>
          <a href="/privacy" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy</a>
          <span className="sep" /><a href="/terms" onClick={(e) => { e.preventDefault(); go("/terms"); }}>Terms</a>
          <span className="sep" /><a href="/support" onClick={(e) => { e.preventDefault(); go("/support"); }}>Help</a>
        </p>
      </div>

      {pick && (
        <SearchPicker title="Show jobs in" placeholder="Search categories" value={[cat]}
          options={[{ id: "all", label: "All jobs", right: String(jobs?.length ?? 0) },
            ...cats.map((c) => ({ id: c.id, label: c.name, right: String(counts.get(c.id) ?? 0) }))]}
          onClose={() => setPick(false)} onChange={(v) => setCat(v[0] === "all" ? "all" : Number(v[0]))} />
      )}
    </div>
  );
}

// "Today 2:00 pm", "Tomorrow 8:00 am", "Sun 9:00 am", in the viewer's own time.
function dayTime(iso: string) {
  const day = (d: Date) => d.toLocaleDateString("en-AU", {});
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
  const now = new Date();
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() + 864e5))) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString("en-AU", { weekday: "short" })} ${time}`;
}
