import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { avatarUrl } from "../lib/supabase";
import { initials } from "../lib/format";

/* ---------- Icons (stroke only, never boxed) ---------- */
const P = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Icon = {
  pin: (c = "currentColor") => <svg width="15" height="15" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  search: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  arrow: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  back: (c = "currentColor") => <svg width="24" height="24" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>,
  tick: (c = "currentColor", s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  chevron: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>,
  msg: (c = "currentColor") => <svg width="18" height="18" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  camera: (c = "currentColor") => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2.2" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  lock: (c = "currentColor") => <svg width="22" height="22" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
  shield: (c = "currentColor") => <svg width="24" height="24" viewBox="0 0 24 24" {...P} stroke={c} strokeWidth="2" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /></svg>,
  star: (c = "currentColor", filled = false) => <svg width="34" height="34" viewBox="0 0 24 24" fill={filled ? c : "none"} stroke={c} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>,
};

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
export function Screen({ title, onBack, children, right }: { title: string; onBack: () => void; children: ReactNode; right?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="screen" role="dialog" aria-label={title}>
      <div className="screen-head">
        <button className="back" onClick={onBack} aria-label="Back">{Icon.back()}</button>
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ---------- Searchable dropdown, full bleed ---------- */
export interface Option { id: number | string; label: string; hint?: string; disabled?: boolean }

export function SearchPicker(props: {
  title: string; options: Option[]; value: (number | string)[]; multi?: boolean;
  onClose: () => void; onChange: (v: (number | string)[]) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(props.value);
  const shown = useMemo(() => props.options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())), [q, props.options]);
  const pick = (id: number | string) => {
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
                {o.hint && <span className="small muted light">{o.hint}</span>}
              </span>
              {on && <span className="on">{Icon.tick("var(--emerald)")}</span>}
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
