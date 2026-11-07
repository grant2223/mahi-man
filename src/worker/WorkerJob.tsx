import { useCallback, useEffect, useState } from "react";
import { isDirectPay, mediaUrls, rpc, sb, type Job, type JobType, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { elapsed, firstName, money, shrinkImage } from "../lib/format";
import { Icon, Perf, Screen, Tile, useNow, useToast } from "../ui/kit";
import { ChatScreen } from "../ui/Chat";
import { ReportScreen } from "../ui/Report";
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
  const [extras, setExtras] = useState<Extra[]>([]);
  const [screen, setScreen] = useState<null | "reportUser" | "chat" | "code" | "extra" | "emergency" | "problem" | "before" | "after">(null);
  const [busy, setBusy] = useState(false);
  const [payid, setPayid] = useState<string | null>(null);
  const [report, setReport] = useState(false);

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
    sb.from("workers").select("payid").single().then(({ data }) => setPayid(data?.payid ?? null));
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

  if (!jt || !session) return null;
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
  const leaveLink = <button className="link quiet" style={{ margin: "0 16px 16px", alignSelf: "flex-start" }} onClick={onLeave}>See new jobs</button>;
  const problem = report && <JobProblem job={j} jobName={jt.name} otherName={cName} isWorker onBack={() => setReport(false)} onDone={() => { setReport(false); load(); }} />;

  if (j.status === "disputed" || j.status === "refunded") {
    return <><DisputeView job={j} jobName={jt.name} otherName={cName} isWorker onChanged={load} footer={leaveLink} />{problem}</>;
  }

  if (j.status === "confirmed") {
    return <ReviewView jobId={j.id} jobName={jt.name} done={`${money(earn)} received`} person={cust} other={cName} isWorker
      about={`Tell other workers about ${cName}`} onDone={onChanged} />;
  }

  if (j.status === "finished" && isDirectPay(j)) {
    const told = !!j.customer_paid_at;
    const at = told ? new Date(j.customer_paid_at!).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }) : "";
    return (
      <>
        <DoneHero jobName={jt.name} step={3} big={money(earn)} lime
          label={told ? `${cName} says they've paid you` : "Get paid"}
          sub={told ? `Marked paid at ${at}` : `Collect it from ${cName} now, by PayID or cash`} />
        {told ? (
          <div className="cp-sec">
            <span className="cp-title" style={{ marginBottom: 2 }}>Check your bank, then confirm</span>
            <span className="t16 light muted" style={{ lineHeight: 1.45 }}>Once you confirm, the job closes and you both leave a review.</span>
          </div>
        ) : (
          <>
            <PriceRows title={`What ${cName} pays you`} jobName={jt.name} priceCents={j.price_cents} extras={approved} totalLabel="Total" />
            <div className="cp-payid">
              {Icon.card("var(--emerald)")}
              <span className="stack" style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 500 }}>{payid ? `${cName} can see your PayID` : "Add your PayID"}</span>
                <span className="t15 light muted">{payid ? showPayid(payid) : `No PayID saved. Ask ${cName} for cash, or send it in Messages.`}</span>
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

  const heroLabel = j.status === "accepted" ? "Head to the job" : j.status === "in_progress" ? "Working for" : isDirectPay(j) ? "Get paid" : "Waiting for the customer";
  const heroBig = j.status === "in_progress" ? elapsed(j.started_at!, now) : money(earn);

  return (
    <>
      <section className="hero" style={{ paddingBottom: 96 }}>
        <div className="hero-top">
          <span className="t17 w5">{jt.name}</span>
          <button className="btn danger small" style={{ height: 36 }} onClick={() => setScreen("emergency")}>Emergency</button>
        </div>
        <span className="label">{heroLabel}</span>
        <div className="row" style={{ alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <span className={j.status === "in_progress" ? "big" : "big lime"}>{heroBig}</span>
          {j.status === "in_progress" && <span className="t15 light" style={{ color: "rgba(255,255,255,0.85)" }}>of up to {Number(jt.max_hours)} hrs</span>}
        </div>
        <span className="sub">
          {j.status === "in_progress" ? <>You earn <span style={{ color: "var(--lime)", fontWeight: 500 }}>{money(earn)}</span> when the customer confirms</>
            : j.status === "finished" ? (isDirectPay(j) ? `Collect ${money(earn)} from the customer now: PayID or cash` : "They have 48 hours to confirm, then you're paid automatically")
              : "Ask for their 4-digit start code when you arrive"}
        </span>
      </section>

      <div className="ticket" style={{ marginTop: -70 }}>
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
        {brief.length > 0 && <div className="photos" style={{ padding: "0 16px 14px" }}>{brief.map((b) => b.kind === "video"
          ? <video key={b.url} src={b.url} controls playsInline style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }} />
          : <a key={b.url} href={b.url} target="_blank" rel="noreferrer"><img src={b.url} alt="Customer photo" /></a>)}</div>}
        {j.notes && <div className="stack" style={{ padding: "0 16px 16px", gap: 4 }}><span className="t15 w5">Getting in</span><span className="t15 light" style={{ lineHeight: 1.45 }}>{j.notes}</span></div>}
        <Perf />
        <CheckRow done={j.status !== "accepted"} n={1} title="Start with customer's code" />
        <CheckRow done={photos.before > 0} n={2} title="Before photos" note={photos.before ? `${photos.before} added` : "take them before you start"} />
        <CheckRow done={photos.after > 0} n={3} title="After photos" note={photos.after ? `${photos.after} added` : "needed to finish"} last />
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

      <div className="row" style={{ margin: "14px 20px 0", justifyContent: "flex-end" }}>
        <button className="link quiet" onClick={() => setScreen("reportUser")}>Report {cName}</button>
      </div>

      <div className="footer">
        {j.status === "accepted" && <button className="btn primary" onClick={() => setScreen("code")}>Enter start code {Icon.arrow("var(--lime)")}</button>}
        {j.status === "in_progress" && photos.before === 0 && <button className="btn primary" onClick={() => setScreen("before")}>{Icon.camera("var(--lime)")} Add before photos</button>}
        {j.status === "in_progress" && photos.before > 0 && photos.after === 0 && <button className="btn primary" onClick={() => setScreen("after")}>{Icon.camera("var(--lime)")} Add after photos</button>}
        {j.status === "in_progress" && photos.after > 0 && (
          <>
            <button className="btn stone" onClick={() => setScreen("after")}>More photos</button>
            <button className="btn primary" disabled={busy || !!pending} onClick={finish}>Finish job {Icon.arrow("var(--lime)")}</button>
          </>
        )}
        {j.status === "finished" && <button className="btn stone" onClick={onChanged}>Back to jobs</button>}
      </div>

      {screen === "chat" && <ChatScreen jobId={j.id} me={session.user.id} otherName={cName} onBack={() => setScreen(null)} />}
      {screen === "reportUser" && <ReportScreen name={cName} userId={j.customer_id} jobId={j.id} onBack={() => setScreen(null)} onDone={() => setScreen(null)} />}
      {screen === "code" && <CodeScreen jobId={j.id} name={cName} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {(screen === "before" || screen === "after") && <PhotoScreen jobId={j.id} kind={screen} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "extra" && <ExtraScreen jobId={j.id} onBack={() => setScreen(null)} onDone={() => { setScreen(null); load(); }} />}
      {screen === "emergency" && <EmergencyScreen jobId={j.id} onBack={() => setScreen(null)} />}
      {screen === "problem" && <ProblemScreen jobId={j.id} onBack={() => setScreen(null)} />}
    </>
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
    <Screen title="Emergency" onBack={onBack}>
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
    <Screen title="Report a problem" onBack={onBack}>
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
