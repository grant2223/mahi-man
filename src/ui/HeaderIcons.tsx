import { go } from "../lib/router";
import { MessagesLink } from "./Messages";

// Small white icons in the top bar instead of labelled buttons, so the header stays clear.
const S = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function JobsIcon() {
  return <a className="hero-icon" href="/jobs" aria-label="My jobs" onClick={(e) => { e.preventDefault(); go("/jobs"); }}>
    <svg {...S}><path d="M8 4h8v3H8zM6 5.5H5v15h14v-15h-1M9 12h6M9 16h4" /></svg>
  </a>;
}

export function SettingsIcon() {
  return <a className="hero-icon" href="/settings" aria-label="Settings" onClick={(e) => { e.preventDefault(); go("/settings"); }}>
    <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  </a>;
}

export function HeaderIcons({ jobs = true }: { jobs?: boolean }) {
  return <span className="row hero-icons"><MessagesLink />{jobs && <JobsIcon />}<SettingsIcon /></span>;
}
