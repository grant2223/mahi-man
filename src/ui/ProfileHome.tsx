import { TaxNudge, useTax } from "./Tax";
import { cardName } from "../lib/format";
import { useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { Capacitor } from "@capacitor/core";
import { avatarUrl, rpc } from "../lib/supabase";
import { money } from "../lib/format";
import { shareLink } from "../lib/share";
import { go } from "../lib/router";
import { loadMapKit } from "./LiveMap";
import { CatIcon, Icon, useToast } from "./kit";
import { GoldTick } from "../customer/Offers";

/* The Profile tab. A worker sees where they're at and where the work is; a customer sees their jobs and money.
   Built to the approved mocks of 15 Nov 2026. */

export type WorkerHomeData = {
  online: boolean; done: number; reviewed: number; recommended: number; turns_up: number | null; earned_month: number;
  steps: { profile: boolean; online: boolean; job: boolean; review: boolean };
  me: { lat: number; lng: number } | null; area: string | null;
  near: { lat: number; lng: number; icon: string }[];
  popular: { name: string; icon: string; n: number; mine: boolean }[];
  busy: number[] | null; busy_part: string | null;
  suburbs: { name: string; n: number }[];
  does: { name: string; icon: string }[];
  badges: { id: number; name: string; status: "verified" | "pending" | "rejected" | "expired" | null }[];
};

// Levels by jobs done. A level badge and a bar to the next one, the way Uber Pro and DoorDash show progress.
export const LEVELS: [number, string][] = [[1, "Rising"], [5, "Trusted"], [25, "Top"]];
function levelOf(done: number) {
  let i = LEVELS.length - 1;
  while (i > 0 && done < LEVELS[i][0]) i--;
  const next = LEVELS[i + 1] ?? null;
  return { name: LEVELS[i][1], from: LEVELS[i][0], next };
}

const ROS = "M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z";
const BADGE_ICON: Record<string, ReactNode> = {
  Insured: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />,
  "White Card": <path d="M4 17h16M6 17v-3a6 6 0 0 1 12 0v3M10 8V5h4v3" />,
  "Blue Card": <><circle cx="12" cy="7" r="3" /><path d="M7 21v-5a5 5 0 0 1 10 0v5" /></>,
  "First aid": <path d="M12 6v12M6 12h12" />,
  RSA: <path d="M7 3h10l-1 8a4 4 0 0 1-8 0zM12 15v6M8 21h8" />,
  "Forklift licence": <path d="M4 20V8h6l3 5v7M13 13h4V4M17 20h4M4 20h9" />,
};
const badgeIcon = (name: string) => BADGE_ICON[name] ?? <path d="M6 12.5l4 4 8-9" />;
const badgeLabel = (name: string) => (name === "Forklift licence" ? "Forklift" : name);

export function Badge({ name, on, s = 64 }: { name: string; on: boolean; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ROS} fill={on ? "#f5c518" : "#e4e9e6"} />
      <g transform="translate(6.6 6.6) scale(.45)" fill="none" stroke={on ? "#2a2d32" : "#9aa39e"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{badgeIcon(name)}</g>
    </svg>
  );
}
const tick = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2a2d32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5l4 4 8-9" /></svg>;
const pinPath = <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>;
const ln = (d: ReactNode, s = 28) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

/* Photo first, with name, age and the gold ID tick. The QR icon (workers) opens the share card, the cog opens Settings. */
export function ProfileHero({ photo, name, age, verified, place, onCard, onCog }: {
  photo: string | null; name: string; age: number | null; verified: boolean; place: string; onCard?: () => void; onCog: () => void;
}) {
  const pic = avatarUrl(photo);
  return (
    <section className="pr-hero" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>
      {!pic && <span className="pr-ini">{name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>}
      <div className="pr-bar">
        {onCard && <button onClick={onCard} aria-label="Your share card"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" /><path d="M14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2" /></svg></button>}
        <button onClick={onCog} aria-label="Settings"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>
      </div>
      <div className="pr-who">
        <div className="n">{cardName(name)}{age != null && <> <i>{age}</i></>}{verified && <GoldTick s={26} />}</div>
        {place && <div className="s">{place}</div>}
      </div>
    </section>
  );
}

/* Jobs near you: a map with a pin for each open job the worker can take. */
function NearMap({ me, near }: { me: { lat: number; lng: number } | null; near: WorkerHomeData["near"] }) {
  const box = useRef<HTMLDivElement>(null);
  const [noMap, setNoMap] = useState(false);
  useEffect(() => {
    let dead = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    loadMapKit().then((mk) => {
      if (dead || !box.current) return;
      if (!mk || !me) { setNoMap(true); return; }
      map = new mk.Map(box.current, { showsCompass: mk.FeatureVisibility.Hidden, showsMapTypeControl: false, showsZoomControl: false, showsUserLocationControl: false,
        isRotationEnabled: false, isScrollEnabled: false, isZoomEnabled: false,
        region: new mk.CoordinateRegion(new mk.Coordinate(me.lat, me.lng), new mk.CoordinateSpan(0.12, 0.12)) });
      const dot = document.createElement("div"); dot.className = "pr-me";
      map.addAnnotation(new mk.Annotation(new mk.Coordinate(me.lat, me.lng), () => dot));
      near.forEach((j) => {
        const el = document.createElement("div"); el.className = "pr-pin";
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CAT_SVG[j.icon] ?? CAT_SVG.other}</svg>`;
        map.addAnnotation(new mk.Annotation(new mk.Coordinate(j.lat, j.lng), () => el));
      });
      if (near.length) map.showItems(map.annotations, { padding: new mk.Padding(40, 40, 40, 40) });
    });
    return () => { dead = true; map?.destroy?.(); };
  }, [me?.lat, me?.lng, near.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="pr-map" ref={box}>{noMap && <span className="pr-me still" />}</div>;
}
// Category marks as plain SVG strings for the map pins (MapKit annotations are DOM, not React).
const CAT_SVG: Record<string, string> = {
  cleaning: '<path d="M8 9h6l1 3v9H7v-9z"/><path d="M9 9V6h4l3-2v5"/>',
  garden: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/>',
  moving: '<path d="M2 7h11v10H2z"/><path d="M13 10h4l3 3.5V17h-7"/><circle cx="6" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>',
  rubbish: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
  errands: '<path d="M5 8h14l-1 13H6z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
  delivery: '<path d="M3 7.5l9-4 9 4v9l-9 4-9-4z"/><path d="M3 7.5l9 4 9-4"/><path d="M12 11.5v9"/><path d="M7.5 5.5l9 4"/>',
  other: '<circle cx="12" cy="12" r="4"/>',
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type Driving = { status: "verified" | "pending" | "retake" | "rejected" | "expired" | null; expiry: string | null; vehicles: string[] };
export type TradeWork = { tradie: boolean; business: string | null; plan: "standard" | "premium" | null };
export function WorkerHome({ d, onlineBusy, onOnline, onStep, onSkills, onBadge, trade, drive, onLicence, onVehicles }: {
  d: WorkerHomeData; onlineBusy: boolean; onOnline: () => void; onStep: (k: "profile") => void; onSkills: () => void; onBadge: () => void; trade?: TradeWork | null;
  drive?: Driving | null; onLicence?: () => void; onVehicles?: () => void;
}) {
  const { tax } = useTax();
  const s = d.steps;
  const steps: [keyof typeof s, string][] = [["profile", "Profile"], ["online", "Go online"], ["job", "First job"], ["review", "First review"]];
  const nowAt = steps.findIndex(([k]) => !s[k]);
  const lv = levelOf(d.done);
  const recPct = d.reviewed ? Math.round((d.recommended / d.reviewed) * 100) : null;
  const busyMax = Math.max(0, ...(d.busy ?? []));
  const busyDay = busyMax ? (d.busy ?? []).indexOf(busyMax) : -1;
  const popMax = Math.max(1, ...d.popular.map((p) => p.n));
  const subMax = Math.max(1, ...d.suburbs.map((p) => p.n));
  const goBtn = !d.online && <button className="btn pr-go" disabled={onlineBusy} onClick={onOnline}>{onlineBusy ? "Going online…" : "Go online"}</button>;
  return (<>
    {tax && <TaxNudge missing={tax.missing} onOpen={() => { sessionStorage.setItem("mm-tax", "1"); window.dispatchEvent(new Event("mm-open-tax")); }} />}
    {d.done === 0 ? (
      <section className="pr-jr">
        <div className="big">{!s.profile ? "Finish your profile" : !s.online ? "Go online for your first job" : "Your first job is next"}</div>
        <div className="pr-trk">
          <i className="fill" style={{ width: `${(Math.max(0, nowAt) / 4) * 100}%` }} />
          {steps.map(([k, l], i) => (
            <button key={k} className={`st${s[k] ? " done" : i === nowAt ? " now" : ""}`} onClick={() => k === "profile" && !s.profile && onStep("profile")} disabled={k !== "profile" || s.profile}>
              <span className="d">{s[k] && tick}</span>{l}</button>
          ))}
        </div>
        {!s.profile ? <button className="btn pr-go" onClick={() => onStep("profile")}>Finish profile</button> : goBtn}
      </section>
    ) : (
      <section className="pr-lv">
        <div className="top"><Badge name="tick" on s={56} /><div><b>{lv.name}</b><span>{d.done} job{d.done === 1 ? "" : "s"} done</span></div></div>
        {lv.next && <>
          <div className="pb"><i style={{ width: `${((d.done - lv.from) / (lv.next[0] - lv.from)) * 100}%` }} /></div>
          <div className="pl"><span>{lv.from}</span><span>{lv.next[0] - d.done} job{lv.next[0] - d.done === 1 ? "" : "s"} to {lv.next[1]}</span><span>{lv.next[0]}</span></div>
        </>}
      </section>
    )}

    {d.done > 0 && (
      <section className="pr-sec pr-nums">
        <div><b className="g">{money(d.earned_month)}</b><small>this month</small></div>
        <div><b>{recPct == null ? "New" : `${recPct}%`}</b><small>{recPct == null ? "no reviews yet" : "recommend"}</small></div>
        <div><b>{d.done}</b><small>jobs done</small></div>
        <div><b>{d.turns_up == null ? "New" : `${d.turns_up}%`}</b><small>turned up</small></div>
      </section>
    )}

    {trade && (
      <section className="pr-sec">
        <h2>Trade work</h2>
        {!trade.tradie ? <button className="btn tr-ask-go" onClick={() => go("/work/trade")}>Create Tradie Profile</button> : <>
          <button className="pr-line" onClick={() => go("/work?trade=start")}><span><b>Trade jobs</b><small>{trade.plan ? "New jobs and your quotes" : "Select how you pay to start quoting"}</small></span>{Icon.chevron("var(--faint)")}</button>
          <button className="pr-line" onClick={() => go(trade.plan ? "/work?trade=plan" : "/work?trade=join")}><span><b>How you pay</b><small>{trade.plan === "premium" ? "Premium" : trade.plan ? "Standard" : "Not selected yet"}</small></span>{Icon.chevron("var(--faint)")}</button>
          <button className="pr-line" onClick={() => go("/work/trade")}><span><b>Tradie profile</b><small>{trade.business ?? "Your business, services and licences"}</small></span>{Icon.chevron("var(--faint)")}</button>
        </>}
      </section>
    )}

    {drive && (
      <section className="pr-sec">
        <h2>Driving</h2>
        <button className="pr-line" onClick={onLicence}>
          <span><b className={drive.status === "verified" ? "pr-drv" : undefined}>{drive.status === "verified" ? <>{Icon.tick("var(--emerald)", 18)}Licensed driver</> : "Driver licence"}</b>
            <small>{drive.status === "verified" ? `Valid to ${new Date(drive.expiry + "T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`
              : drive.status === "pending" ? "Being checked, usually within a few hours"
              : drive.status === "expired" ? "Expired. Add the new one to get driving jobs again"
              : drive.status === "retake" || drive.status === "rejected" ? "Not approved. Tap to send it again"
              : "Add it for deliveries, moving and tip runs"}</small></span>
          {drive.status === "verified" || drive.status === "pending" ? Icon.chevron("var(--faint)") : <span className="btn primary small">Add</span>}
        </button>
        <button className="pr-line" onClick={onVehicles}>
          <span><b>{drive.vehicles.length ? drive.vehicles.map((v) => `Has ${v.toLowerCase()}`).join(", ") : "No vehicle"}</b><small>Your vehicles</small></span>
          {Icon.chevron("var(--faint)")}
        </button>
      </section>
    )}

    <section className="pr-sec">
      <h2>{d.near.length ? "Jobs near you" : `Work in ${d.area ?? "your area"}`}</h2>
      <NearMap me={d.me} near={d.near} />
      {d.near.length ? (
        <div className="pr-row2"><div><b>{d.near.length} job{d.near.length === 1 ? "" : "s"}</b><small>near you right now</small></div>
          {d.online ? <button className="btn primary pr-small" onClick={() => go("/work", true)}>See them</button> : <button className="btn primary pr-small" disabled={onlineBusy} onClick={onOnline}>Go online</button>}</div>
      ) : (
        <div className="pr-empty"><b>{d.done === 0 ? "You're one of the first" : "No open jobs right now"}</b><span>Stay online and you're first in line</span></div>
      )}
    </section>

    {d.popular.length > 0 && (
      <section className="pr-sec"><h2>Popular this week</h2>
        <div className="pr-pop">
          {d.popular.map((p) => (
            <div key={p.name} className="r"><CatIcon name={p.icon} size={32} color="var(--emerald)" />
              <span className="t">{p.name}<i className={p.mine ? "" : "g"} style={{ width: `${(p.n / popMax) * 100}%` }} /></span>
              {p.mine ? <b>{p.n}</b> : <button className="pr-add" onClick={onSkills}>Add</button>}</div>
          ))}
        </div>
      </section>
    )}

    {busyMax > 0 && (
      <section className="pr-sec"><h2>Busy times</h2>
        <div className="pr-bars">{(d.busy ?? []).map((n, i) => <div key={i}><i className={n === busyMax ? "hot" : ""} style={{ height: `${Math.max(4, (n / busyMax) * 100)}%` }} />{DAYS[i]}</div>)}</div>
        <div className="pr-peak">Busiest: <b>{DAY_NAMES[busyDay]}{d.busy_part ? ` ${d.busy_part}` : ""}</b></div>
      </section>
    )}

    {d.suburbs.length > 0 && (
      <section className="pr-sec"><h2>Where the work is</h2>
        <div className="pr-pop">
          {d.suburbs.map((p) => <div key={p.name} className="r">{ln(pinPath)}<span className="t">{p.name}<i style={{ width: `${(p.n / subMax) * 100}%` }} /></span><b>{p.n}</b></div>)}
        </div>
      </section>
    )}

    <section className="pr-sec"><h2>What you do<button onClick={onSkills}>Edit</button></h2>
      <div className="pr-do">
        {d.does.map((c) => <button key={c.name} onClick={onSkills}><CatIcon name={c.icon} size={44} color="var(--emerald)" />{c.name.replace(" removal", "")}</button>)}
        {d.does.length < 4 && <button className="add" onClick={onSkills}>{ln(<path d="M12 5v14M5 12h14" />, 44)}Add</button>}
      </div>
    </section>

    <section className="pr-sec"><h2>Upskill</h2>
      <div className="pr-bg">
        {d.badges.map((b) => (
          <button key={b.id} className={b.status === "verified" ? "" : "off"} onClick={onBadge}>
            <Badge name={b.name} on={b.status === "verified"} />{badgeLabel(b.name)}{b.status === "pending" && <small>Being checked</small>}</button>
        ))}
      </div>
    </section>
  </>);
}

/* ---------- The share card ---------- */
export type PublicWorker = { id: string; name: string; first: string; age: number | null; photo: string | null; verified: boolean; suburb: string | null; area: string | null;
  jobs: number; reviewed: number; recommended: number; turns_up: number | null; does: { name: string; icon: string }[]; online?: boolean };
export const SHARE_HOST = "mahiman.app";

const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = no; i.src = src; });
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fy = 0.3) {
  const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, Math.max(0, (img.height - sh) * fy), sw, sh, x, y, w, h);
}
function ros(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  ctx.fillStyle = "#f5c518"; ctx.fill(new Path2D(ROS));
  ctx.strokeStyle = "#2a2d32"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(new Path2D("M7.8 12.2l2.8 2.8 5.6-6"));
  ctx.restore();
}
function green(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, "#1a9a70"); g.addColorStop(0.45, "#0d6f52"); g.addColorStop(1, "#073f2f");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
const FONT = '"Bricolage Grotesque", system-ui, sans-serif';

// A category's line icon as an image, in gold, for drawing on the card.
async function iconImg(name: string, color: string) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const svg = renderToStaticMarkup(<CatIcon name={name} size={96} color={color} />).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

// What they do, one segment each: icon over name, in a grid. Past the last cell it reads "+N more".
async function drawDoes(ctx: CanvasRenderingContext2D, does: { name: string; icon: string }[], x: number, y: number, colW: number, rowH: number, cols: number, rows: number, icon: number, font: number) {
  const cells = cols * rows;
  const shown = does.length > cells ? does.slice(0, cells - 1) : does;
  const icons = await Promise.all(shown.map((d) => iconImg(d.icon, "#f5c518").catch(() => null)));
  ctx.textBaseline = "middle"; ctx.font = `400 ${font}px ${FONT}`; ctx.fillStyle = "#fff";
  shown.forEach((d, i) => {
    const cx = x + (i % cols) * colW, cy = y + Math.floor(i / cols) * rowH;
    const im = icons[i]; if (im) ctx.drawImage(im, cx, cy, icon, icon);
    let label = d.name;
    while (ctx.measureText(label).width > colW - icon - 26 && label.length > 4) label = label.slice(0, -2) + "…";
    ctx.fillText(label, cx + icon + 14, cy + icon / 2);
  });
  if (does.length > cells) {
    const i = cells - 1, cx = x + (i % cols) * colW, cy = y + Math.floor(i / cols) * rowH;
    ctx.fillStyle = "#f5c518"; ctx.fillText(`+${does.length - shown.length} more`, cx, cy + icon / 2);
  }
  ctx.textBaseline = "alphabetic";
}

// Draws the card as a PNG: "phone" (1080 x 1920, for socials) or "print" (1050 x 600, business card ratio).
// The photo runs full bleed, what they do sits in segments with icons, and the bottom has mahiman.app, the store badges and their QR code.
export async function cardImage(w: PublicWorker, slug: string, kind: "phone" | "print"): Promise<string> {
  await document.fonts.ready;
  const link = `https://${SHARE_HOST}/w/${slug}`;
  const qr = await loadImg(await QRCode.toDataURL(link, { margin: 0, width: 600, color: { dark: "#073f2f", light: "#ffffff" } }));
  const [mascot, apple, google] = await Promise.all([loadImg("/mascot.png"), loadImg("/email/app-store.png"), loadImg("/email/google-play.png")]);
  const pic = avatarUrl(w.photo); const photo = pic ? await loadImg(pic).catch(() => null) : null;
  const place = [w.suburb, w.area].filter(Boolean).join(", ");
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  // The store badges side by side.
  const badges = (x: number, y: number, h: number, gap: number) => {
    const aw = apple.width * (h / apple.height), gw = google.width * (h / google.height);
    ctx.drawImage(apple, x, y, aw, h); ctx.drawImage(google, x + aw + gap, y, gw, h);
  };
  if (kind === "phone") {
    c.width = 1080; c.height = 1920; green(ctx, c.width, c.height);
    // Photo, full bleed from the top
    const ph = 1180;
    if (photo) cover(ctx, photo, 0, 0, 1080, ph, 0.2); else { ctx.fillStyle = "#0b4f3b"; ctx.fillRect(0, 0, 1080, ph); }
    const sh = ctx.createLinearGradient(0, ph * 0.5, 0, ph); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.7)"); ctx.fillStyle = sh; ctx.fillRect(0, ph * 0.5, 1080, ph * 0.5);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
    ctx.font = `600 96px ${FONT}`; const nm = cardName(w.name); ctx.fillText(nm, 66, ph - 120);
    if (w.verified) ros(ctx, 66 + ctx.measureText(nm).width + 22, ph - 194, 74);
    ctx.font = `300 44px ${FONT}`; ctx.fillText(place, 66, ph - 52);
    // Mahi Man, big and faded behind everything below the photo
    ctx.save(); ctx.beginPath(); ctx.rect(0, ph, 1080, 1920 - ph); ctx.clip();
    ctx.globalAlpha = 0.1; ctx.drawImage(mascot, 1080 - 760, ph + 20, 760, 775); ctx.restore();
    await drawDoes(ctx, w.does, 66, ph + 70, 474, 104, 2, 2, 64, 44);
    // Mahi Man in the background, bottom right
    // Scan to book me: the QR code on the left; beside it the line, the website and the store badges, lined up top and bottom with the code
    const qs = 330, qt = 1920 - 66 - qs, tx = 66 + qs + 44;
    ctx.fillStyle = "#fff"; ctx.fillRect(66, qt, qs, qs); ctx.drawImage(qr, 66 + 20, qt + 20, qs - 40, qs - 40);
    // "Scan to book me" level with the middle of the QR code; mahiman.app over the badges, which line up with its bottom
    ctx.font = `600 56px ${FONT}`; ctx.textBaseline = "middle"; ctx.fillText("Scan to book me", tx, qt + qs / 2 - 30); ctx.textBaseline = "alphabetic";
    ctx.font = `400 40px ${FONT}`; ctx.fillStyle = "#f5c518"; ctx.fillText(SHARE_HOST, tx, qt + qs - 70 - 22); ctx.fillStyle = "#fff";
    badges(tx, qt + qs - 70, 70, 12);
  } else {
    c.width = 1050; c.height = 600; green(ctx, c.width, c.height);
    // Photo, full bleed top to bottom on the left
    if (photo) cover(ctx, photo, 0, 0, 412, 600, 0.2); else { ctx.fillStyle = "#0b4f3b"; ctx.fillRect(0, 0, 412, 600); }
    const L = 452;
    ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic"; ctx.font = `600 52px ${FONT}`; const nm = cardName(w.name); ctx.fillText(nm, L, 102);
    if (w.verified) ros(ctx, L + ctx.measureText(nm).width + 14, 60, 44);
    ctx.font = `300 26px ${FONT}`; ctx.fillText(place, L, 144);
    // Mahi Man, big and faded behind the right side
    ctx.save(); ctx.beginPath(); ctx.rect(412, 0, 638, 600); ctx.clip();
    ctx.globalAlpha = 0.1; ctx.drawImage(mascot, 1050 - 560, 40, 560, 571); ctx.restore();
    await drawDoes(ctx, w.does, L, 176, 279, 54, 2, 2, 36, 25);
    // Mahi Man in the background, bottom right
    // Scan to book me: the QR code on the left; beside it the line, the website and the store badges, lined up top and bottom with the code
    const qs = 222, qt = 600 - 40 - qs, tx = L + qs + 28;
    ctx.fillStyle = "#fff"; ctx.fillRect(L, qt, qs, qs); ctx.drawImage(qr, L + 14, qt + 14, qs - 28, qs - 28);
    ctx.font = `600 30px ${FONT}`; ctx.textBaseline = "middle"; ctx.fillText("Scan to book me", tx, qt + qs / 2 - 20); ctx.textBaseline = "alphabetic";
    ctx.font = `400 22px ${FONT}`; ctx.fillStyle = "#f5c518"; ctx.fillText(SHARE_HOST, tx, qt + qs - 40 - 14); ctx.fillStyle = "#fff";
    badges(tx, qt + qs - 40, 40, 8);
  }
  return c.toDataURL("image/png");
}

async function saveImage(dataUrl: string, name: string) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const f = await Filesystem.writeFile({ path: name, data: dataUrl.split(",")[1], directory: Directory.Cache });
    await Share.share({ files: [f.uri], dialogTitle: "Save image" });
  } else {
    const a = document.createElement("a"); a.href = dataUrl; a.download = name; a.click();
  }
}

/* Your card: the branded phone card full screen, then Save image, Print card and Share. */
export function ShareCard({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [w, setW] = useState<PublicWorker | null>(null);
  const [slug, setSlug] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState<"" | "phone" | "print">("");
  useEffect(() => {
    rpc<string>("my_share_slug").then(async (s) => {
      setSlug(s);
      setQr(await QRCode.toString(`https://${SHARE_HOST}/w/${s}`, { type: "svg", margin: 0, color: { dark: "#073f2f", light: "#ffffff" } }));
      setW(await rpc<PublicWorker>("worker_public", { p_key: s }));
    }).catch((e) => toast(e instanceof Error ? e.message : String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  const save = async (k: "phone" | "print") => {
    if (!w) return;
    setBusy(k);
    try { await saveImage(await cardImage(w, slug, k), `Mahi-Man-${slug}-${k === "phone" ? "card" : "print"}.png`); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't make the image"); }
    setBusy("");
  };
  const pic = avatarUrl(w?.photo);
  return (
    <div className="screen sc" role="dialog" aria-label="Your card">
      <button className="sc-back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
      {w && (
        <div className="sc-card">
          <div className="sc-pic" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>
            <div className="w"><div className="n">{cardName(w.name)}{w.verified && <GoldTick s={24} />}</div><div className="s">{[w.suburb, w.area].filter(Boolean).join(", ")}</div></div>
          </div>
          <img className="sc-mascot" src="/mascot.png" alt="" />
          <div className="sc-does">
            {(w.does.length > 4 ? w.does.slice(0, 3) : w.does).map((c) => <span key={c.name}><CatIcon name={c.icon} size={24} color="var(--gold)" />{c.name}</span>)}
            {w.does.length > 4 && <span className="more">+{w.does.length - 3} more</span>}
          </div>
          <div className="sc-scan">
            <div className="q" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="t">
              <b>Scan to book me</b><span>{SHARE_HOST}</span>
              <span className="sc-badges"><img src="/email/app-store.png" alt="Download on the App Store" /><img src="/email/google-play.png" alt="Get it on Google Play" /></span>
            </div>
          </div>
        </div>
      )}
      <div className="sc-acts">
        <button className="btn stone" disabled={!w || !!busy} onClick={() => save("print")}>{busy === "print" ? "Making…" : "Print card"}</button>
        <button className="btn stone" disabled={!w || !!busy} onClick={() => save("phone")}>{busy === "phone" ? "Making…" : "Save image"}</button>
        <button className="btn sc-share" disabled={!w} onClick={async () => { const r = await shareLink(`Book me on Mahi Man`, `https://${SHARE_HOST}/w/${slug}`); if (r === "copied") toast("Link copied"); }}>Share</button>
      </div>
    </div>
  );
}
