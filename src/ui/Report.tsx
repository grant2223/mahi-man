import { useState } from "react";
import { rpc } from "../lib/supabase";
import { Icon, Screen, SearchPicker, useToast } from "./kit";

const REASONS = [
  "Unsafe or threatening",
  "Harassment or abusive messages",
  "Inappropriate photos or content",
  "Fake profile or scam",
  "Asked to pay more than the agreed price",
  "Didn't turn up",
  "Something else",
];

// Report a person, job or message, and optionally block them (Apple guideline 1.2).
export function ReportScreen({ name, userId, jobId, messageId, onBack, onDone }: {
  name: string; userId?: string | null; jobId?: string | null; messageId?: string | null; onBack: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    if (!reason) return setErr("Pick a reason");
    setBusy(true); setErr("");
    try {
      await rpc("report_content", { p_reason: reason, p_details: details, p_user: userId ?? null, p_job: jobId ?? null, p_message: messageId ?? null });
      if (block && userId) await rpc("block_user", { p_user: userId });
      toast(block ? `Reported and blocked ${name}` : "Reported. We'll look at it within 24 hours.");
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <Screen tone="ink" title={`Report ${name}`} onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t15 light" style={{ marginTop: 0, lineHeight: 1.45 }}>
          The More Mahi team reviews every report within 24 hours. {name} isn't told who reported them.
        </p>
        <div className="stack">
          <button className="field" onClick={() => setPick(true)}>
            <span className="row between" style={{ width: "100%" }}>
              <span className="stack" style={{ gap: 2 }}><span className="k">Reason</span><span className={reason ? "v" : "v ph"}>{reason || "Pick a reason"}</span></span>
              {Icon.search()}
            </span>
          </button>
          <label className="field" style={{ cursor: "text" }}><span className="k">What happened? Optional</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} style={{ minHeight: 110 }} /></label>
          {userId && (
            <button className={block ? "choice on" : "choice"} style={{ borderRadius: 4, borderBottom: 0, background: block ? "var(--emerald-tint)" : "var(--ground)" }} onClick={() => setBlock(!block)}>
              <span className="t"><b>Also block {name}</b><span>You won't see each other's jobs or messages again.</span></span>
              {block && Icon.tick("var(--emerald)", 24)}
            </button>
          )}
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn danger" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send report"}</button>
        </div>
      </div>
      {pick && <SearchPicker title="Reason" value={reason ? [reason] : []} options={REASONS.map((r) => ({ id: r, label: r }))}
        onChange={(v) => setReason(String(v[0]))} onClose={() => setPick(false)} />}
    </Screen>
  );
}
