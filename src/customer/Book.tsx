import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { brandUrl, rpc, sb, type Category, type JobType, type Suburb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go, usePath } from "../lib/router";
import { hours, money, money2, shrinkImage } from "../lib/format";
import { draftMedia, type DraftItem } from "../lib/draftMedia";
import { Icon, Logo, SearchPicker, StepHero, useToast } from "../ui/kit";
import { AuthScreen } from "../ui/Auth";
import { VoiceScreen, voiceSupported } from "../ui/Voice";
import { PayScreen } from "./Pay";

interface Draft { jobTypeId: number | null; suburbId: number | null; address: string; notes: string; details: string; asap: boolean; startAt: string }
const DRAFT_KEY = "mm-draft";
const blank: Draft = { jobTypeId: null, suburbId: null, address: "", notes: "", details: "", asap: true, startAt: "" };
const MAX_PHOTOS = 6;
const MAX_VIDEO_SECONDS = 60;

const tint = (i: number) => `ph-${Math.abs(i) % 4}`;
const bg = (path: string | null | undefined) => {
  const u = brandUrl(path);
  return u ? { backgroundImage: `url("${u}")` } : undefined;
};

export function Book() {
  const path = usePath().split("?")[0];
  const { session } = useSession();
  const toast = useToast();
  const [types, setTypes] = useState<JobType[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [popular, setPopular] = useState<number[]>([]);
  const [suburbs, setSuburbs] = useState<Suburb[]>([]);
  const [fee, setFee] = useState(15);
  const [pilot, setPilot] = useState(true);
  const [d, setD] = useState<Draft>(() => { try { return { ...blank, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") }; } catch { return blank; } });
  const [media, setMedia] = useState<(DraftItem & { url: string })[]>([]);
  const [payJob, setPayJob] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    sb.from("job_types").select("*").eq("active", true).order("sort").then(({ data }) => setTypes((data ?? []) as JobType[]));
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    sb.from("suburbs").select("id,name").order("name").then(({ data }) => setSuburbs((data ?? []) as Suburb[]));
    rpc<{ job_type_id: number; bookings: number }[]>("popular_job_types").then((r) => setPopular(r.filter((x) => x.bookings > 0).map((x) => x.job_type_id))).catch(() => {});
    sb.from("settings").select("key,value").in("key", ["fee_percent", "pilot_mode"]).then(({ data }) => {
      for (const r of data ?? []) { if (r.key === "fee_percent") setFee(Number(r.value)); if (r.key === "pilot_mode") setPilot(r.value === "true"); }
    });
    draftMedia.all().then((items) => setMedia(items.map((m) => ({ ...m, url: URL.createObjectURL(m.blob) }))));
  }, []);
  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }, [d]);

  const jt = types.find((t) => t.id === d.jobTypeId) ?? null;
  const suburb = suburbs.find((s) => s.id === d.suburbId) ?? null;
  const priceOf = (t: JobType) => t.price_cents + (pilot ? 0 : Math.round((t.price_cents * fee) / 100));
  const total = jt ? priceOf(jt) : 0;
  const photos = media.filter((m) => m.kind === "photo");
  const video = media.find((m) => m.kind === "video") ?? null;

  function pickJob(t: JobType) {
    if (t.id !== d.jobTypeId) setD({ ...d, jobTypeId: t.id });
    go("/book/details");
  }

  async function addFiles(files: FileList | null, kind: "photo" | "video") {
    if (!files?.length) return;
    setErr("");
    const next: (DraftItem & { url: string })[] = [];
    for (const f of Array.from(files)) {
      if (kind === "photo") {
        if (photos.length + next.length >= MAX_PHOTOS) { toast(`Up to ${MAX_PHOTOS} photos`); break; }
        let blob: Blob = f;
        try { blob = await shrinkImage(f); } catch { /* keep original */ }
        next.push({ id: crypto.randomUUID(), kind, blob, name: f.name, url: URL.createObjectURL(blob) });
      } else {
        const secs = await videoSeconds(f);
        if (secs > MAX_VIDEO_SECONDS + 1) { setErr(`Keep the video under ${MAX_VIDEO_SECONDS} seconds. Trim it in your Photos app and add it again.`); return; }
        if (f.size > 50 * 1024 * 1024) { setErr("That video is too big. Record a shorter one."); return; }
        if (video) { await draftMedia.remove(video.id); }
        next.push({ id: crypto.randomUUID(), kind, blob: f, name: f.name, url: URL.createObjectURL(f) });
      }
    }
    for (const n of next) await draftMedia.put({ id: n.id, kind: n.kind, blob: n.blob, name: n.name });
    setMedia((m) => [...(kind === "video" ? m.filter((x) => x.kind !== "video") : m), ...next]);
  }

  async function removeMedia(id: string) {
    await draftMedia.remove(id);
    setMedia((m) => m.filter((x) => x.id !== id));
  }

  async function book() {
    setErr("");
    if (!jt) return go("/", true);
    if (!photos.length || d.details.trim().length < 15) return go("/book/details");
    if (!suburb || d.address.trim().length < 3) return go("/book/where");
    if (!d.asap && !d.startAt) return go("/book/when");
    if (!session) { setAuth(true); return; }
    setBusy(true);
    try {
      const uid = session.user.id;
      const uploaded: { path: string; kind: string }[] = [];
      for (const m of media) {
        const ext = m.kind === "photo" ? "jpg" : (m.name.split(".").pop() || "mp4").toLowerCase();
        const p = `${uid}/${m.id}.${ext}`;
        const { error } = await sb.storage.from("job-media").upload(p, m.blob, {
          upsert: true,
          contentType: m.kind === "photo" ? "image/jpeg" : (m.blob.type || "video/mp4"),
        });
        if (error) throw new Error("A photo didn't upload. Check your signal and tap Book it again.");
        uploaded.push({ path: p, kind: m.kind });
      }
      const id = await rpc<string>("create_job", {
        p_job_type: d.jobTypeId, p_suburb: d.suburbId, p_address: d.address, p_notes: d.notes,
        p_asap: d.asap, p_start_at: d.asap ? new Date().toISOString() : new Date(d.startAt).toISOString(),
        p_details: d.details, p_media: uploaded,
      });
      const finish = async () => {
        sessionStorage.removeItem(DRAFT_KEY);
        await draftMedia.clear();
        go(`/job/${id}`);
      };
      if (pilot) await finish(); else setPayJob(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const bar = (label: string, onNext: () => void, disabled = false) => (
    <div className="bottombar">
      <span className="stack" style={{ gap: 2 }}>
        <span className="k">Fixed price</span>
        <span className="v">{jt ? money2(total) : "$—"}</span>
      </span>
      <button className="btn primary" disabled={disabled} onClick={onNext}>{label} {Icon.arrow("#fff")}</button>
    </div>
  );

  // ---------- Screens ----------
  const cm = path.match(/^\/c\/(\d+)$/);
  if (path.startsWith("/book/") && !jt && types.length) { go("/", true); return null; }

  if (cm) {
    const cat = cats.find((c) => c.id === Number(cm[1]));
    const list = types.filter((t) => t.category_id === Number(cm[1])).sort((a, b) => a.price_cents - b.price_cents);
    return (
      <div className="app">
        <StepHero title={cat?.name ?? "Jobs"} sub={cat?.name === "Cleaning" ? "You supply the products. Price is fixed." : "One fixed price, agreed before anyone turns up."} onBack={() => history.back()} />
        <div className="home-body">
          {list.map((t, i) => <JobCard key={t.id} t={t} i={i} price={priceOf(t)} onPick={() => pickJob(t)} />)}
        </div>
      </div>
    );
  }

  if (path === "/book/details" && jt) {
    return <DetailsStep jt={jt} d={d} setD={setD} photos={photos} video={video} addFiles={addFiles} removeMedia={removeMedia} err={err} setErr={setErr} bar={bar} />;
  }

  if (path === "/book/where" && jt) {
    return (
      <WhereStep jt={jt} d={d} setD={setD} suburbs={suburbs} suburb={suburb} bar={bar} />
    );
  }

  if (path === "/book/when" && jt) {
    return <WhenStep jt={jt} suburb={suburb} d={d} setD={setD} bar={bar} />;
  }

  if (path === "/book/check" && jt) {
    return (
      <div className="app">
        <section className="step-hero" style={{ paddingBottom: 74 }}>
          <div className="top">
            <button className="back" onClick={() => history.back()} aria-label="Back">{Icon.back("#fff")}</button>
            <span className="count">Step 4 of 4</span>
          </div>
          <div className="bars" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}><span className="on" /><span className="on" /><span className="on" /><span className="on" /></div>
          <h1 style={{ marginBottom: 0 }}>Check and book</h1>
        </section>
        <div className="ticket" style={{ marginTop: -52 }}>
          <ReviewRow k="Job" v={jt.name} onChange={() => go("/")} />
          <div className="review-row">
            <span className="t">
              <span className="k">What you want done</span>
              <span className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 4 }}>
                <span className="thumbs">{photos.slice(0, 2).map((p) => <img key={p.id} src={p.url} alt="" />)}</span>
                <span className="small light muted" style={{ lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {photos.length} photo{photos.length === 1 ? "" : "s"}{video ? " and a video" : ""}. {d.details}
                </span>
              </span>
            </span>
            <button className="link" onClick={() => go("/book/details")}>Change</button>
          </div>
          <ReviewRow k="Where" v={`${d.address}, ${suburb?.name ?? ""}`} onChange={() => go("/book/where")} />
          <ReviewRow k="When" v={d.asap ? "Today, as soon as possible" : new Date(d.startAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} onChange={() => go("/book/when")} last />
          <div className="stack" style={{ padding: "18px 16px 20px", gap: 6 }}>
            <span className="small w5 em">Fixed price, up to {hours(jt.max_hours)}</span>
            <span className="price">{money2(total)}</span>
            {!pilot && <span className="small light muted">Job {money2(jt.price_cents)} · Booking fee {money2(total - jt.price_cents)}</span>}
            <span className="t15 light muted" style={{ marginTop: 8, lineHeight: 1.45 }}>
              {pilot ? "Pay your worker directly, PayID or cash, once the job is done. Never before." : "Your card is held, not charged, until you confirm the job is done."}
            </span>
          </div>
        </div>
        {err && <p className="err" style={{ padding: "0 20px" }}>{err}</p>}
        <div style={{ flex: 1 }} />
        <div className="bottombar">
          <span className="small light muted" style={{ maxWidth: 170, lineHeight: 1.4 }}>
            {session ? "A local gets your job straight away." : "Next, a quick account so your worker can find you."}
          </span>
          <button className="btn primary" disabled={busy} onClick={book}>{busy ? "Booking…" : "Book it"} {Icon.arrow("#fff")}</button>
        </div>
        {auth && (
          <AuthScreen title="Almost booked" reason="Create an account so your worker can find you and you can track the job. Your photos are saved."
            onBack={() => setAuth(false)} onDone={() => { setAuth(false); window.setTimeout(book, 300); }} />
        )}
        {payJob && <PayScreen jobId={payJob} amountLabel={money2(total)} onBack={() => setPayJob(null)}
          onPaid={async () => { sessionStorage.removeItem(DRAFT_KEY); await draftMedia.clear(); go(`/job/${payJob}`); }} />}
      </div>
    );
  }

  return <Home types={types} cats={cats} popular={popular} priceOf={priceOf} onPick={pickJob} signedIn={!!session} />;
}

// ---------- Home ----------
function Home({ types, cats, popular, priceOf, onPick, signedIn }: {
  types: JobType[]; cats: Category[]; popular: number[]; priceOf: (t: JobType) => number; onPick: (t: JobType) => void; signedIn: boolean;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? "";
  const results = query ? types.filter((t) => `${t.name} ${t.description} ${catName(t.category_id)}`.toLowerCase().includes(query)) : [];
  const top = (popular.length ? popular.map((id) => types.find((t) => t.id === id)).filter(Boolean) as JobType[] : [...types].sort((a, b) => a.price_cents - b.price_cents)).slice(0, 2);
  return (
    <div className="app">
      <section className="hero" style={{ paddingBottom: 22 }}>
        <div className="hero-top" style={{ position: "relative" }}>
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          <span className="row" style={{ gap: 14 }}>
            {signedIn && <a className="hero-link" href="/jobs" onClick={(e) => { e.preventDefault(); go("/jobs"); }}>My jobs</a>}
            {!signedIn && <span className="row t15" style={{ gap: 6 }}>{Icon.pin("#fff")} Cairns</span>}
          </span>
        </div>
        <div className="path-switch" role="tablist" aria-label="What are you here for?">
          <button className="on" role="tab" aria-selected="true">Need a job done</button>
          <button role="tab" aria-selected="false" onClick={() => go("/work")}>Want to earn</button>
        </div>
        <img className="mascot" src="/mascot.png" alt="" style={{ top: "auto", bottom: 78, height: 186 }} />
        <h1 style={{ position: "relative", fontSize: 52, margin: "22px 0 12px" }}>Need a<br />hand?</h1>
        <p className="lede" style={{ position: "relative", maxWidth: 165, marginBottom: 22 }}>Fixed price. A local on the way in minutes.</p>
        <label className="search-hero">
          {Icon.search("var(--muted)")}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all jobs: mow, clean, tip run" />
          {q && <button className="back" style={{ marginRight: -10 }} onClick={() => setQ("")} aria-label="Clear search">{Icon.x("var(--muted)")}</button>}
        </label>
      </section>

      <div className="home-body">
        {query ? (
          <>
            <h2>{results.length ? `${results.length} job${results.length === 1 ? "" : "s"}` : "Nothing matches"}</h2>
            {results.map((t, i) => <JobCard key={t.id} t={t} i={i} price={priceOf(t)} onPick={() => onPick(t)} />)}
            {!results.length && <p className="t15 light muted" style={{ margin: "0 4px" }}>Try "clean", "mow", "rubbish" or "move". Or pick a type below.</p>}
          </>
        ) : null}
        {!query || !results.length ? (
          <>
            <h2 className={query ? "gap-top" : ""}>What needs doing?</h2>
            <div className="cat-grid">
              {cats.map((c, i) => {
                const list = types.filter((t) => t.category_id === c.id);
                if (!list.length) return null;
                const from = Math.min(...list.map(priceOf));
                return (
                  <button key={c.id} className={`cat-tile ${c.photo_path ? "" : tint(i)}`} style={bg(c.photo_path)} onClick={() => go(`/c/${c.id}`)}>
                    <b>{c.name}</b>
                    <span>{list.length} job{list.length === 1 ? "" : "s"} · {list.length === 1 ? money(from) : `from ${money(from)}`}</span>
                  </button>
                );
              })}
            </div>
            {top.length > 0 && <h2 className="gap-top">{popular.length ? "Booked most this week" : "Quick jobs"}</h2>}
            {top.map((t, i) => <JobCard key={t.id} t={t} i={i + 1} price={priceOf(t)} onPick={() => onPick(t)} />)}
            <p className="small light muted" style={{ margin: "10px 4px 0", lineHeight: 1.5 }}>
              <a href="/privacy" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy</a>
              {"  ·  "}<a href="/terms" onClick={(e) => { e.preventDefault(); go("/terms"); }}>Terms</a>
              {"  ·  "}<a href="/support" onClick={(e) => { e.preventDefault(); go("/support"); }}>Help</a>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function JobCard({ t, i, price, onPick }: { t: JobType; i: number; price: number; onPick: () => void }) {
  const short = t.included?.[0] ? t.included.slice(0, 2).join(", ") : t.description;
  return (
    <button className="job-card" onClick={onPick}>
      <span className={`pic ${t.photo_path ? "" : tint(i)}`} style={bg(t.photo_path)} />
      <span className="meta">
        <span className="t">
          <b>{t.name}</b>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Up to {hours(t.max_hours)} · {short}</span>
        </span>
        <span className="p">{money(price)}</span>
      </span>
    </button>
  );
}

function ReviewRow({ k, v, onChange, last }: { k: string; v: string; onChange: () => void; last?: boolean }) {
  return (
    <div className="review-row" style={last ? { borderBottom: "1px solid var(--line)" } : undefined}>
      <span className="t"><span className="k">{k}</span><span className="v">{v}</span></span>
      <button className="link" onClick={onChange}>Change</button>
    </div>
  );
}

// ---------- Step 1: Show the job ----------
function DetailsStep({ jt, d, setD, photos, video, addFiles, removeMedia, err, setErr, bar }: {
  jt: JobType; d: Draft; setD: (d: Draft) => void;
  photos: (DraftItem & { url: string })[]; video: (DraftItem & { url: string }) | null;
  addFiles: (f: FileList | null, kind: "photo" | "video") => Promise<void>; removeMedia: (id: string) => Promise<void>;
  err: string; setErr: (s: string) => void; bar: (label: string, onNext: () => void, disabled?: boolean) => ReactNode;
}) {
  const photoIn = useRef<HTMLInputElement>(null);
  const videoIn = useRef<HTMLInputElement>(null);
  const detailsBox = useRef<HTMLTextAreaElement>(null);
  const [voice, setVoice] = useState(false);
  const [dictate, setDictate] = useState(false);
  const next = () => {
    if (!photos.length) return setErr("Add at least one photo so workers can see the job.");
    if (d.details.trim().length < 15) return setErr("Say exactly what you want done. A sentence or two is plenty.");
    setErr("");
    go("/book/where");
  };
  return (
    <div className="app">
      <StepHero step={1} of={4} title="Show the job" sub={jt.name} onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h2>Photos and video</h2>
            <span className="small muted">At least 1 photo</span>
          </div>
          <div className="media-grid">
            {photos.map((p) => (
              <div key={p.id} className="m">
                <img src={p.url} alt="" />
                <button className="x" onClick={() => removeMedia(p.id)} aria-label="Remove photo">{Icon.x("#fff", 16)}</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button className="add" onClick={() => photoIn.current?.click()}>{Icon.camera("var(--emerald)")}Add photo</button>
            )}
          </div>
          <input ref={photoIn} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
          {video ? (
            <div className="media-grid">
              <div className="m"><video src={video.url} muted playsInline /><button className="x" onClick={() => removeMedia(video.id)} aria-label="Remove video">{Icon.x("#fff", 16)}</button></div>
              <span className="small light muted" style={{ gridColumn: "span 2", alignSelf: "center" }}>Video added. Workers can watch it before they take the job.</span>
            </div>
          ) : (
            <button className="wide-btn" onClick={() => videoIn.current?.click()}>
              {Icon.video("var(--emerald)")}
              <span className="t"><b>Add a video walk-through</b><span>Recommended. Up to 60 seconds.</span></span>
            </button>
          )}
          <input ref={videoIn} type="file" accept="video/*" hidden onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />
          <span className="small light muted">Show the worst of it. Workers decide from these.</span>
        </div>

        <div className="sec">
          <h2>Exactly what you want done</h2>
          <button className="wide-btn green" onClick={() => {
            if (voiceSupported()) return setVoice(true);
            // Where the browser has no speech service (the iPhone app), the keyboard's own microphone does the same job.
            setDictate(true);
            detailsBox.current?.focus();
          }}>
            {Icon.mic("var(--lime)")}
            <span className="t"><b>Just say it</b><span>Talk it through. We write it up for you.</span></span>
          </button>
          <label className="field" style={{ cursor: "text" }}>
            <span className="k">Be specific. This is what the worker is held to.</span>
            <textarea ref={detailsBox} value={d.details} onChange={(e) => setD({ ...d, details: e.target.value })} style={{ minHeight: 110 }}
              placeholder="For example: shower screen has build-up, needs a proper scrub. Benches and stovetop degreased. Products are under the sink." />
          </label>
          {dictate && <span className="t15 em" style={{ lineHeight: 1.4 }}>Tap the microphone on your keyboard and start talking. Your words appear in the box.</span>}
        </div>

        {(jt.included?.length > 0 || jt.excluded?.length > 0) && (
          <div className="sec">
            <h2>Included in {money(jt.price_cents)}</h2>
            <div className="ticks">
              {jt.included.map((x) => <span key={x}>{Icon.tick("var(--emerald)", 20)}{x}</span>)}
            </div>
            {jt.excluded.length > 0 && (
              <div className="ticks no">
                <h3>Not included</h3>
                {jt.excluded.map((x) => <span key={x}>{Icon.cross("var(--faint)")}{x}</span>)}
              </div>
            )}
          </div>
        )}
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar("Continue", next)}
      {voice && <VoiceScreen jobName={jt.name} onBack={() => setVoice(false)}
        onDone={(text) => { setD({ ...d, details: d.details.trim() ? `${d.details.trim()} ${text}` : text }); setVoice(false); }} />}
    </div>
  );
}

// ---------- Step 2: Where ----------
function WhereStep({ jt, d, setD, suburbs, suburb, bar }: {
  jt: JobType; d: Draft; setD: (d: Draft) => void; suburbs: Suburb[]; suburb: Suburb | null;
  bar: (label: string, onNext: () => void, disabled?: boolean) => ReactNode;
}) {
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState("");
  const next = () => {
    if (d.address.trim().length < 3) return setErr("Add the street address.");
    if (!suburb) return setErr("Pick the suburb.");
    go("/book/when");
  };
  return (
    <div className="app">
      <StepHero step={2} of={4} title="Where's the job?" sub={jt.name} onBack={() => history.back()} />
      <div className="step-body" style={{ gap: 8 }}>
        <label className="field"><span className="k">Street address</span>
          <input value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="22 Boland Street" autoComplete="street-address" /></label>
        <button className="field" onClick={() => setPick(true)}>
          <span className="row between" style={{ width: "100%" }}>
            <span className="stack" style={{ gap: 2 }}><span className="k">Suburb</span><span className={suburb ? "v" : "v ph"}>{suburb?.name ?? "Pick your suburb"}</span></span>
            {Icon.search()}
          </span>
        </button>
        <label className="field" style={{ cursor: "text" }}><span className="k">Getting in. Optional</span>
          <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Gate code, parking, pets, where the key is" /></label>
        <p className="small light muted" style={{ margin: "6px 2px 0", lineHeight: 1.45 }}>Only the worker who takes the job sees your street address.</p>
        {err && <p className="err">{err}</p>}
      </div>
      {bar("Continue", next)}
      {pick && <SearchPicker title="Suburb" placeholder="Search Cairns suburbs" value={d.suburbId ? [d.suburbId] : []}
        options={suburbs.map((s) => ({ id: s.id, label: s.name }))} onChange={(v) => setD({ ...d, suburbId: Number(v[0]) })} onClose={() => setPick(false)} />}
    </div>
  );
}

// ---------- Step 3: When ----------
function WhenStep({ jt, suburb, d, setD, bar }: {
  jt: JobType; suburb: Suburb | null; d: Draft; setD: (d: Draft) => void;
  bar: (label: string, onNext: () => void, disabled?: boolean) => ReactNode;
}) {
  const [err, setErr] = useState("");
  const min = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const max = useMemo(() => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), []);
  const local = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const next = () => {
    if (!d.asap && !d.startAt) return setErr("Pick a day and time.");
    go("/book/check");
  };
  return (
    <div className="app">
      <StepHero step={3} of={4} title="When?" sub={`${jt.name}${suburb ? ` · ${suburb.name}` : ""}`} onBack={() => history.back()} />
      <div className="step-body" style={{ padding: 0, gap: 0 }}>
        <button className={d.asap ? "choice on" : "choice"} onClick={() => setD({ ...d, asap: true })}>
          <span className="t"><b>As soon as possible</b><span>The first free local takes it, usually within 10 min</span></span>
          {d.asap && Icon.tick("var(--emerald)", 24)}
        </button>
        <button className={!d.asap ? "choice on" : "choice"} onClick={() => setD({ ...d, asap: false })}>
          <span className="t"><b>Pick a day and time</b><span>Up to 5 days ahead</span></span>
          {!d.asap && Icon.tick("var(--emerald)", 24)}
        </button>
        {!d.asap && (
          <div style={{ padding: 16 }}>
            <label className="field"><span className="k">Day and time</span>
              <input type="datetime-local" value={d.startAt} min={local(min)} max={local(max)} onChange={(e) => setD({ ...d, startAt: e.target.value })} /></label>
          </div>
        )}
        {err && <p className="err" style={{ padding: "0 16px" }}>{err}</p>}
      </div>
      {bar("Continue", next)}
    </div>
  );
}

function videoSeconds(f: File): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); res(v.duration || 0); };
    v.onerror = () => res(0);
    v.src = URL.createObjectURL(f);
  });
}
