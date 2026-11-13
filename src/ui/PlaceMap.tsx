import { useEffect, useRef, useState } from "react";
import { loadMapKit } from "./LiveMap";

// A still map with a pin on the job's spot (Apple Maps, the same as the live trip map).
// Without a map it shows a plain street-grid backdrop with the pin, so the screen never looks broken.
export function PlaceMap({ lat, lng }: { lat: number | null; lng: number | null }) {
  const el = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (lat == null || lng == null) return;
    let map: { destroy?: () => void } | null = null;
    loadMapKit().then((mk) => {
      if (!mk || !el.current) return;
      const c = new mk.Coordinate(lat, lng);
      const m = new mk.Map(el.current, { isScrollEnabled: false, isZoomEnabled: false, showsCompass: mk.FeatureVisibility.Hidden, showsMapTypeControl: false, showsZoomControl: false });
      m.region = new mk.CoordinateRegion(c, new mk.CoordinateSpan(0.012, 0.012));
      m.addAnnotation(new mk.MarkerAnnotation(c, { color: "#0b6b4f", glyphColor: "#ffffff" }));
      map = m; setOk(true);
    });
    return () => { map?.destroy?.(); };
  }, [lat, lng]);
  return (
    <div className="pm">
      <div ref={el} className="pm-map" />
      {!ok && (
        <svg className="pm-fallback" viewBox="0 0 390 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="390" height="200" fill="#e4ebe6" />
          <rect x="0" y="0" width="120" height="80" fill="#d6e4d6" />
          <rect x="290" y="130" width="100" height="70" fill="#d6e4d6" />
          {[38, 96, 150].map((y) => <rect key={y} x="0" y={y} width="390" height={y === 96 ? 12 : 7} fill="#fff" />)}
          {[60, 170, 250, 330].map((x) => <rect key={x} x={x} y="0" width={x === 170 ? 12 : 7} height="200" fill="#fff" />)}
          <g transform="translate(176 58)">
            <path d="M18 46s-16-14-16-26a16 16 0 0 1 32 0c0 12-16 26-16 26z" fill="#0b6b4f" />
            <circle cx="18" cy="20" r="6" fill="#fff" />
          </g>
        </svg>
      )}
    </div>
  );
}
