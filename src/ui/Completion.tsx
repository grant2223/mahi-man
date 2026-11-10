import { CUSTOMER_KEYS, FaceRow, WORKER_KEYS } from "./Ratings";
import { useEffect, useState, type ReactNode } from "react";
import { rpc, sb, type Dispute, type Job, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money, shrinkImage } from "../lib/format";
import { Icon, Logo, SearchPicker, StepHero, useToast } from "./kit";
import { inviteText, shareLink, SITE } from "../lib/share";

/* The end of a job, for both sides: get paid, pay, confirm, review, and sort out problems. */

export const DONE_STEPS = ["Booked", "Started", "Finished", "Paid", "Reviewed"];

export function DoneHero({ jobName, label, big, lime, sub, step }: { jobName: string; label: string; big: string; lime?: boolean; sub: string; step: number }) {
  return (
    <section className="hero cp-hero">
      <div className="hero-top cp-top">
        <span className="brand"><Logo /> Mahi Man</span>
        <span className="jn">{jobName}</span>
      </div>
      <span className="label" style={{ marginTop: 18 }}>{label}</span>
      <span className={`big${lime ? " lime" : ""}`} style={big.length > 6 ? { fontSize: 60, letterSpacing: -2.5, lineHeight: 1 } : undefined}>{big}</span>
      <span className="sub" style={{ marginTop: 6 }}>{sub}</span>
      <div className="progress" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))", marginTop: 18 }}>
        {DONE_STEPS.map((s, i) => <span key={s} className={i < step ? "on" : i === step ? "now" : ""} />)}
      </div>
      <div className="progress-labels" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
        {DONE_STEPS.map((s, i) => <span key={s} className={i === step ? "on" : ""}>{s}</span>)}
      </div>
    </section>
  );
}

export function PriceRows({ title, jobName, priceCents, extras, totalLabel }: { title?: string; jobName: string; priceCents: number; extras: { reason: string; amount_cents: number }[]; totalLabel: string }) {
  const total = priceCents + extras.reduce((a, e) => a + e.amount_cents, 0);
  return (
    <div className="cp-sec">
      {title && <span className="cp-title">{title}</span>}
      <div className="cp-row"><span>{jobName}</span><span>{money(priceCents)}</span></div>
      {extras.map((e, i) => <div key={i} className="cp-row"><span>Extra approved: {e.reason}</span><span>{money(e.amount_cents)}</span></div>)}
      <div className="cp-total"><span>{totalLabel}</span><span>{money(total)}</span></div>
    </div>
  );
}

export function Note({ icon, children }: { icon: "clock" | "lock"; children: ReactNode }) {
  return (
    <div className="cp-note">
      {icon === "clock" ? Icon.clockLine("var(--muted)") : Icon.lockLine("var(--emerald)")}
      <span>{children}</span>
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="actionbar">{children}</div>;
}

/* ---------- Reviews ---------- */
// "Would you recommend them?", then each thing that matters rated with faces. Customers rate workers on five, workers rate customers on four.
export function ReviewView({ jobId, jobName, done, other, isWorker, onDone }: {
  jobId: string; jobName: string; done: string; person?: PersonCard | null; about?: string; other: string; isWorker: boolean; onDone: () => void;
}) {
  const toast = useToast();
  const keys = isWorker ? CUSTOMER_KEYS : WORKER_KEYS;
  const [rec, setRec] = useState<boolean | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const first = other.split(" ")[0];
  const ready = rec !== null && keys.every((x) => scores[x.k]);
  if (saved) {
    return (
      <div className="app" style={{ background: "var(--card)" }}>
        <section className="hero cp-hero" style={{ paddingBottom: 30 }}>
          <span className="row t15 light" style={{ gap: 8, color: "rgba(255,255,255,0.85)" }}>{Icon.tick("var(--lime)", 16)}Review saved</span>
          <h1 className="mid" style={{ margin: "14px 0 8px" }}>Know someone who'd use this?</h1>
          <span className="sub">{isWorker ? "Mates who want extra cash, or anyone with odd jobs that need doing." : "Anyone with odd jobs that need doing, or mates who want extra cash."}</span>
        </section>
        <div style={{ flex: 1 }} />
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={onDone}>Done</button>
          <button className="btn primary" style={{ flex: 2 }} onClick={async () => {
            const r = await shareLink(inviteText, SITE);
            if (r === "copied") toast("Link copied. Paste it in a message.");
            if (r !== "none") onDone();
          }}>Invite a mate</button>
        </ActionBar>
      </div>
    );
  }
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <section className="hero cp-hero" style={{ paddingBottom: 26 }}>
        <span className="row t15 light" style={{ gap: 8, color: "rgba(255,255,255,0.85)" }}>{Icon.tick("var(--lime)", 16)}{jobName}, {done.toLowerCase()}</span>
        <h1 className="mid" style={{ margin: "12px 0 0", fontSize: 34, lineHeight: 1.05 }}>Would you recommend {first}?</h1>
      </section>
      <div className="rec-yn">
        <button className={`btn ${rec === true ? "primary" : "stone"}`} onClick={() => setRec(true)} aria-pressed={rec === true}>{rec === true && Icon.tick("#fff", 20)} Yes</button>
        <button className={`btn ${rec === false ? "primary" : "stone"}`} onClick={() => setRec(false)} aria-pressed={rec === false}>{rec === false && Icon.tick("#fff", 20)} No</button>
      </div>
      {keys.map((x) => <FaceRow key={x.k} label={x.label} q={x.q} value={scores[x.k] ?? 0} onChange={(n) => setScores({ ...scores, [x.k]: n })} />)}
      <div className="cp-sec" style={{ gap: 10 }}>
        <label className="cp-label" htmlFor="rv">Anything else? <span className="t15 light muted">Optional</span></label>
        <textarea id="rv" className="cp-text" style={{ height: 80 }} value={comment} maxLength={600} onChange={(e) => setComment(e.target.value)} />
      </div>
      <Note icon="lock">{first} sees your review once they've reviewed you, or after 7 days. Neither of you can change it after that.</Note>
      <div style={{ flex: 1 }} />
      <ActionBar>
        <button className="btn stone" style={{ flex: 1 }} onClick={() => { try { localStorage.setItem(`mm-review-later-${jobId}`, "1"); } catch { /* fine */ } onDone(); }}>Later</button>
        <button className="btn primary" style={{ flex: 2 }} disabled={!ready || busy} onClick={async () => {
          setBusy(true);
          try { await rpc("leave_review", { p_job: jobId, p_recommend: rec, p_scores: scores, p_comment: comment }); setSaved(true); setBusy(false); }
          catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
        }}>{busy ? "Saving…" : ready ? "Save review" : "Rate every line"}</button>
      </ActionBar>
    </div>
  );
}

export function reviewSkipped(jobId: string) {
  try { return localStorage.getItem(`mm-review-later-${jobId}`) === "1"; } catch { return false; }
}

/* ---------- Report a problem (either side, once the job is finished) ---------- */
const REASONS_CUSTOMER = ["Job not finished", "Not done properly", "Something was damaged", "Asked for more money", "Didn't turn up", "Felt unsafe", "Something else"];
const REASONS_WORKER = ["Not paid", "Paid less than agreed", "The job was bigger than booked", "Couldn't get in", "Felt unsafe", "Something else"];
const FIX_CUSTOMER = (w: string) => [`${w} comes back to finish it`, "Pay a part of the price", "Pay nothing", "Something else"];
const FIX_WORKER = (c: string) => [`${c} pays the full amount`, `${c} pays the rest`, "Something else"];

export function ProblemScreen({ job, jobName, otherName, isWorker, onBack, onDone }: {
  job: Job; jobName: string; otherName: string; isWorker: boolean; onBack: () => void; onDone: () => void;
}) {
  const { session } = useSession();
  const [reason, setReason] = useState(isWorker ? "Not paid" : "");
  const [fix, setFix] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<{ blob: Blob; url: string; video: boolean; name: string }[]>([]);
  const [pick, setPick] = useState<null | "reason" | "fix">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reasons = isWorker ? REASONS_WORKER : REASONS_CUSTOMER;
  const fixes = isWorker ? FIX_WORKER(otherName) : FIX_CUSTOMER(otherName);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 6) break;
      const video = f.type.startsWith("video/");
      if (video && f.size > 50 * 1024 * 1024) { setErr("That video is too big. Record a shorter one."); continue; }
      let blob: Blob = f;
      if (!video) { try { blob = await shrinkImage(f); } catch { /* keep */ } }
      next.push({ blob, url: URL.createObjectURL(blob), video, name: f.name });
    }
    setFiles(next);
  }

  async function send() {
    setErr("");
    if (!reason) return setErr("Pick what went wrong.");
    if (!fix) return setErr("Pick what would put it right.");
    if (details.trim().length < 10) return setErr("Tell us a little more about what happened.");
    if (!session) return;
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const ext = f.video ? (f.name.split(".").pop() || "mp4").toLowerCase() : "jpg";
        const p = `${session.user.id}/dispute-${job.id}-${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("job-media").upload(p, f.blob, { contentType: f.video ? (f.blob.type || "video/mp4") : "image/jpeg" });
        if (error) throw new Error("A photo didn't upload. Check your signal and try again.");
        paths.push(p);
      }
      await rpc("report_job_problem", { p_job: job.id, p_reason: reason, p_fix: fix, p_details: details.trim(), p_media: paths });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <div className="screen" role="dialog" aria-label="Report a problem" style={{ background: "var(--card)" }}>
      <StepHero title="Report a problem" sub={`${jobName} with ${otherName}`} onBack={onBack} />
      <div className="screen-body" style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", gap: 22, background: "var(--card)" }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="cp-label">What went wrong?</span>
          <button className="cp-select" onClick={() => setPick("reason")}><span className={reason ? "" : "ph"}>{reason || "Choose a reason"}</span>{Icon.down("var(--ink)")}</button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="cp-label">What would put it right?</span>
          <button className="cp-select" onClick={() => setPick("fix")}><span className={fix ? "" : "ph"}>{fix || "Choose one"}</span>{Icon.down("var(--ink)")}</button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label className="cp-label" htmlFor="pd">Tell us what happened</label>
          <textarea id="pd" className="cp-text" style={{ height: 120 }} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="cp-label">Photos or video</span>
          <div className="cp-media">
            {files.map((f, i) => (
              <button key={f.url} className="cp-thumb" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Remove">
                {f.video ? <video src={f.url} muted playsInline /> : <img src={f.url} alt="" />}
                <span className="x">{Icon.x("#fff", 14)}</span>
              </button>
            ))}
            {files.length < 6 && (
              <label className="cp-thumb add" aria-label="Add photo or video">
                {Icon.plus("var(--emerald)")}
                <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 8, padding: "16px 0", borderTop: "1px solid var(--line)" }}>
          <span className="cp-label">What happens next</span>
          <span className="t15 light muted" style={{ lineHeight: 1.5 }}>
            {otherName} is told straight away and has 24 hours to give their side. {isWorker ? "" : "Don't pay until it's sorted. "}We look at the photos, the messages and both sides, and decide within 2 business days.
          </span>
        </div>
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      <ActionBar>
        <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send to Mahi Man"}</button>
      </ActionBar>
      {pick === "reason" && <SearchPicker title="What went wrong?" value={[reason]} options={reasons.map((r) => ({ id: r, label: r }))} onClose={() => setPick(null)} onChange={(v) => setReason(String(v[0]))} />}
      {pick === "fix" && <SearchPicker title="What would put it right?" value={[fix]} options={fixes.map((r) => ({ id: r, label: r }))} onClose={() => setPick(null)} onChange={(v) => setFix(String(v[0]))} />}
    </div>
  );
}

/* ---------- A dispute that's open, or just decided ---------- */
const OUTCOME: Record<string, string> = {
  pay_full: "Paid in full", return_finish: "Finish the job, then paid in full", part: "Part payment", nothing: "Nothing owed", agreed: "Sorted between you",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "long", hour: "numeric", minute: "2-digit" }).replace(",", "");

export function DisputeView({ job, jobName, otherName, isWorker, onChanged, footer }: { job: Job; jobName: string; otherName: string; isWorker: boolean; onChanged: () => void; footer?: ReactNode }) {
  const toast = useToast();
  const [d, setD] = useState<Dispute | null | undefined>(undefined);
  const [reply, setReply] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { rpc<Dispute[]>("my_dispute", { p_job: job.id }).then((r) => setD(r[0] ?? null)).catch(() => setD(null)); }, [job.id, job.status]);
  if (d === undefined) return null;
  if (!d) return null;

  const decideBy = d.decide_by ? new Date(d.decide_by) : null;
  const big = decideBy ? decideBy.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : "Soon";
  const mine = d.reporter_is_me;
  const steps = [
    { done: true, title: mine ? "You reported it" : `${d.reporter_name} reported a problem`, note: `${d.reason}, ${when(d.created_at)}` },
    d.response
      ? { done: true, title: mine ? `${otherName} gave their side` : "You gave your side", note: when(d.responded_at!) }
      : { done: false, title: mine ? `${otherName} gives their side` : "Give your side", note: d.respond_by ? `By ${when(d.respond_by)}` : "Within 24 hours" },
    { done: d.resolved, title: "Mahi Man decides", note: d.resolved && d.outcome ? OUTCOME[d.outcome] ?? "Decided" : "We look at the photos, messages and both sides" },
    { done: d.resolved, title: "You both hear from us", note: "In the app" },
  ];

  return (
    <div className="app">
      <section className="hero cp-hero">
        <div className="hero-top cp-top">
          <span className="brand"><Logo /> Mahi Man</span>
          <span className="jn">{jobName}</span>
        </div>
        <span className="label" style={{ marginTop: 18 }}>{d.resolved ? "Decided" : "We're looking into it"}</span>
        <span className="big" style={{ fontSize: 60, letterSpacing: -2.5, lineHeight: 1 }}>{d.resolved ? OUTCOME[d.outcome ?? ""] ?? "Done" : big}</span>
        <span className="sub" style={{ marginTop: 6 }}>{d.resolved ? (d.amount_cents != null ? `Amount owed: ${money(d.amount_cents)}` : "") : "Our decision, by 5 pm at the latest"}</span>
      </section>

      {d.resolved && d.decision_note && (
        <div className="cp-sec">
          <span className="cp-title">From Mahi Man</span>
          <span className="t16 light" style={{ lineHeight: 1.5 }}>{d.decision_note}</span>
        </div>
      )}

      <div className="cp-steps">
        {steps.map((s) => (
          <div key={s.title} className="cp-step">
            <span className="ic">{s.done ? Icon.tick("var(--emerald)") : Icon.clockLine("var(--muted)")}</span>
            <span className="t"><b>{s.title}</b><span>{s.note}</span></span>
          </div>
        ))}
      </div>

      <div className="cp-plain">
        <span className="cp-label">{mine ? "What you said" : `What ${d.reporter_name} said`}</span>
        <span className="t15 light muted" style={{ lineHeight: 1.45 }}>{d.fix ? `${d.fix}. ` : ""}"{d.details}"</span>
      </div>
      {d.response && (
        <div className="cp-plain">
          <span className="cp-label">{mine ? `${otherName}'s side` : "Your side"}</span>
          <span className="t15 light muted" style={{ lineHeight: 1.45 }}>"{d.response}"</span>
        </div>
      )}
      {!d.resolved && <Note icon="lock">{isWorker ? "" : "Don't pay until we decide. "}Reviews stay closed until then.</Note>}
      <div style={{ flex: 1 }} />
      {footer}
      {!d.resolved && (
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={() => go("/support")}>Get help</button>
          {mine && d.response && (
            <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
              setBusy(true);
              try { await rpc("dispute_accept_offer", { p_job: job.id }); toast("Sorted"); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
            }}>Agree to {otherName}'s side</button>
          )}
          {!mine && !d.response && <button className="btn primary" style={{ flex: 1 }} onClick={() => setReply(true)}>Give your side</button>}
        </ActionBar>
      )}

      {reply && (
        <div className="screen" role="dialog" aria-label="Give your side" style={{ background: "var(--card)" }}>
          <StepHero title="Give your side" sub={`${d.reporter_name} says: ${d.reason}`} onBack={() => setReply(false)} />
          <div className="screen-body" style={{ padding: "22px 16px 0", display: "flex", flexDirection: "column", gap: 10, background: "var(--card)" }}>
            <label className="cp-label" htmlFor="rs">What happened, and what would you offer?</label>
            <textarea id="rs" className="cp-text" style={{ height: 160 }} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
            <span className="t15 light muted" style={{ lineHeight: 1.45 }}>{d.reporter_name} sees this. If they agree to it, the dispute closes straight away.</span>
          </div>
          <ActionBar>
            <button className="btn primary" style={{ flex: 1 }} disabled={busy || text.trim().length < 5} onClick={async () => {
              setBusy(true);
              try { await rpc("dispute_respond", { p_job: job.id, p_text: text.trim() }); setReply(false); toast("Sent"); const r = await rpc<Dispute[]>("my_dispute", { p_job: job.id }); setD(r[0] ?? null); }
              catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
            }}>Send</button>
          </ActionBar>
        </div>
      )}
    </div>
  );
}

// 0412345678 -> 0412 345 678; emails and ABNs as they are.
export function showPayid(p: string) {
  return /^04\d{8}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}
