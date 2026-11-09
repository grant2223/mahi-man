import { useEffect, useState } from "react";
import { avatarUrl, rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { ChatScreen } from "./Chat";
import { StepHero } from "./kit";

export interface Thread {
  job_id: string; title: string; status: string; start_at: string; other_id: string; other_name: string; other_photo: string | null;
  last_body: string | null; last_at: string | null; last_from_me: boolean | null; unread: number;
}

const STATUS: Record<string, string> = { accepted: "on the way", in_progress: "working now", finished: "finished", disputed: "being looked at", confirmed: "done", cancelled: "cancelled", refunded: "closed" };

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString("en-AU", { weekday: "short" });
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

export function useUnread() {
  const { session } = useSession();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!session) { setN(0); return; }
    let live = true;
    const load = () => rpc<Thread[]>("my_threads").then((t) => live && setN(t.reduce((a, x) => a + Number(x.unread), 0))).catch(() => {});
    load();
    const t = window.setInterval(load, 20000);
    return () => { live = false; window.clearInterval(t); };
  }, [session?.user.id]);
  return n;
}

// The "Messages" link in the top bar, with the unread count.
export function MessagesLink() {
  const n = useUnread();
  return (
    <a className="hero-icon" href="/messages" aria-label={n > 0 ? `Messages, ${n} unread` : "Messages"} onClick={(e) => { e.preventDefault(); go("/messages"); }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
      {n > 0 && <span className="count">{n > 9 ? "9+" : n}</span>}
    </a>
  );
}

export function MessagesPage({ jobId }: { jobId?: string }) {
  const { session } = useSession();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const load = () => rpc<Thread[]>("my_threads").then(setThreads).catch(() => setThreads([]));
  useEffect(() => { if (session) load(); }, [session?.user.id]);
  if (!session) return null;
  const open = jobId ? threads?.find((t) => t.job_id === jobId) : undefined;

  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <StepHero title="Messages" sub="Every job you've posted or taken, in one place." onBack={() => (history.length > 1 ? history.back() : go("/"))} />
      <div className="threads">
        {threads?.map((t) => (
          <button key={t.job_id} className={`thread${Number(t.unread) > 0 ? " unread" : ""}`} onClick={() => go(`/messages/${t.job_id}`)}>
            <span className="ph">{avatarUrl(t.other_photo) ? <img src={avatarUrl(t.other_photo)!} alt="" /> : null}</span>
            <span className="t">
              <span className="row between" style={{ gap: 10 }}><b>{t.other_name}</b><span className="w">{when(t.last_at)}</span></span>
              <span className="j">{t.title}, {STATUS[t.status] ?? t.status}</span>
              <span className="row between" style={{ gap: 10 }}>
                <span className="l">{t.last_body ? `${t.last_from_me ? "You: " : ""}${t.last_body}` : "No messages yet"}</span>
                {Number(t.unread) > 0 && <span className="count">{t.unread}</span>}
              </span>
            </span>
          </button>
        ))}
        {threads && threads.length === 0 && (
          <div className="feed-empty" style={{ borderBottom: 0 }}>
            <b>No messages yet</b>
            <span>Once you choose someone for a job, or someone chooses you, you can message each other here.</span>
          </div>
        )}
      </div>
      {open && (
        <ChatScreen jobId={open.job_id} me={session.user.id} otherName={open.other_name} otherPhoto={open.other_photo}
          sub={`${open.title}, ${STATUS[open.status] ?? open.status}`}
          onBack={() => { load(); go("/messages", true); }}
          onViewJob={async () => {
            const { data } = await sb.from("jobs").select("customer_id").eq("id", open.job_id).single();
            go(data?.customer_id === session.user.id ? `/job/${open.job_id}` : "/work");
          }} />
      )}
    </div>
  );
}
