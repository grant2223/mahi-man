import { useEffect, useRef, useState } from "react";
import { rpc, sb, type Profile } from "../lib/supabase";
import { useSession } from "../lib/session";
import { useArea, useHere } from "../lib/area";
import { currentPosition } from "../lib/trip";
import { DIAL_CODES, GENDERS, HEARD, NATIONALITIES, flag } from "../lib/people";
import { loadMapKit } from "./LiveMap";
import { Icon, NameFields, Screen, SearchPicker, type NameParts } from "./kit";

/* Your profile: name, date of birth, gender, nationality, suburb and how they heard about us.
   Asked at sign-up, editable under Your account. Verifying an ID is its own step. */

type P = Profile & { birth_date?: string | null; gender?: string | null; nationality?: string | null; home_suburb_id?: number | null; heard_from?: string | null };
export const profileComplete = (p: Profile | null) => {
  const x = p as P | null;
  return !!x && !!x.first_name?.trim() && !!x.last_name?.trim() && !!x.birth_date && !!x.gender && !!x.nationality && !!x.home_suburb_id && !!x.heard_from;
};

type Form = { name: NameParts; day: string; month: string; year: string; gender: string; nationality: string; suburb: number | null; heard: string;
  country: string; number: string; whatsapp: boolean };
type Sub = { id: number; name: string; area: string; state: string; lat: number; lng: number; km: number | null };
const pad = (s: string) => (s.length === 1 ? `0${s}` : s);

// The fields and the Continue/Save button. Used inside the sign-in screen and on its own screen.
export function ProfileForm({ button, onSaved }: { button: string; onSaved: () => void }) {
  const { session, profile, reload } = useSession();
  const p = profile as P | null;
  const [f, setF] = useState<Form | null>(null);
  const [subName, setSubName] = useState("");
  const [pick, setPick] = useState<"gender" | "nationality" | "suburb" | "heard" | "dial" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Start from what's saved, so editing shows their details and sign-up fills in a name Apple already gave us.
  useEffect(() => {
    if (!session || f) return;
    Promise.all([
      sb.from("profiles").select("first_name,middle_names,last_name,birth_date,gender,nationality,home_suburb_id,heard_from,suburbs:home_suburb_id(name)").eq("id", session.user.id).single(),
      sb.from("profile_contact").select("country,dial,phone,whatsapp").eq("id", session.user.id).maybeSingle(),
    ]).then(([{ data }, { data: c }]) => {
      const d = (data ?? {}) as Record<string, unknown>;
      const [y, m, dd] = String(d.birth_date ?? "").split("-");
      setSubName((d.suburbs as { name: string } | null)?.name ?? "");
      setF({ name: { first: String(d.first_name ?? ""), middle: String(d.middle_names ?? ""), last: String(d.last_name ?? "") },
        day: dd ? String(Number(dd)) : "", month: m ? String(Number(m)) : "", year: y ?? "",
        gender: String(d.gender ?? ""), nationality: String(d.nationality ?? ""), suburb: (d.home_suburb_id as number | null) ?? null, heard: String(d.heard_from ?? ""),
        country: c?.country || "AU", number: c ? String(c.phone).replace(`+${c.dial}`, "").replace(/(\d{3})(?=\d{3,})/g, "$1 ") : "", whatsapp: !!c?.whatsapp });
    });
  }, [session?.user.id, p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (!f.gender) return setErr("Select your gender, or Prefer not to say");
    if (!f.nationality) return setErr("Select your nationality");
    if (!f.suburb) return setErr("Select your suburb");
    if (!f.heard) return setErr("Tell us how you heard about us");
    const dial = DIAL_CODES.find(([c]) => c === f.country)?.[2] ?? "";
    const digits = f.number.replace(/\D/g, "").replace(/^0+/, "");
    if (digits && (digits.length < 6 || dial.length + digits.length > 15)) return setErr("Check your mobile number");
    setBusy(true);
    try {
      await rpc("save_profile", { p_first: f.name.first, p_middle: f.name.middle, p_last: f.name.last, p_birth: `${f.year}-${pad(f.month)}-${pad(f.day)}`,
        p_gender: f.gender, p_nationality: f.nationality, p_suburb: f.suburb, p_heard: f.heard });
      await rpc("save_contact", { p_country: f.country, p_dial: dial, p_number: digits, p_whatsapp: !!digits && f.whatsapp });
      await reload();
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const dc = DIAL_CODES.find(([c]) => c === f.country) ?? DIAL_CODES[0];
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
        <button className="field sel" onClick={() => setPick("gender")}><span className="k">Gender</span><span className={f.gender ? "v" : "v ph"}>{GENDERS.find(([k]) => k === f.gender)?.[1] ?? "Select"}</span></button>
        <button className="field sel" onClick={() => setPick("nationality")}><span className="k">Nationality</span><span className={f.nationality ? "v" : "v ph"}>{f.nationality || "Select"}</span></button>
        <button className="field sel" onClick={() => setPick("suburb")}><span className="k">Your suburb</span><span className={subName ? "v" : "v ph"}>{subName || "Select"}</span></button>
        <button className="field sel" onClick={() => setPick("heard")}><span className="k">Heard about us</span><span className={f.heard ? "v" : "v ph"}>{f.heard || "Select"}</span></button>
      </div>
      <h4 className="pf-h">Mobile</h4>
      <div className="pf-mob">
        <button className="field sel" onClick={() => setPick("dial")}><span className="k">Country code</span><span className="v">{flag(dc[0])} +{dc[2]}</span></button>
        <label className="field"><span className="k">Number</span><input inputMode="tel" autoComplete="tel-national" value={f.number} placeholder="412 345 678" onChange={(e) => set({ number: e.target.value.replace(/[^\d ]/g, "").slice(0, 16) })} /></label>
      </div>
      <div className="pf-wa"><WaMark /><span>On WhatsApp</span>
        <button className={f.whatsapp ? "on" : ""} role="switch" aria-checked={f.whatsapp} aria-label="On WhatsApp" onClick={() => set({ whatsapp: !f.whatsapp })}><i /></button></div>
      <span className="small light muted" style={{ display: "block", marginTop: 10 }}>You need to be 18 or over. Only the Mahi Man team sees your date of birth, gender, nationality and mobile.</span>
      {err && <p className="err">{err}</p>}
      <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy} onClick={save}>{busy ? "Saving…" : button}</button>

      {pick === "gender" && <SearchPicker title="Gender" placeholder="Search" value={[f.gender]} options={GENDERS.map(([id, label]) => ({ id, label }))} onClose={() => setPick(null)} onChange={(v) => set({ gender: String(v[0]) })} />}
      {pick === "nationality" && <SearchPicker title="Nationality" placeholder="Search nationalities" value={[f.nationality]} options={NATIONALITIES.map((n) => ({ id: n, label: n }))} onClose={() => setPick(null)} onChange={(v) => set({ nationality: String(v[0]) })} />}
      {pick === "suburb" && <SuburbPicker value={f.suburb} onClose={() => setPick(null)} onPick={(s) => { setSubName(s.name); set({ suburb: s.id }); setPick(null); }} />}
      {pick === "dial" && <SearchPicker title="Country code" placeholder="Search countries" value={[f.country]}
        options={DIAL_CODES.map(([c, n, d]) => ({ id: c, label: `${flag(c)}  ${n}`, right: `+${d}` }))} onClose={() => setPick(null)} onChange={(v) => set({ country: String(v[0]) })} />}
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

const WaMark = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a9c4a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M4 20l1.4-4A8 8 0 1 1 8 18.6z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z" fill="#1a9c4a" stroke="none" /></svg>;
const ic = (d: React.ReactNode) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{d}</svg>;
const locIcon = () => ic(<><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="2" fill="var(--emerald)" /></>);
const mapIcon = () => ic(<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>);
const near = (lat: number, lng: number) => rpc<Sub[]>("suburb_find", { p_q: null, p_lat: lat, p_lng: lng, p_limit: 1 }).then((r) => r?.[0] ?? null);

/* Your suburb, based on where they are: the phone's location, or their area if location is off.
   The list and search only show suburbs within 80 km. A search with nothing nearby shows the rest under "Further away". */
const NEAR_KM = 80;
function SuburbPicker({ value, onClose, onPick }: { value: number | null; onClose: () => void; onPick: (s: Sub) => void }) {
  const { area } = useArea();
  const phone = useHere();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Sub[] | null>(null);
  const [far, setFar] = useState(false);
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [map, setMap] = useState(false);
  const [hasMap, setHasMap] = useState(false);
  const centre = phone ?? (area ? { lat: area.lat, lng: area.lng } : { lat: -16.92, lng: 145.77 });
  useEffect(() => { loadMapKit().then((mk) => setHasMap(!!mk)); }, []);
  useEffect(() => {
    const t = q.trim();
    let live = true;
    const find = (km: number | null) => rpc<Sub[]>("suburb_find", { p_q: t || null, p_lat: centre.lat, p_lng: centre.lng, p_limit: 60, p_km: km }).then((r) => r ?? []);
    const id = window.setTimeout(async () => {
      const nearby = await find(NEAR_KM).catch(() => []);
      if (nearby.length || !t) { if (live) { setFar(false); setList(nearby); } return; }
      const rest = await find(null).catch(() => []);
      if (live) { setFar(rest.length > 0); setList(rest); }
    }, t ? 220 : 0);
    return () => { live = false; window.clearTimeout(id); };
  }, [q, centre.lat, centre.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const here = async () => {
    setNote(""); setLocating(true);
    const p = await currentPosition();
    const s = p ? await near(p.lat, p.lng).catch(() => null) : null;
    setLocating(false);
    if (s) onPick(s); else setNote("Couldn't get your location. Search for your suburb or use the map.");
  };
  const many = far || (list ? new Set(list.map((s) => s.area)).size > 1 : false);
  return (
    <Screen title="Your suburb" onBack={onClose}>
      <div style={{ background: "var(--card)" }}>
        <label className="search">{Icon.search("var(--muted)")}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suburbs" /></label>
      </div>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        {!q.trim() && (
          <div className="sp-acts hb-rows">
            <button disabled={locating} onClick={here}>{locIcon()}<span>{locating ? "Finding you…" : "Use my location"}</span></button>
            {hasMap && <button onClick={() => setMap(true)}>{mapIcon()}<span>Select on the map</span>{Icon.chevron("var(--faint)")}</button>}
          </div>
        )}
        {note && <p className="sp-note">{note}</p>}
        {far && <h4 className="sp-far">Further away</h4>}
        <div className="sp-list">
          {(list ?? []).map((s) => (
            <button key={s.id} onClick={() => onPick(s)}>
              <span><b>{s.name}</b>{many && <small>{s.area}, {s.state}</small>}</span>
              {s.id === value && Icon.tick("var(--emerald)")}
            </button>
          ))}
        </div>
        {list && list.length === 0 && <p className="sp-note">Nothing matches "{q}".</p>}
      </div>
      {map && <MapPick start={centre} onBack={() => setMap(false)} onPick={onPick} />}
    </Screen>
  );
}

// Full screen Apple map. Move it under the pin; the suburb at the pin shows at the bottom.
function MapPick({ start, onBack, onPick }: { start: { lat: number; lng: number }; onBack: () => void; onPick: (s: Sub) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const st = useRef<{ mk: any; map: any } | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const seq = useRef(0);
  const look = (lat: number, lng: number) => { const n = ++seq.current; near(lat, lng).then((s) => { if (n === seq.current) setSub(s); }).catch(() => {}); };
  useEffect(() => {
    let dead = false;
    loadMapKit().then((mk) => {
      if (dead || !mk || !box.current) return;
      const map = new mk.Map(box.current, { showsCompass: mk.FeatureVisibility.Hidden, showsMapTypeControl: false, showsZoomControl: false, showsUserLocationControl: false, isRotationEnabled: false,
        region: new mk.CoordinateRegion(new mk.Coordinate(start.lat, start.lng), new mk.CoordinateSpan(0.06, 0.06)) });
      map.addEventListener("region-change-end", () => look(map.center.latitude, map.center.longitude));
      st.current = { mk, map };
      look(start.lat, start.lng);
    });
    return () => { dead = true; st.current?.map?.destroy?.(); st.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const here = async () => {
    const p = await currentPosition();
    const s = st.current;
    if (p && s) s.map.setCenterAnimated(new s.mk.Coordinate(p.lat, p.lng));
  };
  return (
    <div className="sp-map" role="dialog" aria-label="Select on the map">
      <div className="m" ref={box} />
      <span className="pin"><svg width="44" height="56" viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29s9-9.5 9-17A9 9 0 0 0 3 12c0 7.5 9 17 9 17z" fill="#0b6b4f" /><circle cx="12" cy="12" r="3.5" fill="#fff" /></svg></span>
      <button className="fab l" onClick={onBack} aria-label="Back">{Icon.back("var(--ink)")}</button>
      <button className="fab r" onClick={here} aria-label="Use my location">{locIcon()}</button>
      <div className="bar">
        <span><small>Your suburb</small><b>{sub?.name ?? "…"}</b></span>
        <button className="btn primary" disabled={!sub} onClick={() => sub && onPick(sub)}>Select</button>
      </div>
    </div>
  );
}
