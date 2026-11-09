import { Capacitor } from "@capacitor/core";
import { rpc, sb } from "./supabase";
import { go } from "./router";

// Phone alerts. Only the iPhone app can receive them; the website never asks.
const KEY = "mm-push-token";
export const pushSupported = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

type State = "granted" | "prompt" | "denied" | "unsupported";

async function plugin() {
  return (await import("@capacitor/push-notifications")).PushNotifications;
}

export async function alertsState(): Promise<State> {
  if (!pushSupported()) return "unsupported";
  const p = await (await plugin()).checkPermissions();
  return p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt";
}

// Shows Apple's own permission box, then registers this phone.
export async function turnOnAlerts(): Promise<State> {
  if (!pushSupported()) return "unsupported";
  const P = await plugin();
  let p = await P.checkPermissions();
  if (p.receive !== "granted") p = await P.requestPermissions();
  if (p.receive === "granted") { await P.register(); return "granted"; }
  return "denied";
}

// Asked once per role ("post" for customers, "work" for workers), never again after a yes or a no.
export const askedFor = (role: "post" | "work") => { try { return localStorage.getItem(`mm-alerts-${role}`) === "1"; } catch { return true; } };
export const markAsked = (role: "post" | "work") => { try { localStorage.setItem(`mm-alerts-${role}`, "1"); } catch { /* ignore */ } };

let started = false;
// Runs once at start-up: saves this phone against the signed-in account and opens the right screen when an alert is tapped.
export async function startPush() {
  if (started || !pushSupported()) return;
  started = true;
  const P = await plugin();
  await P.addListener("registration", async ({ value }) => {
    try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
    const { data } = await sb.auth.getUser();
    if (data.user) await sb.from("push_tokens").upsert({ token: value, user_id: data.user.id, platform: "ios", updated_at: new Date().toISOString() });
  });
  await P.addListener("pushNotificationActionPerformed", async ({ actionId, notification }) => {
    const d = (notification.data ?? {}) as { url?: string; job?: string; worker?: string };
    if (actionId === "CHOOSE" && d.job && d.worker) {
      try { await rpc("choose_offer", { p_job: d.job, p_worker: d.worker }); } catch { /* the job screen shows what happened */ }
    } else if (actionId === "CONFIRM" && d.job) {
      try { await rpc("confirm_tomorrow", { p_job: d.job }); } catch { /* the job screen shows what happened */ }
    } else if (actionId === "CANT" && d.job) {
      try { await rpc("cant_make_it", { p_job: d.job }); } catch { /* ignore */ }
    } else if (actionId === "IGNORE" && d.job && d.worker) {
      try { await rpc("ignore_offer", { p_job: d.job, p_worker: d.worker }); } catch { /* ignore */ }
    }
    if (d.url && d.url.startsWith("/")) go(d.url);
  });
  // Already allowed: make sure this phone is registered to whoever is signed in.
  if ((await P.checkPermissions()).receive === "granted") await P.register();
  sb.auth.onAuthStateChange(async (e) => {
    if (e === "SIGNED_IN" && (await P.checkPermissions()).receive === "granted") await P.register();
  });
}

// Before signing out: this phone stops getting that account's alerts.
export async function forgetThisPhone() {
  if (!pushSupported()) return;
  let t: string | null = null;
  try { t = localStorage.getItem(KEY); } catch { /* ignore */ }
  if (t) await sb.from("push_tokens").delete().eq("token", t);
}

export async function signOut() {
  await forgetThisPhone().catch(() => {});
  await sb.auth.signOut();
}
