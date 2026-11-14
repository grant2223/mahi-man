import { type ReactNode, useEffect, useMemo, useState } from "react";
import { avatarUrl, rpc } from "../lib/supabase";
import { Icon, Screen, SearchPicker, useToast } from "../ui/kit";

/* Users: who downloaded the app, who signed up, what they use and who they are.
   The period and what it's compared to sit at the top of every tab, the way Stripe's dashboard does it. */

// ---------- Periods (Cairns time, which has no daylight saving) ----------
const OFF = 10 * 3600000;
const local = (d: Date) => new Date(d.getTime() + OFF); // read with getUTC*
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - OFF);
export type Range = { from: Date; to: Date };
export type PeriodId = "today" | "yesterday" | "week" | "lastweek" | "30d" | "month" | "lastmonth" | "quarter" | "lastquarter" | "6m" | "year" | "lastyear" | "all" | "custom";
export const PERIODS: [PeriodId, string][] = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["lastweek", "Last week"], ["30d", "Last 30 days"], ["month", "This month"], ["lastmonth", "Last month"],
  ["quarter", "This quarter"], ["lastquarter", "Last quarter"], ["6m", "Last 6 months"], ["year", "This year"], ["lastyear", "Last year"], ["all", "All time"],
];
export function rangeOf(p: PeriodId, custom?: Range): Range {
  const n = local(new Date()), y = n.getUTCFullYear(), m = n.getUTCMonth(), d = n.getUTCDate();
  const dow = (n.getUTCDay() + 6) % 7, q = Math.floor(m / 3) * 3;
  switch (p) {
    case "today": return { from: at(y, m, d), to: at(y, m, d + 1) };
    case "yesterday": return { from: at(y, m, d - 1), to: at(y, m, d) };
    case "week": return { from: at(y, m, d - dow), to: at(y, m, d - dow + 7) };
    case "lastweek": return { from: at(y, m, d - dow - 7), to: at(y, m, d - dow) };
    case "30d": return { from: at(y, m, d - 29), to: at(y, m, d + 1) };
    case "month": return { from: at(y, m, 1), to: at(y, m + 1, 1) };
    case "lastmonth": return { from: at(y, m - 1, 1), to: at(y, m, 1) };
    case "quarter": return { from: at(y, q, 1), to: at(y, q + 3, 1) };
    case "lastquarter": return { from: at(y, q - 3, 1), to: at(y, q, 1) };
    case "6m": return { from: at(y, m - 6, d + 1), to: at(y, m, d + 1) };
    case "year": return { from: at(y, 0, 1), to: at(y + 1, 0, 1) };
    case "lastyear": return { from: at(y - 1, 0, 1), to: at(y, 0, 1) };
    case "all": return { from: at(2026, 0, 1), to: at(y, m, d + 1) };
    case "custom": return custom ?? { from: at(y, m, d), to: at(y, m, d + 1) };
  }
}
export type CompareId = "prev" | "lastyear" | "none";
export const COMPARES: [CompareId, string][] = [["prev", "The period before"], ["lastyear", "Same period last year"], ["none", "Nothing"]];
const shiftMonths = (dt: Date, k: number) => { const l = local(dt); return at(l.getUTCFullYear(), l.getUTCMonth() + k, l.getUTCDate()); };
export function compareOf(p: PeriodId, r: Range, c: CompareId): Range | null {
  if (c === "none" || p === "all") return null;
  if (c === "lastyear") return { from: shiftMonths(r.from, -12), to: shiftMonths(r.to, -12) };
  const monthly: Partial<Record<PeriodId, number>> = { month: 1, lastmonth: 1, quarter: 3, lastquarter: 3, "6m": 6, year: 12, lastyear: 12 };
  const k = monthly[p];
  if (k) return { from: shiftMonths(r.from, -k), to: r.from };
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: r.from };
}
const dmy = (dt: Date, year = false) => local(dt).toLocaleDateString("en-AU", { timeZone: "UTC", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
export function rangeLabel(r: Range) {
  const end = new Date(r.to.getTime() - 1);
  const sameDay = local(r.from).toISOString().slice(0, 10) === local(end).toISOString().slice(0, 10);
  const yr = local(r.from).getUTCFullYear() !== local(new Date()).getUTCFullYear();
  return sameDay ? dmy(r.from, yr) : `${dmy(r.from, yr)} – ${dmy(end, yr)}`;
}

// ---------- Small pieces ----------
export const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-AU"));
export function Delta({ cur, prev, pct, good = "up" }: { cur: number | null; prev: number | null | undefined; pct?: boolean; good?: "up" | "down" }) {
  if (prev === undefined) return null;
  if (cur == null || prev == null) return <span className="mu-dl">No earlier figure</span>;
  const diff = pct ? cur - prev : prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
  const vs = pct ? `${prev}%` : fmt(prev);
  if (diff == null) return <span className="mu-dl">vs {vs}</span>;
  const ok = diff === 0 || (diff > 0) === (good === "up");
  return <span className="mu-dl"><b className={ok ? "up" : "down"}>{diff >= 0 ? "▲" : "▼"} {Math.abs(diff)}{pct ? " pts" : "%"}</b> vs {vs}</span>;
}
type Row = { l: string; n: number };
export function BarList({ rows, empty = "Nothing yet" }: { rows: Row[]; empty?: string }) {
  const shown = rows.filter((r) => r.n > 0);
  const tot = shown.reduce((a, r) => a + r.n, 0), max = Math.max(1, ...shown.map((r) => r.n));
  if (!shown.length) return <p className="mu-none">{empty}</p>;
  return (
    <div className="mu-bars">
      {shown.map((r) => (
        <div key={r.l} className="mu-bar">
          <span className="l">{r.l}</span><span className="track"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <span className="n">{r.n}</span><span className="p">{Math.round((r.n / tot) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="ov-period">{options.map(([k, l]) => <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
const hourLbl = (h: number) => (h === 0 ? "12am" : h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`);
function bucketLbl(iso: string, b: string) {
  const l = local(new Date(iso));
  if (b === "hour") return hourLbl(l.getUTCHours());
  if (b === "month") return l.toLocaleDateString("en-AU", { timeZone: "UTC", month: "short", year: "2-digit" });
  return l.toLocaleDateString("en-AU", { timeZone: "UTC", day: "numeric", month: "short" });
}
const niceTop = (v: number) => { if (v <= 4) return 4; if (v <= 10) return Math.ceil(v / 2) * 2; const p = 10 ** Math.floor(Math.log10(v)); const t = Math.ceil(v / p) * p; return t % 2 ? t + p : t; };
const ticks = (n: number, k = 5) => (n <= k ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1))));

// ---------- Data ----------
type Kpis = { signups: number; signups_c: number; signups_w: number; opened: number; most_days: number | null; booked: number; repeat: number | null;
  took: number; approved: number; online_hours: number; online_workers: number; stopped: number };
type Report = {
  bucket: string; growth_bucket: string;
  now: { online: number; approved: number; in_app: number; waiting: number; longest: number | null; today_c: number; today_w: number };
  cur: Kpis; cmp: Kpis | null; series: { at: string; c: number; w: number }[]; series_cmp: number[]; growth: { at: string; c: number; w: number }[];
  funnel: { opened: number; ios: number; android: number; signed: number; complete: number; used: number };
};
type Usage = { skills: Row[]; suburbs: Row[]; heat: { d: number; h: number; n: number }[]; by_hour: { h: number; jobs: number; workers: number }[] };
type Who = { total: number; age: Row[]; gender: Row[]; nationality: Row[]; city: Row[]; suburb: Row[]; heard: Row[]; phone: Row[]; back: Row[] };
export interface UserRow { id: string; email: string; full_name: string; photo_path: string | null; is_worker: boolean; id_status: string; suspended: boolean;
  created_at: string; abn: string | null; approved: boolean; jobs_posted: number; jobs_worked: number; online: boolean; platform: string | null;
  suburb: string | null; city: string | null; age_band: string | null; gender: string | null; nationality: string | null; heard_from: string | null; last_open: string | null }

// ---------- Page ----------
type Tab = "summary" | "usage" | "who" | "all";
export function UsersPage({ detail }: { detail: (row: UserRow, back: () => void, reload: () => void) => ReactNode }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("summary");
  const [period, setPeriod] = useState<PeriodId>("month");
  const [custom, setCustom] = useState<Range | undefined>();
  const [cmpId, setCmpId] = useState<CompareId>("prev");
  const [pick, setPick] = useState<"period" | "compare" | "dates" | null>(null);
  const range = useMemo(() => rangeOf(period, custom), [period, custom]);
  const cmp = useMemo(() => compareOf(period, range, cmpId), [period, range, cmpId]);
  const [rep, setRep] = useState<Report | null>(null);
  useEffect(() => {
    setRep(null);
    rpc<Report>("admin_users_report", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_cfrom: cmp?.from.toISOString() ?? null, p_cto: cmp?.to.toISOString() ?? null })
      .then(setRep).catch((e) => toast((e as Error).message));
  }, [range, cmp, toast]);
  const pLabel = period === "custom" ? "Custom dates" : PERIODS.find(([k]) => k === period)![1];
  return (
    <div className="ov">
      <div className="ov-top"><h1>Users</h1>
        {tab !== "all" && <div className="mu-when">
          <button className="mu-drop" onClick={() => setPick("period")}><span className="k">Showing</span><span className="v">{pLabel} · {rangeLabel(range)}</span></button>
          {tab !== "who" && <button className="mu-drop" onClick={() => setPick("compare")} disabled={period === "all"}><span className="k">Compared to</span>
            <span className="v">{cmp ? `${COMPARES.find(([k]) => k === cmpId)![1]} · ${rangeLabel(cmp)}` : "Nothing"}</span></button>}
        </div>}
      </div>
      <div className="mu-tabs">
        {([["summary", "Summary"], ["usage", "Usage"], ["who", "Who they are"], ["all", "Everyone"]] as [Tab, string][]).map(([k, l]) =>
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "summary" && <Summary rep={rep} pLabel={pLabel} cmpOn={!!cmp} cmpLabel={COMPARES.find(([k]) => k === cmpId)![1].toLowerCase()} />}
      {tab === "usage" && <UsageTab range={range} />}
      {tab === "who" && <WhoTab range={range} />}
      {tab === "all" && <Everyone detail={detail} />}

      {pick === "period" && <SearchPicker title="Showing" placeholder="Search" value={[period]}
        options={[...PERIODS.map(([id, label]) => ({ id, label, hint: rangeLabel(rangeOf(id)) })), { id: "custom", label: "Custom dates", hint: "Pick a start and end", action: () => setPick("dates") }]}
        onClose={() => setPick(null)} onChange={(v) => setPeriod(v[0] as PeriodId)} />}
      {pick === "compare" && <SearchPicker title="Compared to" placeholder="Search" value={[cmpId]}
        options={COMPARES.map(([id, label]) => { const c = compareOf(period, range, id); return { id, label, hint: c ? rangeLabel(c) : undefined }; })}
        onClose={() => setPick(null)} onChange={(v) => setCmpId(v[0] as CompareId)} />}
      {pick === "dates" && <CustomDates start={custom ?? range} onClose={() => setPick(null)} onSave={(r) => { setCustom(r); setPeriod("custom"); setPick(null); }} />}
    </div>
  );
}

export function CustomDates({ start, onClose, onSave }: { start: Range; onClose: () => void; onSave: (r: Range) => void }) {
  const iso = (d: Date) => local(d).toISOString().slice(0, 10);
  const [a, setA] = useState(iso(start.from));
  const [b, setB] = useState(iso(new Date(start.to.getTime() - 1)));
  const ok = a && b && a <= b;
  const toRange = (): Range => { const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number); return { from: at(y1, m1 - 1, d1), to: at(y2, m2 - 1, d2 + 1) }; };
  return (
    <Screen title="Custom dates" onBack={onClose} right={<button className="btn primary small" disabled={!ok} onClick={() => onSave(toRange())}>Save</button>}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        <div className="stack">
          <label className="field"><span className="k">From</span><input type="date" value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label className="field"><span className="k">To</span><input type="date" value={b} onChange={(e) => setB(e.target.value)} /></label>
          {!ok && <p className="err">The end has to be on or after the start.</p>}
        </div>
      </div>
    </Screen>
  );
}

// ---------- Summary ----------
function Summary({ rep, pLabel, cmpOn, cmpLabel }: { rep: Report | null; pLabel: string; cmpOn: boolean; cmpLabel: string }) {
  const [who, setWho] = useState<"all" | "c" | "w">("all");
  if (!rep) return <p className="muted light">Loading…</p>;
  const c = rep.cur, p = cmpOn ? rep.cmp ?? undefined : undefined, n = rep.now;
  const k = (key: keyof Kpis) => (p ? (p[key] as number | null) : undefined);
  const f = rep.funnel;
  return (
    <>
      <section className="ov-now dark">
        <div className="ov-h"><h2><i className="ov-live" />Right now</h2><span>Live</span></div>
        <div className="ov-now-grid">
          <div><b>{n.online}</b><span>Workers online</span><small>of {n.approved} approved</small></div>
          <div><b>{n.in_app}</b><span>Customers in the app</span><small>Opened in the last 15 min</small></div>
          <div><b>{n.waiting}</b><span>Jobs waiting for a worker</span><small>{n.waiting ? `Longest ${n.longest} min` : "No one waiting"}</small></div>
          <div><b>{n.today_c + n.today_w}</b><span>Signed up today</span><small>{n.today_c} customers · {n.today_w} workers</small></div>
        </div>
      </section>

      <section className="ov-sec ov-first">
        <div className="ov-h"><h2>{pLabel}</h2><span>{cmpOn ? `Compared to ${cmpLabel}` : ""}</span></div>
        <div className="mu-kpis">
          <div className="mu-kpi"><span className="t">Sign-ups</span><b>{fmt(c.signups)}</b><Delta cur={c.signups} prev={k("signups")} /><small>{c.signups_c} customers · {c.signups_w} workers</small></div>
          <div className="mu-kpi"><span className="t">Opened the app</span><b>{fmt(c.opened)}</b><Delta cur={c.opened} prev={k("opened")} /><small>Different people, at least once</small></div>
          <div className="mu-kpi"><span className="t">Opened it most days</span><b>{c.most_days == null ? "—" : `${c.most_days}%`}</b><Delta cur={c.most_days} prev={k("most_days")} pct /><small>Daily users out of all users</small></div>
          <div className="mu-kpi"><span className="t">Booked a job</span><b>{fmt(c.booked)}</b><Delta cur={c.booked} prev={k("booked")} /><small>Customers who posted and got a worker</small></div>
          <div className="mu-kpi"><span className="t">Booked again</span><b>{c.repeat == null ? "—" : `${c.repeat}%`}</b><Delta cur={c.repeat} prev={k("repeat")} pct /><small>Of those, had booked before</small></div>
          <div className="mu-kpi"><span className="t">Workers who took a job</span><b>{fmt(c.took)}</b><Delta cur={c.took} prev={k("took")} /><small>Of {c.approved} approved</small></div>
          <div className="mu-kpi"><span className="t">Hours workers were online</span><b>{fmt(c.online_hours)}</b><Delta cur={c.online_hours} prev={k("online_hours")} /><small>{c.online_workers ? `${Math.round(c.online_hours / c.online_workers)} hours each on average` : "No one online yet"}</small></div>
          <div className="mu-kpi"><span className="t">Stopped using it</span><b>{fmt(c.stopped)}</b><Delta cur={c.stopped} prev={k("stopped")} good="down" /><small>Not opened in 30 days</small></div>
        </div>
      </section>

      <section className="ov-sec">
        <div className="ov-h"><h2>Growth</h2><span>Everyone with an account, since launch</span></div>
        <Growth g={rep.growth} bucket={rep.growth_bucket} />
        {rep.growth.length > 1 && <div className="ov-key"><span><i style={{ background: "#0b6b4f" }} />Customers</span><span><i style={{ background: "#d9e04f" }} />Workers</span></div>}
      </section>

      <section className="ov-sec">
        <div className="ov-h"><h2>Sign-ups {rep.bucket === "hour" ? "each hour" : rep.bucket === "day" ? "each day" : rep.bucket === "week" ? "each week" : "each month"}</h2>
          <Seg value={who} onChange={setWho} options={[["all", "Everyone"], ["c", "Customers"], ["w", "Workers"]]} /></div>
        <SignupChart s={rep.series} prev={cmpOn ? rep.series_cmp : []} bucket={rep.bucket} who={who} />
        <div className="ov-key">
          {who !== "w" && <span><i style={{ background: "#0b6b4f" }} />Customers</span>}
          {who !== "c" && <span><i style={{ background: "#d9e04f" }} />Workers</span>}
          {cmpOn && who === "all" && <span><i className="dash" />The period before</span>}
        </div>
      </section>

      <section className="ov-sec">
        <div className="ov-h"><h2>From download to first job</h2><span>{pLabel}</span></div>
        <div className="mu-fun">
          {([["Opened the app", f.opened, f.opened >= f.signed && f.opened ? `${f.ios} iPhone · ${f.android} Android` : "App opens are counted from this update on"],
             ["Signed up", f.signed, f.opened >= f.signed && f.opened ? `${Math.round((f.signed / f.opened) * 100)}% of people who opened it` : ""],
             ["Account complete", f.complete, f.signed ? `Photo and ID done · ${Math.round((f.complete / f.signed) * 100)}%` : "Photo and ID done"],
             ["Booked or worked a job", f.used, f.complete ? `${Math.round((f.used / f.complete) * 100)}% of complete accounts` : ""]] as [string, number, string][]).map(([l, v, s2]) => {
            const top = Math.max(f.opened, f.signed, 1);
            return <div key={l} className="mu-fr"><span className="l">{l}</span><span className="track"><i style={{ width: `${Math.max((v / top) * 100, v ? 4 : 0)}%`, padding: v ? undefined : 0 }}>{v > 0 && <b>{v}</b>}</i>{v === 0 && <b className="zero">0</b>}</span><small>{s2}</small></div>;
          })}
        </div>
      </section>
    </>
  );
}

function Growth({ g, bucket }: { g: { at: string; c: number; w: number }[]; bucket: string }) {
  if (g.length < 2) return <p className="mu-none">The growth line starts once there's more than one {bucket} of sign-ups.</p>;
  const last = g[g.length - 1], before = g[g.length - 2];
  const top = niceTop(Math.max(...g.map((x) => x.c + x.w))), h = 220, n = g.length;
  const x = (i: number) => (i / (n - 1)) * 100, y = (v: number) => h - (v / top) * h;
  const area = (a: number[], base: number[]) => `M${a.map((v, i) => `${x(i)},${y(v + base[i])}`).join(" L")} L${base.map((_, i) => `${x(n - 1 - i)},${y(base[n - 1 - i])}`).join(" L")} Z`;
  const zero = g.map(() => 0), cs = g.map((v) => v.c), ws = g.map((v) => v.w);
  const added = last.c + last.w - (before.c + before.w);
  return (
    <div className="mu-chart">
      <div className="mu-yax">{[top, top / 2, 0].map((v) => <span key={v}>{fmt(v)}</span>)}</div>
      <div className="mu-plot">
        <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ height: h }}>
          {[0, 0.5].map((q) => <line key={q} x1="0" x2="100" y1={h * q} y2={h * q} stroke="#e6ebe8" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <path d={area(cs, zero)} fill="#0b6b4f" /><path d={area(ws, cs)} fill="#d9e04f" />
        </svg>
        <div className="mu-xax">{ticks(n, 7).map((i) => <span key={i}>{bucketLbl(g[i].at, bucket)}</span>)}</div>
      </div>
      <div />
      <p className="mu-cap"><b className="w5">{fmt(last.c + last.w)} accounts</b>: {fmt(last.c)} customers and {fmt(last.w)} workers. {added > 0 ? `Up ${fmt(added)} this ${bucket}.` : ""}</p>
    </div>
  );
}

function SignupChart({ s, prev, bucket, who }: { s: { at: string; c: number; w: number }[]; prev: number[]; bucket: string; who: "all" | "c" | "w" }) {
  if (!s.length) return <p className="mu-none">No sign-ups in this period.</p>;
  const vc = s.map((x) => (who === "w" ? 0 : x.c)), vw = s.map((x) => (who === "c" ? 0 : x.w));
  const pv = who === "all" ? prev.slice(0, s.length) : [];
  const top = niceTop(Math.max(1, ...vc.map((v, i) => v + vw[i]), ...pv)), h = 220, w = 100 / s.length;
  const line = pv.map((v, i) => `${i * w + w / 2},${h - (v / top) * h}`).join(" ");
  return (
    <div className="mu-chart">
      <div className="mu-yax">{[top, top / 2, 0].map((v) => <span key={v}>{fmt(v)}</span>)}</div>
      <div className="mu-plot">
        <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ height: h }}>
          {[0, 0.5].map((q) => <line key={q} x1="0" x2="100" y1={h * q} y2={h * q} stroke="#e6ebe8" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {s.map((_, i) => {
            const hc = (vc[i] / top) * h, hw = (vw[i] / top) * h;
            return <g key={i}><rect x={i * w + w * 0.18} width={w * 0.64} y={h - hc} height={hc} fill="#0b6b4f" /><rect x={i * w + w * 0.18} width={w * 0.64} y={h - hc - hw} height={hw} fill="#d9e04f" /></g>;
          })}
          {pv.length > 1 && <polyline points={line} fill="none" stroke="#2a2d32" strokeWidth="1.6" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="mu-xax">{ticks(s.length).map((i) => <span key={i}>{bucketLbl(s[i].at, bucket)}</span>)}</div>
      </div>
    </div>
  );
}

// ---------- Usage ----------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function UsageTab({ range }: { range: Range }) {
  const toast = useToast();
  const [heat, setHeat] = useState<"jobs" | "online" | "opens">("jobs");
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    setU(null);
    rpc<Usage>("admin_users_usage", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_heat: heat }).then(setU).catch((e) => toast((e as Error).message));
  }, [range, heat, toast]);
  const hrs = Array.from({ length: 17 }, (_, i) => i + 6);
  const cell = (d: number, h: number) => u?.heat.find((x) => x.d === d && x.h === h)?.n ?? 0;
  const max = Math.max(1, ...(u?.heat.map((x) => Number(x.n)) ?? [1]));
  // Plain words under each chart, worked out from the numbers.
  const busiest = (() => {
    if (!u?.heat.length || !u.heat.some((x) => Number(x.n) > 0)) return "";
    const b = [...u.heat].sort((a, b2) => Number(b2.n) - Number(a.n))[0];
    return `Busiest: ${["", ...DAYS][b.d]} ${hourLbl(b.h)} to ${hourLbl((b.h + 1) % 24)}.`;
  })();
  const gap = (() => {
    // Runs of hours where more jobs are posted than workers are online, longest first.
    const runs: [number, number][] = [];
    for (const x of u?.by_hour ?? []) {
      if (!(x.jobs > 0 && x.jobs > x.workers)) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === x.h - 1) last[1] = x.h; else runs.push([x.h, x.h]);
    }
    if (!runs.length) return "";
    const top = runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 2).sort((a, b) => a[0] - b[0]);
    return `${top.map(([a, b]) => `${hourLbl(a)} to ${hourLbl((b + 1) % 24)}`).join(" and ")}: more jobs posted than workers online. Worth a broadcast to workers.`;
  })();
  const bh = (u?.by_hour ?? []).filter((x) => x.h >= 6 && x.h <= 22);
  const bmax = Math.max(1, ...bh.map((x) => Math.max(x.jobs, x.workers)));
  return (
    <>
      <section className="ov-sec ov-first">
        <div className="ov-h"><h2>Most booked</h2><span>Jobs posted in this period</span></div>
        <div className="mu-demo two">
          <div className="mu-panel"><h3>Jobs</h3>{u ? <BarList rows={u.skills} empty="No jobs posted yet" /> : <p className="mu-none">Loading…</p>}</div>
          <div className="mu-panel"><h3>Suburbs posting jobs</h3>{u ? <BarList rows={u.suburbs} empty="No jobs posted yet" /> : <p className="mu-none">Loading…</p>}</div>
        </div>
      </section>
      <section className="ov-sec">
        <div className="ov-h"><h2>Busiest times</h2><Seg value={heat} onChange={setHeat} options={[["jobs", "Jobs posted"], ["online", "Workers online"], ["opens", "App opened"]]} /></div>
        <div className="mu-heat">
          <span />{hrs.map((h) => <span key={h} className="hx">{h % 3 === 0 ? hourLbl(h) : ""}</span>)}
          {DAYS.map((d, di) => [<span key={d} className="dy">{d}</span>, ...hrs.map((h) => { const v = Number(cell(di + 1, h)); return <i key={d + h} title={`${d} ${hourLbl(h)}: ${v}`} style={{ background: v ? `rgba(11,107,79,${0.12 + (v / max) * 0.88})` : "#eef2f0" }} />; })])}
        </div>
        <p className="mu-cap">{busiest || "Nothing yet for this period."}</p>
      </section>
      <section className="ov-sec">
        <div className="ov-h"><h2>Jobs vs workers by hour</h2><span>Average day in this period</span></div>
        <div className="mu-sd">
          {bh.map((x) => (
            <div key={x.h}><span className="bars"><i className="j" style={{ height: (x.jobs / bmax) * 130 }} /><i className="w" style={{ height: (x.workers / bmax) * 130 }} /></span><small>{x.h % 3 === 0 ? hourLbl(x.h) : ""}</small></div>
          ))}
        </div>
        <div className="ov-key"><span><i style={{ background: "#0b6b4f" }} />Jobs posted</span><span><i style={{ background: "#d9e04f" }} />Workers online</span></div>
        {gap && <p className="mu-cap">{gap}</p>}
      </section>
    </>
  );
}

// ---------- Who they are ----------
function WhoTab({ range }: { range: Range }) {
  const toast = useToast();
  const [who, setWho] = useState<"customers" | "workers" | "everyone">("customers");
  const [w, setW] = useState<Who | null>(null);
  useEffect(() => { setW(null); rpc<Who>("admin_users_who", { p_to: range.to.toISOString(), p_who: who }).then(setW).catch((e) => toast((e as Error).message)); }, [range, who, toast]);
  const panels: [string, keyof Who][] = [["Age", "age"], ["Gender", "gender"], ["Nationality", "nationality"], ["City", "city"], ["Suburb", "suburb"], ["How they heard about us", "heard"], ["Phone", "phone"], ["Coming back", "back"]];
  return (
    <section className="ov-sec ov-first">
      <div className="ov-h"><h2>Who they are</h2><Seg value={who} onChange={setWho} options={[["customers", "Customers"], ["workers", "Workers"], ["everyone", "Everyone"]]} /></div>
      <p className="mu-sub">{w ? `${fmt(w.total)} ${who === "everyone" ? "people" : who} with an account on ${dmy(new Date(Math.min(range.to.getTime(), Date.now()) - 1))}` : "Loading…"}</p>
      <div className="mu-demo">
        {panels.map(([t, k]) => <div key={k} className="mu-panel"><h3>{t}</h3>{w ? <BarList rows={(w[k] as Row[]) ?? []} /> : null}</div>)}
      </div>
    </section>
  );
}

// ---------- Everyone ----------
const GENDER: Record<string, string> = { woman: "Woman", man: "Man", another: "Another way", not_say: "Prefer not to say" };
const PHONE: Record<string, string> = { ios: "iPhone", android: "Android", web: "Web" };
function ago(iso: string | null) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : dmy(new Date(iso), true);
}
type Filters = { role: string; online: string; phone: string; suburb: string; age: string };
function Everyone({ detail }: { detail: (row: UserRow, back: () => void, reload: () => void) => ReactNode }) {
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filters>({ role: "", online: "", phone: "", suburb: "", age: "" });
  const [pick, setPick] = useState<keyof Filters | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => rpc<UserRow[]>("admin_user_rows").then(setRows).catch((e) => toast((e as Error).message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const role = (r: UserRow) => (r.is_worker ? (r.jobs_posted > 0 ? "Both" : "Worker") : "Customer");
  const shown = (rows ?? []).filter((r) => `${r.full_name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase())
    && (!f.role || role(r) === f.role || (f.role === "Worker" && r.is_worker)) && (!f.online || (f.online === "online" ? r.online : !r.online))
    && (!f.phone || r.platform === f.phone) && (!f.suburb || r.suburb === f.suburb) && (!f.age || r.age_band === f.age));
  const opts: Record<keyof Filters, [string, string][]> = {
    role: [["", "Everyone"], ["Customer", "Customers"], ["Worker", "Workers"], ["Both", "Customers who also work"]],
    online: [["", "Any"], ["online", "Online now"], ["offline", "Not online"]],
    phone: [["", "Any"], ["ios", "iPhone"], ["android", "Android"]],
    suburb: [["", "Any"], ...[...new Set((rows ?? []).map((r) => r.suburb).filter(Boolean) as string[])].sort().map((s) => [s, s] as [string, string])],
    age: [["", "Any"], ...["18–24", "25–34", "35–44", "45–54", "55–64", "65+"].map((a) => [a, a] as [string, string])],
  };
  const label = (k: keyof Filters) => opts[k].find(([v]) => v === f[k])?.[1] ?? "Any";
  const person = rows?.find((r) => r.id === open);
  if (person) return <>{detail(person, () => setOpen(null), load)}</>;
  const csv = () => {
    const head = ["Name", "Email", "Role", "Phone", "City", "Suburb", "Age", "Gender", "Nationality", "Heard from", "Joined", "Last open", "Jobs posted", "Jobs worked"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = shown.map((r) => [r.full_name, r.email, role(r), PHONE[r.platform ?? ""] ?? "", r.city, r.suburb, r.age_band, GENDER[r.gender ?? ""] ?? "", r.nationality, r.heard_from,
      r.created_at.slice(0, 10), r.last_open?.slice(0, 10) ?? "", r.jobs_posted, r.jobs_worked].map(esc).join(","));
    const url = URL.createObjectURL(new Blob([[head.map(esc).join(","), ...body].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `mahi-man-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <section className="ov-sec ov-first">
      <div className="ov-h"><h2>Everyone</h2><span className="row" style={{ gap: 14 }}>{shown.length} {shown.length === 1 ? "person" : "people"} <button className="btn stone small" onClick={csv} disabled={!shown.length}>Download CSV</button></span></div>
      <div className="mu-filters">
        <label className="search mu-search">{Icon.search("var(--muted)")}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" /></label>
        {([["role", "Role"], ["online", "Online"], ["phone", "Phone"], ["suburb", "Suburb"], ["age", "Age"]] as [keyof Filters, string][]).map(([k, l]) => (
          <button key={k} className="mu-drop" onClick={() => setPick(k)}><span className="k">{l}</span><span className="v">{label(k)}</span></button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Suburb</th><th>Age</th><th>Heard from</th><th>Last open</th><th>Jobs</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                <td><span className="row" style={{ gap: 12 }}>
                  {r.photo_path ? <img className="u-pic" src={avatarUrl(r.photo_path)!} alt="" /> : <span className="u-pic none">{(r.full_name || r.email).slice(0, 1).toUpperCase()}</span>}
                  <span className="stack" style={{ gap: 1 }}><span className="w5">{r.full_name || "No name yet"}</span><span className="small muted light">{r.email}</span></span></span></td>
                <td><span className={r.is_worker ? "badge g" : "badge"}>{role(r)}</span>{r.online && <span className="mu-on">Online</span>}{r.suspended && <span className="badge r" style={{ marginLeft: 6 }}>Paused</span>}</td>
                <td className="light">{PHONE[r.platform ?? ""] ?? "—"}</td><td className="light">{r.suburb ?? "—"}</td><td className="light">{r.age_band ?? "—"}</td>
                <td className="light">{r.heard_from ?? "—"}</td><td className="light">{ago(r.last_open)}</td>
                <td className="light">{[r.jobs_posted ? `${r.jobs_posted} posted` : "", r.jobs_worked ? `${r.jobs_worked} worked` : ""].filter(Boolean).join(", ") || "None yet"}</td>
              </tr>
            ))}
            {rows && !shown.length && <tr><td colSpan={8} className="muted">No one matches.</td></tr>}
            {!rows && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      {pick && <SearchPicker title={{ role: "Role", online: "Online", phone: "Phone", suburb: "Suburb", age: "Age" }[pick]} placeholder="Search" value={[f[pick]]}
        options={opts[pick].map(([id, label]) => ({ id, label }))} onClose={() => setPick(null)} onChange={(v) => setF({ ...f, [pick]: String(v[0]) })} />}
    </section>
  );
}
