import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mediaUrls, rpc } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { Screen } from "./kit";

/* Alerts: every alert the app sends also lands here, so nothing is lost if someone has phone alerts blocked.
   The bell sits in the top bar of the two home pages, with the unread count. Messages have their own tab, so they don't show here. */

export interface Alert { id: number; title: string; body: string | null; url: string | null; kind: string; created_at: string; read_at: string | null; photo: string | null }

let listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());

export function useAlertCount() {
  const { session } = useSession();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!session) { setN(0); return; }
    let live = true;
    const load = () => rpc<number>("alerts_unread").then((c) => live && setN(Number(c) || 0)).catch(() => {});
    load();
    listeners.add(load);
    const t = window.setInterval(load, 20000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { live = false; listeners.delete(load); window.clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [session?.user.id]);
  return n;
}

export function AlertsBell() {
  const n = useAlertCount();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="hero-icon" aria-label={n > 0 ? `Alerts, ${n} new` : "Alerts"} onClick={() => setOpen(true)}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0" />
        </svg>
        {n > 0 && <span className="count">{n > 9 ? "9+" : n}</span>}
      </button>
      {open && createPortal(<AlertsScreen onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr`;
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
};
const dayKey = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return "Today";
  if (d.getTime() >= start - 86400000) return "Yesterday";
  if (d.getTime() >= start - 6 * 86400000) return "This week";
  return "Earlier";
};

export function AlertsScreen({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Alert[] | null>(null);
  const [pics, setPics] = useState<Record<string, string>>({});
  useEffect(() => {
    rpc<Alert[]>("my_alerts").then((a) => {
      setList(a ?? []);
      mediaUrls((a ?? []).map((x) => x.photo).filter(Boolean) as string[]).then(setPics).catch(() => {});
    }).catch(() => setList([]));
  }, []);
  const unread = (list ?? []).filter((a) => !a.read_at).length;
  const readAll = () => {
    setList((l) => (l ?? []).map((a) => ({ ...a, read_at: a.read_at ?? new Date().toISOString() })));
    rpc("alerts_read", { p_id: null }).then(ping).catch(() => {});
  };
  const open = (a: Alert) => {
    if (!a.read_at) rpc("alerts_read", { p_id: a.id }).then(ping).catch(() => {});
    onClose();
    if (a.url) go(a.url);
  };
  const groups: [string, Alert[]][] = [];
  for (const a of list ?? []) {
    const k = dayKey(a.created_at);
    const g = groups.find(([x]) => x === k);
    if (g) g[1].push(a); else groups.push([k, [a]]);
  }
  return (
    <Screen title="Alerts" onBack={onClose} right={unread > 0 ? <button className="al-all" onClick={readAll}>Mark all read</button> : undefined}>
      <div className="screen-body al">
        {list && list.length === 0 && (
          <div className="al-empty">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0" /></svg>
            <b>No alerts yet</b>
            <span>Job updates, payments and offers show here.</span>
          </div>
        )}
        {groups.map(([k, items]) => (
          <section key={k}>
            <h2 className="al-h">{k}</h2>
            {items.map((a) => (
              <button key={a.id} className={a.read_at ? "al-row" : "al-row new"} onClick={() => open(a)}>
                {a.photo && pics[a.photo] ? <img src={pics[a.photo]} alt="" /> : <img className="al-mm" src="/mahi-head.png" alt="" />}
                <span className="al-t"><b>{a.title}</b>{a.body && <span>{a.body}</span>}</span>
                <span className="al-when">{ago(a.created_at)}{!a.read_at && <i aria-label="New" />}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </Screen>
  );
}
