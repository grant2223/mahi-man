import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { go } from "./lib/router";

// Android: white status bar icons over the green header (iOS already does this).
if (Capacitor.getPlatform() === "android") {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
  // Android back button: back a screen, or tuck the app away from the first screen (never quits mid-task).
  import("@capacitor/app").then(({ App: Native }) => Native.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) history.back(); else Native.minimizeApp();
  }));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && location.hostname !== "localhost") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// A mahiman.app link opened on a phone with the app installed (a scanned worker code, a shared link) opens that screen in the app.
if (Capacitor.isNativePlatform()) {
  import("@capacitor/app").then(({ App: Native }) => Native.addListener("appUrlOpen", ({ url }) => {
    try { const u = new URL(url); if (u.hostname === "mahiman.app" || u.hostname === "mahiman.vercel.app") go(u.pathname + u.search); } catch { /* not a link we know */ }
  }));
}
