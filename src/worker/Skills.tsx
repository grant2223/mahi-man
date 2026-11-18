import { useCallback, useEffect, useRef, useState } from "react";
import { api, mediaUrls, rpc, sb, type Category, type JobType, myId } from "../lib/supabase";
import { useSession } from "../lib/session";
import { blobBase64, photoForReading, shrinkImage } from "../lib/format";
import { CatIcon, Icon, Screen, SearchPicker, useToast } from "../ui/kit";

/* Worker skills, experience and gear for each type of job, plus licences and certificates. */

export interface Skill { id: number; category_id: number; kind: "skill" | "gear"; name: string; credential_type_id: number | null; sort: number }
export interface CredType { id: number; name: string; short: string }
export const DRIVER = "Driver licence";
export const LICENCE_CLASSES: [string, string, string][] = [["C", "C, car", "Cars, utes and vans up to 4.5 tonnes"], ["LR", "LR, light rigid", "Trucks from 4.5 to 8 tonnes"], ["MR", "MR, medium rigid", "Trucks over 8 tonnes, two axles"], ["HR", "HR, heavy rigid", "Trucks with three or more axles"]];
export interface MyCred { id: string; credential_type_id: number; number: string; expiry: string | null; status: "pending" | "verified" | "retake" | "rejected"; reason: string | null; created_at: string }

const MAX_WORK = 6;
export const expLabel = (y: number | null | undefined) => y == null ? "" : y === 0 ? "Under 1 year" : y >= 10 ? "10+ years" : `${y} year${y === 1 ? "" : "s"}`;
const dmy = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
// Licence names in a sentence: "electrical licence", but "RSA" and "Blue Card" keep their capitals.
export const lc = (n: string) => /^[A-Z]{2}/.test(n) || /Card/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1);
const today = () => new Date().toISOString().slice(0, 10);

// The newest one of each type the worker has sent.
export function latestCreds(rows: MyCred[]) {
  const m = new Map<number, MyCred>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) if (!(r.status === "rejected" && r.reason === "Replaced by a newer one")) m.set(r.credential_type_id, r);
  return m;
}
const valid = (c?: MyCred) => !!c && c.status === "verified" && (!c.expiry || c.expiry >= today());

export function useCatalog() {
  const [d, setD] = useState<{ types: (JobType & { cat: Category })[]; skills: Skill[]; creds: CredType[] } | null>(null);
  useEffect(() => {
    Promise.all([
      sb.from("job_types").select("*, cat:categories(*)").eq("active", true).eq("custom_price", true).order("sort"),
      sb.from("skills").select("*").eq("active", true).order("sort"),
      sb.from("credential_types").select("id,name,short").eq("active", true).order("sort"),
    ]).then(([t, k, c]) => setD({
      types: ((t.data ?? []) as (JobType & { cat: Category })[]).sort((a, b) => a.cat.sort - b.cat.sort),
      skills: (k.data ?? []) as Skill[], creds: (c.data ?? []) as CredType[],
    }));
  }, []);
  return d;
}

export function useMine() {
  const [mine, setMine] = useState<{ types: { job_type_id: number; years: number | null }[]; skills: number[]; creds: MyCred[] } | null>(null);
  const load = useCallback(() => {
    myId().then((uid) => Promise.all([
      sb.from("worker_job_types").select("job_type_id,years").eq("worker_id", uid),
      sb.from("worker_skills").select("skill_id").eq("worker_id", uid),
      sb.from("worker_credentials").select("id,credential_type_id,number,expiry,status,reason,created_at").eq("worker_id", uid),
    ])).then(([t, k, c]) => setMine({
      types: (t.data ?? []) as { job_type_id: number; years: number | null }[],
      skills: (k.data ?? []).map((r) => r.skill_id as number), creds: (c.data ?? []) as MyCred[],
    }));
  }, []);
  useEffect(load, [load]);
  return { mine, load };
}

/* ---------- Jobs and skills: one row per type of job ---------- */
export function JobsAndSkills({ onBack }: { onBack: () => void }) {
  const { session } = useSession();
  const toast = useToast();
  const cat = useCatalog();
  const { mine, load } = useMine();
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  if (!cat || !mine) return <Screen title="My skills" onBack={onBack}><div className="screen-body" /></Screen>;
  const myTypes = cat.types.filter((t) => mine.types.some((m) => m.job_type_id === t.id));
  const names = (catId: number, kind: "skill" | "gear") => cat.skills.filter((k) => k.category_id === catId && k.kind === kind && mine.skills.includes(k.id)).map((k) => k.name);
  const openType = cat.types.find((t) => t.id === open);
  // Driving work needs a checked, in-date driver licence.
  const driverId = cat.creds.find((c) => c.name === DRIVER)?.id;
  const licensed = mine.creds.some((c) => c.credential_type_id === driverId && c.status === "verified" && (!c.expiry || c.expiry >= today()));
  async function addTypes(ids: number[]) {
    if (!ids.length || !session) return;
    const { error } = await sb.from("worker_job_types").upsert(ids.map((id) => ({ worker_id: session.user.id, job_type_id: id })), { onConflict: "worker_id,job_type_id", ignoreDuplicates: true });
    if (error) { toast(error.message); return; }
    toast(ids.length === 1 ? "Added" : `${ids.length} added`); load(); rpc("worker_status").catch(() => {});
  }

  return (
    <Screen title="My skills" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        {myTypes.map((t) => {
          const sk = names(t.cat.id, "skill"), gear = names(t.cat.id, "gear");
          const years = mine.types.find((m) => m.job_type_id === t.id)?.years;
          const sub = [expLabel(years), gear.length ? `brings ${gear.join(", ").toLowerCase()}` : years != null ? "no gear" : ""].filter(Boolean).join(", ");
          return (
            <button key={t.id} className="choice" style={{ alignItems: "flex-start" }} onClick={() => setOpen(t.id)}>
              <span style={{ paddingTop: 2 }}><CatIcon name={t.cat.icon} size={26} color="var(--emerald)" /></span>
              <span className="t">
                <b>{t.cat.name}</b>
                <span style={{ color: sk.length ? "var(--ink)" : "var(--muted)", fontSize: 15 }}>{sk.length ? sk.join(", ") : "Add details, optional"}</span>
                {sub && <span>{sub}</span>}
                {t.needs_driver && !licensed && <span style={{ color: "#8a6d00" }}>Needs your driver licence</span>}
              </span>
              {Icon.chevron("var(--faint)")}
            </button>
          );
        })}
        {!myTypes.length && <p className="t17 light" style={{ padding: "20px 16px 0", margin: 0, lineHeight: 1.4 }}>Select the kinds of work you're happy to do. You can add details later.</p>}
        <div style={{ padding: 16 }}><button className={myTypes.length ? "btn stone" : "btn primary"} onClick={() => setAdding(true)}>{Icon.plus(myTypes.length ? "var(--ink)" : "#fff")} {myTypes.length ? "Add more" : "Select your skills"}</button></div>
      </div>
      {adding && (
        <SearchPicker title="What will you do?" multi placeholder="Search" value={[]}
          options={cat.types.filter((t) => !myTypes.includes(t)).map((t) => ({ id: t.id, label: t.cat.name, hint: t.needs_driver ? "Needs your driver licence" : undefined }))}
          onClose={() => setAdding(false)} onChange={(v) => addTypes(v.map(Number))} />
      )}
      {openType && (
        <JobDetail key={openType.id} type={openType} catalog={cat} mine={mine} isNew={!myTypes.includes(openType)}
          next={myTypes[myTypes.indexOf(openType) + 1] ?? null}
          onBack={() => setOpen(null)} onCredsChanged={load}
          onSaved={(goNext) => { const nx = goNext ? myTypes[myTypes.indexOf(openType) + 1] : null; setOpen(nx ? nx.id : null); load(); rpc("worker_status").catch(() => {}); }} />
      )}
    </Screen>
  );
}

/* ---------- One type of job: skills, experience, gear ---------- */
function JobDetail({ type, catalog, mine, isNew, next, onBack, onSaved, onCredsChanged }: {
  type: JobType & { cat: Category }; catalog: NonNullable<ReturnType<typeof useCatalog>>; mine: NonNullable<ReturnType<typeof useMine>["mine"]>;
  isNew: boolean; next: (JobType & { cat: Category }) | null; onBack: () => void; onSaved: (goNext: boolean) => void; onCredsChanged: () => void;
}) {
  const { session } = useSession();
  const toast = useToast();
  const kind = type.cat.name.toLowerCase();
  const catSkills = catalog.skills.filter((k) => k.category_id === type.cat.id);
  const [skills, setSkills] = useState<number[]>(mine.skills.filter((id) => catSkills.some((k) => k.id === id && k.kind === "skill")));
  const [gear, setGear] = useState<number[]>(mine.skills.filter((id) => catSkills.some((k) => k.id === id && k.kind === "gear")));
  const [years, setYears] = useState<number | null>(mine.types.find((m) => m.job_type_id === type.id)?.years ?? null);
  const [pick, setPick] = useState<null | "skills" | "gear">(null);
  const [addCred, setAddCred] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const creds = latestCreds(mine.creds);
  const credName = (id: number) => catalog.creds.find((c) => c.id === id);
  const nameOf = (ids: number[]) => catSkills.filter((k) => ids.includes(k.id)).map((k) => k.name).join(", ");
  // Photos of past work for this kind of work. Saved straight away (they're files); everything else waits for Save.
  const [work, setWork] = useState<{ id: number; path: string; url: string }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const loadWork = useCallback(async () => {
    const uid = await myId();
    const { data } = await sb.from("worker_work_photos").select("id,path").eq("worker_id", uid).eq("category_id", type.cat.id).order("created_at");
    const rows = (data ?? []) as { id: number; path: string }[];
    const urls = rows.length ? await mediaUrls(rows.map((r) => r.path)) : {};
    setWork(rows.map((r) => ({ ...r, url: urls[r.path] ?? "" })));
  }, [type.cat.id]);
  useEffect(() => { loadWork(); }, [loadWork]);
  async function addWork(files: FileList | null) {
    if (!files?.length || !session) return;
    setAdding(true); setErr("");
    try {
      const uid = session.user.id;
      for (const f of Array.from(files).slice(0, MAX_WORK - (work?.length ?? 0))) {
        const blob = await shrinkImage(f);
        const path = `${uid}/work/${type.cat.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const up = await sb.storage.from("job-media").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        const ins = await sb.from("worker_work_photos").insert({ worker_id: uid, category_id: type.cat.id, path });
        if (ins.error) throw ins.error;
      }
      await loadWork();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setAdding(false); }
  }
  async function removeWork(w: { id: number; path: string }) {
    await sb.from("worker_work_photos").delete().eq("id", w.id);
    await sb.storage.from("job-media").remove([w.path]);
    setWork((x) => (x ?? []).filter((y) => y.id !== w.id));
  }

  async function save() {
    if (!session) return;
    setErr(""); setBusy(true);
    try {
      const uid = session.user.id;
      const catIds = catSkills.map((k) => k.id);
      let r = await sb.from("worker_job_types").upsert({ worker_id: uid, job_type_id: type.id, years }, { onConflict: "worker_id,job_type_id" });
      if (r.error) throw r.error;
      r = await sb.from("worker_skills").delete().eq("worker_id", uid).in("skill_id", catIds);
      if (r.error) throw r.error;
      if (skills.length || gear.length) {
        r = await sb.from("worker_skills").insert([...skills, ...gear].map((id) => ({ worker_id: uid, skill_id: id })));
        if (r.error) throw r.error;
      }
      toast("Saved"); onSaved(!!next);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function stop() {
    if (!session) return;
    setBusy(true);
    await sb.from("worker_skills").delete().eq("worker_id", session.user.id).in("skill_id", catSkills.map((k) => k.id));
    await sb.from("worker_job_types").delete().eq("worker_id", session.user.id).eq("job_type_id", type.id);
    setBusy(false); toast(`Removed ${kind}`); onSaved(false);
  }

  return (
    <div className="screen" role="dialog" aria-label={`Your ${kind} work`}>
      <section className="step-hero">
        <div className="top">
          <button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
          <span className="count">My skills</span>
        </div>
        <h1>Your {kind} work</h1>
        <p>Customers see this when you say you're free for a {kind} job.</p>
      </section>
      <div className="screen-body kw">
        <div className="kw-sec">
          <span className="kw-h">Years doing {kind}</span>
          <div className="kw-step">
            <button className="btn stone" aria-label="Fewer years" disabled={!years} onClick={() => setYears(Math.max(0, (years ?? 0) - 1))}>&minus;</button>
            <b>{years == null ? "0" : years >= 10 ? "10+" : years === 0 ? "<1" : years}</b>
            <button className="btn stone" aria-label="More years" disabled={(years ?? 0) >= 10} onClick={() => setYears(years == null ? 1 : Math.min(10, years + 1))}>+</button>
          </div>
        </div>
        <div className="kw-sec">
          <span className="kw-h row between">What you do<button className="btn stone small" onClick={() => setPick("skills")}>Edit</button></span>
          <span className={skills.length ? "kw-v" : "kw-v muted"}>{skills.length ? nameOf(skills) : "Nothing added yet"}</span>
        </div>
        <div className="kw-sec">
          <span className="kw-h row between">What you bring<button className="btn stone small" onClick={() => setPick("gear")}>Edit</button></span>
          <span className={gear.length ? "kw-v" : "kw-v muted"}>{gear.length ? nameOf(gear) : "Nothing added yet"}</span>
        </div>
        <div className="kw-sec">
          <span className="kw-h">Photos of your past work</span>
          <span className="kw-hint">{type.cat.name} work you've done before Mahi Man. Customers see them marked as added by you.</span>
          <div className="kw-grid">
            {(work ?? []).map((w) => (
              <span key={w.id} className="kw-pic" style={{ backgroundImage: `url("${w.url}")` }}>
                <button aria-label="Remove photo" onClick={() => removeWork(w)}>{Icon.cross("#fff")}</button>
              </span>
            ))}
            {(work?.length ?? 0) < MAX_WORK && (
              <label className="kw-add">{Icon.camera("var(--emerald)")}<span>{adding ? "Adding…" : "Add photo"}</span>
                <input type="file" accept="image/*" multiple hidden disabled={adding} onChange={(e) => { addWork(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>
        <div className="kw-auto">{Icon.tick("var(--emerald)", 22)}<span>Every {kind} job you finish on Mahi Man adds its after photos and the customer's review here by itself.</span></div>
        {err && <p className="err">{err}</p>}
        {!isNew && <button className="btn stone" style={{ marginTop: 18, alignSelf: "flex-start" }} disabled={busy} onClick={stop}>{Icon.cancel("currentColor")}Stop doing {kind} jobs</button>}
      </div>
      <div className="bottombar">
        <span className="small light muted">{next ? `Next, ${next.cat.name.toLowerCase()}` : ""}</span>
        <button className="btn primary" disabled={busy} onClick={save}>Save</button>
      </div>
      {pick === "skills" && (
        <SearchPicker title={`${type.cat.name} skills`} multi placeholder="Search skills" value={skills}
          options={catSkills.filter((k) => k.kind === "skill").map((k) => {
            if (!k.credential_type_id) return { id: k.id, label: k.name };
            const c = creds.get(k.credential_type_id), t = credName(k.credential_type_id);
            if (valid(c)) return { id: k.id, label: k.name, hint: `${t?.short} verified` };
            if (c?.status === "pending") return { id: k.id, label: k.name, hint: `${t?.short} being checked`, disabled: true };
            return { id: k.id, label: k.name, hint: `Add your ${lc(t?.name ?? "licence")} to unlock it`, action: () => { setPick(null); setAddCred(k.credential_type_id); } };
          })}
          onClose={() => setPick(null)} onChange={(v) => setSkills(v.map(Number))} />
      )}
      {pick === "gear" && (
        <SearchPicker title="What you bring" multi placeholder="Search gear" value={gear}
          options={catSkills.filter((k) => k.kind === "gear").map((k) => ({ id: k.id, label: k.name }))}
          onClose={() => setPick(null)} onChange={(v) => setGear(v.map(Number))} />
      )}
      {addCred != null && <AddCredential types={catalog.creds} initial={addCred} onBack={() => setAddCred(null)} onSaved={() => { setAddCred(null); onCredsChanged(); }} />}
    </div>
  );
}

/* ---------- Licences and certificates ---------- */
export function Credentials({ onBack }: { onBack: () => void }) {
  const cat = useCatalog();
  const { mine, load } = useMine();
  const [add, setAdd] = useState<number | "new" | null>(null);
  if (!cat || !mine) return <Screen title="Licences and certificates" onBack={onBack}><div className="screen-body" /></Screen>;
  const latest = [...latestCreds(mine.creds).values()];
  const status = (c: MyCred) => {
    if (c.status === "verified") return c.expiry && c.expiry < today() ? { t: `Expired ${dmy(c.expiry)}. Tap to add the new one`, ok: false } : { t: `Verified${c.expiry ? `, until ${dmy(c.expiry)}` : ""}`, ok: true };
    if (c.status === "pending") return { t: "Being checked, usually within a few hours", ok: false };
    if (c.status === "retake") return { t: `Retake needed: ${c.reason ?? "photo wasn't clear"}`, ok: false };
    return { t: `Not approved: ${c.reason ?? "tap to send it again"}`, ok: false };
  };
  return (
    <Screen title="Licences and certificates" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        {latest.map((c) => {
          const s = status(c);
          return (
            <button key={c.id} className="opt" onClick={() => c.status !== "pending" && setAdd(c.credential_type_id)}>
              <span className="stack" style={{ gap: 2 }}><b>{cat.creds.find((t) => t.id === c.credential_type_id)?.name}</b><span className={s.ok ? "small em" : "small muted light"}>{s.t}</span></span>
              {s.ok ? Icon.shieldTick("var(--emerald)", 20) : c.status === "pending" ? Icon.clockLine("var(--muted)") : Icon.chevron("var(--faint)")}
            </button>
          );
        })}
        {!latest.length && <p className="t17 light" style={{ padding: "20px 16px 0", margin: 0, lineHeight: 1.4 }}>Insurance, RSA, Blue Card, trade licences. Each one unlocks the jobs that need it.</p>}
        <div style={{ padding: 16 }}><button className="btn primary" onClick={() => setAdd("new")}>{Icon.plus("#fff")} Add one</button></div>
        {latest.length > 0 && <p className="t15 light muted" style={{ padding: "0 16px", margin: 0, lineHeight: 1.45 }}>Customers see each verified one when you say you're available. We remind you 30 days before one runs out.</p>}
      </div>
      {add != null && <AddCredential types={cat.creds} initial={add === "new" ? null : add} onBack={() => setAdd(null)} onSaved={() => { setAdd(null); load(); }} />}
    </Screen>
  );
}

// Straight to adding their driver licence (from Driving on their profile).
export function AddDriverLicence({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const cat = useCatalog();
  const id = cat?.creds.find((c) => c.name === DRIVER)?.id;
  if (!cat || id == null) return <Screen title="Driver licence" onBack={onBack}><div className="screen-body" /></Screen>;
  return <AddCredential types={cat.creds} initial={id} onBack={onBack} onSaved={onSaved} />;
}

// Add a licence: snap it, Claude reads it, the worker checks what was read, then it goes to admin to approve.
// If it can't be read, the worker fills it in by hand. Nothing ever stops them sending it.
interface Read { type_id: number | null; number: string; expiry: string; name: string | null; name_match: boolean; ai: boolean }
export function AddCredential({ types, initial, onBack, onSaved }: { types: CredType[]; initial: number | null; onBack: () => void; onSaved: () => void }) {
  const { session } = useSession();
  const toast = useToast();
  const [stage, setStage] = useState<"snap" | "reading" | "check">("snap");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [got, setGot] = useState<Read>({ type_id: initial, number: "", expiry: "", name: null, name_match: false, ai: false });
  const [pick, setPick] = useState<false | "type" | "class">(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [unlocks, setUnlocks] = useState<string[]>([]);
  // Driver licence: the back too, and the class.
  const [back, setBack] = useState<File | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [cls, setCls] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const backCam = useRef<HTMLInputElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUnlocks([]);
    if (got.type_id == null) return;
    sb.from("skills").select("name, cat:categories(name)").eq("credential_type_id", got.type_id).eq("active", true)
      .then(({ data }) => setUnlocks(((data ?? []) as unknown as { name: string; cat: { name: string } | null }[]).map((r) => r.cat ? `${r.name.toLowerCase()} in ${r.cat.name}` : r.name.toLowerCase())));
  }, [got.type_id]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { if (backUrl) URL.revokeObjectURL(backUrl); }, [backUrl]);
  const t = types.find((x) => x.id === got.type_id);
  const insurance = t?.name === "Public liability insurance";
  const driver = t?.name === DRIVER;
  const isPdf = file?.type === "application/pdf";

  async function read(f: File) {
    setFile(f); setUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null); setProblem(null); setErr("");
    setStage("reading");
    try {
      const data = f.type === "application/pdf" ? await blobBase64(f) : await photoForReading(f, 1600);
      const r = await api<{ ai: boolean; readable?: boolean; problem?: string | null; type_id?: number | null; number?: string | null; expiry?: string | null; name?: string | null; name_match?: boolean }>(
        "read_credential", { file: data, media: f.type === "application/pdf" ? "application/pdf" : "image/jpeg", types: types.map((x) => ({ id: x.id, name: x.name })) });
      if (!r.ai) { setGot((g) => ({ ...g, ai: false })); setStage("check"); return; }
      if (r.readable === false) { setProblem(r.problem || "We couldn't read it. Take it again."); return; }
      setGot({ type_id: r.type_id ?? got.type_id, number: r.number ?? "", expiry: r.expiry ?? "", name: r.name ?? null, name_match: !!r.name_match, ai: true });
      setStage("check");
    } catch {
      setGot((g) => ({ ...g, ai: false })); setStage("check");
    }
  }

  async function send() {
    if (!session || got.type_id == null || !file) return;
    if (got.expiry && got.expiry < today()) return setErr("That one has expired");
    if (driver && !back) return setErr("Add a photo of the back of your licence");
    if (driver && !cls) return setErr("Select your licence class");
    if (driver && !got.expiry) return setErr("Add the expiry date");
    setErr(""); setBusy(true);
    try {
      const blob = file.type.startsWith("image/") ? await shrinkImage(file, 1800) : file;
      const ext = file.type.startsWith("image/") ? "jpg" : (file.name.split(".").pop() || "pdf");
      const path = `${session.user.id}/cred-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("insurance").upload(path, blob, { contentType: file.type.startsWith("image/") ? "image/jpeg" : file.type });
      if (error) throw error;
      let backPath: string | null = null;
      if (driver && back) {
        backPath = `${session.user.id}/cred-${Date.now()}-back.jpg`;
        const up = await sb.storage.from("insurance").upload(backPath, await shrinkImage(back, 1800), { contentType: "image/jpeg" });
        if (up.error) throw up.error;
      }
      await rpc("submit_credential", { p_type: got.type_id, p_number: got.number.trim(), p_expiry: got.expiry || null, p_photo: path, p_back: backPath, p_class: driver ? cls : null });
      toast("Sent. We'll check it within a few hours."); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const inputs = <>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
    <input ref={pdf} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
    <input ref={backCam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setErr(""); setBack(f); setBackUrl(URL.createObjectURL(f)); } }} />
  </>;
  const shot = (w: number) => url ? <img className="cs-shot" src={url} alt="" style={{ width: w }} />
    : <span className="cs-doc" style={{ width: w }}>{Icon.doc("var(--emerald)")}<b>{file?.name ?? "Certificate"}</b></span>;

  if (stage === "reading") return (
    <div className="cs-read" role="dialog" aria-label="Reading your card">
      <button className="back" onClick={() => setStage("snap")} aria-label="Back">{Icon.back("#fff")}</button>
      <div className="cs-tilt">{shot(300)}{!problem && <span className="cs-scan" />}</div>
      {problem ? <div className="cs-prob">
        <span className="cam-warn">{problem}</span>
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button className="btn light" onClick={() => { setGot((g) => ({ ...g, ai: false })); setStage("check"); }}>Fill it in myself</button>
          <button className="btn primary" onClick={() => (isPdf ? pdf : camera).current?.click()}>Take it again</button>
        </div>
      </div> : <>
        <span className="cs-rd">{Icon.spark("#f5c518", 26)}Reading your {insurance ? "certificate" : "card"}</span>
        <span className="cs-sub">A few seconds</span>
      </>}
      {inputs}
    </div>
  );

  if (stage === "check") {
    const inDate = !!got.expiry && got.expiry >= today();
    return (
      <Screen title="Check it" onBack={() => setStage("snap")}>
        <div className="screen-body cs-check">
          <div className="cs-pic"><div className="cs-tilt">{shot(220)}</div></div>
          <div className="cs-fields">
            {got.ai && <span className="fill-note">{Icon.spark("#8a6d00")}Read from your {isPdf ? "file" : "photo"}</span>}
            <button className="field sel" onClick={() => setPick("type")}><span className="k">Which one</span><span className={t ? "v w4" : "v ph"}>{t?.name ?? "Select"}</span></button>
            {driver && <>
              <button className="cs-backshot" onClick={() => backCam.current?.click()}>
                {backUrl ? <img src={backUrl} alt="Back of your licence" /> : <span className="cs-noback">{Icon.camera("var(--emerald)")}</span>}
                <span><b>Back of your licence</b><small>{backUrl ? "Tap to retake" : "Take a photo of the back"}</small></span>
              </button>
              <button className="field sel" onClick={() => setPick("class")}><span className="k">Class</span><span className={cls ? "v" : "v ph"}>{LICENCE_CLASSES.find(([c]) => c === cls)?.[1] ?? "Select"}</span></button>
            </>}
            <label className="field"><span className="k">{insurance ? "Policy number" : driver ? "Licence number" : "Number"}</span>
              <input value={got.number} onChange={(e) => setGot({ ...got, number: e.target.value })} autoCapitalize="characters" /></label>
            <label className="field date-field cs-exp">
              <span className="k">Expires</span>
              <span className="row between" style={{ width: "100%" }}>
                <span className={got.expiry ? "v" : "v ph"}>{got.expiry ? dmy(got.expiry) : "DD / MM / YYYY"}</span>
                {got.expiry && (inDate ? <span className="cs-ok">{Icon.tick("var(--emerald)", 18)}In date</span> : <span className="cs-bad">Expired</span>)}
              </span>
              <input type="date" value={got.expiry} onChange={(e) => setGot({ ...got, expiry: e.target.value })} aria-label="Expires" />
            </label>
            {got.name && <div className="field"><span className="k">Name on {insurance ? "certificate" : "card"}</span>
              <span className="v row between" style={{ width: "100%" }}>{got.name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())}
                {got.name_match ? <span className="cs-ok">{Icon.tick("var(--emerald)", 18)}Matches you</span> : <span className="cs-bad">Not your name</span>}</span></div>}
            {driver ? <p className="t15 light muted" style={{ lineHeight: 1.45, margin: "4px 0 0" }}>Unlocks pick-up and delivery, moving and tip runs. It's separate from your ID check, and you can use the same licence for both.</p>
              : unlocks.length > 0 && <p className="t15 light muted" style={{ lineHeight: 1.45, margin: "4px 0 0" }}>Unlocks {unlocks.join(", ")}.</p>}
            {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
          </div>
          <div className="cs-ft">
            <button className="btn stone" onClick={() => (isPdf ? pdf : camera).current?.click()}>Retake</button>
            <button className="btn primary" disabled={busy || got.type_id == null || !file} onClick={send}>{busy ? "Sending…" : "Send for checking"}</button>
          </div>
        </div>
        {pick === "type" && <SearchPicker title="Which one" placeholder="Search" value={got.type_id != null ? [got.type_id] : []}
          options={types.map((x) => ({ id: x.id, label: x.name }))} onClose={() => setPick(false)} onChange={(v) => setGot({ ...got, type_id: Number(v[0]) })} />}
        {pick === "class" && <SearchPicker title="Licence class" value={cls ? [cls] : []}
          options={LICENCE_CLASSES.map(([id, label, hint]) => ({ id, label, hint }))} onClose={() => setPick(false)} onChange={(v) => setCls(String(v[0]))} />}
        {inputs}
      </Screen>
    );
  }

  return (
    <Screen title={t ? `Add ${lc(t.name)}` : "Add a licence"} onBack={onBack}>
      <div className="screen-body cs-snap">
        <h2>{driver ? "Snap the front of your licence" : `Snap the ${insurance ? "certificate" : "card"}`}</h2>
        <p>We read it for you.</p>
        <div className="cs-ex" aria-hidden="true">
          <i /><i /><i /><i />
          <div className="cs-card">
            <div className="h">{insurance ? "CERTIFICATE OF CURRENCY" : (t?.name ?? "Licence").toUpperCase()}</div>
            <div className="b"><span className="ph" /><span className="f"><small>Name</small><b>YOUR NAME</b><small>Number</small><b>1234567</b><small>Expires</small><b>01/01/2030</b></span></div>
          </div>
        </div>
        <div className="cs-tips">
          <span>{Icon.frame("var(--emerald)")}Whole {insurance ? "page" : "card"} in</span>
          <span>{Icon.sun("var(--emerald)")}No glare</span>
          <span>{Icon.layers("var(--emerald)")}Flat on a table</span>
        </div>
        <div className="cs-go">
          <button className="cs-take" onClick={() => camera.current?.click()}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14211c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>Take photo</button>
          <button className="btn stone cs-pdf" onClick={() => pdf.current?.click()}>{Icon.doc("var(--emerald)")}Upload a PDF instead</button>
        </div>
      </div>
      {inputs}
    </Screen>
  );
}
