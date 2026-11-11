import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mahiman.app",
  appName: "Mahi Man",
  webDir: "dist",
  backgroundColor: "#0B6B4F",
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    // Keeps trip location updates flowing while the worker drives with Maps in front (background-geolocation plugin).
    useLegacyBridge: true,
  },
  plugins: {
    // The app shrinks above the keyboard instead of sliding under the status bar.
    Keyboard: { resize: "native", resizeOnFullScreen: true },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
