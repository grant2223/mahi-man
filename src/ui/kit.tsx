import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { avatarUrl } from "../lib/supabase";
import { initials } from "../lib/format";

/* ---------- Icons (stroke only, never boxed) ---------- */
const P = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/* ---------- Category icons (white line icons for the emerald tiles) ---------- */
const CAT: Record<string, ReactNode> = {
  cleaning: <><path d="M8 9h6l1 3v9H7v-9z" /><path d="M9 9V6h4l3-2v5" /><path d="M16 6h3M18 3.5l1.5-1M18 8.5l1.5 1" /><path d="M7 15h8" /></>,
  garden: <><path d="M12 21v-9" /><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z" /><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" /><path d="M5 21h14" /></>,
  moving: <><path d="M2 7h11v10H2z" /><path d="M13 10h4l3 3.5V17h-7" /><circle cx="6" cy="18" r="1.8" /><circle cx="16.5" cy="18" r="1.8" /></>,
  assembly: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
  handyman: <><path d="M9.5 7.5L13 4l2 .5 4.5 4.5-2 2-1.5-1.5-3 3z" /><path d="M12.5 11L4.5 19a1.5 1.5 0 0 0 2 2l8-8" /></>,
  pets: <><ellipse cx="12" cy="16" rx="4.5" ry="3.8" /><circle cx="6" cy="10.5" r="1.8" /><circle cx="9.5" cy="6.5" r="1.8" /><circle cx="14.5" cy="6.5" r="1.8" /><circle cx="18" cy="10.5" r="1.8" /></>,
  errands: <><path d="M5 8h14l-1 13H6z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></>,
  delivery: <><path d="M3 7.5l9-4 9 4v9l-9 4-9-4z" /><path d="M3 7.5l9 4 9-4" /><path d="M12 11.5v9" /><path d="M7.5 5.5l9 4" /></>,
  car: <><path d="M3 16v-4l2.5-5h13L21 12v4z" /><path d="M3 12h18" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></>,
  pool: <><path d="M8 15V4.5a1.5 1.5 0 0 1 3 0M16 15V4.5a1.5 1.5 0 0 0-3 0" /><path d="M8 8h8M8 12h8" /><path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /><path d="M2 21.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /></>,
  rubbish: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>,
  maintenance: <><path d="M3 6h18v7H3z" /><path d="M6 10h12" /><path d="M7 17c0 1.5-1 2-1 3M12 17c0 1.5-1 2-1 3M17 17c0 1.5-1 2-1 3" /></>,
  events: <><path d="M7 3h10l-1 7a4 4 0 0 1-8 0z" /><path d="M12 14v7M8.5 21h7" /><path d="M7.5 7h9" /></>,
  kids: <><path d="M4 4h7v7H4zM13 13h7v7h-7z" /><path d="M16.5 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM4 20l3.5-7 3.5 7z" /></>,
  tech: <><path d="M4 5h16v11H4z" /><path d="M2 19h20" /><path d="M10 16v3M14 16v3" /></>,
  other: <><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /><path d="M19 17v4M17 19h4" /></>,
};
export function CatIcon({ name, size = 32, color = "#fff" }: { name: string | null | undefined; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...P} stroke={color} strokeWidth="1.8" aria-hidden="true">{CAT[name ?? "other"] ?? CAT.other}</svg>;
}
export const Icon = {
  pin: (c = "currentColor") => <svg width="15" height="15" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  search: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  arrow: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  back: (c = "currentColor") => <svg width="24" height="24" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>,
  tick: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  chevron: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>,
  msg: (c = "currentColor") => <svg width="18" height="18" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  repeat: (c = "currentColor", s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>,
  camera: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  lock: (c = "currentColor") => <svg width="22" height="22" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
  shield: (c = "currentColor") => <svg width="24" height="24" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /></svg>,
  mic: (c = "currentColor", s = 26) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  video: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="1" /><path d="M16 10.5l5-3v9l-5-3z" /></svg>,
  play: (c = "#fff") => <svg width="10" height="10" viewBox="0 0 24 24" fill={c} aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>,
  card: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="1.8" aria-hidden="true" style={{ flexShrink: 0 }}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></svg>,
  clockLine: (c = "currentColor") => <svg width="22" height="22" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="1.8" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  lockLine: (c = "currentColor") => <svg width="22" height="22" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="1.8" aria-hidden="true" style={{ flexShrink: 0 }}><rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  filter: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  down: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>,
  plus: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  x: (c = "currentColor", s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  cross: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M7 7l10 10M17 7L7 17" /></svg>,
  spark: (c = "currentColor", s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></svg>,
  doc: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>,
  frame: (c = "currentColor", s = 30) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg>,
  sun: (c = "currentColor", s = 30) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>,
  layers: (c = "currentColor", s = 30) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M3 15l9 4 9-4" /><path d="M3 11l9 4 9-4-9-4z" /></svg>,
  shieldTick: (c = "currentColor", s = 16, w = 2.4) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth={w} aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
  idcard: (c = "currentColor") => <svg width="34" height="34" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="9" cy="11" r="2.3" /><path d="M5.8 16c.7-1.6 1.8-2.4 3.2-2.4s2.5.8 3.2 2.4M14.5 10h4M14.5 13h3" /></svg>,
  face: (c = "currentColor") => <svg width="34" height="34" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="10" r="4" /><path d="M5 20c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" /></svg>,
  clock: (c = "currentColor", s = 72) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  flag: (c = "currentColor") => <svg width="18" height="18" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M5 21V4h12l-2 4 2 4H5" /></svg>,
  star: (c = "currentColor", filled = false) => <svg width="34" height="34" viewBox="0 0 24 24" fill={filled ? c : "none"} stroke={c} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>,
  share: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 11v8.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V11" /></svg>,
  info: (c = "currentColor", s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>,
  help: (c = "currentColor", s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" /></svg>,
  person: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>,
  cancel: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>,
  bell: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" /></svg>,
  warn: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></svg>,
  home: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M3.5 10.5L12 3.5l8.5 7M5.5 9v11h13V9M10 20v-6h4v6" /></svg>,
};

/* ---------- Loading: a spinning ring, shown wherever a page is still fetching ---------- */
export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="loading" role="status" aria-label={label}><span className="spinner" /></div>;
}

/* ---------- Brand mark: house and tick ---------- */
// The Mahi Man mark: his head, as drawn on the mascot. `w` is its height in the header.
export function Logo({ w = 40 }: { w?: number; light?: boolean }) {
  return <img className="logo-mark" src="/mahi-head.png" width={w} height={w} alt="" aria-hidden="true" />;
}

/* ---------- Step header used by every booking and ID step ---------- */
export function StepHero({ step, of, title, sub, onBack }: { step?: number; of?: number; title: string; sub?: string; onBack?: () => void }) {
  return (
    <section className="step-hero">
      <div className="top">
        {onBack ? <button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button> : <span />}
        {step && of ? <span className="count">Step {step} of {of}</span> : null}
      </div>
      {step && of ? (
        <div className="bars" style={{ gridTemplateColumns: `repeat(${of}, minmax(0, 1fr))` }}>
          {Array.from({ length: of }, (_, i) => <span key={i} className={i < step ? "on" : ""} />)}
        </div>
      ) : null}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </section>
  );
}

/* ---------- Ticket pieces ---------- */
export const Perf = () => <div className="perf"><i /></div>;

export function Tile({ name, photo, size = 56 }: { name: string; photo?: string | null; size?: number }) {
  const url = avatarUrl(photo);
  return (
    <span className="tile" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}

/* ---------- Full-bleed screen (every menu, picker and sheet) ---------- */
// Every full-screen page has the emerald brand header. Emergency is red so it stands out; reports use dark ink.
export function Screen({ title, onBack, children, right, tone = "brand" }: { title: string; onBack: () => void; children: ReactNode; right?: ReactNode; brand?: boolean; tone?: "brand" | "danger" | "ink" }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="screen" role="dialog" aria-label={title}>
      <div className={`screen-head brand ${tone}`}>
        <button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ---------- Date field: looks like every other field, opens the phone's date wheel ---------- */
export function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const shown = value ? new Date(`${value}T00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <label className="field date-field">
      <span className="row between" style={{ width: "100%" }}>
        <span className="stack" style={{ gap: 2 }}><span className="k">{label}</span><span className={shown ? "v" : "v ph"}>{shown || "DD / MM / YYYY"}</span></span>
        {Icon.down()}
      </span>
      <input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  );
}

/* ---------- Searchable dropdown, full bleed ---------- */
export interface Option { id: number | string; label: string; hint?: string; disabled?: boolean; right?: string; action?: () => void }

export function SearchPicker(props: {
  title: string; options: Option[]; value: (number | string)[]; multi?: boolean;
  onClose: () => void; onChange: (v: (number | string)[]) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(props.value);
  // Action rows (like "Not in Cairns?") stay visible while searching, so there's always a way out.
  const shown = useMemo(() => props.options.filter((o) => o.action || o.label.toLowerCase().includes(q.trim().toLowerCase())), [q, props.options]);
  const pick = (id: number | string) => {
    const opt = props.options.find((o) => o.id === id);
    if (opt?.action) { opt.action(); return; }
    if (!props.multi) { props.onChange([id]); props.onClose(); return; }
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  return (
    <Screen title={props.title} onBack={props.onClose}
      right={props.multi ? <button className="btn primary small" onClick={() => { props.onChange(sel); props.onClose(); }}>Save</button> : undefined}>
      <div style={{ background: "var(--card)" }}>
        <label className="search">
          {Icon.search("var(--muted)")}
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={props.placeholder ?? "Search"} />
        </label>
      </div>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        {shown.map((o) => {
          const on = (props.multi ? sel : props.value).includes(o.id);
          return (
            <button key={o.id} className="opt" disabled={o.disabled} onClick={() => pick(o.id)} style={o.disabled ? { opacity: 0.45 } : undefined}>
              <span className="stack" style={{ gap: 2 }}>
                <b>{o.label}</b>
                {o.hint && <span className={o.action ? "small em" : "small muted light"}>{o.hint}</span>}
              </span>
              <span className="row" style={{ gap: 14 }}>
                {o.right !== undefined && <span className="t15 light muted">{o.right}</span>}
                <span className="on" style={{ width: 22, display: "flex" }}>{on && Icon.tick("var(--emerald)")}</span>
              </span>
            </button>
          );
        })}
        {shown.length === 0 && <p className="muted" style={{ padding: 20 }}>Nothing matches "{q}".</p>}
      </div>
    </Screen>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Hooks ---------- */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [ms]);
  return now;
}

export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-label={`${n} stars`} style={{ background: "none", border: 0, padding: 2, cursor: "pointer" }}>
          {Icon.star(n <= value ? "var(--emerald)" : "var(--faint)", n <= value)}
        </button>
      ))}
    </div>
  );
}

/* ---------- Name: first, middle and last, never one free-text box ---------- */
export interface NameParts { first: string; middle: string; last: string }
export const emptyName: NameParts = { first: "", middle: "", last: "" };
export const nameError = (n: NameParts) => (!n.first.trim() ? "Add your first name" : !n.last.trim() ? "Add your last name" : "");
export const nameRow = (n: NameParts) => ({ first_name: n.first.trim(), middle_names: n.middle.trim() || null, last_name: n.last.trim() });

export function NameFields({ value, onChange }: { value: NameParts; onChange: (n: NameParts) => void }) {
  return (
    <div className="stack">
      <label className="field"><span className="k">First Name</span>
        <input value={value.first} onChange={(e) => onChange({ ...value, first: e.target.value })} autoComplete="given-name" autoCapitalize="words" /></label>
      <label className="field"><span className="k">Middle Names</span>
        <input value={value.middle} onChange={(e) => onChange({ ...value, middle: e.target.value })} autoComplete="additional-name" autoCapitalize="words" /></label>
      <label className="field"><span className="k">Last Name</span>
        <input value={value.last} onChange={(e) => onChange({ ...value, last: e.target.value })} autoComplete="family-name" autoCapitalize="words" /></label>
      <span className="small light muted">As it appears on your passport or ID.</span>
    </div>
  );
}
