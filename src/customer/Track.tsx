import { useCallback, useEffect, useState } from "react";
import { api, isDirectPay, rpc, sb, type Job, type JobType, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { elapsed, firstName, money2 } from "../lib/format";
import { Icon, Perf, Screen, Stars, Tile, useNow, useToast } from "../ui/kit";
import { ChatScreen } from "../ui/Chat";
import { PayScreen } from "./Pay";

interface Extra { id: string; amount_cents: number; reason: string; status: string }
const STEPS = ["Booked", "Matched", "On the way", "Working", "Done"];

export function Track({ id }: { id: string }) {
  const { session } = useSession();
  const toast = useToast();
  const now = useNow(1000);
  const [job, setJob] = useState<Job | null>(null);
  const [jt, setJt] = useState<JobType | null>(null);
  const [suburb, setSuburb] = useState("");
  const [worker, setWorker] = useState<PersonCard | null>(null);
  const [code, setCode] = useState("");
  const [photos, setPhotos] = useState<{ kind: string; url: string }[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [screen, setScreen] = useState<null | "chat" | "report" | "cancel" | "pay" | { extra: Extra }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("jobs").select("*").eq("id", id).single();
    if (!data) return;
    const j = data as Job;
    setJob(j);
    if (!jt) {
      const { data: t } = await sb.from("job_types").select("*").eq("id", j.job_type_id).single();
      setJt(t as JobType);
      const { data: s } = await sb.from("suburbs").select("name").eq("id", j.suburb_id).single();
      setSuburb(s?.name ?? "");
    }
    if (j.worker_id) {
      const card = await rpc<PersonCard[]>("person_card", { p_person: j.worker_id });
      setWorker(card[0] ?? null);
      const { data: sec } = await sb.from("job_secrets").select("start_code").eq("job_id", id).maybeSingle();
      setCode(sec?.start_code ?? "");
    }
    const { data: ph } = await sb.from("job_photos").select("kind,path").eq("job_id", id).order("created_at");
    const signed = await Promise.all((ph ?? []).map(async (p) => ({ kind: p.kind, url: (await sb.storage.from("job-photos").createSignedUrl(p.path, 3600)).data?.signedUrl ?? "" })));
    setPhotos(signed);
    const { data: ex } = await sb.from("extra_requests").select("id,amount_cents,reason,status").eq("job_id", id).order("created_at");
    setExtras((ex ?? []) as Extra[]);
  }, [id, jt]);

  useEffect(() => {
    load();
    const ch = sb.channel(`job-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_requests", filter: `job_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_photos", filter: `job_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id, load]);

  if (!job || !jt || !session) return <div className="app"><section className="hero short"><button className="wordmark" onClick={() => go("/")}>oddjobs.</button></section></div>;

  const eta = job.eta_at;
  const direct = isDirectPay(job);
  const wName = worker ? firstName(worker.full_name) : "Your worker";
  const stepIdx = { awaiting_payment: 0, searching: 0, accepted: 2, in_progress: 3, finished: 4, confirmed: 4, disputed: 4, cancelled: 0, refunded: 4 }[job.status];
  const pendingExtra = extras.find((e) => e.status === "pending");
  const total = job.price_cents + job.fee_cents + job.extra_cents;

  async function confirm() {
    setBusy(true);
    try { await api("confirm_job", { job_id: id }); toast(direct ? "Done. Thanks for using oddjobs." : "Paid. Thanks for using oddjobs."); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  let label = "", big = "", bigUnit = "", sub = "";
  switch (job.status) {
    case "awaiting_payment": label = "Not booked yet"; big = money2(total); sub = "Hold the payment to send it to workers"; break;
    case "searching": label = "Finding someone nearby"; big = elapsed(job.searching_at ?? job.created_at, now); sub = direct ? "Usually a few minutes." : "Usually a few minutes. You're only charged once it's done."; break;
    case "accepted": {
      const mins = eta ? Math.max(0, Math.round((new Date(eta).getTime() - now) / 60000)) : 0;
      if (job.asap) { label = `${wName} is on the way`; big = String(mins); bigUnit = "min"; }
      else { label = `${wName} is booked for`; big = new Date(job.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); sub = new Date(job.start_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }); }
      break;
    }
    case "in_progress": label = `${wName} is working`; big = elapsed(job.started_at!, now); sub = `Up to ${Number(jt.max_hours)} hrs`; break;
    case "finished": label = "Job done"; big = money2(total); sub = direct ? `Check the photos, pay ${wName} directly, then confirm` : "Check the photos, then confirm to pay"; break;
    case "confirmed": label = direct ? "Done" : "Paid and done"; big = money2(total); sub = `Thanks for booking ${jt.name.toLowerCase()}`; break;
    case "disputed": label = "We're looking into it"; big = direct ? "Checking" : "Held"; sub = direct ? "We'll look at the photos and messages and contact you." : "Your money stays held until it's sorted. We'll message you."; break;
    case "cancelled": label = "Cancelled"; big = "—"; sub = "This booking was cancelled"; break;
    case "refunded": label = "Refunded"; big = money2(total); sub = "Your money has been returned"; break;
  }

  return (
    <div className="app">
      <section className="hero short">
        <div className="hero-top">
          <button className="wordmark" onClick={() => go("/")}>oddjobs.</button>
          <span className="small light" style={{ color: "rgba(255,255,255,0.85)" }}>{jt.name}</span>
        </div>
        <span className="label">{label}</span>
        <div className="row" style={{ alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <span className="big" style={big.length > 6 ? { fontSize: 64, letterSpacing: -3 } : undefined}>{big}</span>
          {bigUnit && <span style={{ fontSize: 22, fontWeight: 500 }}>{bigUnit}</span>}
        </div>
        {sub && <span className="sub">{sub}</span>}
        {!["cancelled", "refunded", "awaiting_payment"].includes(job.status) && (
          <>
            <div className="progress" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
              {STEPS.map((s, i) => <span key={s} className={i <= stepIdx ? "on" : ""} />)}
            </div>
            <div className="progress-labels" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
              {STEPS.map((s, i) => <span key={s} className={i === stepIdx ? "on" : ""}>{s}</span>)}
            </div>
          </>
        )}
      </section>

      <div className="ticket">
        {worker ? (
          <>
            <div className="pad row">
              <Tile name={worker.full_name} photo={worker.photo_path} />
              <span className="stack" style={{ gap: 3, flex: 1 }}>
                <span style={{ fontSize: 19, fontWeight: 500 }}>{worker.full_name}</span>
                {worker.id_verified && <span className="row em t15" style={{ gap: 6 }}>{Icon.tick("var(--emerald)", 15)}ID verified</span>}
                <span className="small light muted">{worker.rating ? `${worker.rating} rating · ` : "New worker · "}{worker.jobs_done} jobs done</span>
              </span>
            </div>
            {["accepted", "in_progress", "finished", "disputed"].includes(job.status) && (
              <div style={{ padding: "0 16px 16px" }}>
                <button className="btn stone block" style={{ background: "var(--ground)" }} onClick={() => setScreen("chat")}>{Icon.msg()} Message {wName}</button>
              </div>
            )}
          </>
        ) : (
          <div className="pad stack" style={{ gap: 4 }}>
            <span className="t17 w5">{jt.name}</span>
            <span className="t15 light muted">{job.address}, {suburb}</span>
          </div>
        )}

        {job.status === "accepted" && code && (
          <>
            <Perf />
            <div className="row between" style={{ padding: "8px 16px 20px" }}>
              <span className="stack" style={{ gap: 4 }}>
                <span className="t17 w5">Your start code</span>
                <span className="small light muted" style={{ maxWidth: 160, lineHeight: 1.4 }}>Give it to {wName} at the door. The job can't start without it.</span>
              </span>
              <span className="em" style={{ fontSize: 44, fontWeight: 600, letterSpacing: 6, fontVariantNumeric: "tabular-nums" }}>{code}</span>
            </div>
          </>
        )}

        {pendingExtra && (
          <>
            <Perf />
            <div className="stack" style={{ padding: "8px 16px 18px", gap: 10 }}>
              <span className="t17 w5">{wName} is asking for {money2(pendingExtra.amount_cents)} more</span>
              <span className="t15 light muted" style={{ lineHeight: 1.45 }}>"{pendingExtra.reason}"</span>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn stone small" onClick={async () => { await rpc("decline_extra", { p_request: pendingExtra.id }); load(); }}>Decline</button>
                <button className="btn primary small" onClick={async () => {
                  if (!direct) return setScreen({ extra: pendingExtra });
                  try { await rpc("approve_extra_pilot", { p_request: pendingExtra.id }); toast("Approved"); load(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
                }}>Approve</button>
              </div>
            </div>
          </>
        )}

        {(job.status === "finished" || job.status === "confirmed" || job.status === "disputed") && photos.length > 0 && (
          <>
            <Perf />
            <div className="stack" style={{ padding: "8px 16px 18px", gap: 12 }}>
              {["before", "after"].map((k) => photos.some((p) => p.kind === k) && (
                <div key={k} className="stack" style={{ gap: 6 }}>
                  <span className="t15 w5">{k === "before" ? "Before" : "After"}</span>
                  <div className="photos">{photos.filter((p) => p.kind === k).map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={`${k} photo`} /></a>)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {job.status === "finished" && (
          <>
            <Perf />
            <div className="stack" style={{ padding: "8px 16px 18px", gap: 12 }}>
              <span className="small light muted" style={{ lineHeight: 1.45 }}>{direct ? `Pay ${wName} ${money2(total)} directly (PayID or cash), then confirm. If you don't confirm or report a problem, the job closes after 48 hours.` : "If you don't confirm or report a problem, payment releases automatically 48 hours after the job was finished."}</span>
              <div className="row between">
                <button className="link quiet" onClick={() => setScreen("report")}>Report a problem</button>
                <button className="btn primary" disabled={busy} onClick={confirm}>{busy ? "Saving…" : direct ? "Confirm it's done" : "Confirm and pay"}</button>
              </div>
            </div>
          </>
        )}

        {job.status === "confirmed" && <ReviewBlock jobId={id} name={wName} />}

        {job.status === "awaiting_payment" && (
          <>
            <Perf />
            <div className="row" style={{ justifyContent: "flex-end", padding: "8px 16px 18px" }}>
              <button className="btn primary" onClick={() => setScreen("pay")}>Hold payment {Icon.arrow("#fff")}</button>
            </div>
          </>
        )}
      </div>

      {["searching", "accepted", "in_progress"].includes(job.status) && (
        <section className="row" style={{ margin: "22px 20px 0", alignItems: "flex-start", gap: 14 }}>
          {Icon.lock("var(--ink)")}
          <span className="stack" style={{ gap: 3 }}>
            <span className="t17 w5">{direct ? `Pay ${money2(total)} when it's done` : `${money2(total)} held, not paid`}</span>
            <span className="small light muted" style={{ lineHeight: 1.45 }}>{direct ? `Pay ${worker ? wName : "your worker"} directly by PayID or cash once the job is finished. Never before.` : `${worker ? wName : "Your worker"} is paid only after you confirm the job is done.`}</span>
          </span>
        </section>
      )}

      <div className="footer between">
        {["awaiting_payment", "searching", "accepted"].includes(job.status)
          ? <button className="link quiet" onClick={() => setScreen("cancel")}>Cancel booking</button>
          : <button className="link quiet" onClick={() => go("/jobs")}>My jobs</button>}
        <a className="link" href="mailto:hello@findfitpeople.com?subject=Help%20with%20an%20oddjobs%20booking">Get help</a>
      </div>

      {screen === "chat" && <ChatScreen jobId={id} me={session.user.id} otherName={wName} onBack={() => setScreen(null)} />}
      {screen === "pay" && <PayScreen jobId={id} amountLabel={money2(total)} onBack={() => setScreen(null)} onPaid={() => { setScreen(null); load(); }} />}
      {screen && typeof screen === "object" && (
        <PayScreen requestId={screen.extra.id} title="Approve extra" amountLabel={money2(screen.extra.amount_cents)} onBack={() => setScreen(null)}
          onPaid={() => { setScreen(null); toast("Approved"); load(); }} />
      )}
      {screen === "report" && <ReportScreen jobId={id} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "cancel" && <CancelScreen job={job} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
    </div>
  );
}

function ReviewBlock({ jobId, name }: { jobId: string; name: string }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const { session } = useSession();
  useEffect(() => {
    if (!session) return;
    sb.from("reviews").select("rating").eq("job_id", jobId).eq("from_id", session.user.id).maybeSingle().then(({ data }) => data && setDone(true));
  }, [jobId, session]);
  if (done) return null;
  return (
    <>
      <Perf />
      <div className="stack" style={{ padding: "8px 16px 18px", gap: 12 }}>
        <span className="t17 w5">How did {name} go?</span>
        <Stars value={rating} onChange={setRating} />
        <label className="field"><span className="k">Anything to add? (optional)</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary small" disabled={!rating} onClick={async () => {
            try { await rpc("leave_review", { p_job: jobId, p_rating: rating, p_comment: comment }); setDone(true); toast("Thanks for the review"); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); }
          }}>Save review</button>
        </div>
      </div>
    </>
  );
}

function ReportScreen({ jobId, onBack, onDone }: { jobId: string; onBack: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  return (
    <Screen title="Report a problem" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t15 light" style={{ marginTop: 0, lineHeight: 1.45 }}>Your money stays held while we look at the photos and messages. We'll reply within a day.</p>
        <label className="field"><span className="k">What went wrong?</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 120 }} /></label>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={reason.trim().length < 5} onClick={async () => {
            try { await rpc("dispute_job", { p_job: jobId, p_reason: reason.trim() }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}>Send report</button>
        </div>
      </div>
    </Screen>
  );
}

function CancelScreen({ job, onBack, onDone }: { job: Job; onBack: () => void; onDone: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [callout, setCallout] = useState(1500);
  useEffect(() => { sb.from("settings").select("value").eq("key", "callout_cents").single().then(({ data }) => data && setCallout(Number(data.value))); }, []);
  const free = job.status !== "accepted" || isDirectPay(job);
  return (
    <Screen title="Cancel booking" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>
          {free ? (isDirectPay(job) ? "Cancelling is free. Your worker will be told straight away." : "No one has taken it yet, so cancelling is free. The hold on your card is released.")
            : `Someone is already on the way. Cancelling now costs ${money2(job.fee_cents + callout)}: the booking fee plus ${money2(callout)} to the worker for their trip. The rest is released.`}
        </p>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button className="btn stone" onClick={onBack}>Keep it</button>
          <button className="btn danger" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await api("cancel_job", { job_id: job.id }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>Cancel booking</button>
        </div>
      </div>
    </Screen>
  );
}
