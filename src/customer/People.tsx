import { useSession } from "../lib/session";
import { useEffect, useState } from "react";
import { avatarUrl, rpc } from "../lib/supabase";
import { go } from "../lib/router";
import { Screen } from "../ui/kit";
import { GoldTick } from "./Offers";
import { cardName } from "../lib/format";

/* Your people: workers a customer saved, then everyone who's done a job for them. Book sends a job to that person first.
   Like TaskRabbit's My Taskers: saved favourites up top, past helpers below. */
export interface Person { worker_id: string; name: string; first: string; photo_path: string | null; verified: boolean; saved: boolean; jobs_for_me: number; does: string[]; online?: boolean }

export const heart = (on: boolean, c = "var(--gold)") => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill={on ? c : "none"} stroke={on ? c : "currentColor"} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
  </svg>
);

function Row({ p, onToggle }: { p: Person; onToggle: (p: Person) => void }) {
  const pic = avatarUrl(p.photo_path);
  const sub = [p.jobs_for_me ? `${p.jobs_for_me} job${p.jobs_for_me === 1 ? "" : "s"} for you` : null, p.does.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
  return (
    <div className="yp-row">
      <button className="yp-pic" style={pic ? { backgroundImage: `url("${pic}")` } : undefined} onClick={() => go(`/w/${p.worker_id}`)} aria-label={`${p.name}'s page`}>{!pic && p.first.charAt(0)}</button>
      <button className="yp-who" onClick={() => go(`/w/${p.worker_id}`)}><b>{cardName(p.name)}{p.verified && <GoldTick s={18} />}</b><span>{p.online && <em>Available now</em>}{p.online && sub ? " · " : ""}{sub}</span></button>
      <button className={p.saved ? "yp-save on" : "yp-save"} onClick={() => onToggle(p)} aria-label={p.saved ? "Remove from saved" : "Save"}>{heart(p.saved)}</button>
      <button className="btn primary small" onClick={() => go(`/w/${p.worker_id}/book`)}>Book</button>
    </div>
  );
}

export function usePeople() {
  const { profile } = useSession();
  const onPlus = !!profile?.plus_until && new Date(profile.plus_until) > new Date();
  const [list, setList] = useState<Person[] | null>(null);
  useEffect(() => { rpc<Person[]>("my_people").then(setList).catch(() => setList([])); }, []);
  // Saving people is part of Plus: without it, the heart opens Plus.
  const toggle = (p: Person) => {
    if (!p.saved && !onPlus) { go("/plus"); return; }
    setList((l) => (l ?? []).map((x) => (x.worker_id === p.worker_id ? { ...x, saved: !x.saved } : x)));
    rpc(p.saved ? "unsave_worker" : "save_worker", p.saved ? { p_worker: p.worker_id } : { p_worker: p.worker_id, p_heart: true }).catch(() => {});
  };
  return { list, toggle };
}

// On the customer's profile: the first few, saved first.
export function YourPeople({ onAll }: { onAll: () => void }) {
  const { list, toggle } = usePeople();
  if (!list?.length) return null;
  const sorted = [...list].sort((a, b) => Number(b.saved) - Number(a.saved) || b.jobs_for_me - a.jobs_for_me);
  return (
    <section className="pr-sec">
      <h2>Your people{list.length > 3 && <button onClick={onAll}>All {list.length}</button>}</h2>
      {sorted.slice(0, 3).map((p) => <Row key={p.worker_id} p={p} onToggle={toggle} />)}
    </section>
  );
}

// Everyone, full screen: Saved, then Used before.
export function PeopleScreen({ onBack }: { onBack: () => void }) {
  const { list, toggle } = usePeople();
  const saved = (list ?? []).filter((p) => p.saved), past = (list ?? []).filter((p) => !p.saved);
  return (
    <Screen title="Your people" onBack={onBack}>
      <div className="screen-body yp">
        {saved.length > 0 && <><h2>Saved</h2>{saved.map((p) => <Row key={p.worker_id} p={p} onToggle={toggle} />)}</>}
        {past.length > 0 && <><h2>Used before</h2>{past.map((p) => <Row key={p.worker_id} p={p} onToggle={toggle} />)}</>}
      </div>
    </Screen>
  );
}
