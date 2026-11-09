import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { rpc } from "./supabase";

/* The worker's trip to a job: their location is sent to the customer from "I'm on my way" until the start code.
   It keeps going while the worker drives with Maps open (iOS shows the blue location pill). */

const BG = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
const KEY = "mm-trip";
let watcher: string | null = null;
let webWatch: number | null = null;
let lastSent = 0;

export const tripJob = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
const setTripJob = (id: string | null) => { try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

async function send(jobId: string, lat: number, lng: number, heading: number | null, accuracy: number | null) {
  // At most every 5 seconds: smooth on the map, light on the battery.
  if (Date.now() - lastSent < 5000) return;
  lastSent = Date.now();
  try {
    const keep = await rpc<boolean>("share_location", { p_job: jobId, p_lat: lat, p_lng: lng, p_heading: heading, p_accuracy: accuracy });
    if (keep === false) await stopTrip(jobId); // arrived, cancelled or reassigned
  } catch { /* offline for a moment: the next update tries again */ }
}

export async function startTrip(jobId: string): Promise<void> {
  if (watcher || webWatch !== null) await stopWatching();
  setTripJob(jobId);
  lastSent = 0;
  if (Capacitor.isNativePlatform()) {
    watcher = await BG.addWatcher(
      { backgroundMessage: "Sharing your location with your customer until you arrive.", backgroundTitle: "More Mahi", requestPermissions: true, stale: false, distanceFilter: 25 },
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
        (e) => { if (first) { first = false; stopTrip(jobId); reject(new Error(e.code === 1 ? "Allow location for More Mahi to share your trip." : "Couldn't get your location. Try again.")); } },
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    });
  }
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

