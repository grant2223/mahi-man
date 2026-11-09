import { useCallback, useEffect, useState } from "react";
import { api, rpc, sb, type Category, type JobType } from "../lib/supabase";
import { useSession } from "../lib/session";
import { shrinkImage } from "../lib/format";
import { CatIcon, DateField, Icon, Screen, SearchPicker, useToast } from "../ui/kit";

/* Worker skills, experience and gear for each type of job, plus licences and certificates. */

export interface Skill { id: number; category_id: number; kind: "skill" | "gear"; name: string; credential_type_id: number | null; sort: number }
export interface CredType { id: number; name: string; short: string }
export interface MyCred { id: string; credential_type_id: number; number: string; expiry: string | null; status: "pending" | "verified" | "retake" | "rejected"; reason: string | null; created_at: string }

const EXP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
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

function useCatalog() {
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

function useMine() {
  const [mine, setMine] = useState<{ types: { job_type_id: number; years: number | null }[]; skills: number[]; creds: MyCred[] } | null>(null);
  const load = useCallback(() => {
    Promise.all([
      sb.from("worker_job_types").select("job_type_id,years"),
      sb.from("worker_skills").select("skill_id"),
      sb.from("worker_credentials").select("id,credential_type_id,number,expiry,status,reason,created_at"),
    ]).then(([t, k, c]) => setMine({
      types: (t.data ?? []) as { job_type_id: number; years: number | null }[],
      skills: (k.data ?? []).map((r) => r.skill_id as number), creds: (c.data ?? []) as MyCred[],
    }));
  }, []);
  useEffect(load, [load]);
  return { mine, load };
}

/* ---------- Jobs and skills: one row per type of job ---------- */
export function JobsAndSkills({ onBack }: { onBack: () => void }) {
  const cat = useCatalog();
  const { mine, load } = useMine();
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  if (!cat || !mine) return <Screen brand title="Jobs and skills" onBack={onBack}><div className="screen-body" /></Screen>;
  const myTypes = cat.types.filter((t) => mine.types.some((m) => m.job_type_id === t.id));
  const names = (catId: number, kind: "skill" | "gear") => cat.skills.filter((k) => k.category_id === catId && k.kind === kind && mine.skills.includes(k.id)).map((k) => k.name);
  const openType = cat.types.find((t) => t.id === open);

  return (
    <Screen brand title="Jobs and skills" onBack={onBack}>
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
                <span style={{ color: sk.length ? "var(--ink)" : "var(--emerald)", fontSize: 15 }}>{sk.length ? sk.join(", ") : "Add your skills"}</span>
                {sub && <span>{sub}</span>}
              </span>
              {Icon.chevron("var(--faint)")}
            </button>
          );
        })}
        {!myTypes.length && <p className="t17 light" style={{ padding: "20px 16px 0", margin: 0, lineHeight: 1.4 }}>Add each type of job you do. Customers see your skills on every offer.</p>}
        <div style={{ padding: 16 }}><button className="btn stone" onClick={() => setAdding(true)}>{Icon.plus("var(--ink)")} Add a type of job</button></div>
      </div>
      {adding && (
        <SearchPicker title="Add a type of job" placeholder="Search jobs" value={[]}
          options={cat.types.filter((t) => !myTypes.includes(t)).map((t) => ({ id: t.id, label: t.cat.name }))}
          onClose={() => setAdding(false)} onChange={(v) => setOpen(Number(v[0]))} />
      )}
      {openType && (
        <JobDetail type={openType} catalog={cat} mine={mine} isNew={!myTypes.includes(openType)}
          onBack={() => setOpen(null)} onSaved={() => { setOpen(null); load(); api("worker_status").catch(() => {}); }} onCredsChanged={load} />
      )}
    </Screen>
  );
}

/* ---------- One type of job: skills, experience, gear ---------- */
function JobDetail({ type, catalog, mine, isNew, onBack, onSaved, onCredsChanged }: {
  type: JobType & { cat: Category }; catalog: NonNullable<ReturnType<typeof useCatalog>>; mine: NonNullable<ReturnType<typeof useMine>["mine"]>;
  isNew: boolean; onBack: () => void; onSaved: () => void; onCredsChanged: () => void;
}) {
  const { session } = useSession();
  const toast = useToast();
  const catSkills = catalog.skills.filter((k) => k.category_id === type.cat.id);
  const [skills, setSkills] = useState<number[]>(mine.skills.filter((id) => catSkills.some((k) => k.id === id && k.kind === "skill")));
  const [gear, setGear] = useState<number[]>(mine.skills.filter((id) => catSkills.some((k) => k.id === id && k.kind === "gear")));
  const [years, setYears] = useState<number | null>(mine.types.find((m) => m.job_type_id === type.id)?.years ?? null);
  const [pick, setPick] = useState<null | "skills" | "years" | "gear">(null);
  const [addCred, setAddCred] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const creds = latestCreds(mine.creds);
  const credName = (id: number) => catalog.creds.find((c) => c.id === id);
  const nameOf = (ids: number[]) => catSkills.filter((k) => ids.includes(k.id)).map((k) => k.name).join(", ");

  async function save() {
    if (!session) return;
    if (!skills.length) return setErr("Pick at least one skill");
    if (years == null) return setErr("Pick your experience");
    setErr(""); setBusy(true);
    try {
      const uid = session.user.id;
      const catIds = catSkills.map((k) => k.id);
      let r = await sb.from("worker_job_types").upsert({ worker_id: uid, job_type_id: type.id, years }, { onConflict: "worker_id,job_type_id" });
      if (r.error) throw r.error;
      r = await sb.from("worker_skills").delete().eq("worker_id", uid).in("skill_id", catIds);
      if (r.error) throw r.error;
      r = await sb.from("worker_skills").insert([...skills, ...gear].map((id) => ({ worker_id: uid, skill_id: id })));
      if (r.error) throw r.error;
      toast("Saved"); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function stop() {
    if (!session) return;
    setBusy(true);
    await sb.from("worker_skills").delete().eq("worker_id", session.user.id).in("skill_id", catSkills.map((k) => k.id));
    await sb.from("worker_job_types").delete().eq("worker_id", session.user.id).eq("job_type_id", type.id);
    setBusy(false); toast(`Removed ${type.cat.name.toLowerCase()}`); onSaved();
  }

  return (
    <Screen brand title={type.cat.name} onBack={onBack} right={<button className="btn primary small" disabled={busy} onClick={save}>Save</button>}>
      <div className="screen-body" style={{ padding: 16 }}>
        <div className="stack">
          <button className="field sel" onClick={() => setPick("skills")}><span className="k">Skills</span><span className={skills.length ? "v w4" : "v ph"}>{skills.length ? nameOf(skills) : "Pick your skills"}</span></button>
          <button className="field sel" onClick={() => setPick("years")}><span className="k">Experience</span><span className={years != null ? "v w4" : "v ph"}>{years != null ? expLabel(years) : "How long you've done it"}</span></button>
          <button className="field sel" onClick={() => setPick("gear")}><span className="k">Gear you bring</span><span className={gear.length ? "v w4" : "v ph"}>{gear.length ? nameOf(gear) : "None"}</span></button>
        </div>
        {err && <p className="err">{err}</p>}
        <p className="t15 light muted" style={{ lineHeight: 1.45 }}>Customers see this on your offers for {type.cat.name.toLowerCase()} jobs.</p>
        {!isNew && <button className="link quiet" style={{ padding: 0 }} disabled={busy} onClick={stop}>Stop doing {type.cat.name.toLowerCase()} jobs</button>}
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
      {pick === "years" && (
        <SearchPicker title="Experience" placeholder="Search" value={years != null ? [years] : []}
          options={EXP.map((y) => ({ id: y, label: expLabel(y) }))} onClose={() => setPick(null)} onChange={(v) => setYears(Number(v[0]))} />
      )}
      {pick === "gear" && (
        <SearchPicker title="Gear you bring" multi placeholder="Search gear" value={gear}
          options={catSkills.filter((k) => k.kind === "gear").map((k) => ({ id: k.id, label: k.name }))}
          onClose={() => setPick(null)} onChange={(v) => setGear(v.map(Number))} />
      )}
      {addCred != null && <AddCredential types={catalog.creds} initial={addCred} onBack={() => setAddCred(null)} onSaved={() => { setAddCred(null); onCredsChanged(); }} />}
    </Screen>
  );
}

/* ---------- Licences and certificates ---------- */
export function Credentials({ onBack }: { onBack: () => void }) {
  const cat = useCatalog();
  const { mine, load } = useMine();
  const [add, setAdd] = useState<number | "new" | null>(null);
  if (!cat || !mine) return <Screen brand title="Licences and certificates" onBack={onBack}><div className="screen-body" /></Screen>;
  const latest = [...latestCreds(mine.creds).values()];
  const status = (c: MyCred) => {
    if (c.status === "verified") return c.expiry && c.expiry < today() ? { t: `Expired ${dmy(c.expiry)}. Tap to add the new one`, ok: false } : { t: `Verified${c.expiry ? `, until ${dmy(c.expiry)}` : ""}`, ok: true };
    if (c.status === "pending") return { t: "Being checked, usually within a few hours", ok: false };
    if (c.status === "retake") return { t: `Retake needed: ${c.reason ?? "photo wasn't clear"}`, ok: false };
    return { t: `Not approved: ${c.reason ?? "tap to send it again"}`, ok: false };
  };
  return (
    <Screen brand title="Licences and certificates" onBack={onBack}>
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
        {latest.length > 0 && <p className="t15 light muted" style={{ padding: "0 16px", margin: 0, lineHeight: 1.45 }}>Customers see each verified one on your offers. We remind you 30 days before one runs out.</p>}
      </div>
      {add != null && <AddCredential types={cat.creds} initial={add === "new" ? null : add} onBack={() => setAdd(null)} onSaved={() => { setAdd(null); load(); }} />}
    </Screen>
  );
}

function AddCredential({ types, initial, onBack, onSaved }: { types: CredType[]; initial: number | null; onBack: () => void; onSaved: () => void }) {
  const { session } = useSession();
  const toast = useToast();
  const [type, setType] = useState<number | null>(initial);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [unlocks, setUnlocks] = useState<string[]>([]);
  useEffect(() => {
    setUnlocks([]);
    if (type == null) return;
    sb.from("skills").select("name, cat:categories(name)").eq("credential_type_id", type).eq("active", true)
      .then(({ data }) => setUnlocks(((data ?? []) as unknown as { name: string; cat: { name: string } | null }[]).map((r) => r.cat ? `${r.name.toLowerCase()} in ${r.cat.name}` : r.name.toLowerCase())));
  }, [type]);
  const t = types.find((x) => x.id === type);
  const insurance = t?.name === "Public liability insurance";

  async function send() {
    if (!session || type == null || !file) return;
    if (expiry && expiry < today()) return setErr("That one has expired");
    setErr(""); setBusy(true);
    try {
      const blob = file.type.startsWith("image/") ? await shrinkImage(file, 1800) : file;
      const ext = file.type.startsWith("image/") ? "jpg" : (file.name.split(".").pop() || "pdf");
      const path = `${session.user.id}/cred-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("insurance").upload(path, blob, { contentType: file.type.startsWith("image/") ? "image/jpeg" : file.type });
      if (error) throw error;
      await rpc("submit_credential", { p_type: type, p_number: number, p_expiry: expiry || null, p_photo: path });
      toast("Sent. We'll check it within a few hours."); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <Screen brand title={t ? `Add ${lc(t.name)}` : "Add a licence or certificate"} onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <div className="stack">
          <button className="field sel" onClick={() => setPick(true)}><span className="k">Which one</span><span className={t ? "v w4" : "v ph"}>{t?.name ?? "Pick one"}</span></button>
          <label className="field"><span className="k">{insurance ? "Policy number" : "Number"}</span><input value={number} onChange={(e) => setNumber(e.target.value)} autoCapitalize="characters" /></label>
          <DateField label="Expiry date, if it has one" value={expiry} onChange={setExpiry} min={today()} />
          <label className="field" style={{ cursor: "pointer" }}>
            <span className="k">{insurance ? "Certificate of currency" : "Photo of the card"}</span>
            <span className={file ? "v w4" : "v ph"}>{file?.name ? (file.type.startsWith("image/") ? "Photo added" : file.name) : "Take or choose a photo"}</span>
            <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        {unlocks.length > 0 && <p className="t15 light muted" style={{ lineHeight: 1.45 }}>Unlocks {unlocks.join(", ")}.</p>}
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn primary" disabled={busy || type == null || !file} onClick={send}>{busy ? "Sending…" : "Send for checking"}</button>
        </div>
      </div>
      {pick && <SearchPicker title="Which one" placeholder="Search" value={type != null ? [type] : []}
        options={types.map((x) => ({ id: x.id, label: x.name }))} onClose={() => setPick(false)} onChange={(v) => setType(Number(v[0]))} />}
    </Screen>
  );
}
