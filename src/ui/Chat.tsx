import { useEffect, useRef, useState } from "react";
import { avatarUrl, mediaUrls, rpc, sb } from "../lib/supabase";
import { shrinkImage } from "../lib/format";
import { Icon } from "./kit";

interface Msg { id: string; sender_id: string; body: string; created_at: string; photo_path: string | null }

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
const day = (iso: string) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === new Date(now.getTime() - 864e5).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
};

// In-app messages, full screen: neither side ever sees the other's phone number or email.
export function ChatScreen({ jobId, me, otherName, otherPhoto, sub, onBack, onViewJob }: {
  jobId: string; me: string; otherName: string; otherPhoto?: string | null; sub?: string; onBack: () => void; onViewJob?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const photoIn = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    sb.from("messages").select("id,sender_id,body,created_at,photo_path").eq("job_id", jobId).order("created_at").then(({ data }) => setMsgs((data ?? []) as Msg[]));
    rpc("mark_read", { p_job: jobId }).catch(() => {});
    const ch = sb.channel(`msgs-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${jobId}` }, (p) => {
        setMsgs((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg]));
        rpc("mark_read", { p_job: jobId }).catch(() => {});
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [jobId]);

  useEffect(() => {
    const need = msgs.map((m) => m.photo_path).filter((p): p is string => !!p && !urls[p]);
    if (need.length) mediaUrls(need).then((u) => setUrls((x) => ({ ...x, ...u })));
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  async function send(photo?: string) {
    const body = text.trim() || (photo ? "Photo" : "");
    if (!body) return;
    setText("");
    const { data, error } = await sb.from("messages").insert({ job_id: jobId, sender_id: me, body, photo_path: photo ?? null }).select("id,sender_id,body,created_at,photo_path").single();
    if (!error && data) setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data as Msg]));
  }

  async function sendPhoto(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      let blob: Blob = f;
      try { blob = await shrinkImage(f); } catch { /* keep */ }
      const p = `${me}/msg-${jobId}-${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("job-media").upload(p, blob, { contentType: "image/jpeg" });
      if (!error) await send(p);
    } finally { setBusy(false); }
  }

  const photo = avatarUrl(otherPhoto);
  let lastDay = "";
  return (
    <div className="screen chat" role="dialog" aria-label={`Messages with ${otherName}`}>
      <div className="chat-top">
        <button className="back" onClick={onBack} aria-label="Back">{Icon.back("var(--ink)")}</button>
        <span className="ph">{photo ? <img src={photo} alt="" /> : null}</span>
        <span className="t"><b>{otherName}</b>{sub && <span>{sub}</span>}</span>
        {onViewJob && <button className="btn stone small" onClick={onViewJob}>View job</button>}
      </div>
      <div className="chat-body">
        {msgs.length === 0 && <p className="muted small" style={{ textAlign: "center", margin: "24px 0" }}>Messages stay in the app. Your number is never shared.</p>}
        {msgs.map((m) => {
          const dd = day(m.created_at);
          const showDay = dd !== lastDay;
          lastDay = dd;
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className="chat-item" style={{ alignSelf: mine ? "flex-end" : "flex-start" }}>
              {showDay && <span className="chat-day">{dd}</span>}
              {m.photo_path
                ? <a className={mine ? "bubble me pic" : "bubble pic"} href={urls[m.photo_path]} target="_blank" rel="noreferrer">{urls[m.photo_path] ? <img src={urls[m.photo_path]} alt="Photo" /> : "Photo"}</a>
                : <div className={mine ? "bubble me" : "bubble"}>{m.body}</div>}
              <span className="chat-time" style={{ alignSelf: mine ? "flex-end" : "flex-start" }}>{time(m.created_at)}</span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="chat-compose">
        <button className="sq" onClick={() => photoIn.current?.click()} disabled={busy} aria-label="Send a photo">{Icon.camera("var(--emerald)")}</button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${otherName.split(" ")[0]}`} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="sq go" onClick={() => send()} aria-label="Send">{Icon.arrow("#fff")}</button>
        <input ref={photoIn} type="file" accept="image/*" hidden onChange={(e) => { sendPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}
