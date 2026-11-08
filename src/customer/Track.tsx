import { useCallback, useEffect, useState } from "react";
import { api, isDirectPay, rpc, sb, type Job, type JobType, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { elapsed, firstName, money, money2 } from "../lib/format";
import { Icon, Logo, Perf, Screen, Tile, useNow, useToast } from "../ui/kit";
import { ReportScreen as ReportUser } from "../ui/Report";
import { ChatScreen } from "../ui/Chat";
import { PayScreen } from "./Pay";
import { OffersView } from "./Offers";
import { ActionBar, DisputeView, DoneHero, Note, PriceRows, ProblemScreen, ReviewView, reviewSkipped, showPayid } from "../ui/Completion";

interface Extra { id: string; amount_cents: number; reason: string; status: string }
const STEPS = ["Booked", "Matched", "On the way", "Working", "Done"];

export function Track({ id }: { id: string }) {
  const { session, profile } = useSession();
  const toast = useToast();
  const now = useNow(1000);
  const [job, setJob] = useState<Job | null>(null);
  const [jt, setJt] = useState<JobType | null>(null);
  const [suburb, setSuburb] = useState("");
  const [worker, setWorker] = useState<PersonCard | null>(null);
  const [code, setCode] = useState("");
  const [photos, setPhotos] = useState<{ kind: string; url: string }[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [screen, setScreen] = useState<null | "chat" | "report" | "cancel" | "pay" | "reportUser" | { extra: Extra }>(null);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const [payid, setPayid] = useState<string | null>(null);
  const [later, setLater] = useState(false);

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
    if (["finished", "disputed", "confirmed"].includes(j.status) && j.worker_id) {
      rpc<string | null>("job_payid", { p_job: id }).then(setPayid).catch(() => {});
    }
    if (j.status === "confirmed") {
      const { data: me } = await sb.auth.getUser();
      const { data: rv } = await sb.from("reviews").select("id").eq("job_id", id).eq("from_id", me.user?.id ?? "").maybeSingle();
      setReviewed(!!rv);
    }
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

  if (!job || !jt || !session) return <div className="app"><section className="hero short"><button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button></section></div>;

  const eta = job.eta_at;
  const jobName = job.title || jt.name;
  const direct = isDirectPay(job);
  const wName = worker ? firstName(worker.full_name) : "Your worker";
  const stepIdx = { awaiting_payment: 0, searching: 0, accepted: 2, in_progress: 3, finished: 4, confirmed: 4, disputed: 4, cancelled: 0, refunded: 4 }[job.status];
  const pendingExtra = extras.find((e) => e.status === "pending");
  const total = job.price_cents + job.fee_cents + job.extra_cents;

  async function confirm() {
    setBusy(true);
    try { await api("confirm_job", { job_id: id }); toast(direct ? "Done. Thanks for using More Mahi." : "Paid. Thanks for using More Mahi."); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const approved = extras.filter((e) => e.status === "approved");
  const overlays = (
    <>
      {screen === "report" && <ProblemScreen job={job} jobName={jobName} otherName={wName} isWorker={false} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "chat" && <ChatScreen jobId={id} me={session.user.id} otherName={worker?.full_name ?? wName} otherPhoto={worker?.photo_path} sub={jobName} onBack={() => setScreen(null)} />}
    </>
  );

  if (job.status === "searching") {
    return (
      <>
        <OffersView jobId={id} title={jobName} price={money(job.price_cents)} asap={job.asap} startAt={job.start_at}
          searchingAt={job.searching_at ?? job.created_at} onChosen={load} onCancel={() => setScreen("cancel")} />
        {screen === "cancel" && <CancelScreen job={job} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      </>
    );
  }

  if (job.status === "disputed" || job.status === "refunded") {
    return <>{<DisputeView job={job} jobName={jobName} otherName={wName} isWorker={false} onChanged={load} />}{overlays}</>;
  }

  if (job.status === "confirmed" && reviewed === false && !later && !reviewSkipped(id)) {
    return <ReviewView jobId={id} jobName={jobName} done={direct ? "Paid and done" : "Done"} person={worker} other={wName} isWorker={false}
      about={`Tell others about ${wName}`} onDone={() => { setLater(true); load(); }} />;
  }

  if (job.status === "finished" && direct) {
    const paid = !!job.customer_paid_at;
    const before = photos.filter((p) => p.kind === "before");
    const after = photos.filter((p) => p.kind === "after");
    const owed = job.price_cents + approved.reduce((a, e) => a + e.amount_cents, 0);
    return (
      <div className="app">
        <DoneHero jobName={jobName} step={3} big={money(owed)}
          label={paid ? `Waiting for ${wName} to confirm` : `${wName} has finished`}
          sub={paid ? `You told ${wName} you paid at ${new Date(job.customer_paid_at!).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })}` : `Check the photos, pay ${wName}, then tell us`} />
        {(before.length > 0 || after.length > 0) && (
          <div className="cp-sec" style={{ gap: 10 }}>
            <span className="cp-title" style={{ marginBottom: 0 }}>Before and after</span>
            {[["Before", before], ["After", after]].map(([k, list]) => (list as typeof photos).length > 0 && (
              <div key={k as string} className="stack" style={{ gap: 6 }}>
                <span className="t14 light muted">{k as string}</span>
                <div className="cp-photos">{(list as typeof photos).map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={`${k} photo`} /></a>)}</div>
              </div>
            ))}
          </div>
        )}
        <PriceRows jobName={jobName} priceCents={job.price_cents} extras={approved} totalLabel={`Pay ${wName}`} />
        <div className="cp-payid">
          {Icon.card("var(--emerald)")}
          <span className="stack" style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <span className="k">{wName}'s PayID</span>
            <span className="v">{payid ? showPayid(payid) : `Ask ${wName} in Messages`}</span>
          </span>
          {payid
            ? <button className="btn stone small" onClick={() => { navigator.clipboard?.writeText(payid).then(() => toast("Copied"), () => toast(payid)); }}>Copy</button>
            : <button className="btn stone small" onClick={() => setScreen("chat")}>Message</button>}
        </div>
        <Note icon="clock">{paid
          ? `Once ${wName} confirms they got it, you can both leave a review. If they don't answer within 24 hours, the job closes as paid.`
          : "Cash is fine too. Not happy with the job? Report it before paying. If you do nothing for 48 hours, the job closes as done."}</Note>
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={() => setScreen("report")}>Something's wrong</button>
          {!paid && (
            <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
              setBusy(true);
              try { await rpc("customer_mark_paid", { p_job: id }); toast(`${wName} has been told`); await load(); }
              catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
            }}>{busy ? "Saving…" : `I've paid ${wName}`}</button>
          )}
        </ActionBar>
        {overlays}
      </div>
    );
  }

  let label = "", big = "", bigUnit = "", sub = "";
  switch (job.status) {
    case "awaiting_payment": label = "Not booked yet"; big = money2(total); sub = "Hold the payment to send it to workers"; break;
    case "accepted": {
      const mins = eta ? Math.max(0, Math.round((new Date(eta).getTime() - now) / 60000)) : 0;
      if (job.asap) { label = `${wName} is on the way`; if (mins > 0) { big = String(mins); bigUnit = "min"; } else { big = "Any minute"; } }
      else { label = `${wName} is booked for`; big = new Date(job.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); sub = new Date(job.start_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }); }
      break;
    }
    case "in_progress": label = `${wName} is working`; big = elapsed(job.started_at!, now); sub = `Up to ${Number(jt.max_hours)} hrs`; break;
    case "finished": label = "Job done"; big = money2(total); sub = direct ? `Check the photos, pay ${wName} directly, then confirm` : "Check the photos, then confirm to pay"; break;
    case "confirmed": label = direct ? "Done" : "Paid and done"; big = money2(total); sub = "Thanks for using More Mahi"; break;
    case "cancelled": label = "Cancelled"; big = "—"; sub = "This booking was cancelled"; break;
  }

  return (
    <div className="app">
      <section className="hero short">
        <div className="hero-top">
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          <span className="small light" style={{ color: "rgba(255,255,255,0.85)" }}>{jobName}</span>
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
                {worker.id_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not verified</span>}
                <span className="small light muted">{worker.rating ? `${worker.rating} rating, ` : "New worker, "}{worker.jobs_done} jobs done</span>
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
            <span className="t17 w5">{jobName}</span>
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

        {(job.status === "finished" || job.status === "confirmed") && photos.length > 0 && (
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
            <span className="small light muted" style={{ lineHeight: 1.45 }}>{direct ? `Pay ${worker ? wName : "your worker"} by PayID or cash once the job is finished.` : `${worker ? wName : "Your worker"} is paid only after you confirm the job is done.`}</span>
          </span>
        </section>
      )}

      {profile && profile.id_status !== "verified" && !["cancelled", "refunded"].includes(job.status) && (
        <button className="poster" style={{ margin: "22px 0 0", borderTop: "1px solid var(--line)" }} onClick={() => go("/verify")}>
          {Icon.shieldTick("var(--emerald)", 34, 1.8)}
          <span className="t">
            <span className="t17 w5">{profile.id_status === "pending" ? "Your ID is being checked" : profile.id_status === "retake" ? "Retake your ID photo" : "Verify your ID"}</span>
            <span className="small light muted">{profile.id_status === "pending" ? "Usually within a few hours." : "Workers take jobs faster from verified customers. About 2 minutes."}</span>
          </span>
          {Icon.chevron("var(--faint)")}
        </button>
      )}

      <div className="footer between">
        {["awaiting_payment", "searching", "accepted"].includes(job.status)
          ? <button className="link quiet" onClick={() => setScreen("cancel")}>Cancel booking</button>
          : <button className="link quiet" onClick={() => go("/jobs")}>My jobs</button>}
        <span className="row" style={{ gap: 18 }}>
          {job.worker_id && <button className="link quiet" onClick={() => setScreen("reportUser")}>Report {wName}</button>}
          <button className="link" onClick={() => go("/support")}>Get help</button>
        </span>
      </div>

      {screen === "chat" && <ChatScreen jobId={id} me={session.user.id} otherName={worker?.full_name ?? wName} otherPhoto={worker?.photo_path} sub={jobName} onBack={() => setScreen(null)} />}
      {screen === "pay" && <PayScreen jobId={id} amountLabel={money2(total)} onBack={() => setScreen(null)} onPaid={() => { setScreen(null); load(); }} />}
      {screen && typeof screen === "object" && (
        <PayScreen requestId={screen.extra.id} title="Approve extra" amountLabel={money2(screen.extra.amount_cents)} onBack={() => setScreen(null)}
          onPaid={() => { setScreen(null); toast("Approved"); load(); }} />
      )}
      {screen === "report" && <ProblemScreen job={job} jobName={jobName} otherName={wName} isWorker={false} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "reportUser" && job.worker_id && <ReportUser name={wName} userId={job.worker_id} jobId={id} onBack={() => setScreen(null)} onDone={() => setScreen(null)} />}
      {screen === "cancel" && <CancelScreen job={job} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
    </div>
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
