import { useEffect, useMemo, useState } from "react";
import { rpc, sb, type Profile } from "../lib/supabase";
import { useSession } from "../lib/session";
import { GENDERS, HEARD, NATIONALITIES } from "../lib/people";
import { NameFields, Screen, SearchPicker, type NameParts } from "./kit";

/* Your profile: name, date of birth, gender, nationality, suburb and how they heard about us.
   Asked at sign-up, editable under Your account. Verifying an ID is its own step. */

type P = Profile & { birth_date?: string | null; gender?: string | null; nationality?: string | null; home_suburb_id?: number | null; heard_from?: string | null };
export const profileComplete = (p: Profile | null) => {
  const x = p as P | null;
  return !!x && !!x.first_name?.trim() && !!x.last_name?.trim() && !!x.birth_date && !!x.gender && !!x.nationality && !!x.home_suburb_id && !!x.heard_from;
};

type Form = { name: NameParts; day: string; month: string; year: string; gender: string; nationality: string; suburb: number | null; heard: string };
const pad = (s: string) => (s.length === 1 ? `0${s}` : s);

// The fields and the Continue/Save button. Used inside the sign-in screen and on its own screen.
export function ProfileForm({ button, onSaved }: { button: string; onSaved: () => void }) {
  const { session, profile, reload } = useSession();
  const p = profile as P | null;
  const [f, setF] = useState<Form | null>(null);
  const [suburbs, setSuburbs] = useState<{ id: number; name: string; area: string }[]>([]);
  const [pick, setPick] = useState<"gender" | "nationality" | "suburb" | "heard" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    sb.from("suburbs").select("id,name,areas(name,active)").order("name").then(({ data }) =>
      setSuburbs(((data ?? []) as unknown as { id: number; name: string; areas: { name: string; active: boolean } | null }[])
        .filter((s) => s.areas?.active !== false).map((s) => ({ id: s.id, name: s.name, area: s.areas?.name ?? "" }))));
  }, []);
  // Start from what's saved, so editing shows their details and sign-up fills in a name Apple already gave us.
  useEffect(() => {
    if (!session || f) return;
    sb.from("profiles").select("first_name,middle_names,last_name,birth_date,gender,nationality,home_suburb_id,heard_from").eq("id", session.user.id).single().then(({ data }) => {
      const d = (data ?? {}) as Record<string, string | number | null>;
      const [y, m, dd] = String(d.birth_date ?? "").split("-");
      setF({ name: { first: String(d.first_name ?? ""), middle: String(d.middle_names ?? ""), last: String(d.last_name ?? "") },
        day: dd ? String(Number(dd)) : "", month: m ? String(Number(m)) : "", year: y ?? "",
        gender: String(d.gender ?? ""), nationality: String(d.nationality ?? ""), suburb: (d.home_suburb_id as number | null) ?? null, heard: String(d.heard_from ?? "") });
    });
  }, [session?.user.id, p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const multiArea = useMemo(() => new Set(suburbs.map((s) => s.area)).size > 1, [suburbs]);
  if (!f) return null;
  const set = (x: Partial<Form>) => { setErr(""); setF({ ...f, ...x }); };
  const num = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
  const save = async () => {
    setErr("");
    if (!f.name.first.trim()) return setErr("Add your first name");
    if (!f.name.last.trim()) return setErr("Add your last name");
    const d = Number(f.day), m = Number(f.month), y = Number(f.year);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (!d || !m || f.year.length !== 4 || dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1) return setErr("Check your date of birth");
    if (!f.gender) return setErr("Pick your gender, or Prefer not to say");
    if (!f.nationality) return setErr("Pick your nationality");
    if (!f.suburb) return setErr("Pick your suburb");
    if (!f.heard) return setErr("Tell us how you heard about us");
    setBusy(true);
    try {
      await rpc("save_profile", { p_first: f.name.first, p_middle: f.name.middle, p_last: f.name.last, p_birth: `${f.year}-${pad(f.month)}-${pad(f.day)}`,
        p_gender: f.gender, p_nationality: f.nationality, p_suburb: f.suburb, p_heard: f.heard });
      await reload();
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const sub = suburbs.find((s) => s.id === f.suburb);
  return (
    <>
      <NameFields value={f.name} onChange={(name) => set({ name })} />
      <h4 className="pf-h">Date of birth</h4>
      <div className="pf-dob">
        <label className="field"><span className="k">Day</span><input inputMode="numeric" value={f.day} placeholder="DD" onChange={(e) => set({ day: num(e.target.value, 2) })} /></label>
        <label className="field"><span className="k">Month</span><input inputMode="numeric" value={f.month} placeholder="MM" onChange={(e) => set({ month: num(e.target.value, 2) })} /></label>
        <label className="field"><span className="k">Year</span><input inputMode="numeric" value={f.year} placeholder="YYYY" onChange={(e) => set({ year: num(e.target.value, 4) })} /></label>
      </div>
      <h4 className="pf-h">About you</h4>
      <div className="pf-grid">
        <button className="field sel" onClick={() => setPick("gender")}><span className="k">Gender</span><span className={f.gender ? "v" : "v ph"}>{GENDERS.find(([k]) => k === f.gender)?.[1] ?? "Pick"}</span></button>
        <button className="field sel" onClick={() => setPick("nationality")}><span className="k">Nationality</span><span className={f.nationality ? "v" : "v ph"}>{f.nationality || "Pick"}</span></button>
        <button className="field sel" onClick={() => setPick("suburb")}><span className="k">Your suburb</span><span className={sub ? "v" : "v ph"}>{sub?.name ?? "Pick"}</span></button>
        <button className="field sel" onClick={() => setPick("heard")}><span className="k">Heard about us</span><span className={f.heard ? "v" : "v ph"}>{f.heard || "Pick"}</span></button>
      </div>
      <span className="small light muted" style={{ display: "block", marginTop: 10 }}>You need to be 18 or over. Only the Mahi Man team sees your date of birth, gender and nationality.</span>
      {err && <p className="err">{err}</p>}
      <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy} onClick={save}>{busy ? "Saving…" : button}</button>

      {pick === "gender" && <SearchPicker title="Gender" placeholder="Search" value={[f.gender]} options={GENDERS.map(([id, label]) => ({ id, label }))} onClose={() => setPick(null)} onChange={(v) => set({ gender: String(v[0]) })} />}
      {pick === "nationality" && <SearchPicker title="Nationality" placeholder="Search nationalities" value={[f.nationality]} options={NATIONALITIES.map((n) => ({ id: n, label: n }))} onClose={() => setPick(null)} onChange={(v) => set({ nationality: String(v[0]) })} />}
      {pick === "suburb" && <SearchPicker title="Your suburb" placeholder="Search suburbs" value={f.suburb ? [f.suburb] : []}
        options={suburbs.map((s) => ({ id: s.id, label: s.name, hint: multiArea ? s.area : undefined }))} onClose={() => setPick(null)} onChange={(v) => set({ suburb: Number(v[0]) })} />}
      {pick === "heard" && <SearchPicker title="How did you hear about us?" placeholder="Search" value={[f.heard]} options={HEARD.map((h) => ({ id: h, label: h }))} onClose={() => setPick(null)} onChange={(v) => set({ heard: String(v[0]) })} />}
    </>
  );
}

// Its own full screen: finishing a profile from before these details were asked, or editing it from Your account.
export function ProfileScreen({ mode, onDone, onBack }: { mode: "finish" | "edit"; onDone: () => void; onBack?: () => void }) {
  return (
    <Screen title="Your profile" onBack={onBack ?? (() => {})}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        <p className="t17 light" style={{ margin: "0 0 20px", lineHeight: 1.4 }}>{mode === "finish" ? "A few details to finish your profile. It only takes a minute." : "So people know who they're dealing with."}</p>
        <ProfileForm button={mode === "finish" ? "Continue" : "Save"} onSaved={onDone} />
      </div>
    </Screen>
  );
}
