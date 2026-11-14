import { useState } from "react";
import { Icon } from "./kit";
import { markAsked, turnOnAlerts } from "../lib/push";

const COPY = {
  post: {
    title: "Know when they're free",
    items: [["People who are free", "Select them before their offer runs out"], ["On the way and done", "When your worker heads over and finishes"], ["Messages", "From the person you choose"]],
    button: "Turn on alerts",
  },
  work: {
    title: "Don't miss a job",
    items: [["New jobs near you", "The second they're posted, while you're online"], ["You got the job", "Straight away when a customer picks you"], ["Messages and payment", "From the customer, and when they've paid you"]],
    button: "Turn on job alerts",
  },
};

// Full-screen ask, shown once at the moment alerts matter. Apple's own box only appears after "Turn on".
export function AlertsAsk({ role, onDone }: { role: "post" | "work"; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const c = COPY[role];
  const done = () => { markAsked(role); onDone(); };
  return (
    <div className="screen alerts-ask" role="dialog" aria-label={c.title}>
      <div className="top">
        <span className="brand-t">Mahi Man</span>
        <h1>{c.title}</h1>
        <img src="/mascot.png" alt="" />
      </div>
      <div className="body">
        {c.items.map(([b, s]) => (
          <div key={b} className="li">{Icon.tick("var(--emerald)", 22)}<span><b>{b}</b>{s}</span></div>
        ))}
      </div>
      <div className="foot">
        <button className="link quiet" onClick={done}>Not now</button>
        <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await turnOnAlerts().catch(() => {}); done(); }}>{c.button}</button>
      </div>
    </div>
  );
}
