import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.moremahi.app",
  appName: "More Mahi",
  webDir: "dist",
  backgroundColor: "#0B6B4F",
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // The app shrinks above the keyboard instead of sliding under the status bar.
    Keyboard: { resize: "native", resizeOnFullScreen: true },
  },
};

export default config;
