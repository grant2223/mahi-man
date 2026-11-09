import { useEffect, useRef, useState } from "react";
import { api, rpc } from "../lib/supabase";

/* The worker's trip, as the customer sees it: polled every 5 seconds, drawn on Apple Maps with the driving
   route and a live ETA. Without a map key it still reports the trip, just without the map. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MK = any;
declare global { interface Window { mapkit?: MK; __mkReady?: Promise<MK | null> } }

function loadMapKit(): Promise<MK | null> {
  if (window.__mkReady) return window.__mkReady;
  window.__mkReady = (async () => {
    const r = await api<{ token: string | null }>("map_token").catch(() => ({ token: null }));
    if (!r.token) return null;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";
      s.crossOrigin = "anonymous";
      s.dataset.libraries = "map,annotations,services,overlays";
      s.dataset.callback = "__mkLoaded";
      (window as unknown as Record<string, () => void>).__mkLoaded = () => resolve();
      s.onerror = () => reject(new Error("map"));
      document.head.appendChild(s);
    });
    const mk = window.mapkit!;
    mk.init({ authorizationCallback: (done: (t: string) => void) => { api<{ token: string | null }>("map_token").then((x) => x.token && done(x.token)); }, language: "en-AU" });
    return mk;
  })().catch(() => null);
  return window.__mkReady;
}

export interface TripPoint { lat: number; lng: number; heading: number | null; updated_at: string; started_at: string }

// Is the worker on the way, and where are they? Polls while the job is booked.
export function useTrip(jobId: string, enabled: boolean) {
  const [loc, setLoc] = useState<TripPoint | null>(null);
  useEffect(() => {
    if (!enabled) { setLoc(null); return; }
    let live = true;
    const load = () => rpc<TripPoint[]>("job_location", { p_job: jobId }).then((r) => live && setLoc(r?.[0] ?? null)).catch(() => {});
    load();
    const t = window.setInterval(load, 5000);
    return () => { live = false; window.clearInterval(t); };
  }, [jobId, enabled]);
  return loc;
}

export function LiveMap({ loc, address, initials, onRoute, onShown }: {
  loc: TripPoint; address: string; initials: string; onRoute: (r: { minutes: number; km: number } | null) => void; onShown: (shown: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const st = useRef<{ mk: MK; map: MK; me: MK; dest: MK | null; destCoord: MK | null; line: MK | null; lastRoute: number } | null>(null);
  const [noMap, setNoMap] = useState(false);

  useEffect(() => {
    let dead = false;
    loadMapKit().then((mk) => {
      if (dead || !box.current) return;
      if (!mk) { setNoMap(true); onShown(false); return; }
      onShown(true);
      const map = new mk.Map(box.current, { showsCompass: mk.FeatureVisibility.Hidden, showsMapTypeControl: false, showsZoomControl: false, showsUserLocationControl: false, isRotationEnabled: false });
      const el = document.createElement("div");
      el.className = "trip-me";
      el.textContent = initials;
      const me = new mk.Annotation(new mk.Coordinate(loc.lat, loc.lng), () => el, { anchorOffset: new DOMPoint(0, 0) });
      map.addAnnotation(me);
      st.current = { mk, map, me, dest: null, destCoord: null, line: null, lastRoute: 0 };
      new mk.Geocoder({ language: "en-AU" }).lookup(`${address}, Queensland, Australia`, (err: unknown, data: MK) => {
        if (err || !st.current || !data?.results?.length) return;
        const c = data.results[0].coordinate;
        st.current.destCoord = c;
        st.current.dest = new mk.MarkerAnnotation(c, { color: "#1f2421", glyphColor: "#d4f04c", title: "" });
        map.addAnnotation(st.current.dest);
        route();
      });
    });
    return () => { dead = true; st.current?.map?.destroy?.(); st.current = null; onShown(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function route() {
    const s = st.current;
    if (!s?.destCoord) { s?.map.showItems([s.me], { animate: true, padding: new s.mk.Padding(60, 60, 60, 60) }); return; }
    // Re-route at most every 45 seconds; between times the pin still moves every update.
    if (Date.now() - s.lastRoute < 45000) return;
    s.lastRoute = Date.now();
    new s.mk.Directions().route({ origin: s.me.coordinate, destination: s.destCoord, transportType: s.mk.Directions.Transport.Automobile }, (err: unknown, data: MK) => {
      if (!st.current) return;
      const r = !err && data?.routes?.[0];
      if (!r) { onRoute(null); s.map.showItems([s.me, s.dest], { animate: true, padding: new s.mk.Padding(60, 60, 60, 60) }); return; }
      if (s.line) s.map.removeOverlay(s.line);
      r.polyline.style = new s.mk.Style({ lineWidth: 5, strokeColor: "#0b6b4f", lineCap: "round" });
      s.line = r.polyline;
      s.map.addOverlay(r.polyline);
      s.map.showItems([s.me, s.dest, r.polyline], { animate: true, padding: new s.mk.Padding(60, 50, 60, 50) });
      onRoute({ minutes: Math.max(1, Math.round(r.expectedTravelTime / 60)), km: Math.round(r.distance / 100) / 10 });
    });
  }

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.me.coordinate = new s.mk.Coordinate(loc.lat, loc.lng);
    route();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.lat, loc.lng]);

  if (noMap) return null;
  return <div ref={box} className="trip-map" />;
}
