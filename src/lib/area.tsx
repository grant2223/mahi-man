import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { sb, type Area } from "./supabase";
import { useSession } from "./session";
import { currentPosition } from "./trip";
import { Icon, SearchPicker } from "../ui/kit";

/* The area someone is using Mahi Man in. Their saved choice wins; otherwise the one they picked on this device;
   otherwise, while only one area is open, that one. Every screen that lists suburbs or jobs uses it. */

const KEY = "mm-area";
let cache: Area[] | null = null;
const listeners = new Set<() => void>();
let picked: number | null = (() => { try { const v = localStorage.getItem(KEY); return v ? Number(v) : null; } catch { return null; } })();

export function useAreas() {
  const [areas, setAreas] = useState<Area[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    sb.from("areas").select("*").eq("active", true).order("sort").then(({ data }) => { cache = (data ?? []) as Area[]; setAreas(cache); });
  }, []);
  return areas;
}

// Nearest open area to a point, by straight-line distance to each area's centre.
const nearest = (areas: Area[], lat: number, lng: number) =>
  [...areas].sort((a, b) => ((a.lat - lat) ** 2 + (a.lng - lng) ** 2) - ((b.lat - lat) ** 2 + (b.lng - lng) ** 2))[0];

/* Where they are right now. Asked for once when the app opens; the app then opens on their area and the jobs near them.
   If they say no, it falls back to their saved area and the pin lets them pick. */
export type Here = { lat: number; lng: number } | null;
let here: Here = null;
let asked = false;
let manual = false; // they picked an area themselves this visit, so their location doesn't override it
function askHere() {
  if (asked) return;
  asked = true;
  currentPosition(15000).then((p) => {
    if (!p) return;
    here = p;
    listeners.forEach((f) => f());
  });
}
export function useHere(): Here {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); askHere(); return () => { listeners.delete(f); }; }, []);
  return here;
}

export function useArea(): { area: Area | null; areas: Area[] | null; choose: (id: number) => void } {
  const areas = useAreas();
  const { session, profile, reload } = useSession();
  const loc = useHere();
  const id = !manual && loc && areas?.length ? nearest(areas, loc.lat, loc.lng).id : profile?.area_id ?? picked;
  const area = areas?.find((a) => a.id === id) ?? (areas?.length === 1 ? areas[0] : areas?.[0] ?? null);
  const choose = (next: number) => {
    picked = next; manual = true;
    try { localStorage.setItem(KEY, String(next)); } catch { /* private mode */ }
    listeners.forEach((f) => f());
    if (session) sb.from("profiles").update({ area_id: next }).eq("id", session.user.id).then(() => reload());
  };
  return { area, areas, choose };
}

// The pin in the top bar: the area's name, and a full-screen picker when more than one area is open.
export function AreaPin() {
  const { area, areas, choose } = useArea();
  const [open, setOpen] = useState(false);
  if (!area) return null;
  const many = (areas?.length ?? 0) > 1;
  return (
    <>
      <button className="area-pin" disabled={!many} onClick={() => setOpen(true)} aria-label={many ? `Area: ${area.name}. Change` : `Area: ${area.name}`}>
        {Icon.pin("#fff")} {area.name}{many && Icon.down("#fff")}
      </button>
      {/* Full screen, outside the header, so the header's styles don't reach it. */}
      {open && createPortal(<SearchPicker title="Where are you?" placeholder="Search areas" value={[area.id]}
        options={(areas ?? []).map((a) => ({ id: a.id, label: a.name, hint: a.state }))}
        onClose={() => setOpen(false)} onChange={(v) => choose(Number(v[0]))} />, document.body)}
    </>
  );
}

// Settings row: the area they use, and the same picker. Only shown once more than one area is open.
export function AreaRow() {
  const { area, areas, choose } = useArea();
  const [open, setOpen] = useState(false);
  if (!area || (areas?.length ?? 0) < 2) return null;
  return (
    <>
      <button className="choice" onClick={() => setOpen(true)}><span className="t"><b>Your area</b><span>{area.name}, {area.state}</span></span>{Icon.chevron("var(--faint)")}</button>
      {open && createPortal(<SearchPicker title="Where are you?" placeholder="Search areas" value={[area.id]}
        options={(areas ?? []).map((a) => ({ id: a.id, label: a.name, hint: a.state }))}
        onClose={() => setOpen(false)} onChange={(v) => choose(Number(v[0]))} />, document.body)}
    </>
  );
}

// For suburb pickers: the first option opens the area picker, so someone in the wrong area is never stuck.
export function useChangeArea() {
  const { area, areas, choose } = useArea();
  const [open, setOpen] = useState(false);
  const option = area && (areas?.length ?? 0) > 1 ? { id: "__area", label: `Not in ${area.name}?`, hint: "Change your area", action: () => setOpen(true) } : null;
  const picker = open && area ? createPortal(<SearchPicker title="Where are you?" placeholder="Search areas" value={[area.id]}
    options={(areas ?? []).map((a) => ({ id: a.id, label: a.name, hint: a.state }))}
    onClose={() => setOpen(false)} onChange={(v) => choose(Number(v[0]))} />, document.body) : null;
  return { option, picker };
}
