import type { ReactNode } from "react";
import { go } from "../lib/router";
import { useSession } from "../lib/session";
import { setSide } from "./SideSwitch";
import { useUnread } from "./Messages";

// The menu along the bottom of the app, the way Airtasker, Uber and DoorDash do it.
// One bar for both sides of the app. It shows on the five main pages only, never inside a job or a step.
export type Tab = "help" | "work" | "messages" | "offers" | "you";

const S = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ICON: Record<Tab, ReactNode> = {
  help: <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5" />,
  work: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  messages: <path d="M4 5h16v11H9l-5 4z" />,
  offers: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  you: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
};
const LABEL: Record<Tab, string> = { help: "Get help", work: "Do work", messages: "Messages", offers: "Offers", you: "You" };

export function TabBar({ on }: { on: Tab }) {
  const { session, profile } = useSession();
  const unread = useUnread();
  // Signed-out visitors keep the Get help / Do work switch at the top instead.
  if (!session) return null;
  const open = (t: Tab) => {
    if (t === on) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (t === "help") { setSide("help"); go("/post", true); }
    if (t === "work") { setSide("work"); go(profile?.is_worker ? "/work" : "/find", true); }
    if (t === "messages") go("/messages", true);
    if (t === "offers") go("/offers", true);
    if (t === "you") go("/settings", true);
  };
  return (
    <>
      <div className="tb-space" aria-hidden="true" />
      <nav className="tb" aria-label="Main menu">
        {(Object.keys(LABEL) as Tab[]).map((t) => (
          <button key={t} className={t === on ? "on" : ""} aria-current={t === on ? "page" : undefined} onClick={() => open(t)}>
            <span className="tb-i"><svg {...S}>{ICON[t]}</svg>{t === "messages" && unread > 0 ? <b>{unread > 9 ? "9+" : unread}</b> : null}</span>
            <span>{LABEL[t]}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
