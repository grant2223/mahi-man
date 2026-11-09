import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, firstPhoto, mediaUrls, rpc, sb, type Category, type JobType, type Suburb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go, usePath } from "../lib/router";
import { money, money2, shrinkImage } from "../lib/format";
import { draftMedia, type DraftItem } from "../lib/draftMedia";
import { CatIcon, Icon, Logo, SearchPicker, StepHero, useToast } from "../ui/kit";
import { AuthScreen } from "../ui/Auth";
import { VoiceScreen, voiceSupported } from "../ui/Voice";
import { PayScreen } from "./Pay";
import { AddCardScreen, CardMark, cardLabel } from "./Cards";
import { lc } from "../worker/Skills";
import { SideSwitch } from "../ui/SideSwitch";
import { HeaderIcons } from "../ui/HeaderIcons";
import { PhotoStep } from "../worker/Signup";
import { AreaPin, useArea } from "../lib/area";

/* Post a job: price, show the job, who can take it, where, when, check. */

interface Reused { path: string; kind: "photo" | "video" }
interface Draft {
  categoryId: number | null; priceCents: number; suburbId: number | null; address: string; notes: string; details: string;
  asap: boolean; startAt: string; invited: string[]; openAfter: number | null; reuse: Reused[];
  included: string[]; excluded: string[]; priceSet?: boolean; boost?: boolean; skills?: number[];
}
const DRAFT_KEY = "mm-draft-2";
const blank: Draft = { categoryId: null, priceCents: 8000, suburbId: null, address: "", notes: "", details: "", asap: true, startAt: "", invited: [], openAfter: 30, reuse: [], included: [], excluded: [] };
const MAX_PHOTOS = 6;
const MAX_VIDEO_SECONDS = 60;
const STEPS = 4;

export interface PastWorker { worker_id: string; full_name: string; photo_path: string | null; id_verified: boolean; rating: number | null; jobs_for_me: number; last_job: string | null }

export function Book() {
  const path = usePath().split("?")[0];
  const { session, profile } = useSession();
  const toast = useToast();
  const [types, setTypes] = useState<JobType[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [skillList, setSkillList] = useState<{ id: number; category_id: number; name: string; needs: string | null }[]>([]);
  useEffect(() => {
    sb.from("skills").select("id,category_id,name,sort,credential_types(name)").eq("kind", "skill").eq("active", true).order("sort")
      .then(({ data }) => setSkillList(((data ?? []) as unknown as { id: number; category_id: number; name: string; credential_types: { name: string } | null }[])
        .map((k) => ({ id: k.id, category_id: k.category_id, name: k.name, needs: k.credential_types?.name ?? null }))));
  }, []);
  const [suburbs, setSuburbs] = useState<Suburb[]>([]);
  const [fee, setFee] = useState(15);
  const [pilot, setPilot] = useState(true);
  const [feeMode, setFeeMode] = useState("off");
  const [cardScreen, setCardScreen] = useState(false);
  const cardAdded = useRef(false);
  const [photoScreen, setPhotoScreen] = useState(false);
  const photoAdded = useRef(false);
  const [feePct, setFeePct] = useState(12);
  const [feeMax, setFeeMax] = useState(3000);
  const [boostCents, setBoostCents] = useState(500);
  const [supply, setSupply] = useState<{ online_now: number; typical_minutes: number | null } | null>(null);
  const [d, setD] = useState<Draft>(() => { try { return { ...blank, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") }; } catch { return blank; } });
  const [media, setMedia] = useState<(DraftItem & { url: string })[]>([]);
  const [reuseUrls, setReuseUrls] = useState<Record<string, string>>({});
  const [past, setPast] = useState<PastWorker[]>([]);
  const [payJob, setPayJob] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const { area } = useArea();
  // Only the suburbs of the area they're in.
  useEffect(() => {
    if (area) sb.from("suburbs").select("id,name,area_id").eq("area_id", area.id).order("name").then(({ data }) => setSuburbs((data ?? []) as Suburb[]));
  }, [area?.id]);
  useEffect(() => {
    sb.from("job_types").select("*").eq("active", true).eq("custom_price", true).order("sort").then(({ data }) => setTypes((data ?? []) as JobType[]));
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    sb.from("settings").select("key,value").in("key", ["fee_percent", "pilot_mode", "booking_fee_percent", "booking_fee_max_cents", "boost_cents", "fee_mode"]).then(({ data }) => {
      for (const r of data ?? []) {
        if (r.key === "fee_percent") setFee(Number(r.value)); if (r.key === "pilot_mode") setPilot(r.value === "true"); if (r.key === "fee_mode") setFeeMode(r.value);
        if (r.key === "booking_fee_percent") setFeePct(Number(r.value)); if (r.key === "booking_fee_max_cents") setFeeMax(Number(r.value));
        if (r.key === "boost_cents") setBoostCents(Number(r.value));
      }
    });
    draftMedia.all().then((items) => setMedia(items.map((m) => ({ ...m, url: URL.createObjectURL(m.blob) }))));
  }, []);
  useEffect(() => {
    if (!session) { setPast([]); return; }
    rpc<PastWorker[]>("my_past_workers").then(setPast).catch(() => setPast([]));
  }, [session?.user.id]);
  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }, [d]);
  useEffect(() => { if (d.reuse.length) mediaUrls(d.reuse.map((r) => r.path)).then(setReuseUrls); }, [d.reuse]);

  const cat = cats.find((c) => c.id === d.categoryId) ?? null;
  const jt = types.find((t) => t.category_id === d.categoryId) ?? null;
  const suburb = suburbs.find((s) => s.id === d.suburbId) ?? null;
  useEffect(() => {
    if (path !== "/book/check" || !d.categoryId || !d.suburbId) return;
    rpc<{ online_now: number; typical_minutes: number | null }[]>("supply_near", { p_category: d.categoryId, p_suburb: d.suburbId })
      .then((r) => setSupply(r?.[0] ?? null)).catch(() => setSupply(null));
  }, [path, d.categoryId, d.suburbId]);
  const total = d.priceCents + (pilot ? 0 : Math.round((d.priceCents * fee) / 100));
  const isPlus = !!profile?.plus_until && new Date(profile.plus_until) > new Date();
  const bookingFee = feeMode === "on_choose" && !isPlus ? Math.min(Math.round((d.priceCents * feePct) / 100), feeMax) : 0;
  const photos = media.filter((m) => m.kind === "photo");
  const video = media.find((m) => m.kind === "video") ?? null;
  const reusedPhotos = d.reuse.filter((r) => r.kind === "photo");
  const reusedVideo = d.reuse.find((r) => r.kind === "video") ?? null;
  const photoCount = photos.length + reusedPhotos.length;

  async function startNew(prefill?: Partial<Draft>) {
    await draftMedia.clear();
    setMedia([]);
    setReuseUrls({});
    setErr("");
    setD({ ...blank, ...prefill, priceSet: !!prefill?.priceCents });
    go("/book/details");
  }

  async function addFiles(files: FileList | null, kind: "photo" | "video") {
    if (!files?.length) return;
    setErr("");
    const next: (DraftItem & { url: string })[] = [];
    for (const f of Array.from(files)) {
      if (kind === "photo") {
        if (photoCount + next.length >= MAX_PHOTOS) { toast(`Up to ${MAX_PHOTOS} photos`); break; }
        let blob: Blob = f;
        try { blob = await shrinkImage(f); } catch { /* keep original */ }
        next.push({ id: crypto.randomUUID(), kind, blob, name: f.name, url: URL.createObjectURL(blob) });
      } else {
        const secs = await videoSeconds(f);
        if (secs > MAX_VIDEO_SECONDS + 1) { setErr(`Keep the video under ${MAX_VIDEO_SECONDS} seconds. Trim it in your Photos app and add it again.`); return; }
        if (f.size > 50 * 1024 * 1024) { setErr("That video is too big. Record a shorter one."); return; }
        if (video) { await draftMedia.remove(video.id); }
        if (reusedVideo) setD({ ...d, reuse: d.reuse.filter((r) => r.kind !== "video") });
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
  const removeReused = (p: string) => setD({ ...d, reuse: d.reuse.filter((r) => r.path !== p) });

  async function book() {
    setErr("");
    if (!jt) return go("/book/details");
    if (d.details.trim().length < 15 || !(d.included ?? []).length) return go("/book/details");
    if (!photoCount) return go("/book/photos");
    if (!suburb || d.address.trim().length < 3) return go("/book/where");
    if (!d.asap && !/T\d/.test(d.startAt)) return go("/book/when");
    if (!session) { setAuth(true); return; }
    // A face to go with the job: workers see it before they offer.
    if (!profile?.photo_path && !photoAdded.current) { setPhotoScreen(true); return; }
    if (bookingFee > 0 && !profile?.card_last4 && !cardAdded.current) { setCardScreen(true); return; }
    setBusy(true);
    try {
      const uid = session.user.id;
      const uploaded: { path: string; kind: string }[] = d.reuse.filter((r) => r.path.startsWith(`${uid}/`)).map((r) => ({ path: r.path, kind: r.kind }));
      for (const m of media) {
        const ext = m.kind === "photo" ? "jpg" : (m.name.split(".").pop() || "mp4").toLowerCase();
        const p = `${uid}/${m.id}.${ext}`;
        const { error } = await sb.storage.from("job-media").upload(p, m.blob, {
          upsert: true,
          contentType: m.kind === "photo" ? "image/jpeg" : (m.blob.type || "video/mp4"),
        });
        if (error) throw new Error("A photo didn't upload. Check your signal and try again.");
        uploaded.push({ path: p, kind: m.kind });
      }
      const invited = d.invited.filter((w) => past.some((p) => p.worker_id === w));
      const id = await rpc<string>("create_job", {
        p_job_type: jt.id, p_suburb: d.suburbId, p_address: d.address, p_notes: d.notes,
        p_asap: d.asap, p_start_at: d.asap ? new Date().toISOString() : new Date(d.startAt).toISOString(),
        p_details: d.details, p_media: uploaded, p_price_cents: d.priceCents,
        p_invited: invited, p_open_after_minutes: invited.length ? d.openAfter : null,
        p_included: d.included ?? [], p_excluded: d.excluded ?? [], p_skills: (d.skills ?? []).filter((id) => skillList.some((k) => k.id === id && k.category_id === d.categoryId)),
      });
      if (d.boost && pilot) await rpc("boost_job", { p_job: id }).catch(() => {});
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

  const bar = (label: string, onNext: () => void, disabled = false, nextName = "") => (
    <div className="bottombar">
      <span className="t15 light muted">{nextName ? `Next, ${nextName}` : ""}</span>
      <button className="btn primary" disabled={disabled} onClick={onNext}>{label} {Icon.arrow("#fff")}</button>
    </div>
  );

  // ---------- Screens ----------
  if (path === "/book/price") {
    return <PriceStep value={d.priceCents} catName={d.priceSet ? null : cat?.name ?? null} onChange={(v) => setD({ ...d, priceCents: v, priceSet: true })} />;
  }

  if (path === "/book/details") {
    return <DetailsStep d={d} setD={setD} cats={cats} cat={cat} skillList={skillList} suggest={(id) => types.find((t) => t.category_id === id)?.price_cents ?? null} err={err} setErr={setErr} bar={bar} />;
  }

  if (path === "/book/photos") {
    return <PhotosStep photos={photos} video={video} reused={d.reuse} reuseUrls={reuseUrls}
      photoCount={photoCount} addFiles={addFiles} removeMedia={removeMedia} removeReused={removeReused} err={err} setErr={setErr} bar={bar} />;
  }

  if (path === "/book/where" || path === "/book/when" || path === "/book/who") {
    return <WhereStep d={d} setD={setD} suburbs={suburbs} suburb={suburb} past={past} bar={bar} />;
  }

  if (path === "/book/check") {
    const chosen = past.filter((p) => d.invited.includes(p.worker_id));
    const whoLabel = chosen.length
      ? `${chosen.map((p) => p.full_name).join(", ")}${d.openAfter ? `, then everyone after ${afterLabel(d.openAfter)}` : " only"}`
      : "Anyone nearby";
    return (
      <div className="app">
        <section className="step-hero" style={{ paddingBottom: 74 }}>
          <div className="top">
            <button className="back" onClick={() => history.back()} aria-label="Back">{Icon.back("#fff")}</button>
          </div>
          <h1 style={{ marginBottom: 0 }}>Check and post</h1>
        </section>
        <div className="ticket" style={{ marginTop: -52 }}>
          <div className="review-row">
            <span className="t">
              <span className="k">{cat?.name ?? "The job"}</span>
              <span className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 4 }}>
                <span className="small light muted" style={{ lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {d.details}
                </span>
              </span>
            </span>
            <button className="link" onClick={() => go("/book/details")}>Change</button>
          </div>
          <ReviewRow k="What's included" v={`${(d.included ?? []).length} thing${(d.included ?? []).length === 1 ? "" : "s"}${(d.excluded ?? []).length ? `, ${d.excluded.length} not included` : ""}`} onChange={() => go("/book/details")} />
          {(() => { const sk = skillList.filter((k) => (d.skills ?? []).includes(k.id) && k.category_id === d.categoryId); return sk.length ? <ReviewRow k="Skills needed" v={sk.map((k) => k.name).join(", ")} onChange={() => go("/book/details")} /> : null; })()}
          <ReviewRow k="Photos and video" v={`${photoCount} photo${photoCount === 1 ? "" : "s"}${video || reusedVideo ? " and a video" : ", no video"}`} onChange={() => go("/book/photos")} />
          <ReviewRow k="Who can take it" v={whoLabel} onChange={() => go("/book/where")} />
          <ReviewRow k="Where" v={`${d.address}, ${suburb?.name ?? ""}`} onChange={() => go("/book/where")} />
          <ReviewRow k="When" v={d.asap ? "Today, as soon as possible" : new Date(d.startAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} onChange={() => go("/book/where")} />
          <ReviewRow k="Your price" v={money(d.priceCents)} onChange={() => go("/book/price")} last={!(bookingFee > 0 && session)} />
          {bookingFee > 0 && session && (
            <div className="review-row" style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }} onClick={() => setCardScreen(true)}>
              {profile?.card_last4 ? <span className="row" style={{ gap: 12, flex: 1 }}><CardMark brand={profile.card_brand} /><span className="t"><span className="k">Card for the booking fee</span><span className="v">{cardLabel(profile)}</span></span></span>
                : <span className="t"><span className="k">Card for the booking fee</span><span className="v em">Add a card</span></span>}
              {profile?.card_last4 ? <button className="link">Change</button> : Icon.chevron("var(--emerald)")}
            </div>
          )}
          {bookingFee > 0 ? (
            <div className="stack" style={{ padding: "16px 16px 18px", gap: 6 }}>
              <span className="t15 light muted" style={{ lineHeight: 1.45 }}>
                The booking fee is only charged when you choose a worker. Nobody chosen, nothing charged. You pay the {money(d.priceCents)} to your worker by bank transfer or cash when it's done.{" "}
                <a href="/pricing" onClick={(e) => { e.preventDefault(); go("/pricing"); }}>How it works</a>
              </span>
            </div>
          ) : (
          <div className="stack" style={{ padding: "18px 16px 20px", gap: 6 }}>
            {!pilot && <><span className="small w5 em">Total, fixed</span>
            <span className="price">{money2(total)}</span></>}
            {!pilot && <span className="small light muted">Job {money2(d.priceCents)} + booking fee {money2(total - d.priceCents)}</span>}
            <span className="t15 light muted" style={{ marginTop: pilot ? 0 : 8, lineHeight: 1.45 }}>
              {pilot ? "Pay your worker by bank transfer or cash once it's done." : "Your card is held, not charged, until you confirm the job is done."}
            </span>
            {pilot && (
              <span className="t15 light muted" style={{ lineHeight: 1.45 }}>
                No booking fee during the pilot. From launch it's {feePct}%, up to {money(feeMax)}, and Plus members never pay it.{" "}
                <a href="/pricing" onClick={(e) => { e.preventDefault(); go("/pricing"); }}>How it works</a>
              </span>
            )}
          </div>
          )}
        </div>
        {supply && supply.online_now > 0 && !skillList.some((k) => (d.skills ?? []).includes(k.id) && k.category_id === d.categoryId && k.needs) && (
          <p className="t15 light" style={{ margin: "16px 20px 0", lineHeight: 1.45 }}>
            <span className="w5 em">{supply.online_now} {cat?.name.toLowerCase() ?? ""} worker{supply.online_now === 1 ? "" : "s"} online near {suburb?.name} now.</span>
            {supply.typical_minutes != null && ` Usually someone's free in about ${supply.typical_minutes} min.`}
          </p>
        )}
        {pilot && (
          <button className={`boost-pick${d.boost ? " on" : ""}`} onClick={() => setD({ ...d, boost: !d.boost })} aria-pressed={!!d.boost}>
            <span className="stack" style={{ gap: 2, flex: 1 }}>
              <b>Urgent boost</b>
              <span>Every worker in your category gets an alert and your job goes to the top. Free during the pilot, {money(boostCents)} from launch.</span>
            </span>
            <span className="box">{d.boost && Icon.tick("#fff", 16)}</span>
          </button>
        )}
        {err && <p className="err" style={{ padding: "0 20px" }}>{err}</p>}
        <div style={{ flex: 1 }} />
        <div className="bottombar">
          {bookingFee > 0
            ? <span className="stack"><span className="k">Booking fee</span><span className="v">{money2(bookingFee)}</span></span>
            : <span className="small light muted" style={{ maxWidth: 170, lineHeight: 1.4 }}>
                {session ? "People who are free tell you, and you choose." : "Next, a quick account so workers can reach you."}
              </span>}
          <button className="btn primary" disabled={busy} onClick={book}>
            {busy ? "Posting…" : session && bookingFee > 0 && !profile?.card_last4 ? "Add a card" : "Post it"} {Icon.arrow("#fff")}
          </button>
        </div>
        {photoScreen && <PhotoStep note="Workers see it before they offer, so they know who they're meeting." saveLabel="Save and post" photoOnly
          onBack={() => setPhotoScreen(false)} onSaved={() => { photoAdded.current = true; setPhotoScreen(false); window.setTimeout(book, 300); }} />}
        {cardScreen && <AddCardScreen onBack={() => setCardScreen(false)} onSaved={() => { cardAdded.current = true; setCardScreen(false); window.setTimeout(book, 300); }} />}
        {auth && (
          <AuthScreen title="Almost there" reason="Sign in and your job posts straight away. Your photos are saved."
            onBack={() => setAuth(false)} onDone={() => { setAuth(false); window.setTimeout(book, 300); }} />
        )}
        {payJob && <PayScreen jobId={payJob} amountLabel={money2(total)} onBack={() => setPayJob(null)}
          onPaid={async () => { sessionStorage.removeItem(DRAFT_KEY); await draftMedia.clear(); go(`/job/${payJob}`); }} />}
      </div>
    );
  }

  return <PostHome cats={cats} signedIn={!!session} uid={session?.user.id ?? null} onStart={startNew} />;
}

const afterLabel = (m: number) => (m >= 60 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

// ---------- Get help: one button, then your recent jobs ----------
interface Recent {
  id: string; title: string | null; details: string; skill_ids: number[] | null; included: string[] | null; excluded: string[] | null; price_cents: number; suburb_id: number; address: string; notes: string; created_at: string;
  status: string; worker_id: string | null; job_types: { category_id: number | null } | null; suburbs: { name: string } | null;
  job_media: { path: string; kind: "photo" | "video"; sort: number }[];
}

function PostHome({ cats, signedIn, uid, onStart }: { cats: Category[]; signedIn: boolean; uid: string | null; onStart: (p?: Partial<Draft>) => void }) {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  useEffect(() => {
    if (!uid) { setRecent([]); return; }
    sb.from("jobs").select("id,title,details,skill_ids,included,excluded,price_cents,suburb_id,address,notes,created_at,status,worker_id,job_types(category_id),suburbs(name),job_media(path,kind,sort)")
      .eq("customer_id", uid).neq("status", "awaiting_payment").order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecent((data ?? []) as unknown as Recent[]));
  }, [uid]);
  // Each recent job shows its own first photo, so it's recognisable at a glance. The category icon only fills in when there's no photo.
  const [pics, setPics] = useState<Record<string, string>>({});
  useEffect(() => { if (recent?.length) mediaUrls(recent.map((r) => firstPhoto(r.job_media)).filter(Boolean) as string[]).then(setPics); }, [recent]);

  const again = (r: Recent) => onStart({
    categoryId: r.job_types?.category_id ?? null, priceCents: r.price_cents, suburbId: r.suburb_id, address: r.address, notes: r.notes,
    details: r.details, skills: r.skill_ids ?? [], included: r.included ?? [], excluded: r.excluded ?? [], reuse: [...r.job_media].sort((a, b) => a.sort - b.sort).map((m) => ({ path: m.path, kind: m.kind })),
    invited: r.worker_id && ["finished", "confirmed"].includes(r.status) ? [r.worker_id] : [],
  });

  return (
    <div className="app" style={{ background: "var(--ground)" }}>
      <section className="hero" style={{ paddingBottom: 28 }}>
        <div className="hero-top" style={{ position: "relative", zIndex: 1 }}>
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          {signedIn
            ? <HeaderIcons />
            : <AreaPin />}
        </div>
        <SideSwitch side="help" />
        <img className="mascot" src="/mascot.png" alt="" style={{ top: "auto", bottom: 0, height: 160, right: -30 }} />
        <h1 className="mid" style={{ position: "relative", margin: "26px 0 10px" }}>Need a hand?</h1>
        <p className="lede" style={{ position: "relative", maxWidth: 200 }}>Get help now with your odd job.</p>
      </section>

      <div className="post-body">
        <button className="post-btn" onClick={() => onStart()}>
          <span>Post a job</span>
          {Icon.arrow("var(--lime)")}
        </button>

        {recent && recent.length > 0 ? (
          <div className="stack" style={{ gap: 0 }}>
            <span className="post-h">Your recent jobs</span>
            {recent.map((r) => {
              const c = cats.find((x) => x.id === r.job_types?.category_id);
              return (
                <div key={r.id} className="recent-row">
                  {(() => { const p = firstPhoto(r.job_media); return p && pics[p]
                    ? <span className="sq pic" style={{ backgroundImage: `url("${pics[p]}")` }} />
                    : <span className="sq"><CatIcon name={c?.icon} size={28} /></span>; })()}
                  <span className="t">
                    <b>{r.title || r.details}</b>
                    <span>{money(r.price_cents)}, {r.suburbs?.name ?? ""}, {new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                  </span>
                  <button className="btn stone small" onClick={() => again(r)}>Post again</button>
                </div>
              );
            })}
          </div>
        ) : recent ? (
          <div className="stack" style={{ gap: 0 }}>
            {[["1", "Set your price", "What you'll pay for the work"], ["2", "Show the job", "Photos and exactly what you want done"], ["3", "Choose who does it", "Pay them directly when it's done"]].map(([n, t, s]) => (
              <div key={n} className="how-row"><span className="n">{n}</span><span className="t"><b>{t}</b><span>{s}</span></span></div>
            ))}
          </div>
        ) : null}

        <p className="small light muted" style={{ margin: "18px 0 calc(var(--safe-bottom) + 18px)", lineHeight: 1.5 }}>
          <a href="/privacy" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy</a>
          <span className="sep" /><a href="/terms" onClick={(e) => { e.preventDefault(); go("/terms"); }}>Terms</a>
          <span className="sep" /><a href="/support" onClick={(e) => { e.preventDefault(); go("/support"); }}>Help</a>
        </p>
      </div>
    </div>
  );
}

// ---------- Step 1: Set your price ----------
const QUICK = [3000, 5000, 8000, 12000, 20000];
const LO = 2000, HI = 200000, SLIDER_MAX = 30000;

function PriceStep({ value, catName, onChange }: { value: number; catName: string | null; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(Math.round(value / 100)));
  const [err, setErr] = useState("");
  const dollars = Number(text) || 0;
  const set = (cents: number) => { setErr(""); setText(String(Math.round(cents / 100))); onChange(cents); };
  const pct = Math.max(0, Math.min(100, ((Math.min(dollars * 100, SLIDER_MAX) - LO) / (SLIDER_MAX - LO)) * 100));
  const next = () => {
    const c = Math.round(dollars) * 100;
    if (c < LO) return setErr(`The lowest price is ${money(LO)}.`);
    if (c > HI) return setErr(`The highest price is ${money(HI)}.`);
    onChange(c); go("/book/check");
  };
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <StepHero step={4} of={STEPS} title="Set your price" sub="What will you pay?" onBack={() => history.back()} />
      <div className="price-body">
        <label htmlFor="amt" className="t15 muted">You pay</label>
        <div className="price-box">
          <span className="cur">$</span>
          <input id="amt" type="text" inputMode="numeric" pattern="[0-9]*" value={text} aria-label="Price in dollars"
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4); setText(v); setErr(""); if (v) onChange(Number(v) * 100); }} />
          <span className="hint">tap to type</span>
        </div>
        <span className="t14 light muted">{catName ? `Suggested for ${catName.toLowerCase()}. ` : ""}A fixed price. You pay your worker when the job's done.</span>
        <div className="price-slider">
          <input className="mm-range" type="range" min={LO / 100} max={SLIDER_MAX / 100} step={5} value={Math.min(Math.max(dollars, LO / 100), SLIDER_MAX / 100)} aria-label="Price"
            onChange={(e) => set(Number(e.target.value) * 100)}
            style={{ background: `linear-gradient(90deg, var(--emerald) ${pct}%, var(--stone-2) ${pct}%) center / 100% 10px no-repeat` }} />
          <div className="row between t13 light muted"><span>{money(LO)}</span><span>{money(SLIDER_MAX)}+</span></div>
        </div>
        <span className="t17 w5" style={{ marginTop: 14 }}>Quick pick</span>
        <div className="quick-grid">
          {QUICK.map((q) => (
            <button key={q} className={dollars * 100 === q ? "on" : ""} onClick={() => set(q)}>{money(q)}</button>
          ))}
        </div>
        <div className="cp-note" style={{ padding: "22px 0 0" }}>
          {Icon.clockLine("var(--muted)")}
          <span>Help is usually about $45 an hour. Fair prices get taken faster.</span>
        </div>
        {err && <p className="err" style={{ margin: "12px 0 0" }}>{err}</p>}
      </div>
      <div style={{ flex: 1 }} />
      <div className="bottombar">
        <span className="t15 light muted">Next, check and post</span>
        <button className="btn primary" onClick={next}>Continue {Icon.arrow("#fff")}</button>
      </div>
    </div>
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

// ---------- Step 1: What's the job ----------
// Without the AI: pick the category whose name and skills share the most words, and turn each sentence into a task.
function guessJob(text: string, cats: Category[], skills: { id: number; category_id: number; name: string }[]) {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
  const score = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w) || words.has(w.replace(/s$/, ""))).length;
  let best: { id: number; n: number } | null = null;
  for (const c of cats) {
    const n = score(c.name) * 2 + skills.filter((k) => k.category_id === c.id).reduce((a, k) => a + score(k.name), 0);
    if (n > 0 && (!best || n > best.n)) best = { id: c.id, n };
  }
  const tidy = text.replace(/\s+/g, " ").trim();
  const details = tidy.charAt(0).toUpperCase() + tidy.slice(1) + (/[.!?]$/.test(tidy) ? "" : ".");
  const included = tidy.split(/(?<=[.!?])\s+|\s+and\s+(?=[a-z])/i).map((x) => x.replace(/[.!?]+$/, "").trim()).filter((x) => x.length > 3)
    .map((x) => (x.charAt(0).toUpperCase() + x.slice(1)).slice(0, 60)).slice(0, 6);
  return { details, category_id: best?.id ?? null, skill_ids: [] as number[], included, excluded: [] as string[] };
}
function DetailsStep({ d, setD, cats, cat, skillList, suggest, err, setErr, bar }: {
  d: Draft; setD: (d: Draft) => void; cats: Category[]; cat: Category | null; skillList: { id: number; category_id: number; name: string; needs: string | null }[]; suggest: (catId: number) => number | null;
  err: string; setErr: (s: string) => void; bar: (label: string, onNext: () => void, disabled?: boolean, nextName?: string) => ReactNode;
}) {
  const detailsBox = useRef<HTMLTextAreaElement>(null);
  const [voice, setVoice] = useState(false);
  const [dictate, setDictate] = useState(false);
  const [pickCat, setPickCat] = useState(false);
  const [pickSkills, setPickSkills] = useState(false);
  const [filling, setFilling] = useState(false);
  const filled = useRef(false);
  // One description in, the whole job out. The AI does it when it's switched on; otherwise a simple match on the words.
  async function fill(text: string) {
    filled.current = true; setFilling(true); setErr("");
    const payload = cats.map((c) => ({ id: c.id, name: c.name, skills: skillList.filter((k) => k.category_id === c.id).map((k) => ({ id: k.id, name: k.name })) }));
    let r: { ai: boolean; details?: string; category_id?: number | null; skill_ids?: number[]; included?: string[]; excluded?: string[] } = { ai: false };
    try { r = await api("fill_job", { text, categories: payload }); } catch { /* offline: the simple match below */ }
    const out = r.ai ? r : guessJob(text, cats, skillList);
    const catId = out.category_id ?? d.categoryId;
    const sp = catId ? suggest(catId) : null;
    setD({
      ...d, details: out.details || text, categoryId: catId,
      skills: (out.skill_ids ?? []).length ? out.skill_ids! : d.skills,
      included: (d.included ?? []).length ? d.included : out.included ?? [],
      excluded: (d.excluded ?? []).length ? d.excluded : out.excluded ?? [],
      ...(!d.priceSet && sp && catId !== d.categoryId ? { priceCents: sp } : {}),
    });
    setFilling(false);
  }
  const catSkills = skillList.filter((k) => k.category_id === cat?.id);
  const chosen = catSkills.filter((k) => (d.skills ?? []).includes(k.id));
  const needs = [...new Set(chosen.map((k) => k.needs).filter(Boolean))] as string[];
  const next = () => {
    if (!cat) return setErr("Pick what kind of job it is.");
    if (d.details.trim().length < 15) return setErr("Say what you want done.");
    if (!(d.included ?? []).length) return setErr("Add at least one thing that's included.");
    setErr("");
    go("/book/photos");
  };
  return (
    <div className="app">
      <StepHero step={1} of={STEPS} title="What's the job?" sub="Be specific. This is what the worker is held to." onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <h2>Tell us the job</h2>
          <button className="wide-btn green" disabled={filling} onClick={() => {
            if (voiceSupported()) return setVoice(true);
            // Where the browser has no speech service (the iPhone app), the keyboard's own microphone does the same job.
            setDictate(true);
            detailsBox.current?.focus();
          }}>
            {Icon.mic("var(--lime)")}
            <span className="t"><b>Just say it</b><span>Talk it through. We fill in everything below.</span></span>
          </button>
          <label className="field" style={{ cursor: "text" }}>
            <textarea ref={detailsBox} value={d.details} onChange={(e) => setD({ ...d, details: e.target.value })} style={{ minHeight: 110 }}
              onBlur={() => { if (!filled.current && d.details.trim().length >= 20 && !d.categoryId && !(d.included ?? []).length) fill(d.details); }}
              placeholder="Or type it. For example: shower screen has build-up, needs a proper scrub. Benches and stovetop degreased. Products are under the sink." />
          </label>
          {dictate && !filling && <span className="t15 em" style={{ lineHeight: 1.4 }}>Tap the microphone on your keyboard and talk. We fill in the rest when you're done.</span>}
          {filling && <span className="t15 em" style={{ lineHeight: 1.4 }}>Filling in the rest…</span>}
        </div>

        <div className="sec">
          <h2>What kind of job?</h2>
          <button className="cp-select" onClick={() => setPickCat(true)}>
            <span className="row" style={{ gap: 12 }}>
              {cat && <CatIcon name={cat.icon} size={24} color="var(--emerald)" />}
              <span className={cat ? "" : "ph"}>{cat?.name ?? "Pick a category"}</span>
            </span>
            {Icon.down("var(--ink)")}
          </button>
        </div>

        {catSkills.length > 0 && (
          <div className="sec">
            <h2>Skills needed <span className="h-opt">Optional</span></h2>
            <button className="cp-select" onClick={() => setPickSkills(true)}>
              <span className={chosen.length ? "" : "ph"}>{chosen.length ? chosen.map((k) => k.name).join(", ") : "Pick any that apply"}</span>
              {Icon.down("var(--ink)")}
            </button>
            {needs.length > 0 && <span className="t15 em" style={{ lineHeight: 1.4 }}>Only workers with a verified {needs.map(lc).join(" and ")} can take this job.</span>}
          </div>
        )}

        <div className="sec">
          <h2>What's included</h2>
          <ListEditor items={d.included ?? []} onChange={(v) => { setD({ ...d, included: v }); setErr(""); }} yes
            placeholder="e.g. Clean the shower screen" />
        </div>

        <div className="sec">
          <h2>Not included <span className="h-opt">Optional</span></h2>
          <ListEditor items={d.excluded ?? []} onChange={(v) => setD({ ...d, excluded: v })}
            placeholder="e.g. Inside the oven" />
          <span className="small light muted">The price covers what's included. Anything else is agreed in the app first.</span>
        </div>
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar("Continue", next, false, "photos")}
      {pickCat && <SearchPicker title="What kind of job?" placeholder="Search categories" value={d.categoryId ? [d.categoryId] : []}
        options={cats.map((c) => ({ id: c.id, label: c.name }))} onClose={() => setPickCat(false)}
        onChange={(v) => { const id = Number(v[0]); const sp = suggest(id); setD({ ...d, categoryId: id, skills: id === d.categoryId ? d.skills : [], ...(!d.priceSet && sp ? { priceCents: sp } : {}) }); setErr(""); }} />}
      {pickSkills && <SearchPicker title="Skills needed" multi placeholder="Search skills" value={chosen.map((k) => k.id)}
        options={catSkills.map((k) => ({ id: k.id, label: k.name, hint: k.needs ? `Only workers with a verified ${lc(k.needs)}` : undefined }))}
        onClose={() => setPickSkills(false)} onChange={(v) => setD({ ...d, skills: v.map(Number) })} />}
      {voice && <VoiceScreen jobName={cat?.name ?? "Odd job"} onBack={() => setVoice(false)}
        raw onDone={(text) => { setVoice(false); fill(d.details.trim() ? `${d.details.trim()} ${text}` : text); }} />}
    </div>
  );
}

function PhotosStep({ photos, video, reused, reuseUrls, photoCount, addFiles, removeMedia, removeReused, err, setErr, bar }: {
  photos: (DraftItem & { url: string })[]; video: (DraftItem & { url: string }) | null;
  reused: Reused[]; reuseUrls: Record<string, string>; photoCount: number;
  addFiles: (f: FileList | null, kind: "photo" | "video") => Promise<void>; removeMedia: (id: string) => Promise<void>; removeReused: (p: string) => void;
  err: string; setErr: (s: string) => void; bar: (label: string, onNext: () => void, disabled?: boolean, nextName?: string) => ReactNode;
}) {
  const photoIn = useRef<HTMLInputElement>(null);
  const videoIn = useRef<HTMLInputElement>(null);
  const reusedPhotos = reused.filter((r) => r.kind === "photo");
  const reusedVideo = reused.find((r) => r.kind === "video") ?? null;
  const next = () => {
    if (!photoCount) return setErr("Add at least one photo so workers can see the job.");
    setErr("");
    go("/book/where");
  };
  return (
    <div className="app">
      <StepHero step={2} of={STEPS} title="Show the job" sub="Workers decide from what they see." onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h2>Photos</h2>
            <span className="small muted">At least 1 photo</span>
          </div>
          <div className="media-grid">
            {reusedPhotos.map((r) => (
              <div key={r.path} className="m">
                {reuseUrls[r.path] ? <img src={reuseUrls[r.path]} alt="" /> : null}
                <button className="x" onClick={() => removeReused(r.path)} aria-label="Remove photo">{Icon.x("#fff", 16)}</button>
              </div>
            ))}
            {photos.map((p) => (
              <div key={p.id} className="m">
                <img src={p.url} alt="" />
                <button className="x" onClick={() => removeMedia(p.id)} aria-label="Remove photo">{Icon.x("#fff", 16)}</button>
              </div>
            ))}
            {photoCount < MAX_PHOTOS && (
              <button className="add" onClick={() => photoIn.current?.click()}>{Icon.camera("var(--emerald)")}Add photo</button>
            )}
          </div>
          <input ref={photoIn} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
          {video || reusedVideo ? (
            <div className="media-grid">
              <div className="m">
                {video ? <video src={video.url} muted playsInline /> : reuseUrls[reusedVideo!.path] ? <video src={reuseUrls[reusedVideo!.path]} muted playsInline /> : null}
                <button className="x" onClick={() => (video ? removeMedia(video.id) : removeReused(reusedVideo!.path))} aria-label="Remove video">{Icon.x("#fff", 16)}</button>
              </div>
              <span className="small light muted" style={{ gridColumn: "span 2", alignSelf: "center" }}>Video added.</span>
            </div>
          ) : (
            <button className="wide-btn" onClick={() => videoIn.current?.click()}>
              {Icon.video("var(--emerald)")}
              <span className="t"><b>Add a video walk-through</b><span>Recommended. Up to 60 seconds.</span></span>
            </button>
          )}
          <input ref={videoIn} type="file" accept="video/*" hidden onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />
          <span className="small light muted">Show the worst of it.</span>
        </div>

        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar("Continue", next, false, "where and when")}
    </div>
  );
}

// What's included / not included: typed lines the worker is held to.
function ListEditor({ items, onChange, yes = false, placeholder }: { items: string[]; onChange: (v: string[]) => void; yes?: boolean; placeholder: string }) {
  const [t, setT] = useState("");
  const add = () => {
    const v = t.trim().slice(0, 80);
    if (!v || items.length >= 12 || items.some((x) => x.toLowerCase() === v.toLowerCase())) { setT(""); return; }
    onChange([...items, v]); setT("");
  };
  return (
    <div className="list-ed">
      {items.map((x) => (
        <div key={x} className="li">
          {yes ? Icon.tick("var(--emerald)", 20) : Icon.cross("var(--muted)")}
          <span>{x}</span>
          <button onClick={() => onChange(items.filter((y) => y !== x))} aria-label={`Remove ${x}`}>{Icon.cross("var(--muted)")}</button>
        </div>
      ))}
      {items.length < 12 && (
        <div className="add">
          <label className="field" style={{ cursor: "text", minHeight: 56 }}>
            <input value={t} onChange={(e) => setT(e.target.value)} placeholder={placeholder} maxLength={80}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} enterKeyHint="done" />
          </label>
          <button className="btn stone" onClick={add} disabled={!t.trim()} aria-label="Add">{Icon.plus("var(--ink)")}</button>
        </div>
      )}
    </div>
  );
}

// ---------- Step 3: Where and when (and who, once you've used someone) ----------
const OPEN_AFTER: { id: string; label: string; v: number | null }[] = [
  { id: "15", label: "Open it to everyone after 15 minutes", v: 15 },
  { id: "30", label: "Open it to everyone after 30 minutes", v: 30 },
  { id: "60", label: "Open it to everyone after 1 hour", v: 60 },
  { id: "never", label: "Keep it just for them", v: null },
];

function WhereStep({ d, setD, suburbs, suburb, past, bar }: {
  d: Draft; setD: (d: Draft) => void; suburbs: Suburb[]; suburb: Suburb | null; past: PastWorker[];
  bar: (label: string, onNext: () => void, disabled?: boolean, nextName?: string) => ReactNode;
}) {
  const { area } = useArea();
  const [pick, setPick] = useState<null | "suburb" | "day" | "time" | "people" | "after">(null);
  const [err, setErr] = useState("");
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayKey = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const earliest = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const x = new Date(); x.setDate(x.getDate() + i);
    const nice = x.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
    return { id: dayKey(x), label: i === 0 ? `Today, ${nice}` : i === 1 ? `Tomorrow, ${nice}` : nice };
  }), []);
  const [selDay, selTime] = d.startAt ? d.startAt.split("T") : ["", ""];
  const times = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (let m = 6 * 60; m <= 20 * 60; m += 30) {
      const hh = pad(Math.floor(m / 60)), mm = pad(m % 60);
      const at = selDay ? new Date(`${selDay}T${hh}:${mm}`) : null;
      const label = new Date(2000, 0, 1, m / 60, m % 60).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
      if (!at || at >= earliest) out.push({ id: `${hh}:${mm}`, label });
    }
    return out;
  }, [selDay, earliest]);
  const timeLabel = times.find((t) => t.id === selTime)?.label;
  const dayLabel = days.find((x) => x.id === selDay)?.label;
  const chosen = past.filter((p) => d.invited.includes(p.worker_id));
  const next = () => {
    if (d.address.trim().length < 3) return setErr("Add the street address.");
    if (!suburb) return setErr("Pick the suburb.");
    if (!d.asap && (!selDay || !selTime)) return setErr("Pick a day and a start time.");
    if (!d.asap && new Date(d.startAt) < earliest) return setErr("Pick a time at least an hour from now.");
    setErr("");
    go("/book/price");
  };
  return (
    <div className="app">
      <StepHero step={3} of={STEPS} title="Where and when?" onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <h2>Where</h2>
          <label className="field"><span className="k">Street address</span>
            <input value={d.address} onChange={(e) => { setD({ ...d, address: e.target.value }); setErr(""); }} placeholder="22 Boland Street" autoComplete="street-address" /></label>
          <button className="field sel" onClick={() => setPick("suburb")}>
            <span className="stack" style={{ gap: 2 }}><span className="k">Suburb</span><span className={suburb ? "v" : "v ph"}>{suburb?.name ?? "Pick your suburb"}</span></span>
          </button>
          <label className="field" style={{ cursor: "text" }}><span className="k">Getting in <span className="h-opt" style={{ fontSize: 13, marginLeft: 2 }}>Optional</span></span>
            <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Gate code, parking, pets, where the key is" style={{ minHeight: 64 }} /></label>
          <span className="small light muted">Only the worker you choose sees your street address.</span>
        </div>

        <div className="sec">
          <h2>When</h2>
          <button className={`who-opt${d.asap ? " on" : ""}`} onClick={() => { setD({ ...d, asap: true }); setErr(""); }}>
            <span className="t"><b>As soon as possible</b><span>People who are free now tell you, and you choose</span></span>
            <span className="box">{d.asap && Icon.tick("var(--emerald)", 16)}</span>
          </button>
          <button className={`who-opt${!d.asap ? " on" : ""}`} onClick={() => { setD({ ...d, asap: false }); setErr(""); }}>
            <span className="t"><b>Pick a day and time</b><span>Up to 5 days ahead</span></span>
            <span className="box">{!d.asap && Icon.tick("var(--emerald)", 16)}</span>
          </button>
          {!d.asap && (
            <div className="row" style={{ gap: 10 }}>
              <button className="field sel" style={{ flex: 1.2 }} onClick={() => setPick("day")}>
                <span className="stack" style={{ gap: 2 }}><span className="k">Day</span><span className={dayLabel ? "v" : "v ph"}>{dayLabel ?? "Pick a day"}</span></span>
              </button>
              <button className="field sel" style={{ flex: 1 }} onClick={() => setPick(selDay ? "time" : "day")}>
                <span className="stack" style={{ gap: 2 }}><span className="k">Start</span><span className={timeLabel ? "v" : "v ph"}>{timeLabel ?? "Pick a time"}</span></span>
              </button>
            </div>
          )}
        </div>

        {past.length > 0 && (
          <div className="sec">
            <h2>Who can take it?</h2>
            <button className="field sel" onClick={() => setPick("people")}>
              <span className="stack" style={{ gap: 2 }}>
                <span className="k">Send it to</span>
                <span className="v">{chosen.length ? chosen.map((p) => p.full_name).join(", ") : "Anyone nearby"}</span>
              </span>
            </button>
            {chosen.length > 0 && (
              <button className="field sel" onClick={() => setPick("after")}>
                <span className="stack" style={{ gap: 2 }}>
                  <span className="k">If they can't take it</span>
                  <span className="v">{OPEN_AFTER.find((o) => o.v === d.openAfter)?.label ?? OPEN_AFTER[1].label}</span>
                </span>
              </button>
            )}
            <span className="small light muted">Pick someone you've used before, or leave it open to anyone nearby.</span>
          </div>
        )}
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar("Continue", next, false, "your price")}
      {pick === "suburb" && <SearchPicker title="Suburb" placeholder={`Search ${area?.name ?? ""} suburbs`} value={d.suburbId ? [d.suburbId] : []}
        options={suburbs.map((s) => ({ id: s.id, label: s.name }))} onChange={(v) => { setD({ ...d, suburbId: Number(v[0]) }); setErr(""); }} onClose={() => setPick(null)} />}
      {pick === "day" && <SearchPicker title="Day" placeholder="Search days" value={selDay ? [selDay] : []} options={days}
        onChange={(v) => { const t = selTime && new Date(`${v[0]}T${selTime}`) >= earliest ? selTime : ""; setD({ ...d, startAt: `${v[0]}T${t}` }); setErr(""); if (!t) setTimeout(() => setPick("time"), 0); }} onClose={() => setPick(null)} />}
      {pick === "time" && <SearchPicker title="Start time" placeholder="Search times" value={selTime ? [selTime] : []} options={times}
        onChange={(v) => { setD({ ...d, startAt: `${selDay}T${v[0]}` }); setErr(""); }} onClose={() => setPick(null)} />}
      {pick === "people" && (
        <SearchPicker title="People you've used" multi placeholder="Search by name" value={d.invited}
          options={past.map((p) => ({ id: p.worker_id, label: p.full_name, hint: `Did ${p.jobs_for_me} job${p.jobs_for_me === 1 ? "" : "s"} for you${p.rating ? `, ${p.rating} rating` : ""}` }))}
          onClose={() => setPick(null)} onChange={(v) => setD({ ...d, invited: v.map(String) })} />
      )}
      {pick === "after" && (
        <SearchPicker title="If they can't take it" value={[OPEN_AFTER.find((o) => o.v === d.openAfter)?.id ?? "30"]}
          options={OPEN_AFTER.map((o) => ({ id: o.id, label: o.label }))}
          onClose={() => setPick(null)} onChange={(v) => setD({ ...d, openAfter: OPEN_AFTER.find((o) => o.id === v[0])?.v ?? null })} />
      )}
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
