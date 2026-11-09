import { Capacitor } from "@capacitor/core";

// The public address people land on from a shared link (moves to moremahi.com when the domain is live).
export const SITE = "https://quickmahi.vercel.app";

// Opens the phone's own share sheet (Messages, WhatsApp and so on). Returns false if nothing could be shared.
export async function shareLink(text: string, url: string): Promise<"shared" | "copied" | "none"> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ text, url, dialogTitle: "Share" });
      return "shared";
    }
    if (navigator.share) { await navigator.share({ text, url }); return "shared"; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  } catch {
    return "none";
  }
}

export const inviteText = "I've been using More Mahi for odd jobs. Post a job, or earn extra cash doing them.";
