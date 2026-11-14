import { Capacitor } from "@capacitor/core";
import { rpc, sb } from "./supabase";

/* Counts app opens for the admin Users page: which phone, which version, and who (once signed in).
   Each phone gets a random id the first time the app opens. The server keeps one row per phone every 10 minutes at most. */
const KEY = "mm-install";
function installId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return null; }
}

let version: string | null = null;
async function report() {
  const id = installId();
  if (!id) return;
  if (version == null) version = await import("@capacitor/app").then(({ App }) => App.getInfo()).then((i) => `${i.version} (${i.build})`).catch(() => "");
  rpc("app_open", { p_install: id, p_platform: Capacitor.getPlatform(), p_version: version || null }).catch(() => {});
}

export function startOpens() {
  if (!Capacitor.isNativePlatform()) return;
  report();
  import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => { if (isActive) report(); }));
  // Signing in on this open links it to the account.
  sb.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") report(); });
}
