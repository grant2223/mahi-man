import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { rpc, sb, SUPABASE_KEY, SUPABASE_URL } from "./supabase";

/* The worker's trip to a job: their location is sent to the customer from "I'm on my way" until the start code.
   It keeps going while the worker drives with Maps open (iOS shows the blue location pill). */

const BG = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
const KEY = "mm-trip";
let watcher: string | null = null;
let webWatch: number | null = null;
let lastSent = 0;

export const tripJob = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const setTripJob = (id: string | null) => { try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

/* Android slows the web view's own requests after a few minutes in the background, which would freeze the customer's
   map while the worker drives with Maps in front. Sending through the native HTTP client keeps the updates going. */
async function nativeRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data } = await sb.auth.getSession();
  const r = await CapacitorHttp.post({
    url: `${SUPABASE_URL}/rest/v1/rpc/${fn}`,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`, "Content-Type": "application/json" },
    data: args,
  });
  if (r.status >= 400) throw new Error(`${fn} failed (${r.status})`);
  return r.data as T;
}

async function send(jobId: string, lat: number, lng: number, heading: number | null, accuracy: number | null) {
  // At most every 5 seconds: smooth on the map, light on the battery.
  if (Date.now() - lastSent < 5000) return;
  lastSent = Date.now();
  try {
    const args = { p_job: jobId, p_lat: lat, p_lng: lng, p_heading: heading, p_accuracy: accuracy };
    const keep = Capacitor.getPlatform() === "android" ? await nativeRpc<boolean>("share_location", args) : await rpc<boolean>("share_location", args);
    if (keep === false) await stopTrip(jobId); // arrived, cancelled or reassigned
  } catch { /* offline for a moment: the next update tries again */ }
}

export async function startTrip(jobId: string): Promise<void> {
  if (watcher || webWatch !== null) await stopWatching();
  setTripJob(jobId);
  lastSent = 0;
  if (Capacitor.isNativePlatform()) {
    watcher = await BG.addWatcher(
      { backgroundMessage: "Sharing your location with your customer until you arrive.", backgroundTitle: "Mahi Man", requestPermissions: true, stale: false, distanceFilter: 25 },
      (loc, err) => {
        if (err) {
          if (err.code === "NOT_AUTHORIZED") { stopTrip(jobId); BG.openSettings().catch(() => {}); }
          return;
        }
        if (loc) send(jobId, loc.latitude, loc.longitude, loc.bearing, loc.accuracy);
      },
    );
  } else if ("geolocation" in navigator) {
    await new Promise<void>((resolve, reject) => {
      let first = true;
      webWatch = navigator.geolocation.watchPosition(
        (p) => { send(jobId, p.coords.latitude, p.coords.longitude, p.coords.heading, p.coords.accuracy); if (first) { first = false; resolve(); } },
        (e) => { if (first) { first = false; stopTrip(jobId); reject(new Error(e.code === 1 ? "Allow location for Mahi Man to share your trip." : "Couldn't get your location. Try again.")); } },
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    });
  }
}

/* Where the phone is right now, once. In the app this goes through the native location plugin, so iOS asks once
   with Mahi Man's own message; the web view's geolocation would add a second "localhost would like to use your
   location" prompt. Resolves null if they say no or it takes too long. */
export function currentPosition(timeoutMs = 10000): Promise<{ lat: number; lng: number } | null> {
  if (!Capacitor.isNativePlatform()) {
    if (!("geolocation" in navigator)) return Promise.resolve(null);
    return new Promise((res) => navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null),
      { maximumAge: 300000, timeout: timeoutMs, enableHighAccuracy: false },
    ));
  }
  return new Promise((res) => {
    let id: string | null = null;
    let done = false;
    const finish = (v: { lat: number; lng: number } | null) => {
      if (done) return;
      done = true;
      if (id) BG.removeWatcher({ id }).catch(() => {});
      res(v);
    };
    setTimeout(() => finish(null), timeoutMs);
    BG.addWatcher({ requestPermissions: true, stale: true }, (loc, err) => {
      if (err || !loc) { if (err) finish(null); return; }
      finish({ lat: loc.latitude, lng: loc.longitude });
    }).then((w) => { id = w; if (done) BG.removeWatcher({ id: w }).catch(() => {}); }).catch(() => finish(null));
  });
}

async function stopWatching() {
  if (watcher) { await BG.removeWatcher({ id: watcher }).catch(() => {}); watcher = null; }
  if (webWatch !== null) { navigator.geolocation.clearWatch(webWatch); webWatch = null; }
}

export async function stopTrip(jobId?: string): Promise<void> {
  const id = jobId ?? tripJob();
  await stopWatching();
  setTripJob(null);
  if (id) await rpc("stop_sharing", { p_job: id }).catch(() => {});
}

// Picks a trip back up if the app was closed mid-drive.
export async function resumeTrip(jobId: string, stillOnTheWay: boolean): Promise<boolean> {
  if (tripJob() !== jobId) return false;
  if (!stillOnTheWay) { await stopTrip(jobId); return false; }
  if (!watcher && webWatch === null) await startTrip(jobId).catch(() => {});
  return true;
}

