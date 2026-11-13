import { useEffect, useMemo, useState } from "react";
import { mediaUrls, rpc } from "../lib/supabase";
import { money } from "../lib/format";
import { SearchPicker, useToast } from "../ui/kit";

// What a worker sees while they're offline. Uber and DoorDash both show what's happening without you,
// when it gets busy, and make coming back one tap. Every figure here comes from worker_offline_summary.
type Summary = {
  missed_count: number; missed_cents: number;
  missed: { id: string; name: string; suburb: string; pay_cents: number; cover_path: string | null }[];
  days: number[]; busy_day: number | null; busy_part: "morning" | "afternoon" | "evening" | null;
  last_paid_cents: number | null; alarm_at: string | null;
};

const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY3 = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PART_HOUR = { morning: 8, afternoon: 13, evening: 17 } as const;
const H = 3600e3;
// Cairns time (UTC+10, no daylight saving), the same zone the rest of the app uses.
const local = (d: Date) => new Date(d.getTime() + 10 * H);
const at = (dayOffset: number, hour: number) => {
  const n = local(new Date());
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + dayOffset, hour - 10));
};
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const isoDow = (d: Date) => ((local(d).getUTCDay() + 6) % 7) + 1;
const dayStart = (d: Date) => Math.floor(local(d).getTime() / 864e5);
function label(d: Date) {
  const off = dayStart(d) - dayStart(new Date());
  const day = off === 0 ? "Today" : off === 1 ? "Tomorrow" : off === 7 ? `Next ${DAY[isoDow(d)]}` : DAY[isoDow(d)];
  return `${day} ${hourLabel(local(d).getUTCHours())}`;
}

export function Offline() {
  const toast = useToast();
  const [s, setS] = useState<Summary | null>(null);
  const [pics, setPics] = useState<Record<string, string>>({});
  const [pick, setPick] = useState(false);
  const [when, setWhen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => rpc<Summary>("worker_offline_summary").then((r) => {
    setS(r);
    const need = r.missed.map((m) => m.cover_path).filter((p): p is string => !!p);
    if (need.length) mediaUrls(need).then(setPics);
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  // Every hour from 6am to 8pm over the next 7 days that hasn't passed yet.
  const times = useMemo(() => {
    const out: Date[] = [];
    for (let d = 0; d <= 7; d++) for (let h = 6; h <= 20; h++) { const t = at(d, h); if (t.getTime() > Date.now() + 5 * 60e3) out.push(t); }
    return out;
  }, []);
  // Suggest their area's busiest time; otherwise tomorrow at 8am.
  const suggested = useMemo(() => {
    if (s?.busy_day && s.busy_part) {
      const t = times.find((x) => isoDow(x) === s.busy_day && local(x).getUTCHours() === PART_HOUR[s.busy_part!]);
      if (t) return t.toISOString();
    }
    return at(1, 8).toISOString();
  }, [s, times]);
  const chosen = when ?? suggested;

  async function setAlarm() {
    setBusy(true);
    try { await rpc("set_work_alarm", { p_at: chosen }); toast(`Alarm set for ${label(new Date(chosen))}`); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function clearAlarm() {
    setBusy(true);
    try { await rpc("clear_work_alarm"); setWhen(null); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!s) return null;
  const total = s.days.reduce((a, b) => a + b, 0);
  const max = Math.max(...s.days, 1);
  return (
    <>
      {(s.missed_count > 0 || s.last_paid_cents) && (
        <section className="of-sec">
          <div className="of-stats">
            {s.missed_count > 0 && <div><span className="k">Missed today</span><b className="em">{money(s.missed_cents)}</b><span>from {s.missed_count} job{s.missed_count === 1 ? "" : "s"} near you</span></div>}
            {s.last_paid_cents ? <div><span className="k">Your last job paid</span><b>{money(s.last_paid_cents)}</b></div> : null}
          </div>
          {s.missed_count > 0 && (
            <div className="of-strip">
              {s.missed.map((j) => (
                <div key={j.id} className="of-job">
                  <span className={`pic ${j.cover_path && pics[j.cover_path] ? "" : "ph-0"}`} style={j.cover_path && pics[j.cover_path] ? { backgroundImage: `url("${pics[j.cover_path]}")` } : undefined}><i>{money(j.pay_cents)}</i></span>
                  <b>{j.name}</b><span>{j.suburb}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {total > 0 && s.busy_day && s.busy_part && (
        <section className="of-sec">
          <h2>Busiest near you</h2>
          <p className="of-note">{DAY[s.busy_day]} {s.busy_part}s get the most jobs.</p>
          <div className="of-bars">
            {s.days.map((n, i) => (
              <div key={i} className={i + 1 === s.busy_day ? "on" : ""}><span style={{ height: `${(n / max) * 100}%` }} /><em>{DAY3[i + 1]}</em></div>
            ))}
          </div>
        </section>
      )}

      <section className="of-sec">
        <h2>Remind me to go online</h2>
        {s.alarm_at ? (
          <div className="of-remind">
            <div className="of-when"><span className="k">Alarm</span><span className="v">{label(new Date(s.alarm_at))}</span></div>
            <button className="btn stone of-alarm" disabled={busy} onClick={clearAlarm}>Cancel</button>
          </div>
        ) : (
          <div className="of-remind">
            <button className="of-when" onClick={() => setPick(true)}><span className="k">When</span><span className="v">{label(new Date(chosen))}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
            <button className="btn stone of-alarm" disabled={busy} onClick={setAlarm}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2M5 4L2 7M19 4l3 3" /></svg>Alarm</button>
          </div>
        )}
      </section>
      <div style={{ height: 24 }} />

      {pick && <SearchPicker title="Remind me" value={[chosen]} options={times.map((t) => ({ id: t.toISOString(), label: label(t) }))}
        onChange={(v) => setWhen(String(v[0]))} onClose={() => setPick(false)} />}
    </>
  );
}
