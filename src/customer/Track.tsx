import { cardName, priceWords } from "../lib/format";
import { AfterJobOffer } from "../ui/LocalOffers";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, isDirectPay, payWay, rpc, sb, type Job, type JobType, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { useRules } from "../lib/rules";
import { go } from "../lib/router";
import { elapsed, firstName, initials, money, money2 } from "../lib/format";
import { Icon, Loading, Logo, Perf, Screen, SearchPicker, Tile, useNow, useToast } from "../ui/kit";
import { JobLine, postedAgo, useJobLook } from "./Posted";
import { ReportScreen as ReportUser } from "../ui/Report";
import { ChatScreen } from "../ui/Chat";
import { PayScreen } from "./Pay";
import { OffersView } from "./Offers";
import { LiveMap, useTrip } from "../ui/LiveMap";
import { AlertsAsk } from "../ui/AlertsAsk";
import { alertsState, askedFor } from "../lib/push";
import { FeePayScreen, useOwed, type OwedFee } from "./Fees";
import { GiftPaidSection, JobFeeSection, useJobFee } from "../ui/Payments";
import { ActionBar, DisputeView, DONE_STEPS, DoneHero, Note, PriceRows, ProblemScreen, ReviewView, reviewSkipped, showPayid } from "../ui/Completion";

interface PayDetails { payid: string | null; bsb: string | null; account_number: string | null; account_name: string }

interface Extra { id: string; amount_cents: number; reason: string; status: string }
// One set of stages from booking to review, the same on every screen (Completion uses DONE_STEPS, the same list).
const STEPS = DONE_STEPS;

export function Track({ id }: { id: string }) {
  const { session, profile } = useSession();
  const [verifyHours, setVerifyHours] = useState<number | null>(null);
  useEffect(() => { sb.from("settings").select("value").eq("key", "verify_within_hours").maybeSingle().then(({ data }) => data && setVerifyHours(Number(data.value))); }, []);
  const toast = useToast();
  const now = useNow(1000);
  const [job, setJob] = useState<Job | null>(null);
  const [jt, setJt] = useState<JobType | null>(null);
  const [suburb, setSuburb] = useState("");
  const [region, setRegion] = useState("Australia");
  const [askAlerts, setAskAlerts] = useState(false);
  const searching = job?.status === "searching";
  useEffect(() => {
    if (!searching || askedFor("post")) return;
    alertsState().then((s) => { if (s === "prompt") setAskAlerts(true); }).catch(() => {});
  }, [searching]);
  const [worker, setWorker] = useState<PersonCard | null>(null);
  const [code, setCode] = useState("");
  const [photos, setPhotos] = useState<{ kind: string; url: string }[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [screen, setScreen] = useState<null | "chat" | "report" | "cancel" | "pay" | "reportUser" | "help" | { extra: Extra }>(null);
  const look = useJobLook(id);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const [pay, setPay] = useState<PayDetails | null>(null);
  const payid = pay?.payid ?? null;
  const bank = !payid && pay?.bsb && pay?.account_number ? pay : null;
  const [later, setLater] = useState(false);
  const trip = useTrip(id, job?.status === "accepted");
  const [route, setRoute] = useState<{ minutes: number; km: number } | null>(null);
  const [mapOn, setMapOn] = useState(false);
  // What cancelling would cost right now, and whether the worker is late or has changed their time.
  const [terms, setTerms] = useState<CancelTerms | null>(null);
  const accepted = job?.status === "accepted";
  useEffect(() => {
    if (!accepted) { setTerms(null); return; }
    const get = () => rpc<CancelTerms>("cancel_preview", { p_job: id }).then(setTerms).catch(() => {});
    get();
    const t = window.setInterval(get, 30000);
    return () => window.clearInterval(t);
  }, [id, accepted, job?.eta_at, job?.on_way_at, job?.eta_changed_at, job?.eta_ok_at, job?.arrived_at]);
  const { owed, reload: reloadOwed } = useOwed(job?.status === "cancelled");
  const owedHere = owed.find((f) => f.job_id === id) ?? null;
  const [paying, setPaying] = useState(false);
  const rules = useRules();
  // The Mahi Man connection fee on this job, once it's been billed.
  const jobFee = useJobFee(id, !!job && ["invoiced", "paid"].includes(job.fee_status ?? ""));

  const load = useCallback(async () => {
    const { data } = await sb.from("jobs").select("*").eq("id", id).single();
    if (!data) return;
    const j = data as Job;
    setJob(j);
    if (!jt) {
      const { data: t } = await sb.from("job_types").select("*").eq("id", j.job_type_id).single();
      setJt(t as JobType);
      const { data: s } = await sb.from("suburbs").select("name, areas(state, country)").eq("id", j.suburb_id).single();
      setSuburb(s?.name ?? "");
      const a = s?.areas as unknown as { state: string; country: string } | null;
      setRegion(a ? `${a.state}, ${a.country === "NZ" ? "New Zealand" : "Australia"}` : "Australia");
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
      rpc<PayDetails[]>("job_pay_details", { p_job: id }).then((r) => setPay(r?.[0] ?? null)).catch(() => {});
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

  if (!job || !jt || !session) return <div className="app"><section className="hero short"><button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button></section><Loading /></div>;

  const eta = job.eta_at;
  const jobName = job.title || jt.name;
  const direct = isDirectPay(job);
  const wName = worker ? firstName(worker.full_name) : "Your worker";
  const stepIdx = { awaiting_payment: 0, searching: 0, accepted: trip ? 1 : 0, in_progress: 2, finished: 3, confirmed: 4, disputed: 3, cancelled: 0, refunded: 3 }[job.status];
  const pendingExtra = extras.find((e) => e.status === "pending");
  // What the job costs. On direct-pay jobs the booking fee was charged separately when the worker was chosen.
  const total = job.price_cents + job.extra_cents + (direct ? 0 : job.fee_cents);

  async function confirm() {
    setBusy(true);
    try { await api("confirm_job", { job_id: id }); toast(direct ? "Done. Thanks for using Mahi Man." : "Paid. Thanks for using Mahi Man."); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const approved = extras.filter((e) => e.status === "approved");
  const overlays = (
    <>
      {screen === "report" && <ProblemScreen job={job} jobName={jobName} otherName={wName} isWorker={false} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "chat" && <ChatScreen jobId={id} me={session.user.id} otherName={worker?.full_name ?? wName} otherPhoto={worker?.photo_path} sub={jobName} onBack={() => setScreen(null)} />}
      {screen === "help" && <JobHelp job={job} wName={job.worker_id ? wName : null} onBack={() => setScreen(null)}
        onPick={(k) => { if (k === "support") { setScreen(null); go("/support"); } else setScreen(k); }} />}
    </>
  );

  if (job.status === "searching") {
    return (
      <>
        <OffersView jobId={id} title={jobName} price={priceWords(job)} priceCents={job.price_cents} feeDue={job.fee_status === "due" ? job.fee_cents : 0} feeInvoice={job.fee_status === "invoice" ? job.fee_cents : 0} asap={job.asap} startAt={job.start_at}
          searchingAt={job.searching_at ?? job.created_at} onBoosted={load} onChosen={load} onCancel={() => setScreen("cancel")}
          trade={!!job.trade} />
        {screen === "cancel" && <CancelScreen job={job} title={jobName} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
        {askAlerts && <AlertsAsk role="post" onDone={() => setAskAlerts(false)} />}
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
    // A Mahi Man gift card pays the worker first; the customer pays any rest directly.
    const gift = Math.min(job.gift_cents ?? 0, owed);
    const rest = owed - gift;
    const giftAll = gift > 0 && rest === 0;
    return (
      <div className="app">
        <DoneHero jobName={jobName} step={3} big={money(giftAll ? owed : rest)}
          label={paid ? `Waiting for ${wName} to confirm` : `${wName} has finished`}
          sub={paid ? `You told ${wName} you paid at ${new Date(job.customer_paid_at!).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`
            : giftAll ? "Check the photos, then tell us it's done" : `Check the photos, pay ${wName}, then tell us`} />
        {(job.included?.length ?? 0) > 0 && (
          <div className="cp-sec" style={{ gap: 8 }}>
            <span className="cp-title" style={{ marginBottom: 0 }}>What {wName} did</span>
            <div className="ticks">{job.included!.map((x) => (
              <span key={x} style={{ fontSize: 15 }}>{(job.done_items ?? []).includes(x) ? Icon.tick("var(--emerald)", 20) : Icon.cross("var(--faint)")}{x}</span>
            ))}</div>
          </div>
        )}
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
        <PriceRows jobName={jobName} priceCents={job.price_cents} extras={approved} totalLabel={gift > 0 ? "Job price" : `Pay ${wName}`} />
        {gift > 0 && <GiftPaidSection worker={wName} gift={gift} rest={rest} fee={jobFee} />}
        {!giftAll && job.pay_method !== "cash" && <div className="cp-payid">
          {Icon.card("var(--emerald)")}
          <span className="stack" style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <span className="k">{bank ? `${wName}'s bank account` : `${wName}'s PayID`}</span>
            {bank
              ? <><span className="v">BSB {bank.bsb!.slice(0, 3)}-{bank.bsb!.slice(3)}</span><span className="v">Acc {bank.account_number}</span></>
              : <span className="v">{payid ? showPayid(payid) : `Ask ${wName} in Messages`}</span>}
            {bank && <span className="t14 light muted">{bank.account_name}</span>}
          </span>
          {payid || bank
            ? <button className="btn stone small" onClick={() => { const t = payid ?? `BSB ${bank!.bsb} Account ${bank!.account_number} ${bank!.account_name}`; navigator.clipboard?.writeText(t).then(() => toast("Copied"), () => toast(t)); }}>Copy</button>
            : <button className="btn stone small" onClick={() => setScreen("chat")}>Message</button>}
        </div>}
        {jobFee && !(gift > 0 && jobFee.from_balance_cents >= jobFee.amount_cents) && <JobFeeSection fee={jobFee} />}
        <AfterJobOffer jobId={id} />
        {giftAll ? <Note icon="lock">{`Nothing to pay. We pay ${wName} once you say it's done, or in 2 days if you don't. Not happy? Report it first.`}</Note>
        : <Note icon="clock">{paid
          ? `Once ${wName} confirms they got it, you can both leave a review. If they don't answer within 24 hours, the job closes as paid.`
          : `${job.pay_method ? "" : "Cash is fine too. "}Not happy with the job? Report it before paying. If you do nothing for 48 hours, the job closes as done.`}</Note>}
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={() => setScreen("report")}>Something's wrong</button>
          {giftAll ? (
            <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={async () => {
              setBusy(true);
              try { await api("confirm_job", { job_id: id }); toast(`Thanks. We'll pay ${wName} on Friday`); await load(); }
              catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
            }}>{busy ? "Saving…" : "It's done"}</button>
          ) : !paid && (
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

  if (job.status === "cancelled") {
    const reason = job.cancel_reason && !/^Not given/.test(job.cancel_reason) ? job.cancel_reason : null;
    const by = job.cancelled_by === "worker" ? wName : job.cancelled_by === "admin" ? "Mahi Man" : "You";
    return (
      <div className="app ps cx" style={{ background: "var(--card)" }}>
        <section className="hero ps-hero">
          <div className="hero-top"><button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button><HelpButton onClick={() => setScreen("help")} /></div>
          <h1 className="ps-h">Job cancelled.</h1>
          <JobLine photo={look.photo} title={jobName} parts={[priceWords(job), suburb, job.asap ? "As soon as possible" : longWhen(job.start_at)]} />
        </section>
        <div className="cx-sec">
          <dl className="cx-sum">
            <dt>Posted</dt><dd>{longWhen(job.created_at)}</dd>
            {job.cancelled_at && <><dt>Cancelled</dt><dd>{longWhen(job.cancelled_at)}{by !== "You" ? ` by ${by}` : ""}</dd></>}
            {reason && <><dt>Reason</dt><dd>{reason}</dd></>}
            <dt>Charged</dt><dd>{job.cancel_fee_cents ? money(job.cancel_fee_cents) : "Nothing"}</dd>
            <dt>Address</dt><dd>{[job.address, suburb].filter(Boolean).join(", ")}</dd>
          </dl>
        </div>
        {owedHere && (
          <div className="row between" style={{ padding: "8px 16px 18px", gap: 12 }}>
            <span className="stack" style={{ gap: 2 }}>
              <span className="t17 w5">Pay {owedHere.to} {money(owedHere.amount_cents)}</span>
              <span className="small light muted">Cancellation fee, needed before your next job</span>
            </span>
            <button className="btn primary small" onClick={() => setPaying(true)}>Pay</button>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div className="ps-foot">
          <div className="ps-btns">
            <button className="btn stone" onClick={() => { try { sessionStorage.setItem("mm-again", job.id); } catch { /* private mode */ } go("/", true); }}>{Icon.repeat("currentColor", 22)}Post again</button>
            <button className="btn primary" onClick={() => go("/", true)}>{Icon.home("currentColor")}Home</button>
          </div>
        </div>
        {overlays}
        {paying && owedHere && <FeePayScreen fee={owedHere} onBack={() => setPaying(false)} onPaid={() => { setPaying(false); reloadOwed(); }} />}
      </div>
    );
  }

  let label = "", big = "", bigUnit = "", sub = "";
  switch (job.status) {
    case "awaiting_payment": label = "Not booked yet"; big = money2(total); sub = "Hold the payment to send it to workers"; break;
    case "accepted": {
      const mins = eta ? Math.max(0, Math.round((new Date(eta).getTime() - now) / 60000)) : 0;
      if (trip) {
        // Live: worker tapped "I'm on my way". ETA from the driving route when the map is on, otherwise their estimate.
        const m = route?.minutes ?? mins;
        label = `${wName} is on the way`;
        if (m > 0) { big = String(m); bigUnit = "min"; } else { big = "Any minute"; }
        const secs = Math.max(0, Math.round((now - new Date(trip.updated_at).getTime()) / 1000));
        sub = `${route ? `${route.km} km away. ` : ""}Updated ${secs < 20 ? "just now" : secs < 90 ? `${secs} sec ago` : `${Math.round(secs / 60)} min ago`}.`;
      } else if (job.asap) {
        label = `${wName} is booked`;
        big = new Date(eta ?? job.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
        sub = `You'll see ${wName} on a map once they leave.`;
      }
      else { label = `${wName} is booked for`; big = new Date(job.start_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); sub = `${new Date(job.start_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}. You'll see ${wName} on a map once they leave.`; }
      break;
    }
    case "in_progress": label = `${wName} is working`; big = elapsed(job.started_at!, now); sub = `Up to ${Number(jt.max_hours)} hrs`; break;
    case "finished": label = "Job done"; big = money2(total); sub = direct ? `Check the photos, pay ${wName} directly, then confirm` : "Check the photos, then confirm to pay"; break;
    case "confirmed": label = direct ? "Done" : "Paid and done"; big = money2(total); sub = "Thanks for using Mahi Man"; break;
  }

  // The deadline to verify: the hours set in Admin from when they signed up.
  const verifyBy = profile && verifyHours != null ? new Date(new Date(profile.created_at).getTime() + verifyHours * 3600000)
    .toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="app">
      <section className="hero short">
        <div className="hero-top">
          <button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button>
          <HelpButton onClick={() => setScreen("help")} />
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
      {trip && job.status === "accepted" && <LiveMap loc={trip} address={`${job.address}, ${suburb}, ${region}`} initials={initials(worker?.full_name ?? wName)} onRoute={setRoute} onShown={setMapOn} />}

      <div className="ticket" style={trip && mapOn && job.status === "accepted" ? { marginTop: 12 } : undefined}>
        {worker ? (
          <>
            <div className="pad row">
              <Tile name={worker.full_name} photo={worker.photo_path} />
              <span className="stack" style={{ gap: 3, flex: 1 }}>
                <span style={{ fontSize: 19, fontWeight: 500 }}>{cardName(worker.full_name)}</span>
                {worker.id_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not verified</span>}
                <span className="small light muted">{[worker.turns_up != null ? `Turns up ${worker.turns_up}%` : "", worker.reviewed ? `recommended by ${worker.recommended} of ${worker.reviewed}` : "", `${worker.jobs_done} jobs done`].filter(Boolean).join(", ").replace(/^r/, "R")}</span>
              </span>
            </div>
            {["accepted", "in_progress", "finished", "disputed"].includes(job.status) && (
              <div style={{ padding: "0 16px 16px" }}>
                <button className="btn stone block" style={{ background: "var(--ground)" }} onClick={() => setScreen("chat")}>{Icon.msg()} Message {wName}</button>
              </div>
            )}
            {job.status === "accepted" && terms && ["new_time", "late", "no_show"].includes(terms.kind) && (
              <>
                <Perf />
                <div className="stack" style={{ padding: "8px 16px 18px", gap: 10 }}>
                  <span className="t17 w5" style={{ color: "#8a5a10" }}>
                    {terms.kind === "new_time" ? `${wName} is running late` : terms.kind === "late" ? `${wName} is ${terms.minutes_late} minutes late` : `${wName} hasn't set off`}
                  </span>
                  <span className="t15 light muted" style={{ lineHeight: 1.45 }}>
                    {terms.kind === "new_time" ? `New arrival ${hm(terms.eta_at)}${terms.eta_reason ? ` (${terms.eta_reason})` : ""}. Accept it, or cancel for free.`
                      : terms.kind === "late" ? "You can keep waiting, or cancel for free."
                      : `They said ${hm(terms.eta_at)}. You can cancel for free, and you get ${money(rules.fee)} credit.`}
                  </span>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                    <button className="btn stone small" onClick={() => setScreen("cancel")}>Cancel for free</button>
                    {terms.kind === "new_time" && <button className="btn primary small" onClick={async () => {
                      try { await rpc("accept_new_time", { p_job: id }); toast(`${wName} has been told`); load(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
                    }}>OK, {hm(terms.eta_at)}</button>}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="pad stack" style={{ gap: 4 }}>
            <span className="t17 w5">{jobName}</span>
            <span className="t15 light muted">{[job.address, suburb].filter(Boolean).join(", ")}</span>
          </div>
        )}

        {jobFee && job.status !== "finished" && (
          <>
            <Perf />
            <div className="stack" style={{ padding: "8px 16px 18px", gap: 4 }}>
              <span className="row between"><span className="t17 w5">Connection fee</span><span className="t17 w5">{money2(jobFee.amount_cents)}</span></span>
              <span className="small light muted" style={{ lineHeight: 1.45 }}>
                {jobFee.amount_cents <= jobFee.from_balance_cents ? "Taken from your credit."
                  : jobFee.customer_invoices ? `${jobFee.from_balance_cents > 0 ? `${money2(jobFee.from_balance_cents)} from your credit, ${money2(jobFee.amount_cents - jobFee.from_balance_cents)} ${jobFee.customer_invoices.status === "paid" ? "paid" : "to pay"}` : jobFee.customer_invoices.status === "paid" ? "Paid" : "To pay"} on invoice ${jobFee.customer_invoices.number}. It's in You, Payments.`
                  : "On your next invoice. It's in You, Payments."}
              </span>
            </div>
          </>
        )}
        {(job.fee_status === "paid" || job.fee_status === "refunded") && !jobFee && (
          <>
            <Perf />
            <div className="stack" style={{ padding: "8px 16px 18px", gap: 4 }}>
              <span className="row between"><span className="t17 w5">Connection fee</span><span className="t17 w5">{money2(job.fee_cents)}</span></span>
              <span className="small light muted" style={{ lineHeight: 1.45 }}>
                {job.fee_status === "refunded"
                  ? "Refunded to your card. It can take 5 to 10 days to show."
                  : ["accepted", "searching"].includes(job.status)
                    ? `Paid. Receipt sent to your email. If ${wName} cancels or doesn't turn up, you choose someone else with no new fee. If the job never gets done, it's refunded.`
                    : "Paid. Receipt sent to your email."}
              </span>
            </div>
          </>
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
              <span className="small light muted" style={{ lineHeight: 1.45 }}>{direct ? `Pay ${wName} ${money2(total)} ${payWay(job)}, then confirm. If you don't confirm or report a problem, the job closes after 48 hours.` : "If you don't confirm or report a problem, payment releases automatically 48 hours after the job was finished."}</span>
              <div className="row between">
                <button className="btn stone" onClick={() => setScreen("report")}>Something's wrong</button>
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
            <span className="t17 w5">{direct ? `Pay ${money(total)} when it's done` : `${money2(total)} held, not paid`}</span>
            <span className="small light muted" style={{ lineHeight: 1.45 }}>{direct ? `Pay ${worker ? wName : "your worker"} ${payWay(job)} once the job is finished.` : `${worker ? wName : "Your worker"} is paid only after you confirm the job is done.`}</span>
          </span>
        </section>
      )}

      {profile && profile.id_status !== "verified" && !["cancelled", "refunded"].includes(job.status) && (
        <button className="poster" style={{ margin: "22px 0 0", borderTop: "1px solid var(--line)" }} onClick={() => go("/verify")}>
          {Icon.shieldTick("var(--emerald)", 34, 1.8)}
          <span className="t">
            <span className="t17 w5">{profile.id_status === "pending" ? "Your ID is being checked" : profile.id_status === "retake" ? "Retake your ID photo" : "Verify your ID"}</span>
            <span className="small light muted">{profile.id_status === "pending" ? "Usually within a few hours." : verifyBy ? `Verify by ${verifyBy} to keep posting jobs. About 2 minutes.` : "Verify to keep posting jobs. About 2 minutes."}</span>
          </span>
          {Icon.chevron("var(--faint)")}
        </button>
      )}


      {screen === "chat" && <ChatScreen jobId={id} me={session.user.id} otherName={worker?.full_name ?? wName} otherPhoto={worker?.photo_path} sub={jobName} onBack={() => setScreen(null)} />}
      {screen === "pay" && <PayScreen jobId={id} amountLabel={money2(total)} onBack={() => setScreen(null)} onPaid={() => { setScreen(null); load(); }} />}
      {screen && typeof screen === "object" && (
        <PayScreen requestId={screen.extra.id} title="Approve extra" amountLabel={money2(screen.extra.amount_cents)} onBack={() => setScreen(null)}
          onPaid={() => { setScreen(null); toast("Approved"); load(); }} />
      )}
      {screen === "report" && <ProblemScreen job={job} jobName={jobName} otherName={wName} isWorker={false} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "help" && <JobHelp job={job} wName={job.worker_id ? wName : null} onBack={() => setScreen(null)}
        onPick={(k) => { if (k === "support") { setScreen(null); go("/support"); } else setScreen(k); }} />}
      {screen === "reportUser" && job.worker_id && <ReportUser name={wName} userId={job.worker_id} jobId={id} onBack={() => setScreen(null)} onDone={() => setScreen(null)} />}
      {screen === "reportUser" && job.worker_id && <ReportUser name={wName} userId={job.worker_id} jobId={id} onBack={() => setScreen(null)} onDone={() => setScreen(null)} />}
      {screen === "cancel" && <CancelScreen job={job} title={jobName} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); reloadOwed(); }} />}
      {paying && owedHere && <FeePayScreen fee={owedHere} onBack={() => setPaying(false)} onPaid={() => { setPaying(false); reloadOwed(); }} />}
    </div>
  );
}

interface CancelTerms {
  kind: "free" | "fee" | "late" | "no_show" | "new_time" | "not_moving" | "started";
  fee_cents?: number; set_off_at?: string; minutes_late?: number; worker: string | null; eta_at: string | null; eta_reason: string | null;
  booking_fee_cents: number; card: string | null; payments_live: boolean;
  posted_at?: string; cancels_30?: number; cancel_limit?: number; pause_days?: number;
}
const hm = (d: string | null | undefined) => d ? new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase() : "";

// Cancelling: free until the worker is on the way; then a fee that goes to them. Free again if they're late.
// Like Airtasker and Uber: say what happens before they cancel, ask why, and show the receipt after.
// Free cancels are counted: too many in 30 days pauses posting (Admin sets both numbers).
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const longWhen = (d: string) => `${hm(d)}, ${new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}`;
interface CancelDone { cancelled_at: string; reason: string; charged: number; cancels_30: number; cancel_limit: number; paused_until: string | null; told: string | null }

function CancelScreen({ job, title, onBack, onDone }: { job: Job; title: string; onBack: () => void; onDone: () => void }) {
  const toast = useToast();
  const [t, setT] = useState<CancelTerms | null>(null);
  const [busy, setBusy] = useState(false);
  const [fee, setFee] = useState<OwedFee | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState<CancelDone | null>(null);
  const rules = useRules();
  const { suburb, photo } = useJobLook(job.id);
  useEffect(() => { rpc<CancelTerms>("cancel_preview", { p_job: job.id }).then(setT).catch((e) => toast(e instanceof Error ? e.message : String(e))); }, [job.id]);
  const w = t?.worker ?? "your worker";
  const W = t?.worker ?? "Your worker";
  const when = job.asap ? "As soon as possible" : job.start_at ? longWhen(job.start_at) : "";
  const line = <JobLine photo={photo} title={title} parts={[priceWords(job), suburb, when]} />;
  const OTHER = "Something else";
  const reasons = [
    ...(t?.kind === "new_time" ? [`The new time doesn't suit me`] : t?.kind === "not_moving" ? [`${W} hasn't moved`] : []),
    "I found someone else", "I don't need it anymore", "I posted it by mistake", "The details are wrong. I'll post it again",
    ...(job.worker_id ? [] : ["Nobody has taken it"]), "I want to change the price", OTHER,
  ];
  const said = reason === OTHER ? other.trim() : reason;

  async function doCancel(why: string) {
    setBusy(true);
    try {
      const r = await api<{ kind: string; fee_cents: number; fee_id: number | null; paid: boolean; cancelled_at: string; cancels_30: number; cancel_limit: number; paused_until: string | null }>("cancel_job", { job_id: job.id, reason: why });
      const receipt: CancelDone = { cancelled_at: r.cancelled_at ?? new Date().toISOString(), reason: why, charged: r.fee_cents, cancels_30: r.cancels_30, cancel_limit: r.cancel_limit, paused_until: r.paused_until, told: job.worker_id ? (t?.worker ?? null) : null };
      if (r.fee_cents > 0 && !r.paid && r.fee_id) {
        const all = await rpc<{ owed: OwedFee[] }>("my_fees");
        const f = all.owed.find((x) => x.id === r.fee_id);
        if (f) { setDone(receipt); setFee(f); return; }
      }
      setDone(receipt);
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  if (fee) return <FeePayScreen fee={fee} onBack={() => setFee(null)} onPaid={() => setFee(null)} />;
  if (done) return <CancelledView title={title} line={line} d={done} onDone={onDone} />;
  if (!t) return <Screen title="Cancel booking" onBack={onBack}><Loading /></Screen>;

  if (t.kind === "late" || t.kind === "no_show") {
    const why = t.kind === "late" ? `${W} was ${t.minutes_late} minutes late` : `${W} didn't turn up`;
    return (
      <div className="screen" role="dialog" aria-label="Cancel booking">
        <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
          <section className="step-hero late-hero" style={{ paddingBottom: 28 }}>
            <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
            <span style={{ color: "rgba(255,255,255,.85)", fontSize: 15 }}>{W} said {hm(t.eta_at)}</span>
            <h1>{t.minutes_late} minutes late</h1>
            <p>{t.kind === "late" ? `${W} is on the way but running late.` : `${W} hasn't set off.`}</p>
          </section>
          <div className="cp-sec">
            <span className="cp-title">Your choice</span>
            <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>Keep waiting.</b> {t.kind === "late" ? `${W} is still coming.` : `${W} may still turn up.`}</span></div>
            <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>Cancel for free.</b> {t.kind === "no_show" ? `You get ${money(rules.fee)} credit, and ${w} gets a strike.` : `${W} gets a strike.`} It doesn't count against you.</span></div>
          </div>
          <div style={{ flex: 1 }} />
          <ActionBar>
            <button className="btn stone" style={{ flex: 1 }} onClick={onBack}>Keep waiting</button>
            <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={() => doCancel(why)}>{busy ? "Cancelling…" : "Cancel for free"}</button>
          </ActionBar>
        </div>
      </div>
    );
  }

  if (t.kind === "started") {
    return (
      <Screen title="Cancel booking" onBack={onBack}>
        <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
          <div className="cp-sec"><span className="cp-title">The job has started</span><span className="t16 light" style={{ lineHeight: 1.5 }}>{W} is already working. Use Get help and we'll sort it out.</span></div>
          <div style={{ flex: 1 }} />
          <ActionBar><button className="btn primary block" onClick={() => { onBack(); go("/support"); }}>Get help</button></ActionBar>
        </div>
      </Screen>
    );
  }

  // What happens if they cancel now, in plain words.
  const counts = t.kind === "free" || t.kind === "fee";
  const nth = (t.cancels_30 ?? 0) + 1, limit = t.cancel_limit ?? 3, days = t.pause_days ?? 7;
  const items: { icon: ReactNode; head: string; body: string; warn?: boolean }[] = [];
  if (t.kind === "fee") {
    items.push({ icon: Icon.warn("#b8860b"), warn: true, head: `Cancelling costs ${money(t.fee_cents ?? 0)}`, body: `${W} set off at ${hm(t.set_off_at)}. The fee goes to ${w} for their time${t.booking_fee_cents ? ", and the connection fee isn't refunded" : ""}.${t.card && t.payments_live ? ` Charged to your ${t.card}.` : ""}` });
  } else {
    const free = t.kind === "new_time" ? `${W} changed the time to ${hm(t.eta_at)}, so it's free.` : t.kind === "not_moving" ? `${W} hasn't moved in 10 minutes, so it's free.`
      : job.worker_id ? `${W} hasn't set off yet, so nothing is charged.` : "Nobody has taken it yet, so nothing is charged.";
    items.push({ icon: Icon.tick("var(--emerald)", 22), head: "Free to cancel", body: free + (t.booking_fee_cents ? ` Your ${money2(t.booking_fee_cents)} connection fee is refunded.` : "") });
  }
  items.push(job.worker_id
    ? { icon: Icon.bell("var(--emerald)"), head: `${W} is told straight away`, body: "They won't come." }
    : { icon: Icon.bell("var(--emerald)"), head: "Taken down straight away", body: "It comes off everyone's alerts the moment you cancel." });
  if (counts) items.push({ icon: Icon.warn("#b8860b"), warn: true, head: "Cancelling a lot pauses your account",
    body: nth >= limit ? `This is your ${ordinal(nth)} cancel in 30 days, so you can't post for ${days} days after it.` : `${limit} cancels in 30 days and you can't post for ${days} days. This would be your ${ordinal(nth)}.` });

  return (
    <div className="screen cx" role="dialog" aria-label="Cancel this job">
      <div className="screen-body" style={{ display: "flex", flexDirection: "column", background: "var(--card)" }}>
        <section className="hero ps-hero">
          <div className="hero-top"><button className="cx-back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <h1 className="ps-h">Cancel this job?</h1>
          {line}
          {t.posted_at && <span className="cx-when">{postedAgo(t.posted_at)}</span>}
        </section>
        <div className="cx-sec">
          <h2>What happens</h2>
          {items.map((i) => <div key={i.head} className={i.warn ? "cx-li warn" : "cx-li"}>{i.icon}<span><b>{i.head}</b>{i.body}</span></div>)}
        </div>
        <div className="cx-sec">
          <h2>Why are you cancelling?</h2>
          <button className={reason ? "cx-sel" : "cx-sel ph"} onClick={() => setPicking(true)}><span>{reason ?? "Select a reason"}</span>{Icon.down("var(--muted)")}</button>
          {reason === OTHER && <textarea className="cx-other" value={other} maxLength={300} onChange={(e) => setOther(e.target.value)} placeholder="Tell us in a few words" autoFocus />}
        </div>
        <div style={{ flex: 1 }} />
        <div className="ps-foot">
          <div className="ps-btns">
            <button className="btn stone" onClick={onBack}>Keep job</button>
            <button className="btn danger" disabled={busy || !said} onClick={() => said && doCancel(said)}>{Icon.cancel("currentColor")}{busy ? "Cancelling…" : t.kind === "fee" ? `Cancel, pay ${money(t.fee_cents ?? 0)}` : "Cancel job"}</button>
          </div>
        </div>
      </div>
      {picking && <SearchPicker title="Why are you cancelling?" options={reasons.map((r) => ({ id: r, label: r, hint: r === OTHER ? "Tell us in a few words" : undefined }))}
        value={reason ? [reason] : []} onClose={() => setPicking(false)} onChange={(v) => setReason(String(v[0]))} />}
    </div>
  );
}

// After cancelling: when, why, what it cost, and where they stand.
function CancelledView({ line, d, onDone }: { title: string; line: ReactNode; d: CancelDone; onDone: () => void }) {
  const again = () => { try { sessionStorage.setItem("mm-again", "1"); } catch { /* private mode */ } go("/", true); };
  return (
    <div className="screen cx" role="dialog" aria-label="Job cancelled">
      <div className="screen-body" style={{ display: "flex", flexDirection: "column", background: "var(--card)" }}>
        <section className="hero ps-hero">
          <div className="hero-top"><button className="brand" onClick={onDone}><Logo /> Mahi Man</button></div>
          <h1 className="ps-h">Job cancelled.</h1>
          {line}
        </section>
        <div className="cx-sec">
          <dl className="cx-sum">
            <dt>Cancelled</dt><dd>{longWhen(d.cancelled_at)}</dd>
            <dt>Reason</dt><dd>{d.reason}</dd>
            <dt>Charged</dt><dd>{d.charged ? money(d.charged) : "Nothing"}</dd>
            <dt>Cancels</dt><dd>{d.cancels_30} of {d.cancel_limit} in 30 days</dd>
          </dl>
        </div>
        <div className="cx-sec">
          <div className="cx-li">{Icon.bell("var(--emerald)")}<span>{d.told ? <><b>{d.told} has been told</b>They won't come.</> : <><b>It's off everyone's alerts</b>Nobody will turn up for it.</>}</span></div>
          {d.paused_until && <div className="cx-li warn">{Icon.warn("#b8860b")}<span><b>Posting is paused until {longWhen(d.paused_until)}</b>That's {d.cancel_limit} cancels in 30 days.</span></div>}
        </div>
        <div style={{ flex: 1 }} />
        <div className="ps-foot">
          <div className={d.paused_until ? "ps-btns one" : "ps-btns"}>
            {!d.paused_until && <button className="btn stone" onClick={again}>{Icon.repeat("currentColor", 22)}Post again</button>}
            <button className="btn primary" onClick={() => go("/", true)}>{Icon.home("currentColor")}Home</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Help, top right of every job screen (the way Uber and DoorDash do it): the less common actions in one full-screen list.
export function HelpButton({ onClick }: { onClick: () => void }) {
  return <button className="wj-safety" onClick={onClick} aria-label="Help">{Icon.help("#fff")}<span>Help</span></button>;
}
function JobHelp({ job, wName, onBack, onPick }: { job: Job; wName: string | null; onBack: () => void; onPick: (k: "cancel" | "report" | "reportUser" | "support") => void }) {
  const rules = useRules();
  const items: { k: "cancel" | "report" | "reportUser" | "support"; icon: ReactNode; t: string; s: string }[] = [];
  if (["awaiting_payment", "searching", "accepted"].includes(job.status))
    items.push({ k: "cancel", icon: Icon.cancel("var(--danger)", 24), t: "Cancel booking", s: job.worker_id ? `Free until ${wName} is on the way` : "Free, nobody has taken it yet" });
  if (job.status === "finished") items.push({ k: "report", icon: Icon.flag("var(--emerald)"), t: "Report a problem with the job", s: "Something wasn't done, or went wrong" });
  if (wName) items.push({ k: "reportUser", icon: Icon.person("var(--emerald)", 24), t: `Report ${wName}`, s: "Behaviour or safety" });
  items.push({ k: "support", icon: Icon.msg("var(--emerald)"), t: "Talk to Mahi Man", s: rules.late ? "We reply within a few hours" : "We reply within a few hours" });
  return (
    <Screen title="Help with this job" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <div className="hl-list">
          {items.map((i) => <button key={i.k} onClick={() => onPick(i.k)}>{i.icon}<span><b>{i.t}</b><small>{i.s}</small></span>{Icon.chevron("var(--faint)")}</button>)}
        </div>
      </div>
    </Screen>
  );
}
