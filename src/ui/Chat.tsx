import { useEffect, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { Screen } from "./kit";

interface Msg { id: string; sender_id: string; body: string; created_at: string }

// In-app messages: neither side ever sees the other's phone number or email.
export function ChatScreen({ jobId, me, otherName, onBack }: { jobId: string; me: string; otherName: string; onBack: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sb.from("messages").select("*").eq("job_id", jobId).order("created_at").then(({ data }) => setMsgs((data ?? []) as Msg[]));
    const ch = sb.channel(`msgs-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${jobId}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg])))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [jobId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await sb.from("messages").insert({ job_id: jobId, sender_id: me, body }).select().single();
    if (!error && data) setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data as Msg]));
  }

  return (
    <Screen title={otherName} onBack={onBack}>
      <div className="screen-body">
        <div className="bubbles">
          {msgs.length === 0 && <p className="muted small" style={{ textAlign: "center" }}>Messages stay in the app. Your number is never shared.</p>}
          {msgs.map((m) => <div key={m.id} className={m.sender_id === me ? "bubble me" : "bubble"}>{m.body}</div>)}
          <div ref={end} />
        </div>
      </div>
      <div className="composer">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn primary small" style={{ height: 50 }} onClick={send}>Send</button>
      </div>
    </Screen>
  );
}
