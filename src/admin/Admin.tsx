import { type ReactNode, useCallback, useEffect, useState } from "react";
import { api, avatarUrl, brandUrl, rpc, sb, type Area, type Category, type JobType } from "../lib/supabase";
import { loadMapKit } from "../ui/LiveMap";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money2, shrinkImage } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { CatIcon, Icon, Logo, SearchPicker, useToast } from "../ui/kit";

const CAT_ICONS: [string, string][] = [["cleaning", "Spray bottle"], ["garden", "Seedling"], ["moving", "Truck"], ["rubbish", "Bin"], ["maintenance", "Aircon"], ["events", "Glass"], ["kids", "Blocks"], ["tech", "Laptop"], ["assembly", "Wrench"], ["handyman", "Hammer"], ["pets", "Paw"], ["errands", "Bag"], ["car", "Car"], ["pool", "Pool"], ["other", "Sparkle"]];

type Tab = "overview" | "jobs" | "ids" | "licences" | "reports" | "problems" | "people" | "areas" | "types" | "skills" | "settings";

const STATUS_BADGE: Record<string, string> = {
  awaiting_payment: "", searching: "y", accepted: "y", in_progress: "y", finished: "y", confirmed: "g", disputed: "r", cancelled: "", refunded: "r",
};

export function Admin() {
  const { session, profile, ready } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [counts, setCounts] = useState({ ids: 0, reports: 0, problems: 0, licences: 0 });
  const recount = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      sb.from("id_checks").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb.from("incidents").select("id", { count: "exact", head: true }).eq("resolved", false),
      sb.from("worker_credentials").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setCounts({ ids: a.count ?? 0, reports: b.count ?? 0, problems: c.count ?? 0, licences: d.count ?? 0 });
  }, []);
  useEffect(() => { if (profile?.is_admin) recount(); }, [profile?.is_admin, recount, tab]);
  // Full-width admin: a fixed side menu grouped by what needs doing, and the page on the right.
  const GROUPS: { label: string; items: [Tab, string, number?][] }[] = [
    { label: "", items: [["overview", "Overview"]] },
    { label: "To check", items: [["ids", "ID checks", counts.ids], ["licences", "Licence checks", counts.licences], ["reports", "Reports", counts.reports], ["problems", "Disputes", counts.problems]] },
    { label: "Marketplace", items: [["jobs", "Jobs"], ["people", "Users"]] },
    { label: "Setup", items: [["areas", "Areas"], ["types", "Job types"], ["skills", "Skills"], ["settings", "Settings"]] },
  ];
  const TITLE = Object.fromEntries(GROUPS.flatMap((g) => g.items.map(([k, l]) => [k, l]))) as Record<Tab, string>;
  if (!ready) return null;
  if (!session) return <div className="admin"><AuthScreen title="Admin sign in" reason="Sign in with your admin account." onBack={() => go("/")} onDone={() => {}} /></div>;
  if (!profile?.is_admin) return (
    <div className="admin solo"><div className="admin-head"><span className="brand"><Logo /> More Mahi Admin</span><h1 style={{ margin: "16px 0 0", fontWeight: 600 }}>Admins only</h1>
      <p className="light">This account isn't an admin. <button className="hero-link" onClick={() => sb.auth.signOut()}>Sign out</button></p></div></div>
  );
  return (
    <div className="admin">
      <aside className="adm-side">
        <span className="brand"><Logo /> More Mahi</span>
        <nav>
          {GROUPS.map((g) => (
            <div key={g.label || "top"} className="adm-group">
              {g.label && <span className="adm-label">{g.label}</span>}
              {g.items.map(([k, l, n]) => (
                <button key={k} className={tab === k ? "adm-link on" : "adm-link"} onClick={() => setTab(k)}>
                  <span>{l}</span>{!!n && <span className="adm-count">{n}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="adm-me">
          <span className="small light">{session.user.email}</span>
          <button className="adm-signout" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="adm-main">
        <h1 className="adm-title">{TITLE[tab]}</h1>
        {tab === "overview" && <Overview />}
        {tab === "jobs" && <Jobs />}
        {tab === "ids" && <IdChecks onChanged={recount} />}
        {tab === "licences" && <LicenceChecks onChanged={recount} />}
        {tab === "skills" && <Skills />}
        {tab === "reports" && <Reports onChanged={recount} />}
        {tab === "problems" && <Problems />}
        {tab === "people" && <People />}
        {tab === "areas" && <Areas />}
        {tab === "types" && <Types />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}

function Overview() {
  const [s, setS] = useState({ live: 0, searching: 0, weekJobs: 0, weekFees: 0, workers: 0, online: 0, problems: 0, accept: "—", repeat: 0, cancelled: 0 });
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const [live, searching, week, workers, online, problems, recent] = await Promise.all([
        sb.from("jobs").select("id", { count: "exact", head: true }).in("status", ["accepted", "in_progress", "finished"]),
        sb.from("jobs").select("id", { count: "exact", head: true }).eq("status", "searching"),
        sb.from("jobs").select("fee_cents").or(`and(fee_status.eq.paid,fee_paid_at.gte.${since}),and(status.eq.confirmed,confirmed_at.gte.${since},payment_intent_id.not.is.null)`),
        sb.from("workers").select("id", { count: "exact", head: true }).eq("approved", true),
        sb.from("workers").select("id", { count: "exact", head: true }).eq("online", true),
        sb.from("incidents").select("id", { count: "exact", head: true }).eq("resolved", false),
        sb.from("jobs").select("customer_id,status,searching_at,accepted_at").gte("created_at", since),
      ]);
      const r = recent.data ?? [];
      const waits = r.filter((j) => j.searching_at && j.accepted_at).map((j) => (new Date(j.accepted_at!).getTime() - new Date(j.searching_at!).getTime()) / 60000);
      const per: Record<string, number> = {};
      r.forEach((j) => { per[j.customer_id] = (per[j.customer_id] ?? 0) + 1; });
      setS({
        live: live.count ?? 0, searching: searching.count ?? 0, weekJobs: week.data?.length ?? 0,
        weekFees: (week.data ?? []).reduce((a, j) => a + j.fee_cents, 0), workers: workers.count ?? 0, online: online.count ?? 0, problems: problems.count ?? 0,
        accept: waits.length ? `${Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)} min` : "—",
        repeat: Object.values(per).filter((n) => n > 1).length,
        cancelled: r.filter((j) => j.status === "cancelled").length,
      });
    })();
  }, []);
  return (
    <div className="stats">
      <Stat n={s.searching} l="Waiting for a worker" />
      <Stat n={s.live} l="Jobs underway" />
      <Stat n={s.weekJobs} l="Jobs done, last 7 days" />
      <Stat n={s.accept} l="Average wait for a worker, 7 days" />
      <Stat n={s.repeat} l="Customers who booked again, 7 days" />
      <Stat n={s.cancelled} l="Cancelled, 7 days" />
      <Stat n={money2(s.weekFees)} l="Your fees, last 7 days" />
      <Stat n={s.workers} l="Approved workers" />
      <Stat n={s.online} l="Workers online now" />
      <Stat n={s.problems} l="Open problems" />
    </div>
  );
}
// Nothing to do: said once, on the page itself, no card.
const AdmEmpty = ({ text }: { text: string }) => <div className="adm-empty">{Icon.tick("var(--emerald)", 28)}<span className="stack" style={{ gap: 4 }}><b>All clear</b><span>{text}</span></span></div>;
const Stat = ({ n, l }: { n: number | string; l: string }) => <div className="stat"><b>{n}</b><span>{l}</span></div>;

function Jobs() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const load = useCallback(() => {
    sb.from("jobs").select("*, job_types(name), suburbs(name), customer:profiles!jobs_customer_id_fkey(full_name), worker:workers(profiles(full_name))")
      .order("created_at", { ascending: false }).limit(200).then(({ data }) => setRows((data ?? []) as Record<string, unknown>[]));
  }, []);
  useEffect(() => {
    load();
    const ch = sb.channel("admin-jobs").on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Booked</th><th>Job</th><th>Where</th><th>Customer</th><th>Worker</th><th>Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const j = r as { id: string; title: string | null; created_at: string; status: string; price_cents: number; fee_cents: number; extra_cents: number; address: string; fee_status: string; payment_intent_id: string | null;
              job_types: { name: string }; suburbs: { name: string }; customer: { full_name: string } | null; worker: { profiles: { full_name: string } } | null };
            return (
              <tr key={j.id}>
                <td>{new Date(j.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                <td>{j.title || j.job_types.name}</td>
                <td>{j.address}, {j.suburbs.name}</td>
                <td>{j.customer?.full_name}</td>
                <td>{j.worker?.profiles.full_name ?? "—"}</td>
                <td>{money2(j.price_cents + j.extra_cents + (j.payment_intent_id ? j.fee_cents : 0))}
                  {!j.payment_intent_id && j.fee_status !== "none" && <span className={`badge ${j.fee_status === "paid" ? "g" : ""}`} style={{ marginLeft: 6 }}>
                    Fee {money2(j.fee_cents)} {j.fee_status === "paid" ? "paid" : j.fee_status === "refunded" ? "refunded" : "due"}</span>}</td>
                <td><span className={`badge ${STATUS_BADGE[j.status]}`}>{j.status.replace("_", " ")}</span></td>
                <td><span className="row" style={{ gap: 6 }}>
                  {["searching", "accepted", "awaiting_payment"].includes(j.status) && (
                  <button className="btn stone small" onClick={async () => {
                    if (!confirm(j.fee_status === "paid" ? "Remove this job? It will be cancelled for both sides and the booking fee refunded." : "Remove this job? It will be cancelled for both sides.")) return;
                    try {
                      await rpc("admin_cancel_job", { p_job: j.id });
                      if (j.fee_status === "paid") await api("admin_fee_refund", { job_id: j.id });
                      load();
                    } catch (e) { alert((e as Error).message); }
                  }}>Remove</button>)}
                  {j.fee_status === "paid" && !["searching", "accepted", "awaiting_payment"].includes(j.status) && (
                  <button className="btn stone small" onClick={async () => {
                    if (!confirm(`Refund the ${money2(j.fee_cents)} booking fee to the customer?`)) return;
                    try { await api("admin_fee_refund", { job_id: j.id }); load(); } catch (e) { alert((e as Error).message); }
                  }}>Refund fee</button>)}
                </span></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No jobs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

interface Incident {
  id: string; created_at: string; kind: string; details: string; resolved: boolean; reason: string | null; fix: string | null; media: string[];
  response: string | null; responded_at: string | null; decide_by: string | null; outcome: string | null; reporter_id: string;
  reporter: { full_name: string } | null;
  jobs: { id: string; status: string; price_cents: number; fee_cents: number; extra_cents: number; customer_id: string; worker_id: string | null;
    address: string; start_at: string; payment_intent_id: string | null; job_types: { name: string; included: string[] }; suburbs: { name: string } } | null;
}

function Problems() {
  const toast = useToast();
  const [rows, setRows] = useState<Incident[]>([]);
  const [open, setOpen] = useState<Incident | null>(null);
  const load = useCallback(() => {
    sb.from("incidents").select("*, reporter:profiles(full_name), jobs(id,status,price_cents,fee_cents,extra_cents,customer_id,worker_id,address,start_at,payment_intent_id,job_types(name,included),suburbs(name))")
      .order("resolved").order("created_at", { ascending: false }).limit(100).then(({ data }) => setRows((data ?? []) as unknown as Incident[]));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (open) return <DisputeDecide inc={open} onBack={() => { setOpen(null); load(); }} />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Type</th><th>From</th><th>Job</th><th>What went wrong</th><th>Action</th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>{new Date(i.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
              <td><span className={`badge ${i.kind === "emergency" ? "r" : "y"}`}>{i.kind}</span></td>
              <td>{i.reporter?.full_name}</td>
              <td>{i.jobs ? `${i.jobs.job_types.name}, ${i.jobs.status}` : "—"}</td>
              <td style={{ maxWidth: 320 }}>{i.reason ? <b className="w5">{i.reason}. </b> : null}{i.details}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {i.resolved ? <span className="badge g">{i.outcome ? DECIDE_LABEL[i.outcome] ?? "Resolved" : "Resolved"}</span>
                  : i.jobs?.status === "disputed" ? <button className="btn primary small" onClick={() => setOpen(i)}>Decide</button>
                  : <button className="btn stone small" onClick={async () => { await sb.from("incidents").update({ resolved: true }).eq("id", i.id); toast("Saved"); load(); }}>Mark resolved</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No problems reported.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const DECIDE_LABEL: Record<string, string> = {
  pay_full: "Paid in full", return_finish: "Worker finishes it, paid in full", part: "Part payment", nothing: "Nothing owed", agreed: "Agreed between them",
};

interface Side { full_name: string; id_status: string; rating: number | null; jobs: number }

function DisputeDecide({ inc, onBack }: { inc: Incident; onBack: () => void }) {
  const toast = useToast();
  const job = inc.jobs!;
  const [cust, setCust] = useState<Side | null>(null);
  const [work, setWork] = useState<Side | null>(null);
  const [photos, setPhotos] = useState<{ url: string; label: string; video: boolean }[]>([]);
  const [msgs, setMsgs] = useState<{ sender_id: string; body: string; created_at: string }[]>([]);
  const [extras, setExtras] = useState<{ reason: string; amount_cents: number }[]>([]);
  const [outcome, setOutcome] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pause, setPause] = useState("none");
  const [pick, setPick] = useState<null | "outcome" | "pause">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const full = job.price_cents + job.extra_cents;
  const custIsReporter = inc.reporter_id === job.customer_id;

  useEffect(() => {
    const side = async (id: string | null, set: (s: Side) => void) => {
      if (!id) return;
      const { data: p } = await sb.from("profiles").select("full_name,id_status").eq("id", id).single();
      const card = await rpc<{ rating: number | null; jobs_done: number }[]>("person_card", { p_person: id }).catch(() => []);
      set({ full_name: p?.full_name ?? "", id_status: p?.id_status ?? "none", rating: card[0]?.rating ?? null, jobs: Number(card[0]?.jobs_done ?? 0) });
    };
    side(job.customer_id, setCust); side(job.worker_id, setWork);
    (async () => {
      const { data: ph } = await sb.from("job_photos").select("kind,path").eq("job_id", job.id).order("created_at");
      const out: { url: string; label: string; video: boolean }[] = [];
      for (const p of ph ?? []) {
        const { data } = await sb.storage.from("job-photos").createSignedUrl(p.path, 3600);
        if (data?.signedUrl) out.push({ url: data.signedUrl, label: p.kind === "before" ? "Before" : "After", video: false });
      }
      if (inc.media?.length) {
        const { data } = await sb.storage.from("job-media").createSignedUrls(inc.media, 3600);
        for (const d of data ?? []) if (d.signedUrl) out.push({ url: d.signedUrl, label: "Report", video: /\.(mp4|mov|m4v|webm)$/i.test(d.path ?? "") });
      }
      setPhotos(out);
    })();
    sb.from("messages").select("sender_id,body,created_at").eq("job_id", job.id).order("created_at").then(({ data }) => setMsgs(data ?? []));
    sb.from("extra_requests").select("reason,amount_cents").eq("job_id", job.id).eq("status", "approved").then(({ data }) => setExtras(data ?? []));
  }, [job.id, job.customer_id, job.worker_id, inc.media]);

  const cName = cust?.full_name.split(" ")[0] ?? "Customer";
  const wName = work?.full_name.split(" ")[0] ?? "Worker";
  const OUTCOMES = [
    { id: "pay_full", label: `${wName} paid in full`, hint: money2(full) },
    { id: "return_finish", label: `${wName} finishes it, paid in full`, hint: "The job goes back to waiting for payment" },
    { id: "part", label: "Part payment", hint: job.payment_intent_id ? "Not available on card jobs yet" : "You set the amount", disabled: !!job.payment_intent_id },
    { id: "nothing", label: "Nothing owed", hint: job.payment_intent_id ? "The customer is refunded" : "The job closes with nothing to pay" },
  ];
  const sideBlock = (who: "customer" | "worker") => {
    const isCust = who === "customer";
    const p = isCust ? cust : work;
    const reported = isCust === custIsReporter;
    return (
      <div className="dd-side">
        <span className="dd-k">{isCust ? "Customer" : "Worker"}: {p?.full_name ?? ""}</span>
        {reported
          ? <><b>{inc.reason}{inc.fix ? `. Wants: ${inc.fix}` : ""}</b><span className="dd-q">"{inc.details}"</span></>
          : inc.response ? <><b>Their side</b><span className="dd-q">"{inc.response}"</span></> : <><b>No reply yet</b><span className="dd-q">They have 24 hours from the report to reply.</span></>}
        <span className="dd-m">{p?.rating ? `${p.rating} rating, ` : ""}{p?.jobs ?? 0} jobs, {p?.id_status === "verified" ? "ID verified" : "not ID verified"}</span>
      </div>
    );
  };

  async function save() {
    setErr("");
    if (!outcome) return setErr("Pick an outcome.");
    if (outcome === "part" && !(Number(amount) > 0)) return setErr("Enter the part amount.");
    if (note.trim().length < 10) return setErr("Write a note to both of them.");
    setBusy(true);
    try {
      await api("admin_resolve", { job_id: job.id, outcome, note: note.trim(), amount_cents: Math.round(Number(amount) * 100), pause_user: pause === "none" ? null : pause });
      toast("Saved"); onBack();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <div className="dd">
      <div className="row between" style={{ alignItems: "flex-end", marginBottom: 16 }}>
        <span className="stack" style={{ gap: 4 }}>
          <button className="link" style={{ alignSelf: "flex-start" }} onClick={onBack}>All disputes</button>
          <span className="dd-title">{job.job_types.name}, {money2(full)}</span>
          <span className="t15 light muted">{job.suburbs?.name}, {new Date(job.start_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}. Reported by {inc.reporter?.full_name} at {new Date(inc.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>
        </span>
        {inc.decide_by && <span className="w5" style={{ color: "#8a5a10" }}>Decide by {new Date(inc.decide_by).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
      </div>
      <div className="dd-grid">
        <div className="dd-main">
          <div className="dd-two">{sideBlock("customer")}{sideBlock("worker")}</div>
          <div className="dd-sec">
            <b>Photos</b>
            {photos.length ? (
              <div className="dd-photos">{photos.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title={p.label}>{p.video ? <video src={p.url} muted playsInline /> : <img src={p.url} alt={p.label} />}</a>)}</div>
            ) : <span className="dd-q">No photos.</span>}
            {photos.length > 0 && <span className="dd-m">{["Before", "After", "Report"].map((l) => `${l} (${photos.filter((p) => p.label === l).length})`).join(", ")}</span>}
          </div>
          <div className="dd-sec">
            <b>What was booked</b>
            <span className="dd-q">Included: {job.job_types.included?.join(", ")}{extras.length ? `. Extra approved: ${extras.map((e) => `${e.reason} ${money2(e.amount_cents)}`).join(", ")}` : ""}</span>
          </div>
          <div className="dd-sec">
            <b>Messages</b>
            {msgs.length ? msgs.map((m, i) => (
              <span key={i} className="dd-q"><span className="w5">{m.sender_id === job.customer_id ? cName : wName}, {new Date(m.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>: {m.body}</span>
            )) : <span className="dd-q">No messages.</span>}
          </div>
        </div>
        <div className="dd-panel">
          <span className="dd-title" style={{ fontSize: 20 }}>Your decision</span>
          <label className="stack" style={{ gap: 8 }}>
            <span className="w5 t15">Outcome</span>
            <button className="cp-select" onClick={() => setPick("outcome")}><span className={outcome ? "" : "ph"}>{OUTCOMES.find((o) => o.id === outcome)?.label ?? "Choose an outcome"}</span>{Icon.down("var(--ink)")}</button>
          </label>
          {outcome === "part" && (
            <label className="stack" style={{ gap: 8 }}>
              <span className="w5 t15">{cName} pays {wName}</span>
              <input className="cp-select" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Less than ${money2(full)}`} />
            </label>
          )}
          <label className="stack" style={{ gap: 8 }}>
            <span className="w5 t15">Note to both</span>
            <textarea className="cp-text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </label>
          <label className="stack" style={{ gap: 8 }}>
            <span className="w5 t15">Pause an account</span>
            <button className="cp-select" onClick={() => setPick("pause")}><span>{pause === "none" ? "No one" : pause === job.customer_id ? `${cust?.full_name} (customer)` : `${work?.full_name} (worker)`}</span>{Icon.down("var(--ink)")}</button>
          </label>
          {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
          <button className="btn primary block" style={{ marginTop: "auto" }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save decision"}</button>
        </div>
      </div>
      {pick === "outcome" && <SearchPicker title="Outcome" value={[outcome]} options={OUTCOMES} onClose={() => setPick(null)} onChange={(v) => setOutcome(String(v[0]))} />}
      {pick === "pause" && <SearchPicker title="Pause an account" value={[pause]}
        options={[{ id: "none", label: "No one" }, { id: job.customer_id, label: `${cust?.full_name ?? "Customer"}`, hint: "Customer" }, ...(job.worker_id ? [{ id: job.worker_id, label: `${work?.full_name ?? "Worker"}`, hint: "Worker" }] : [])]}
        onClose={() => setPick(null)} onChange={(v) => setPause(String(v[0]))} />}
    </div>
  );
}

// ---------- ID checks: compare the ID, the selfie and the profile photo, then decide ----------
const RETAKE_REASONS = ["The ID photo is blurry", "Glare covers the ID", "Part of the ID is cut off", "The selfie is blurry", "The ID isn't visible in the selfie", "The face doesn't match the profile photo"];
const REJECT_REASONS = ["The ID has expired", "The name doesn't match the account", "The face doesn't match the ID", "This document isn't accepted", "Looks altered or fake"];

interface IdCheck { id: string; user_id: string; doc_type: string; country: string; doc_path: string | null; selfie_path: string | null; created_at: string;
  profiles: { full_name: string; photo_path: string | null; is_worker: boolean } }

function IdChecks({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<IdCheck[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [urls, setUrls] = useState<{ doc?: string; selfie?: string }>({});
  const [pick, setPick] = useState<null | "retake" | "reject">(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    sb.from("id_checks").select("id,user_id,doc_type,country,doc_path,selfie_path,created_at,profiles(full_name,photo_path,is_worker)")
      .eq("status", "pending").order("created_at").then(({ data }) => {
        const list = (data ?? []) as unknown as IdCheck[];
        setRows(list);
        setSel((cur) => (cur && list.some((r) => r.id === cur) ? cur : list[0]?.id ?? null));
      });
  }, []);
  useEffect(() => { load(); }, [load]);
  const cur = rows.find((r) => r.id === sel) ?? null;
  useEffect(() => {
    setUrls({});
    if (!cur) return;
    const paths = [cur.doc_path, cur.selfie_path].filter(Boolean) as string[];
    sb.storage.from("ids").createSignedUrls(paths, 900).then(({ data }) => {
      const m: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      setUrls({ doc: cur.doc_path ? m[cur.doc_path] : undefined, selfie: cur.selfie_path ? m[cur.selfie_path] : undefined });
    });
  }, [cur]);

  async function decide(decision: "approve" | "retake" | "reject", reason = "") {
    if (!cur) return;
    setBusy(true);
    try {
      await api("admin_id_decide", { check_id: cur.id, decision, reason });
      toast(decision === "approve" ? `${cur.profiles.full_name} is verified` : "Sent. They'll see what to fix.");
      load(); onChanged();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hrs ago`; };

  if (!rows.length) return <AdmEmpty text="New ID checks show up here, oldest first." />;
  return (
    <div className="row" style={{ alignItems: "stretch", gap: 20, flexWrap: "wrap" }}>
      <div style={{ width: 330, flexShrink: 0, background: "var(--card)", borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>
        <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Waiting</span><span className="t15 muted">Oldest first</span>
        </div>
        {rows.map((r) => (
          <button key={r.id} className="li" style={r.id === sel ? { background: "var(--emerald-tint)" } : undefined} onClick={() => setSel(r.id)}>
            {r.profiles.photo_path ? <img src={avatarUrl(r.profiles.photo_path)!} alt="" style={{ width: 44, height: 44, borderRadius: 4, objectFit: "cover" }} /> : <span className="tile" style={{ width: 44, height: 44 }} />}
            <span className="t"><b style={{ fontSize: 16 }}>{r.profiles.full_name}</b><span>{r.profiles.is_worker ? "Worker" : "Customer"}, {r.doc_type}, {ago(r.created_at)}</span></span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="stack" style={{ flex: "999 1 560px", minWidth: 0, background: "var(--card)", borderRadius: 6, padding: "20px 22px", gap: 16 }}>
          <div className="row between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>{cur.profiles.full_name}</span>
              <span className="t15 light muted">{cur.profiles.is_worker ? "Worker" : "Customer"}, {cur.country} {cur.doc_type.toLowerCase()}, sent {ago(cur.created_at)}</span>
            </span>
            <span className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
              <span className="small muted">Profile photo</span>
              {cur.profiles.photo_path ? <img src={avatarUrl(cur.profiles.photo_path)!} alt="" style={{ width: 64, height: 64, borderRadius: 4, objectFit: "cover" }} /> : <span className="small muted">None yet</span>}
            </span>
          </div>
          <div className="grid2" style={{ gap: 12 }}>
            {(["doc", "selfie"] as const).map((k) => (
              <div key={k} className="stack" style={{ gap: 8 }}>
                <span className="t15 w5">{k === "doc" ? cur.doc_type : "Selfie holding the ID"}</span>
                {urls[k] ? <a href={urls[k]} target="_blank" rel="noreferrer"><img src={urls[k]} alt="" style={{ width: "100%", height: 360, objectFit: "contain", background: "#1d211f", borderRadius: 4, display: "block" }} /></a>
                  : <span style={{ height: 360, background: "var(--stone)", borderRadius: 4, display: "block" }} />}
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="t15 light muted" style={{ flex: 1, minWidth: 240 }}>Check: same face in all three photos, the name matches the account, the ID isn't expired. Photos are deleted when you decide.</span>
            <button className="btn stone" disabled={busy} onClick={() => setPick("retake")}>Ask to retake</button>
            <button className="btn danger" disabled={busy} onClick={() => setPick("reject")}>Reject</button>
            <button className="btn primary" disabled={busy} onClick={() => decide("approve")}>Approve</button>
          </div>
        </div>
      )}
      {pick && <SearchPicker title={pick === "retake" ? "What should they retake?" : "Why is it rejected?"} value={[]}
        options={(pick === "retake" ? RETAKE_REASONS : REJECT_REASONS).map((r) => ({ id: r, label: r }))}
        onChange={(v) => decide(pick, String(v[0]))} onClose={() => setPick(null)} />}
    </div>
  );
}

// ---------- Licences and certificates sent by workers ----------
interface CredCheck { id: string; worker_id: string; number: string; expiry: string | null; photo_path: string; created_at: string;
  credential_types: { name: string; short: string }; profiles: { full_name: string; photo_path: string | null; id_status: string } }
const CRED_RETAKE = ["Photo is blurry", "Card is cut off", "Number doesn't match the card", "Expiry date doesn't match"];
const CRED_REJECT = ["Name doesn't match their ID", "Expired", "Not on the register", "Wrong document"];

function LicenceChecks({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<CredCheck[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [pick, setPick] = useState<null | "retake" | "rejected">(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    sb.from("worker_credentials").select("id,worker_id,number,expiry,photo_path,created_at,credential_types(name,short),profiles!worker_credentials_profile_fkey(full_name,photo_path,id_status)")
      .eq("status", "pending").order("created_at").then(({ data }) => {
        const list = (data ?? []) as unknown as CredCheck[];
        setRows(list);
        setSel((cur) => (cur && list.some((r) => r.id === cur) ? cur : list[0]?.id ?? null));
      });
  }, []);
  useEffect(() => { load(); }, [load]);
  const cur = rows.find((r) => r.id === sel) ?? null;
  useEffect(() => {
    setUrl(null);
    if (cur) sb.storage.from("insurance").createSignedUrl(cur.photo_path, 900).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [cur]);
  async function decide(decision: "verified" | "retake" | "rejected", reason = "") {
    if (!cur) return;
    setBusy(true);
    try {
      await rpc("admin_credential_decide", { p_id: cur.id, p_decision: decision, p_reason: reason });
      toast(decision === "verified" ? `${cur.credential_types.short} verified for ${cur.profiles.full_name}` : "Sent. They'll see what to fix.");
      load(); onChanged();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} hrs ago` : `${Math.round(m / 1440)} days ago`; };
  const isPdf = cur?.photo_path.toLowerCase().endsWith(".pdf");

  if (!rows.length) return <AdmEmpty text="Licences and certificates from workers show up here, oldest first." />;
  return (
    <div className="row" style={{ alignItems: "stretch", gap: 20, flexWrap: "wrap" }}>
      <div style={{ width: 330, flexShrink: 0, background: "var(--card)", borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>
        <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Waiting</span><span className="t15 muted">Oldest first</span>
        </div>
        {rows.map((r) => (
          <button key={r.id} className="li" style={r.id === sel ? { background: "var(--emerald-tint)" } : undefined} onClick={() => setSel(r.id)}>
            {r.profiles.photo_path ? <img src={avatarUrl(r.profiles.photo_path)!} alt="" style={{ width: 44, height: 44, borderRadius: 4, objectFit: "cover" }} /> : <span className="tile" style={{ width: 44, height: 44 }} />}
            <span className="t"><b style={{ fontSize: 16 }}>{r.profiles.full_name}</b><span>{r.credential_types.name}, {ago(r.created_at)}</span></span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="stack" style={{ flex: "999 1 560px", minWidth: 0, background: "var(--card)", borderRadius: 6, padding: "20px 22px", gap: 16 }}>
          <span className="stack" style={{ gap: 2 }}>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>{cur.profiles.full_name}</span>
            <span className="t15 light muted">{cur.credential_types.name}, sent {ago(cur.created_at)}</span>
          </span>
          <div className="row" style={{ gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            {url ? (isPdf ? <a className="btn stone" href={url} target="_blank" rel="noreferrer">Open the PDF</a>
              : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" style={{ width: 460, maxWidth: "100%", height: 300, objectFit: "contain", background: "#1d211f", borderRadius: 4, display: "block" }} /></a>)
              : <span style={{ width: 460, maxWidth: "100%", height: 300, background: "var(--stone)", borderRadius: 4, display: "block" }} />}
            <div className="stack" style={{ gap: 14 }}>
              <span className="stack" style={{ gap: 2 }}><span className="small muted">Number</span><span className="t17">{cur.number || "Not given"}</span></span>
              <span className="stack" style={{ gap: 2 }}><span className="small muted">Expires</span><span className="t17">{cur.expiry ? new Date(cur.expiry + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "No expiry given"}</span></span>
              <span className="stack" style={{ gap: 2 }}><span className="small muted">Name on account</span><span className="t17">{cur.profiles.full_name}{cur.profiles.id_status === "verified" ? ", ID verified" : ", ID not verified yet"}</span></span>
              <a className="link" style={{ padding: 0 }} target="_blank" rel="noreferrer"
                href={`https://www.google.com/search?q=${encodeURIComponent(`${cur.credential_types.name} register check Australia`)}`}>Find the register to check it</a>
            </div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="t15 light muted" style={{ flex: 1, minWidth: 240 }}>Check: the name matches their ID, the number is on the register, it isn't expired. The photo is kept while it's valid.</span>
            <button className="btn stone" disabled={busy} onClick={() => setPick("retake")}>Ask to retake</button>
            <button className="btn danger" disabled={busy} onClick={() => setPick("rejected")}>Reject</button>
            <button className="btn primary" disabled={busy} onClick={() => decide("verified")}>Approve</button>
          </div>
        </div>
      )}
      {pick && <SearchPicker title={pick === "retake" ? "What should they retake?" : "Why is it rejected?"} value={[]}
        options={(pick === "retake" ? CRED_RETAKE : CRED_REJECT).map((r) => ({ id: r, label: r }))}
        onChange={(v) => decide(pick, String(v[0]))} onClose={() => setPick(null)} />}
    </div>
  );
}

// ---------- Skills and gear for each category, and which licence a skill needs ----------
interface SkillRow { id: number; category_id: number; kind: "skill" | "gear"; name: string; credential_type_id: number | null; sort: number; active: boolean }
function Skills() {
  const toast = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState<number | null>(null);
  const [rows, setRows] = useState<SkillRow[]>([]);
  const [creds, setCreds] = useState<{ id: number; name: string }[]>([]);
  const [dirty, setDirty] = useState<Record<number, Partial<SkillRow>>>({});
  useEffect(() => {
    sb.from("categories").select("*").order("sort").then(({ data }) => { const c = (data ?? []) as Category[]; setCats(c); setCat((x) => x ?? c[0]?.id ?? null); });
    sb.from("credential_types").select("id,name").order("sort").then(({ data }) => setCreds((data ?? []) as { id: number; name: string }[]));
  }, []);
  const load = useCallback(() => {
    if (cat == null) return;
    sb.from("skills").select("*").eq("category_id", cat).order("kind").order("sort").then(({ data }) => { setRows((data ?? []) as SkillRow[]); setDirty({}); });
  }, [cat]);
  useEffect(() => { load(); }, [load]);
  const set = (id: number, p: Partial<SkillRow>) => setDirty((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const val = <K extends keyof SkillRow>(r: SkillRow, k: K): SkillRow[K] => (dirty[r.id]?.[k] ?? r[k]) as SkillRow[K];
  async function save() {
    for (const [id, p] of Object.entries(dirty)) {
      const { error } = await sb.from("skills").update(p).eq("id", Number(id));
      if (error) return toast(error.message);
    }
    toast("Saved"); load();
  }
  async function add(kind: "skill" | "gear") {
    if (cat == null) return;
    const n = rows.filter((r) => r.kind === kind).length + 1;
    const { error } = await sb.from("skills").insert({ category_id: cat, kind, name: kind === "skill" ? `New skill ${n}` : `New gear ${n}`, sort: n });
    if (error) toast(error.message); else load();
  }
  return (
    <>
      <div className="row" style={{ gap: 12, marginBottom: 14, alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Skills for</h2>
        <select value={cat ?? ""} onChange={(e) => setCat(Number(e.target.value))} style={{ fontSize: 17, height: 44, padding: "0 12px", border: 0, borderRadius: 4, background: "var(--card)", minWidth: 220 }}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Needs</th><th>Order</th><th>Live</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><input value={val(r, "name")} onChange={(e) => set(r.id, { name: e.target.value })} style={{ minWidth: 240 }} /></td>
                <td><select value={val(r, "kind")} onChange={(e) => set(r.id, { kind: e.target.value as "skill" | "gear" })}><option value="skill">Skill</option><option value="gear">Gear</option></select></td>
                <td>{val(r, "kind") === "skill" ? (
                  <select value={String(val(r, "credential_type_id") ?? "")} onChange={(e) => set(r.id, { credential_type_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Nothing</option>{creds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>) : <span className="small muted">Nothing</span>}</td>
                <td><input inputMode="numeric" value={String(val(r, "sort"))} onChange={(e) => set(r.id, { sort: Number(e.target.value || 0) })} style={{ width: 70 }} /></td>
                <td><select value={val(r, "active") ? "1" : "0"} onChange={(e) => set(r.id, { active: e.target.value === "1" })}><option value="1">Live</option><option value="0">Hidden</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row between" style={{ marginTop: 16 }}>
        <span className="row" style={{ gap: 10 }}>
          <button className="btn stone small" onClick={() => add("skill")}>Add a skill</button>
          <button className="btn stone small" onClick={() => add("gear")}>Add gear</button>
        </span>
        <button className="btn primary" disabled={!Object.keys(dirty).length} onClick={save}>Save</button>
      </div>
      <p className="small muted">A skill that needs a licence only shows on workers who have that licence verified. Jobs asking for it only go to those workers.</p>
    </>
  );
}

// ---------- Reports from users (Apple guideline 1.2: act within 24 hours) ----------
interface Report { id: string; created_at: string; reason: string; details: string; status: string; target_user: string | null; job_id: string | null;
  reporter: { full_name: string } | null; target: { full_name: string; suspended: boolean } | null; jobs: { status: string; job_types: { name: string } } | null }

function Reports({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Report[]>([]);
  const load = useCallback(() => {
    sb.from("reports").select("*, reporter:profiles!reports_reporter_id_fkey(full_name), target:profiles!reports_target_user_fkey(full_name,suspended), jobs(status, job_types(name))")
      .order("created_at", { ascending: false }).limit(200).then(({ data }) => setRows((data ?? []) as unknown as Report[]));
  }, []);
  useEffect(() => { load(); }, [load]);
  async function close(r: Report, status: "actioned" | "dismissed") {
    const { error } = await sb.from("reports").update({ status, handled_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast(error.message);
    toast("Saved"); load(); onChanged();
  }
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Reason</th><th>About</th><th>From</th><th>Job</th><th>Details</th><th>Action</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
              <td><span className={`badge ${r.status === "open" ? "r" : ""}`}>{r.reason}</span></td>
              <td>{r.target?.full_name ?? "—"}{r.target?.suspended && <span className="badge r" style={{ marginLeft: 6 }}>Paused</span>}</td>
              <td>{r.reporter?.full_name ?? "Deleted account"}</td>
              <td>{r.jobs ? `${r.jobs.job_types.name}, ${r.jobs.status}` : "—"}</td>
              <td style={{ maxWidth: 300 }}>{r.details || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {r.status !== "open" ? <span className="badge g">{r.status === "actioned" ? "Actioned" : "Dismissed"}</span> : (
                  <span className="row" style={{ gap: 6 }}>
                    {r.target_user && !r.target?.suspended && <button className="btn danger small" onClick={async () => {
                      try { await rpc("admin_set_suspended", { p_user: r.target_user, p_suspended: true }); await close(r, "actioned"); } catch (e) { toast((e as Error).message); }
                    }}>Pause account</button>}
                    {r.job_id && r.jobs && ["searching", "accepted"].includes(r.jobs.status) && <button className="btn stone small" onClick={async () => {
                      try { await rpc("admin_cancel_job", { p_job: r.job_id }); await close(r, "actioned"); } catch (e) { toast((e as Error).message); }
                    }}>Remove job</button>}
                    <button className="btn stone small" onClick={() => close(r, "dismissed")}>Dismiss</button>
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No reports.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ---------- People: every account, customers and workers ----------
interface Person { id: string; email: string; full_name: string; photo_path: string | null; is_worker: boolean; id_status: string; suspended: boolean;
  created_at: string; abn: string | null; approved: boolean; jobs_posted: number; jobs_worked: number }
const ID_BADGE: Record<string, [string, string]> = { none: ["", "Not verified"], pending: ["y", "Checking"], verified: ["g", "Verified"], retake: ["y", "Retake asked"], rejected: ["r", "Rejected"] };

function People() {
  const toast = useToast();
  const [rows, setRows] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [review, setReview] = useState<Set<string>>(new Set());
  const [admins, setAdmins] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc<Person[]>("admin_people").then(setRows).catch((e) => toast((e as Error).message));
    sb.from("admin_roles").select("email").then(({ data }) => setAdmins(new Set((data ?? []).map((r) => (r.email as string).toLowerCase()))));
    sb.from("workers").select("id").eq("needs_review", true).then(({ data }) => setReview(new Set((data ?? []).map((r) => r.id as string))));
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const person = rows.find((r) => r.id === open);
  if (person) return <UserDetail p={person} isAdmin={admins.has(person.email.toLowerCase())} review={review.has(person.id)} onBack={() => setOpen(null)} onChanged={load} />;
  const shown = rows.filter((r) => `${r.full_name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <label className="search" style={{ margin: "0 0 16px", maxWidth: 420, background: "var(--card)" }}>
        {Icon.search("var(--muted)")}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
      </label>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>User</th><th>Role</th><th>ID</th><th>Jobs</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="click" onClick={() => setOpen(p.id)}>
                <td><span className="row" style={{ gap: 12 }}>
                  {p.photo_path ? <img className="u-pic" src={avatarUrl(p.photo_path)!} alt="" /> : <span className="u-pic none">{(p.full_name || p.email).slice(0, 1).toUpperCase()}</span>}
                  <span className="stack" style={{ gap: 1 }}><span className="w5">{p.full_name || "No name yet"}</span><span className="small muted light">{p.email}</span></span>
                </span></td>
                <td>{roleBadges(p, admins.has(p.email.toLowerCase()), review.has(p.id))}</td>
                <td><span className={`badge ${ID_BADGE[p.id_status]?.[0] ?? ""}`}>{ID_BADGE[p.id_status]?.[1] ?? p.id_status}</span></td>
                <td className="light">{p.jobs_posted} posted, {p.jobs_worked} worked</td>
                <td className="light">{new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td style={{ width: 32 }}>{Icon.chevron("var(--faint)")}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="muted">No one yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function roleBadges(p: Person, admin: boolean, review: boolean) {
  return <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
    {admin && <span className="badge g">Admin</span>}
    {p.is_worker ? (p.approved ? <span className="badge g">Worker</span> : <span className="badge">Worker, setting up</span>) : <span className="badge">Customer</span>}
    {p.suspended && <span className="badge r">Paused</span>}
    {review && <span className="badge r">Low ratings</span>}
  </span>;
}

interface UJob { id: string; title: string | null; status: string; price_cents: number; created_at: string; customer_id: string; worker_id: string | null; job_types: { name: string } | null }
// One user: everything about them on one page, with the actions at the top.
function UserDetail({ p, isAdmin, review, onBack, onChanged }: { p: Person; isAdmin: boolean; review: boolean; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { session } = useSession();
  const [w, setW] = useState<Record<string, unknown> | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [creds, setCreds] = useState<{ name: string; status: string; expiry: string | null }[]>([]);
  const [jobs, setJobs] = useState<UJob[]>([]);
  const [prof, setProf] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    sb.from("profiles").select("first_name,middle_names,last_name,phone,id_note,card_brand,card_last4").eq("id", p.id).single().then(({ data }) => setProf(data));
    sb.from("jobs").select("id,title,status,price_cents,created_at,customer_id,worker_id,job_types(name)").or(`customer_id.eq.${p.id},worker_id.eq.${p.id}`).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setJobs((data ?? []) as unknown as UJob[]));
    if (!p.is_worker) return;
    sb.from("workers").select("payid,bsb,account_number,abn,radius_km,online,suburbs:base_suburb_id(name)").eq("id", p.id).single().then(({ data }) => setW(data));
    sb.from("worker_job_types").select("job_types(name)").eq("worker_id", p.id).then(({ data }) => setCats((data ?? []).map((r) => (r.job_types as unknown as { name: string } | null)?.name ?? "").filter(Boolean)));
    sb.from("worker_credentials").select("status,expiry,credential_types(name)").eq("worker_id", p.id).order("created_at", { ascending: false })
      .then(({ data }) => setCreds((data ?? []).map((r) => ({ name: (r.credential_types as unknown as { name: string } | null)?.name ?? "Licence", status: r.status as string, expiry: r.expiry as string | null }))));
  }, [p.id, p.is_worker]);
  const act = async (f: () => Promise<unknown>, msg: string) => { try { await f(); toast(msg); onChanged(); } catch (e) { toast((e as Error).message); } };
  const dmy = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const bsb = w?.bsb as string | null, acct = w?.account_number as string | null;
  const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="u-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
  return (
    <div className="u-page">
      <button className="u-back" onClick={onBack}>{Icon.back("var(--emerald)")} All users</button>
      <div className="u-head">
        {p.photo_path ? <img className="u-big" src={avatarUrl(p.photo_path)!} alt="" /> : <span className="u-big none">{(p.full_name || p.email).slice(0, 1).toUpperCase()}</span>}
        <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <h2>{p.full_name || "No name yet"}</h2>
          <span className="light muted">{p.email}, joined {dmy(p.created_at)}</span>
          {roleBadges(p, isAdmin, review)}
        </div>
        <div className="row" style={{ gap: 8, alignSelf: "flex-start", flexWrap: "wrap" }}>
          {review && <button className="btn stone" onClick={() => act(() => rpc("admin_clear_review", { p_worker: p.id }), "Cleared. They can go online again.")}>Clear low ratings</button>}
          {p.id !== session?.user.id && <button className="btn stone" onClick={() => act(() => rpc("admin_set_role", { p_email: p.email, p_admin: !isAdmin }), isAdmin ? "Admin role removed" : "Now an admin")}>{isAdmin ? "Remove admin" : "Make admin"}</button>}
          <button className={p.suspended ? "btn primary" : "btn stone"} onClick={() => act(() => rpc("admin_set_suspended", { p_user: p.id, p_suspended: !p.suspended }), p.suspended ? "Unpaused" : "Paused")}>{p.suspended ? "Unpause" : "Pause account"}</button>
        </div>
      </div>
      <div className="u-grid">
        <section className="u-card">
          <h3>Account</h3>
          <Row k="Name" v={[prof?.first_name, prof?.middle_names, prof?.last_name].filter(Boolean).join(" ") || "—"} />
          <Row k="Email" v={p.email} />
          <Row k="Mobile" v={(prof?.phone as string) || "—"} />
          <Row k="ID check" v={<span className={`badge ${ID_BADGE[p.id_status]?.[0] ?? ""}`}>{ID_BADGE[p.id_status]?.[1] ?? p.id_status}</span>} />
          {!!prof?.id_note && <Row k="ID note" v={prof.id_note as string} />}
          <Row k="Saved card" v={prof?.card_last4 ? `${String(prof.card_brand).toUpperCase()} ending ${prof.card_last4}` : "None"} />
        </section>
        {p.is_worker && (
          <section className="u-card">
            <h3>Work</h3>
            <Row k="Status" v={p.approved ? (w?.online ? "Ready, online now" : "Ready, offline") : "Setting up"} />
            <Row k="Area" v={w ? `${(w.suburbs as { name: string } | null)?.name ?? "Not set"}${w.radius_km ? `, up to ${w.radius_km} km` : ""}` : "—"} />
            <Row k="My skills" v={cats.length ? cats.join(", ") : "None yet"} />
            <Row k="Getting paid" v={w?.payid ? `PayID ${w.payid}` : bsb && acct ? `BSB ${bsb.slice(0, 3)}-${bsb.slice(3)}, Acc ${acct}` : "Not added"} />
            <Row k="ABN" v={(w?.abn as string) || "None"} />
            <Row k="Licences" v={creds.length ? creds.map((c) => `${c.name} (${c.status}${c.expiry ? `, to ${dmy(c.expiry)}` : ""})`).join(", ") : "None"} />
          </section>
        )}
        <section className="u-card wide">
          <h3>Jobs</h3>
          {jobs.length ? jobs.map((j) => (
            <div key={j.id} className="u-row">
              <span className="k">{dmy(j.created_at)}</span>
              <span className="v row between" style={{ gap: 12 }}>
                <span>{j.title || j.job_types?.name || "Job"} <span className="muted light">{j.customer_id === p.id ? "posted" : "worked"}</span></span>
                <span className="row" style={{ gap: 12 }}><span className="badge">{j.status}</span><span className="w5">{money2(j.price_cents)}</span></span>
              </span>
            </div>
          )) : <p className="light muted" style={{ margin: 0 }}>No jobs yet.</p>}
        </section>
      </div>
    </div>
  );
}

// ---------- Areas: open More Mahi city by city ----------
const STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];
type AreaRow = Area & { suburbs: { count: number }[] };

// Find a place on Apple Maps. Used to set an area's centre and each suburb's position, which job distances are worked out from.
async function locate(q: string): Promise<{ lat: number; lng: number } | null> {
  const mk = await loadMapKit();
  if (!mk) return null;
  return new Promise((res) => new mk.Geocoder({ language: "en-AU" }).lookup(q, (err: unknown, data: { results?: { coordinate: { latitude: number; longitude: number } }[] }) => {
    const c = !err && data?.results?.[0]?.coordinate;
    res(c ? { lat: c.latitude, lng: c.longitude } : null);
  }));
}

function Areas() {
  const toast = useToast();
  const [rows, setRows] = useState<AreaRow[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState("QLD");
  const [pickState, setPickState] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    sb.from("areas").select("*, suburbs(count)").order("sort").order("name").then(({ data }) => setRows((data ?? []) as AreaRow[]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const area = rows.find((r) => r.id === open);
  if (area) return <AreaDetail area={area} onBack={() => setOpen(null)} onChanged={load} />;

  async function add() {
    if (!name.trim()) return toast("Type the area's name");
    setBusy(true);
    const at = await locate(`${name.trim()}, ${state}, Australia`);
    if (!at) { setBusy(false); return toast("Couldn't find that place on the map. Check the spelling."); }
    const { error } = await sb.from("areas").insert({ name: name.trim(), state, lat: at.lat, lng: at.lng, active: false, sort: 100 });
    setBusy(false);
    if (error) return toast(error.message);
    setName(""); setAdding(false); toast("Area added. Add its suburbs, then open it."); load();
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="light muted" style={{ margin: 0, maxWidth: 640 }}>Each area has its own suburbs. Customers and workers only see the areas that are open.</p>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>Area</th><th>State</th><th>Suburbs</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                <td className="w5">{r.name}</td>
                <td className="light">{r.state}</td>
                <td className="light">{r.suburbs?.[0]?.count ?? 0}</td>
                <td>{r.active ? <span className="badge g">Open</span> : <span className="badge">Not open yet</span>}</td>
                <td style={{ width: 32 }}>{Icon.chevron("var(--faint)")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding ? (
        <div className="u-card stack" style={{ gap: 12, maxWidth: 560 }}>
          <h3 style={{ margin: 0 }}>New area</h3>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}><span className="k">Area name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Townsville" /></label>
            <button className="field sel" style={{ width: 140 }} onClick={() => setPickState(true)}><span className="k">State</span><span className="v w4">{state}</span></button>
          </div>
          <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
            <button className="btn stone" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={add}>{busy ? "Finding it…" : "Add area"}</button>
          </div>
        </div>
      ) : <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>{Icon.plus("#fff")} Add an area</button>}
      {pickState && <SearchPicker title="State" placeholder="Search" value={[state]} options={STATES.map((s) => ({ id: s, label: s }))}
        onClose={() => setPickState(false)} onChange={(v) => setState(String(v[0]))} />}
    </div>
  );
}

function AreaDetail({ area, onBack, onChanged }: { area: AreaRow; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [subs, setSubs] = useState<{ id: number; name: string }[]>([]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { sb.from("suburbs").select("id,name").eq("area_id", area.id).order("name").then(({ data }) => setSubs(data ?? [])); }, [area.id]);
  useEffect(() => { load(); }, [load]);

  async function addSuburbs() {
    const names = [...new Set(paste.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))].filter((n) => !subs.some((s) => s.name.toLowerCase() === n.toLowerCase()));
    if (!names.length) return toast("Paste suburb names, one per line");
    const missed: string[] = [];
    let added = 0;
    for (const [i, n] of names.entries()) {
      setBusy(`Finding ${i + 1} of ${names.length}…`);
      const at = await locate(`${n}, ${area.state}, Australia`);
      if (!at) { missed.push(n); continue; }
      const { error } = await sb.from("suburbs").insert({ name: n, area_id: area.id, lat: at.lat, lng: at.lng });
      if (error) missed.push(n); else added++;
    }
    setBusy(""); setPaste(missed.join("\n")); load(); onChanged();
    toast(missed.length ? `Added ${added}. Couldn't find ${missed.length}, left in the box to check.` : `Added ${added} suburbs`);
  }
  async function setOpenState(active: boolean) {
    if (active && !subs.length) return toast("Add suburbs before opening this area");
    const { error } = await sb.from("areas").update({ active }).eq("id", area.id);
    if (error) return toast(error.message);
    toast(active ? `${area.name} is open` : `${area.name} is closed to new jobs`); onChanged();
  }
  async function remove(id: number, n: string) {
    const { error } = await sb.from("suburbs").delete().eq("id", id);
    if (error) return toast(`${n} has jobs or workers, so it stays`);
    load(); onChanged();
  }

  return (
    <div className="u-page">
      <button className="u-back" onClick={onBack}>{Icon.back("var(--emerald)")} All areas</button>
      <div className="u-head">
        <div className="stack" style={{ gap: 8, flex: 1 }}>
          <h2>{area.name}, {area.state}</h2>
          <span>{area.active ? <span className="badge g">Open</span> : <span className="badge">Not open yet</span>}</span>
        </div>
        <button className={area.active ? "btn stone" : "btn primary"} onClick={() => setOpenState(!area.active)}>{area.active ? "Close this area" : "Open this area"}</button>
      </div>
      <div className="u-grid">
        <section className="u-card">
          <h3>Suburbs ({subs.length})</h3>
          <div className="area-subs">
            {subs.map((s) => <span key={s.id} className="area-sub">{s.name}<button aria-label={`Remove ${s.name}`} onClick={() => remove(s.id, s.name)}>{Icon.x("var(--muted)")}</button></span>)}
            {!subs.length && <p className="light muted" style={{ margin: 0 }}>None yet.</p>}
          </div>
        </section>
        <section className="u-card stack" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>Add suburbs</h3>
          <p className="light muted" style={{ margin: 0, fontSize: 14 }}>Paste names, one per line. Each one is found on the map so job distances work.</p>
          <textarea className="area-paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Aitkenvale\nAnnandale\nBelgian Gardens"} />
          <button className="btn primary" style={{ alignSelf: "flex-end" }} disabled={!!busy} onClick={addSuburbs}>{busy || "Add suburbs"}</button>
        </section>
      </div>
    </div>
  );
}

// ---------- Categories and job types: prices, what's included, hero photos ----------
async function uploadBrand(file: File, prefix: string): Promise<string> {
  const blob = await shrinkImage(file, 1600);
  const path = `${prefix}-${Date.now()}.jpg`;
  const { error } = await sb.storage.from("brand").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

function PhotoCell({ path, onPick }: { path: string | null; onPick: (f: File) => void }) {
  const u = brandUrl(path);
  return (
    <label style={{ cursor: "pointer", display: "block", width: 72 }}>
      {u ? <img src={u} alt="" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 4, display: "block" }} />
        : <span className="small em w5" style={{ display: "flex", width: 72, height: 54, borderRadius: 4, background: "var(--ground)", alignItems: "center", justifyContent: "center" }}>Add</span>}
      <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </label>
  );
}

function Types() {
  const toast = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [rows, setRows] = useState<JobType[]>([]);
  const [dirty, setDirty] = useState<Record<number, Partial<JobType>>>({});
  const [catDirty, setCatDirty] = useState<Record<number, Partial<Category>>>({});
  const load = useCallback(() => {
    sb.from("job_types").select("*").order("sort").then(({ data }) => { setRows((data ?? []) as JobType[]); setDirty({}); });
    sb.from("categories").select("*").order("sort").then(({ data }) => { setCats((data ?? []) as Category[]); setCatDirty({}); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const set = (id: number, p: Partial<JobType>) => setDirty((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const setC = (id: number, p: Partial<Category>) => setCatDirty((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const val = <K extends keyof JobType>(t: JobType, k: K): JobType[K] => (dirty[t.id]?.[k] ?? t[k]) as JobType[K];
  const cval = <K extends keyof Category>(c: Category, k: K): Category[K] => (catDirty[c.id]?.[k] ?? c[k]) as Category[K];
  const lines = (a: string[]) => a.join("\n");
  const toList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  async function save() {
    for (const [id, p] of Object.entries(catDirty)) {
      const { error } = await sb.from("categories").update(p).eq("id", Number(id));
      if (error) return toast(error.message);
    }
    for (const [id, p] of Object.entries(dirty)) {
      const { error } = await sb.from("job_types").update(p).eq("id", Number(id));
      if (error) return toast(error.message);
    }
    toast("Saved"); load();
  }
  const anyDirty = Object.keys(dirty).length + Object.keys(catDirty).length > 0;
  return (
    <>
      <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 600 }}>Categories</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Photo</th><th>Icon</th><th>Name</th><th>Order</th><th>Live</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td><PhotoCell path={cval(c, "photo_path")} onPick={async (f) => { try { setC(c.id, { photo_path: await uploadBrand(f, `cat-${c.id}`) }); } catch (e) { toast((e as Error).message); } }} /></td>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="cat-sq"><span className="sq" style={{ width: 40 }}><CatIcon name={String(cval(c, "icon"))} size={22} /></span></span>
                    <select value={String(cval(c, "icon"))} onChange={(e) => setC(c.id, { icon: e.target.value })}>
                      {CAT_ICONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </span>
                </td>
                <td><input value={cval(c, "name")} onChange={(e) => setC(c.id, { name: e.target.value })} style={{ minWidth: 200 }} /></td>
                <td><input inputMode="numeric" value={String(cval(c, "sort"))} onChange={(e) => setC(c.id, { sort: Number(e.target.value || 0) })} style={{ width: 70 }} /></td>
                <td><select value={cval(c, "active") ? "1" : "0"} onChange={(e) => setC(c.id, { active: e.target.value === "1" })}><option value="1">Live</option><option value="0">Hidden</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ margin: "10px 0 28px" }}>
        <button className="btn stone small" onClick={async () => { const { error } = await sb.from("categories").insert({ name: "New category", sort: cats.length + 1, active: false }); if (error) toast(error.message); else load(); }}>Add a category</button>
      </div>

      <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 600 }}>Job types</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Photo</th><th>Job</th><th>Category</th><th>Price ($)</th><th>Up to (hrs)</th><th>Included (one per line)</th><th>Not included (one per line)</th><th>Needs</th><th>Live</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ verticalAlign: "top" }}>
                <td><PhotoCell path={val(t, "photo_path")} onPick={async (f) => { try { set(t.id, { photo_path: await uploadBrand(f, `type-${t.id}`) }); } catch (e) { toast((e as Error).message); } }} /></td>
                <td><input value={val(t, "name")} onChange={(e) => set(t.id, { name: e.target.value })} style={{ minWidth: 180 }} /></td>
                <td><select value={String(val(t, "category_id") ?? "")} onChange={(e) => set(t.id, { category_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                <td className="stack" style={{ gap: 6 }}>
                  <select value={val(t, "custom_price") ? "1" : "0"} onChange={(e) => set(t.id, { custom_price: e.target.value === "1" })}><option value="0">Fixed price</option><option value="1">Customer sets it</option></select>
                  <label className="small muted">{val(t, "custom_price") ? "Suggested" : "Price"} <input inputMode="decimal" value={(val(t, "price_cents") / 100).toString()} onChange={(e) => set(t.id, { price_cents: Math.round(Number(e.target.value || 0) * 100) })} style={{ width: 80 }} /></label>
                  {val(t, "custom_price") && <>
                    <label className="small muted">Lowest <input inputMode="decimal" value={(val(t, "min_price_cents") / 100).toString()} onChange={(e) => set(t.id, { min_price_cents: Math.round(Number(e.target.value || 0) * 100) })} style={{ width: 80 }} /></label>
                    <label className="small muted">Highest <input inputMode="decimal" value={(val(t, "max_price_cents") / 100).toString()} onChange={(e) => set(t.id, { max_price_cents: Math.round(Number(e.target.value || 0) * 100) })} style={{ width: 80 }} /></label>
                  </>}
                </td>
                <td><input inputMode="decimal" value={String(val(t, "max_hours"))} onChange={(e) => set(t.id, { max_hours: Number(e.target.value || 0) })} style={{ width: 70 }} /></td>
                <td><textarea value={lines(val(t, "included") ?? [])} onChange={(e) => set(t.id, { included: toList(e.target.value) })} rows={4}
                  style={{ minWidth: 240, border: 0, borderRadius: 4, background: "var(--ground)", padding: 8, font: "inherit", fontSize: 14 }} /></td>
                <td><textarea value={lines(val(t, "excluded") ?? [])} onChange={(e) => set(t.id, { excluded: toList(e.target.value) })} rows={4}
                  style={{ minWidth: 220, border: 0, borderRadius: 4, background: "var(--ground)", padding: 8, font: "inherit", fontSize: 14 }} /></td>
                <td className="stack" style={{ gap: 6 }}>
                  <select value={val(t, "needs_insurance") ? "1" : "0"} onChange={(e) => set(t.id, { needs_insurance: e.target.value === "1" })}><option value="0">No insurance</option><option value="1">Insurance</option></select>
                  <select value={val(t, "needs_vehicle") ? "1" : "0"} onChange={(e) => set(t.id, { needs_vehicle: e.target.value === "1" })}><option value="0">No vehicle</option><option value="1">Vehicle</option></select>
                </td>
                <td><select value={val(t, "active") ? "1" : "0"} onChange={(e) => set(t.id, { active: e.target.value === "1" })}><option value="1">Live</option><option value="0">Hidden</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row between" style={{ marginTop: 16 }}>
        <button className="btn stone small" onClick={async () => { const { error } = await sb.from("job_types").insert({ name: "New job", price_cents: 5000, max_hours: 2, sort: rows.length + 1, active: false }); if (error) toast(error.message); else load(); }}>Add a job type</button>
        <button className="btn primary" disabled={!anyDirty} onClick={save}>Save</button>
      </div>
      <p className="small muted">Photos show on the customer's home screen. Changes only apply to new bookings.</p>
    </>
  );
}

// Settings in groups, each with a plain explanation. Money is shown in dollars; nothing saves until Save.
type SetField = { k: string; label: string; hint?: string } & ({ t: "toggle"; on: string; off: string } | { t: "num"; unit: "%" | "$" | "hours" | "minutes" } | { t: "text"; ph: string });
const SETTING_GROUPS: { title: string; text: string; fields: SetField[] }[] = [
  { title: "Payments", text: "How customers pay during the pilot, and when the booking fee is charged.", fields: [
    { k: "pilot_mode", label: "Pilot mode", hint: "Customers pay workers directly by bank transfer or cash. Turn off to hold the full price on a card.", t: "toggle", on: "true", off: "false" },
    { k: "fee_mode", label: "Charge the booking fee", hint: "Charged to the customer's saved card when they choose a worker.", t: "toggle", on: "on_choose", off: "off" },
    { k: "stripe_publishable_key", label: "Stripe publishable key", hint: "Starts with pk_. Needed before any card payments.", t: "text", ph: "pk_live_…" },
  ] },
  { title: "Fees and prices", text: "What customers are charged, and what's shown to them during the pilot.", fields: [
    { k: "booking_fee_percent", label: "Booking fee", hint: "A share of the job price.", t: "num", unit: "%" },
    { k: "booking_fee_max_cents", label: "Booking fee cap", hint: "The most one booking fee can be.", t: "num", unit: "$" },
    { k: "fee_percent", label: "Fee when the card is held", hint: "Only used with pilot mode off.", t: "num", unit: "%" },
    { k: "boost_cents", label: "Urgent boost", t: "num", unit: "$" },
    { k: "plus_cents", label: "Plus, per month", t: "num", unit: "$" },
  ] },
  { title: "Jobs", text: "Timing rules for every job.", fields: [
    { k: "widen_after_minutes", label: "Show to workers further away after", t: "num", unit: "minutes" },
    { k: "auto_release_hours", label: "Close as done if the customer does nothing for", t: "num", unit: "hours" },
    { k: "callout_cents", label: "Late-cancel payment to the worker", t: "num", unit: "$" },
  ] },
  { title: "Customers", text: "Checks a customer needs before they can book.", fields: [
    { k: "customer_id_required", label: "ID check required to book", hint: "Off: customers are asked after their first booking.", t: "toggle", on: "true", off: "false" },
  ] },
];
const isCents = (k: string) => k.endsWith("_cents");

function Settings() {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [orig, setOrig] = useState<Record<string, string>>({});
  useEffect(() => {
    sb.from("settings").select("*").then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      setVals(m); setOrig(m);
    });
  }, []);
  const keys = SETTING_GROUPS.flatMap((g) => g.fields.map((f) => f.k));
  const changed = keys.filter((k) => vals[k] !== orig[k]);
  const shown = (k: string) => { const v = vals[k] ?? ""; return isCents(k) && v !== "" ? String(Number(v) / 100) : v; };
  const set = (k: string, v: string) => setVals({ ...vals, [k]: isCents(k) ? (v === "" ? "" : String(Math.round(Number(v) * 100))) : v });
  async function save() {
    if (vals.stripe_publishable_key && !vals.stripe_publishable_key.startsWith("pk_")) return toast("The publishable key starts with pk_");
    if (vals.pilot_mode === "false" && !vals.stripe_publishable_key) return toast("Add the Stripe publishable key before turning pilot mode off");
    if (vals.fee_mode === "on_choose" && !vals.stripe_publishable_key) return toast("Connect Stripe and add the publishable key before turning the booking fee on");
    for (const k of changed) {
      const { error } = await sb.from("settings").update({ value: vals[k] }).eq("key", k);
      if (error) return toast(error.message);
    }
    setOrig(vals); toast("Saved");
  }
  return (
    <div className="set-page">
      {SETTING_GROUPS.map((g) => (
        <section key={g.title} className="set-group">
          <div className="set-about"><h3>{g.title}</h3><p>{g.text}</p></div>
          <div className="set-card">
            {g.fields.map((f) => (
              <div key={f.k} className="set-row">
                <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                  <span className="set-label">{f.label}</span>
                  {f.hint && <span className="set-hint">{f.hint}</span>}
                </span>
                {f.t === "toggle" ? (
                  <button className={`toggle${vals[f.k] === f.on ? " on" : ""}`} role="switch" aria-checked={vals[f.k] === f.on} aria-label={f.label}
                    onClick={() => setVals({ ...vals, [f.k]: vals[f.k] === f.on ? f.off : f.on })} />
                ) : f.t === "num" ? (
                  <label className="set-num">
                    {f.unit === "$" && <span>$</span>}
                    <input inputMode="decimal" value={shown(f.k)} onChange={(e) => set(f.k, e.target.value.replace(/[^\d.]/g, ""))} />
                    {f.unit !== "$" && <span>{f.unit}</span>}
                  </label>
                ) : (
                  <input className="set-text" value={vals[f.k] ?? ""} placeholder={f.ph} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value.trim() })} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {changed.length > 0 && (
        <div className="set-bar">
          <span>{changed.length === 1 ? "1 unsaved change" : `${changed.length} unsaved changes`}</span>
          <span className="row" style={{ gap: 10 }}>
            <button className="btn stone" onClick={() => setVals(orig)}>Discard</button>
            <button className="btn primary" onClick={save}>Save</button>
          </span>
        </div>
      )}
    </div>
  );
}
