import { useEffect } from "react";
import { go } from "../lib/router";
import { useSession } from "../lib/session";

// One account does both: get help with your own jobs, or do work for other people.
// Same switch on every home screen. The app opens on whichever side you used last;
// new visitors start on Get help, the way Airtasker, hipages and Thumbtack lead with posting.
const KEY = "mm-side";
export const lastSide = (): "help" | "work" => { try { return localStorage.getItem(KEY) === "work" ? "work" : "help"; } catch { return "help"; } };

export function SideSwitch({ side }: { side: "help" | "work" }) {
  const { profile } = useSession();
  useEffect(() => { try { localStorage.setItem(KEY, side); } catch { /* private mode */ } }, [side]);
  const work = profile?.is_worker ? "/work" : "/find";
  return (
    <div className="path-switch" role="tablist" aria-label="What are you here for?">
      <button className={side === "help" ? "on" : ""} role="tab" aria-selected={side === "help"} onClick={() => side !== "help" && go("/")}>Get help</button>
      <button className={side === "work" ? "on" : ""} role="tab" aria-selected={side === "work"} onClick={() => side !== "work" && go(work)}>Do work</button>
    </div>
  );
}
