import { useCallback, useEffect, useState } from "react";
import { isDirectPay, mediaUrls, rpc, sb, type Job, type JobType, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { elapsed, firstName, money, shrinkImage } from "../lib/format";
import { Icon, Loading, Perf, Screen, SearchPicker, Tile, useNow, useToast } from "../ui/kit";
import { ChatScreen } from "../ui/Chat";
import { resumeTrip, startTrip, stopTrip, tripJob } from "../lib/trip";
import { ReportScreen } from "../ui/Report";
import { useRules } from "../lib/rules";
import { ActionBar, DisputeView, DoneHero, Note, PriceRows, ProblemScreen as JobProblem, ReviewView, showPayid } from "../ui/Completion";

interface Extra { id: string; amount_cents: number; reason: string; status: string }

export function WorkerJob({ job, onChanged, onLeave }: { job: Job; onChanged: () => void; onLeave: () => void }) {
  const { session } = useSession();
  const toast = useToast();
  const [brief, setBrief] = useState<{ kind: string; url: string }[]>([]);
  const now = useNow(15000);
  const [j, setJ] = useState(job);
  const [jt, setJt] = useState<JobType | null>(null);
  const [suburb, setSuburb] = useState("");
  const [cust, setCust] = useState<PersonCard | null>(null);
  const [photos, setPhotos] = useState<{ before: number; after: number }>({ before: 0, after: 0 });
  const [done, setDone] = useState<string[]>(job.done_items ?? []);
  useEffect(() => { setDone(job.done_items ?? []); }, [job.id]);
  const allTicked = (job.included ?? []).every((x) => done.includes(x));
  const toggleItem = (x: string) => {
    const next = done.includes(x) ? done.filter((y) => y !== x) : [...done, x];
    setDone(next);
    rpc("tick_items", { p_job: job.id, p_items: next }).catch((e) => { setDone(done); toast(e instanceof Error ? e.message : String(e)); });
  };
  const [extras, setExtras] = useState<Extra[]>([]);
  const [screen, setScreen] = useState<null | "reportUser" | "chat" | "code" | "extra" | "emergency" | "problem" | "before" | "after" | "cant" | "eta">(null);
  const [busy, setBusy] = useState(false);
  const [payid, setPayid] = useState<string | null>(null);
  const [bank, setBank] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  // The trip: location shared with the customer from "I'm on my way" until the start code.
  const [onWay, setOnWay] = useState(tripJob() === job.id);
  const [askTrip, setAskTrip] = useState(false);
  const rules = useRules();
  useEffect(() => { resumeTrip(j.id, j.status === "accepted").then(setOnWay); }, [j.id, j.status]);
  async function goNow() {
    try { await startTrip(j.id); setOnWay(true); try { localStorage.setItem("mm-trip-asked", "1"); } catch { /* */ } }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  }
  const tripAsked = (() => { try { return localStorage.getItem("mm-trip-asked") === "1"; } catch { return false; } })();
  // "I'm on my way" shows from 3 hours before the start (straight away for as-soon-as-possible jobs).
  const canLeave = j.status === "accepted" && (j.asap || new Date(j.start_at).getTime() - now < 3 * 3600000);

  const load = useCallback(async () => {
    const { data } = await sb.from("jobs").select("*").eq("id", job.id).single();
    if (data) setJ(data as Job);
    const { data: ph } = await sb.from("job_photos").select("kind").eq("job_id", job.id);
    setPhotos({ before: (ph ?? []).filter((p) => p.kind === "before").length, after: (ph ?? []).filter((p) => p.kind === "after").length });
    const { data: ex } = await sb.from("extra_requests").select("id,amount_cents,reason,status").eq("job_id", job.id).order("created_at");
    setExtras((ex ?? []) as Extra[]);
    if (data && data.status === "cancelled") onChanged();
  }, [job.id, onChanged]);

  useEffect(() => {
    sb.from("job_types").select("*").eq("id", job.job_type_id).single().then(({ data }) => setJt(data as JobType));
    sb.from("suburbs").select("name").eq("id", job.suburb_id).single().then(({ data }) => setSuburb(data?.name ?? ""));
    rpc<PersonCard[]>("person_card", { p_person: job.customer_id }).then((c) => setCust(c[0] ?? null));
    sb.from("workers").select("payid,bsb,account_number").single().then(({ data }) => {
      setPayid(data?.payid ?? null);
      setBank(data?.bsb && data?.account_number ? `BSB ${data.bsb.slice(0, 3)}-${data.bsb.slice(3)}, Acc ${data.account_number}` : null);
    });
    sb.from("job_media").select("path,kind,sort").eq("job_id", job.id).order("sort").then(async ({ data }) => {
      const rows = (data ?? []) as { path: string; kind: string }[];
      const urls = await mediaUrls(rows.map((r) => r.path));
      setBrief(rows.filter((r) => urls[r.path]).map((r) => ({ kind: r.kind, url: urls[r.path] })));
    });
    load();
    const ch = sb.channel(`wjob-${job.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${job.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_requests", filter: `job_id=eq.${job.id}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [job.id, job.job_type_id, job.suburb_id, job.customer_id, load]);

  if (!jt || !session) return <Loading />;
  const cName = cust ? firstName(cust.full_name) : "The customer";
  const earn = j.price_cents + j.extra_cents;
  const pending = extras.find((e) => e.status === "pending");
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${j.address}, ${suburb} QLD`)}`;

  async function finish() {
    setBusy(true);
    try { await rpc("finish_job", { p_job: j.id }); toast("Done. The customer has been asked to confirm."); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const approved = extras.filter((e) => e.status === "approved");
  const jobName = j.title || jt.name;
  const leaveLink = <button className="link quiet" style={{ margin: "0 16px 16px", alignSelf: "flex-start" }} onClick={onLeave}>See new jobs</button>;
  const problem = report && <JobProblem job={j} jobName={jobName} otherName={cName} isWorker onBack={() => setReport(false)} onDone={() => { setReport(false); load(); }} />;

  if (j.status === "disputed" || j.status === "refunded") {
    return <><DisputeView job={j} jobName={jobName} otherName={cName} isWorker onChanged={load} footer={leaveLink} />{problem}</>;
  }

  if (j.status === "confirmed") {
    return <ReviewView jobId={j.id} jobName={jobName} done={`${money(earn)} received`} person={cust} other={cName} isWorker
      about={`Tell other workers about ${cName}`} onDone={onChanged} />;
  }

  if (j.status === "finished" && isDirectPay(j)) {
    const told = !!j.customer_paid_at;
    const at = told ? new Date(j.customer_paid_at!).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "";
    return (
      <>
        <DoneHero jobName={jobName} step={3} big={money(earn)} lime
          label={told ? `${cName} says they've paid you` : "Get paid"}
          sub={told ? `Marked paid at ${at}` : `Collect it from ${cName} now, by bank transfer or cash`} />
        {told ? (
          <div className="cp-sec">
            <span className="cp-title" style={{ marginBottom: 2 }}>Check your bank, then confirm</span>
            <span className="t16 light muted" style={{ lineHeight: 1.45 }}>Once you confirm, the job closes and you both leave a review.</span>
          </div>
        ) : (
          <>
            <PriceRows title={`What ${cName} pays you`} jobName={jobName} priceCents={j.price_cents} extras={approved} totalLabel="Total" />
            <div className="cp-payid">
              {Icon.card("var(--emerald)")}
              <span className="stack" style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 500 }}>{payid ? `${cName} can see your PayID` : bank ? `${cName} can see your bank account` : "Add how you get paid"}</span>
                <span className="t15 light muted">{payid ? showPayid(payid) : bank ?? `Nothing saved. Ask ${cName} for cash, or send your details in Messages.`}</span>
              </span>
            </div>
          </>
        )}
        <Note icon="clock">{told ? "If you don't answer within 24 hours, we take it as received." : `Waiting for ${cName} to check your after photos and pay. If they do nothing for 48 hours, the job closes as done.`}</Note>
        {leaveLink}
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={() => setReport(true)}>{told ? "Not received" : "Not paid?"}</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await rpc("worker_confirm_received", { p_job: j.id }); await load(); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : told ? "Payment received" : "I've been paid"}</button>
        </ActionBar>
        {problem}
      </>
    );
  }

  const heroLabel = j.status === "accepted" ? (onWay ? `On the way to ${cName}` : "Head to the job") : j.status === "in_progress" ? "Working for" : isDirectPay(j) ? "Get paid" : "Waiting for the customer";
  const heroBig = j.status === "in_progress" ? elapsed(j.started_at!, now) : money(earn);

  return (
    <>
      <section className="hero" style={{ paddingBottom: j.status === "accepted" && (onWay || j.arrived_at) ? 24 : 96 }}>
        <div className="hero-top">
          <span className="t17 w5">{jobName}</span>
          <button className="btn danger small" style={{ height: 36 }} onClick={() => setScreen("emergency")}>Emergency</button>
        </div>
        <span className="label">{heroLabel}</span>
        <div className="row" style={{ alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <span className={j.status === "in_progress" ? "big" : "big lime"}>{heroBig}</span>
          {j.status === "in_progress" && <span className="t15 light" style={{ color: "rgba(255,255,255,0.85)" }}>of up to {Number(jt.max_hours)} hrs</span>}
        </div>
        <span className="sub">
          {j.status === "in_progress" ? <>You earn <span style={{ color: "var(--lime)", fontWeight: 500 }}>{money(earn)}</span> when the customer confirms</>
            : j.status === "finished" ? (isDirectPay(j) ? `Collect ${money(earn)} from the customer now: bank transfer or cash` : "They have 48 hours to confirm, then you're paid automatically")
              : "Ask for their 4-digit start code when you arrive"}
        </span>
        {j.status === "accepted" && !onWay && !j.arrived_at && canLeave && (
          <>
            <div className="row" style={{ gap: 10, marginTop: 20, position: "relative" }}>
              <button className="btn" style={{ background: "var(--lime)", color: "var(--ink)" }} onClick={() => (tripAsked ? goNow() : setAskTrip(true))}>I'm on my way {Icon.arrow("var(--ink)")}</button>
            </div>
            <span className="sub" style={{ marginTop: 10, fontSize: 13 }}>{cName} sees you on a map until you arrive. Then it stops.</span>
          </>
        )}
      </section>
      {j.status === "accepted" && onWay && (
        <div className="row" style={{ gap: 12, padding: 16, background: "var(--card)", alignItems: "center", position: "relative", zIndex: 1 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: "var(--emerald)", flexShrink: 0 }} />
          <span className="t15 light" style={{ flex: 1 }}>Sharing your location with {cName}. It stops when you enter the start code.</span>
          <button className="link quiet" onClick={async () => { await stopTrip(j.id); setOnWay(false); }}>Stop</button>
        </div>
      )}

      {j.status === "accepted" && (onWay || j.arrived_at) && (
        <div className="row" style={{ gap: 12, padding: "0 16px 16px", background: "var(--card)", alignItems: "center", position: "relative", zIndex: 1 }}>
          {!j.arrived_at ? (
            <>
              <span className="t15 light muted" style={{ flex: 1 }}>At the door and {cName} isn't answering?</span>
              <button className="btn stone small" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  const pos = await new Promise<GeolocationPosition | null>((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000 }) : res(null));
                  await rpc("worker_arrived", { p_job: j.id, p_lat: pos?.coords.latitude ?? null, p_lng: pos?.coords.longitude ?? null });
                  toast(`${cName} has been told you're here`); await load();
                } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
              }}>I'm here</button>
            </>
          ) : (() => {
            const left = Math.ceil((new Date(j.arrived_at).getTime() + rules.wait * 60000 - now) / 60000);
            return (
              <>
                <span className="t15 light muted" style={{ flex: 1 }}>{left > 0 ? `You arrived at ${hm(j.arrived_at)}. If ${cName} doesn't answer, you can cancel in ${left} min and get ${money(rules.fee)}.` : `You've waited ${rules.wait} minutes. Cancel and get ${money(rules.fee)} for your time.`}</span>
                <button className="btn stone small" disabled={busy || left > 0} onClick={async () => {
                  setBusy(true);
                  try { await rpc("customer_not_here", { p_job: j.id }); await stopTrip(j.id); toast(`Cancelled. ${cName} pays you ${money(rules.fee)}.`); onChanged(); }
                  catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
                }}>Not here</button>
              </>
            );
          })()}
        </div>
      )}

      {j.status === "accepted" && !j.asap && j.confirm_asked_at && !j.day_confirmed_at && (
        <div className="confirm-bar">
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <b>Still on for {new Date(j.start_at).toLocaleDateString("en-AU", { weekday: "short" })} at {new Date(j.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase()}?</b>
            <span>Confirm, or hand it back so someone else can take it.</span>
          </span>
          <span className="row" style={{ gap: 10, width: "100%", justifyContent: "flex-end" }}>
          <button className="btn stone small" disabled={busy} onClick={() => setScreen("cant")}>Can't make it</button>
          <button className="btn primary small" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await rpc("confirm_tomorrow", { p_job: j.id }); toast(`Confirmed. ${cName} has been told.`); await load(); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}>Confirm</button>
          </span>
        </div>
      )}

      <div className="ticket" style={{ marginTop: (j.status === "accepted" && (onWay || j.arrived_at)) || (j.status === "accepted" && !j.asap && j.confirm_asked_at && !j.day_confirmed_at) ? 16 : -70 }}>
        <div className="pad row">
          <Tile name={cust?.full_name ?? "?"} photo={cust?.photo_path} size={48} />
          <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 500 }}>{cust?.full_name ?? ""}</span>
            <span className="t15 light muted">{j.address}, {suburb}</span>
          </span>
        </div>
        <div className="grid2" style={{ padding: "0 16px 16px" }}>
          <button className="btn stone" style={{ background: "var(--ground)", fontSize: 15, height: 46 }} onClick={() => setScreen("chat")}>{Icon.msg()} Message</button>
          <a className="btn stone" style={{ background: "var(--ground)", fontSize: 15, height: 46 }} href={maps} target="_blank" rel="noreferrer">{Icon.pin()} Directions</a>
        </div>
        {j.details && <div className="stack" style={{ padding: "0 16px 14px", gap: 4 }}><span className="t15 w5">What they want done</span><span className="t15 light" style={{ lineHeight: 1.45 }}>{j.details}</span></div>}
        {(j.included?.length ?? 0) > 0 && (
          <div className="stack" style={{ padding: "0 16px 14px", gap: 6 }}>
            <span className="t15 w5">What's included</span>
            {j.status === "in_progress" ? (
              <div className="tick-list">
                <span className="small light muted">Tick each one off as you finish it. The customer sees this list.</span>
                {j.included!.map((x) => {
                  const on = done.includes(x);
                  return (
                    <button key={x} className={on ? "tick-item on" : "tick-item"} onClick={() => toggleItem(x)} aria-pressed={on}>
                      <span className="box">{on && Icon.tick("#fff", 16)}</span><span>{x}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ticks">{j.included!.map((x) => <span key={x} style={{ fontSize: 15 }}>{Icon.tick("var(--emerald)", 20)}{x}</span>)}</div>
            )}
            {(j.excluded?.length ?? 0) > 0 && <div className="ticks no"><h3>Not included</h3>{j.excluded!.map((x) => <span key={x}>{Icon.cross("var(--faint)")}{x}</span>)}</div>}
          </div>
        )}
        {brief.length > 0 && <div className="photos" style={{ padding: "0 16px 14px" }}>{brief.map((b) => b.kind === "video"
          ? <video key={b.url} src={b.url} controls playsInline style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }} />
          : <a key={b.url} href={b.url} target="_blank" rel="noreferrer"><img src={b.url} alt="Customer photo" /></a>)}</div>}
        {j.notes && <div className="stack" style={{ padding: "0 16px 16px", gap: 4 }}><span className="t15 w5">Getting in</span><span className="t15 light" style={{ lineHeight: 1.45 }}>{j.notes}</span></div>}
        <Perf />
        <CheckRow done={j.status !== "accepted"} n={1} title="Start with customer's code" />
        <CheckRow done={photos.before > 0} n={2} title="Before photos" note={photos.before ? `${photos.before} added` : "take them before you start"} />
        {(j.included?.length ?? 0) > 0 && <CheckRow done={allTicked} n={3} title="Tick off what's included" note={`${done.filter((x) => j.included!.includes(x)).length} of ${j.included!.length}`} />}
        <CheckRow done={photos.after > 0} n={(j.included?.length ?? 0) > 0 ? 4 : 3} title="After photos" note={photos.after ? `${photos.after} added` : "needed to finish"} last />
      </div>

      {pending && <div className="section t15"><span className="w5">Waiting on {cName}:</span> <span className="light">{money(pending.amount_cents)} extra for "{pending.reason}"</span></div>}
      {extras.filter((e) => e.status !== "pending").slice(-1).map((e) => (
        <div key={e.id} className="section t15 light">{e.status === "approved" ? `${cName} approved ${money(e.amount_cents)} extra.` : `${cName} declined the extra ${money(e.amount_cents)}.`}</div>
      ))}

      {j.status === "in_progress" && (
        <div className="row between" style={{ margin: "18px 20px 0" }}>
          <button className="link" onClick={() => setScreen("extra")} disabled={!!pending}>Job bigger than booked?</button>
          <button className="link quiet" onClick={() => setScreen("problem")}>Report a problem</button>
        </div>
      )}

      <div className="row" style={{ margin: "14px 20px 0", justifyContent: j.status === "accepted" ? "space-between" : "flex-end" }}>
        {j.status === "accepted" && <button className="link quiet" onClick={() => setScreen("cant")}>Cancel this job</button>}
        <button className="link quiet" onClick={() => setScreen("reportUser")}>Report {cName}</button>
      </div>

      <div className="footer">
        {j.status === "accepted" && <button className="btn primary" onClick={() => setScreen("code")}>Enter start code {Icon.arrow("var(--lime)")}</button>}
        {j.status === "in_progress" && photos.before === 0 && <button className="btn primary" onClick={() => setScreen("before")}>{Icon.camera("var(--lime)")} Add before photos</button>}
        {j.status === "in_progress" && photos.before > 0 && photos.after === 0 && <button className="btn primary" onClick={() => setScreen("after")}>{Icon.camera("var(--lime)")} Add after photos</button>}
        {j.status === "in_progress" && photos.after > 0 && (
          <>
            <button className="btn stone" onClick={() => setScreen("after")}>More photos</button>
            <button className="btn primary" disabled={busy || !!pending || !allTicked} onClick={finish}>Finish job {Icon.arrow("var(--lime)")}</button>
          </>
        )}
        {j.status === "finished" && <button className="btn stone" onClick={onChanged}>Back to jobs</button>}
      </div>

      {screen === "cant" && <WorkerCancelScreen job={j} name={cName} onBack={() => setScreen(null)} onEta={() => setScreen("eta")}
        onDone={async () => { await stopTrip(j.id); setOnWay(false); onChanged(); }} />}
      {screen === "eta" && <EtaScreen job={j} name={cName} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "chat" && <ChatScreen jobId={j.id} me={session.user.id} otherName={cName} onBack={() => setScreen(null)} />}
      {screen === "reportUser" && <ReportScreen name={cName} userId={j.customer_id} jobId={j.id} onBack={() => setScreen(null)} onDone={() => setScreen(null)} />}
      {screen === "code" && <CodeScreen jobId={j.id} name={cName} onBack={() => setScreen(null)} onDone={() => { setScreen(null); stopTrip(j.id); setOnWay(false); load(); }} />}
      {askTrip && <TripAsk name={cName} onBack={() => setAskTrip(false)} onGo={() => { setAskTrip(false); goNow(); }} />}
      {(screen === "before" || screen === "after") && <PhotoScreen jobId={j.id} kind={screen} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "extra" && <ExtraScreen jobId={j.id} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "emergency" && <EmergencyScreen jobId={j.id} onBack={() => setScreen(null)} />}
      {screen === "problem" && <ProblemScreen jobId={j.id} onBack={() => setScreen(null)} />}
    </>
  );
}

const hm = (d: string | null | undefined) => d ? new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase() : "";

interface WorkerTerms { kind: "early" | "soon" | "on_way"; fee_cents: number; strike: boolean; emergency_free: boolean; customer: string; eta_at: string | null; eta_changed: boolean; strikes_30: number; strikes_limit: number }

// Cancelling a job you took: free more than 2 hours out; a fee and a strike after that. Running late? Change the time instead.
function WorkerCancelScreen({ job, name, onBack, onEta, onDone }: { job: Job; name: string; onBack: () => void; onEta: () => void; onDone: () => void }) {
  const toast = useToast();
  const rules = useRules();
  const [t, setT] = useState<WorkerTerms | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc<WorkerTerms>("worker_cancel_preview", { p_job: job.id }).then(setT).catch((e) => toast(e instanceof Error ? e.message : String(e))); }, [job.id]);
  if (!t) return <Screen title="Cancel this job" onBack={onBack}><Loading /></Screen>;
  const canEta = !t.eta_changed && t.eta_at && new Date(t.eta_at).getTime() > Date.now();
  return (
    <Screen title="Cancel this job" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div className="cp-sec">
          <span className="cp-title">{t.kind === "on_way" ? `You're on the way to ${name}` : t.kind === "soon" ? "The job starts soon" : "Hand the job back"}</span>
          <span className="t16 light" style={{ lineHeight: 1.5 }}>
            {!t.strike ? `It's free more than ${rules.window / 60} hours before the start. ${name} is told and the job goes back out.`
              : emergency ? "Tell us what happened. The first emergency in 90 days has no fee or strike."
              : `The fee goes to ${name} as credit. It also adds a strike.`}
          </span>
          {t.strike && !emergency && <div className="row between" style={{ padding: "10px 0 0" }}><span className="t16 light">Your strikes, last 30 days</span><span className="t17 w5">{t.strikes_30} of {t.strikes_limit}</span></div>}
          {emergency && <textarea className="cp-text" style={{ marginTop: 10, height: 90 }} placeholder="What happened?" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </div>
        {t.strike && !emergency && (canEta || t.emergency_free) && (
          <div className="cp-sec">
            <span className="cp-title">Running late instead?</span>
            {canEta && <button className="choice" style={{ padding: "12px 0" }} onClick={onEta}>
              <span className="t"><b style={{ fontWeight: 500 }}>Update your arrival time</b><span className="t15 light muted">Free, once per job, before {hm(t.eta_at)}</span></span>{Icon.chevron("var(--faint)")}
            </button>}
            {t.emergency_free && <button className="choice" style={{ padding: "12px 0", borderBottom: 0 }} onClick={() => setEmergency(true)}>
              <span className="t"><b style={{ fontWeight: 500 }}>Emergency?</b><span className="t15 light muted">Tell us why. No fee or strike the first time.</span></span>{Icon.chevron("var(--faint)")}
            </button>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={() => (emergency ? setEmergency(false) : onBack())}>{emergency ? "Back" : "Keep the job"}</button>
          <button className="btn danger" style={{ flex: 1.4 }} disabled={busy || (emergency && reason.trim().length <= 3)} onClick={async () => {
            setBusy(true);
            try { await rpc("worker_cancel", { p_job: job.id, p_reason: emergency ? reason.trim() : null }); toast(`Cancelled. ${name} has been told.`); onDone(); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? "Cancelling…" : emergency ? "Cancel, no fee" : !t.strike ? "Cancel the job" : `Cancel and pay ${money(t.fee_cents)}`}</button>
        </ActionBar>
      </div>
    </Screen>
  );
}

const REASONS = ["Traffic", "Previous job ran over", "Car trouble", "Weather", "Getting gear for the job", "Something else"];

// Running late: change the arrival time once, up to 2 hours later. The customer can accept it or cancel for free.
function EtaScreen({ job, name, onBack, onDone }: { job: Job; name: string; onBack: () => void; onDone: () => void }) {
  const toast = useToast();
  const base = new Date(job.eta_at ?? job.start_at).getTime();
  const times = [10, 15, 20, 30, 45, 60, 90, 120].map((m) => ({ id: m, label: hm(new Date(base + m * 60000).toISOString()), hint: `${m} minutes later` }));
  const [mins, setMins] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [pick, setPick] = useState<null | "time" | "reason">(null);
  const [busy, setBusy] = useState(false);
  return (
    <Screen title="Update arrival time" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div className="cp-sec">
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><span className="k">You said</span><span className="v">{hm(job.eta_at)}</span></div>
            <button className="field" style={{ flex: 1 }} onClick={() => setPick("time")}><span className="k">New time</span><span className={mins ? "v" : "v ph"}>{mins ? hm(new Date(base + mins * 60000).toISOString()) : "Pick"}</span></button>
          </div>
          <button className="field" style={{ marginTop: 10 }} onClick={() => setPick("reason")}><span className="k">Reason</span><span className={reason ? "v" : "v ph"} style={{ fontSize: 16, fontWeight: reason ? 500 : 400 }}>{reason ?? "Pick a reason"}</span></button>
        </div>
        <Note icon="clock">You can do this once per job. {name} can accept the new time or cancel for free.</Note>
        <div style={{ flex: 1 }} />
        <ActionBar><button className="btn primary block" disabled={!mins || !reason || busy} onClick={async () => {
          setBusy(true);
          try { await rpc("update_eta", { p_job: job.id, p_new_at: new Date(base + mins! * 60000).toISOString(), p_reason: reason }); toast(`${name} has been told`); onDone(); }
          catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
        }}>Send to {name}</button></ActionBar>
        {pick === "time" && <SearchPicker title="New arrival time" placeholder="Search times" options={times} value={mins ? [mins] : []} onClose={() => setPick(null)} onChange={(v) => setMins(Number(v[0]))} />}
        {pick === "reason" && <SearchPicker title="Reason" placeholder="Search reasons" options={REASONS.map((r) => ({ id: r, label: r }))} value={reason ? [reason] : []} onClose={() => setPick(null)} onChange={(v) => setReason(String(v[0]))} />}
      </div>
    </Screen>
  );
}

function CheckRow({ done, n, title, note, last }: { done: boolean; n: number; title: string; note?: string; last?: boolean }) {
  return (
    <div className="row" style={{ padding: last ? "4px 16px 16px" : "4px 16px", minHeight: 52 }}>
      {done ? Icon.tick("var(--emerald)") : <span style={{ width: 22, textAlign: "center", fontSize: 16, fontWeight: 600, color: "var(--emerald)" }}>{n}</span>}
      <span className="t" style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{title} {note && <span className="light muted">{note}</span>}</span>
    </div>
  );
}

function CodeScreen({ jobId, name, onBack, onDone }: { jobId: string; name: string; onBack: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  return (
    <Screen title="Start code" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>Ask {name} for the 4-digit code in their app. It proves you're at the right place.</p>
        <label className="field"><span className="k">Code</span>
          <input inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ fontSize: 36, letterSpacing: 10, fontWeight: 600 }} /></label>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={code.length !== 4} onClick={async () => {
            try { await rpc("start_job", { p_job: jobId, p_code: code }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}>Start job</button>
        </div>
      </div>
    </Screen>
  );
}

function PhotoScreen({ jobId, kind, onBack, onDone }: { jobId: string; kind: "before" | "after"; onBack: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Screen title={kind === "before" ? "Before photos" : "After photos"} onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t15 light" style={{ marginTop: 0, lineHeight: 1.45 }}>
          {kind === "before" ? "Show how it looks before you start. These protect you." : "Show the finished job, the same spots as before. The customer sees these before confirming."}
        </p>
        <label className="btn stone" style={{ cursor: "pointer" }}>{Icon.camera()} Take or add photos
          <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        </label>
        {files.length > 0 && <div className="photos" style={{ marginTop: 14 }}>{files.map((f, i) => <img key={i} src={URL.createObjectURL(f)} alt="" />)}</div>}
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={!files.length || busy} onClick={async () => {
            setBusy(true); setErr("");
            try {
              for (const f of files) {
                const blob = await shrinkImage(f);
                const path = `${jobId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
                const up = await sb.storage.from("job-photos").upload(path, blob, { contentType: "image/jpeg" });
                if (up.error) throw up.error;
                const ins = await sb.from("job_photos").insert({ job_id: jobId, kind, path });
                if (ins.error) throw ins.error;
              }
              onDone();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? "Uploading…" : `Save ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </Screen>
  );
}

function ExtraScreen({ jobId, onBack, onDone }: { jobId: string; onBack: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  return (
    <Screen title="Ask for more" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t15 light" style={{ marginTop: 0, lineHeight: 1.45 }}>Job bigger than booked? Ask here. The customer approves it before you do the extra work.</p>
        <div className="stack">
          <label className="field"><span className="k">Extra amount ($)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="30" /></label>
          <label className="field"><span className="k">Why</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Second bathroom wasn't in the booking" /></label>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={!amount || reason.trim().length < 4} onClick={async () => {
            try { await rpc("request_extra", { p_job: jobId, p_amount_cents: Math.round(Number(amount) * 100), p_reason: reason }); onDone(); }
            catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}>Send request</button>
        </div>
      </div>
    </Screen>
  );
}

function EmergencyScreen({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const { session } = useSession();
  useEffect(() => {
    if (session) sb.from("incidents").insert({ job_id: jobId, reporter_id: session.user.id, kind: "emergency", details: "Emergency screen opened" }).then(() => {});
  }, [jobId, session]);
  return (
    <Screen tone="danger" title="Emergency" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>If you or anyone is in danger, get to safety and call 000 now. We've been alerted and will contact you.</p>
        <a className="btn danger block" href="tel:000" style={{ height: 64, fontSize: 22 }}>Call 000</a>
        <p className="t15 light muted" style={{ lineHeight: 1.45 }}>Not an emergency but feel unsafe? Stop the job, leave, and use Report a problem.</p>
      </div>
    </Screen>
  );
}

function ProblemScreen({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const { session } = useSession();
  const toast = useToast();
  const [details, setDetails] = useState("");
  return (
    <Screen tone="ink" title="Report a problem" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <label className="field"><span className="k">What's happening?</span><textarea value={details} onChange={(e) => setDetails(e.target.value)} style={{ minHeight: 120 }} /></label>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={details.trim().length < 5} onClick={async () => {
            if (!session) return;
            await sb.from("incidents").insert({ job_id: jobId, reporter_id: session.user.id, kind: "problem", details: details.trim() });
            toast("Sent. We'll be in touch shortly."); onBack();
          }}>Send</button>
        </div>
      </div>
    </Screen>
  );
}

// Before the first trip: what sharing your location means, then the iPhone's own permission prompt.
function TripAsk({ name, onBack, onGo }: { name: string; onBack: () => void; onGo: () => void }) {
  return (
    <div className="screen" role="dialog" aria-label="Share your location">
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <section className="step-hero">
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <h1>Let {name} see you coming</h1>
          <p>{name} can see when you're nearly there.</p>
        </section>
        <div className="stack" style={{ padding: 20, gap: 16 }}>
          {[["Only on the way", "Starts when you tap I'm on my way, stops when you enter the start code."],
            [`Only ${name} sees it`, "Nobody else, not other customers or workers."],
            ["Gone after the job", "Your trip is deleted once you arrive."]].map(([b, t]) => (
            <div key={b} className="row" style={{ gap: 12, alignItems: "flex-start" }}><span style={{ flexShrink: 0, display: "flex" }}>{Icon.tick("var(--emerald)", 22)}</span><span className="stack" style={{ gap: 2 }}><span className="t17 w5">{b}</span><span className="t15 light muted">{t}</span></span></div>
          ))}
          <p className="small light muted" style={{ margin: 0, lineHeight: 1.5 }}>Your iPhone will ask to allow location. Pick "Allow While Using App". It keeps working while you drive with Maps.</p>
        </div>
        <div style={{ flex: 1 }} />
        <div className="actionbar"><button className="btn stone" style={{ flex: 1 }} onClick={onBack}>Not now</button><button className="btn primary" style={{ flex: 2 }} onClick={onGo}>Allow and go</button></div>
      </div>
    </div>
  );
}
