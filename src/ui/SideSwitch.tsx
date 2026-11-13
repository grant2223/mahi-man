import { useEffect } from "react";
import { go } from "../lib/router";
import { useSession } from "../lib/session";

// One account does both: get help with your own jobs, or do work for other people.
// Same switch on every home screen. The app opens on whichever side you used last;
// new visitors start on Get help, the way Airtasker, hipages and Thumbtack lead with posting.
const KEY = "mm-side";
export const lastSide = (): "help" | "work" => { try { return localStorage.getItem(KEY) === "work" ? "work" : "help"; } catch { return "help"; } };
export const setSide = (side: "help" | "work") => { try { localStorage.setItem(KEY, side); } catch { /* private mode */ } };

// Remembers which side is open when the tab bar is showing instead of the switch.
export function SetSide({ side }: { side: "help" | "work" }) {
  useEffect(() => setSide(side), [side]);
  return null;
}

export function SideSwitch({ side }: { side: "help" | "work" }) {
  const { profile } = useSession();
  useEffect(() => setSide(side), [side]);
  const work = profile?.is_worker ? "/work" : "/find";
  return (
    <div className="path-switch" role="tablist" aria-label="What are you here for?">
      <button className={side === "help" ? "on" : ""} role="tab" aria-selected={side === "help"} onClick={() => { if (side !== "help") { setSide("help"); go("/post"); } }}>Get help</button>
      <button className={side === "work" ? "on" : ""} role="tab" aria-selected={side === "work"} onClick={() => { if (side !== "work") { setSide("work"); go(work); } }}>Do work</button>
    </div>
  );
}
