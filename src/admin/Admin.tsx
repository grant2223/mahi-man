import { type ReactNode, useCallback, useEffect, useState } from "react";
import { api, avatarUrl, brandUrl, rpc, sb, type Area, type Category, type JobType } from "../lib/supabase";
import { loadMapKit } from "../ui/LiveMap";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money2, shrinkImage, validAbn } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { CatIcon, Icon, Loading, Logo, SearchPicker, useToast } from "../ui/kit";

const CAT_ICONS: [string, string][] = [["cleaning", "Spray bottle"], ["garden", "Seedling"], ["moving", "Truck"], ["rubbish", "Bin"], ["maintenance", "Aircon"], ["events", "Glass"], ["kids", "Blocks"], ["tech", "Laptop"], ["assembly", "Wrench"], ["handyman", "Hammer"], ["pets", "Paw"], ["errands", "Bag"], ["car", "Car"], ["pool", "Pool"], ["other", "Sparkle"]];

type Tab = "overview" | "jobs" | "ids" | "licences" | "reports" | "problems" | "people" | "launch" | "areas" | "types" | "skills" | "settings" | "cancels" | "strikes" | "reviews" | "tradies" | "partners" | "money";

const STATUS_BADGE: Record<string, string> = {
  awaiting_payment: "", searching: "y", accepted: "y", in_progress: "y", finished: "y", confirmed: "g", disputed: "r", cancelled: "", refunded: "r",
};

export function Admin() {
  const { session, profile, ready } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [counts, setCounts] = useState({ ids: 0, reports: 0, problems: 0, licences: 0, fees: 0, strikes: 0, invoices: 0, partners: 0, money: 0 });
  const recount = useCallback(async () => {
    const [a, b, c, d, e, f, g, h, m1, m2] = await Promise.all([
      sb.from("id_checks").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb.from("incidents").select("id", { count: "exact", head: true }).eq("resolved", false),
      sb.from("worker_credentials").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("fees_owed").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb.from("workers").select("id", { count: "exact", head: true }).eq("needs_review", true),
      sb.from("trade_orders").select("id", { count: "exact", head: true }).eq("status", "requested"),
      sb.from("partners").select("id", { count: "exact", head: true }).eq("status", "applied"),
      sb.from("customer_invoices").select("id", { count: "exact", head: true }).eq("status", "claimed"),
      sb.from("topups").select("id", { count: "exact", head: true }).eq("status", "claimed"),
    ]);
    setCounts({ ids: a.count ?? 0, reports: b.count ?? 0, problems: c.count ?? 0, licences: d.count ?? 0, fees: e.count ?? 0, strikes: f.count ?? 0, invoices: g.count ?? 0, partners: h.count ?? 0, money: (m1.count ?? 0) + (m2.count ?? 0) });
  }, []);
  useEffect(() => { if (profile?.is_admin) recount(); }, [profile?.is_admin, recount, tab]);
  // Full-width admin: a fixed side menu grouped by what needs doing, and the page on the right.
  const GROUPS: { label: string; items: [Tab, string, number?][] }[] = [
    { label: "", items: [["overview", "Overview"]] },
    { label: "To check", items: [["ids", "ID checks", counts.ids], ["licences", "Licence checks", counts.licences], ["reports", "Reports", counts.reports], ["problems", "Disputes", counts.problems]] },
    { label: "Marketplace", items: [["jobs", "Jobs"], ["people", "Users"], ["launch", "Launch list"]] },
    { label: "Trust", items: [["cancels", "Cancellations", counts.fees], ["strikes", "Strikes", counts.strikes], ["reviews", "Reviews"]] },
    { label: "Money", items: [["money", "Invoices", counts.money]] },
    { label: "Partners", items: [["partners", "Partners", counts.partners], ["tradies", "Tradies", counts.invoices]] },
    { label: "Setup", items: [["areas", "Areas"], ["types", "Job types"], ["skills", "Skills"], ["settings", "Settings"]] },
  ];
  const TITLE = Object.fromEntries(GROUPS.flatMap((g) => g.items.map(([k, l]) => [k, l]))) as Record<Tab, string>;
  if (!ready) return null;
  if (!session) return <div className="admin"><AuthScreen title="Admin sign in" reason="Sign in with your admin account." onBack={() => go("/")} onDone={() => {}} /></div>;
  if (!profile?.is_admin) return (
    <div className="admin solo"><div className="admin-head"><span className="brand"><Logo /> Mahi Man Admin</span><h1 style={{ margin: "16px 0 0", fontWeight: 600 }}>Admins only</h1>
      <p className="light">This account isn't an admin. <button className="hero-link" onClick={() => sb.auth.signOut()}>Sign out</button></p></div></div>
  );
  return (
    <div className="admin">
      <aside className="adm-side">
        <span className="brand"><Logo /> Mahi Man</span>
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
        {tab === "launch" && <LaunchList />}
        {tab === "areas" && <Areas />}
        {tab === "types" && <Types />}
        {tab === "settings" && <Settings />}
        {tab === "cancels" && <Cancellations onChanged={recount} />}
        {tab === "strikes" && <Strikes onChanged={recount} />}
        {tab === "reviews" && <Reviews />}
        {tab === "tradies" && <Tradies onChanged={recount} />}
        {tab === "partners" && <Partners onChanged={recount} />}
        {tab === "money" && <MoneyInvoices onChanged={recount} />}
      </main>
    </div>
  );
}

function Overview() {
  const [s, setS] = useState({ live: 0, searching: 0, weekJobs: 0, weekFees: 0, workers: 0, online: 0, problems: 0, accept: "—", repeat: 0, cancelled: 0, owed: 0 });
  const [tr, setTr] = useState<TradeSummary | null>(null);
  useEffect(() => { rpc<TradeSummary>("admin_trade_summary").then(setTr).catch(() => {}); }, []);
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const [live, searching, week, workers, online, problems, recent, owed] = await Promise.all([
        sb.from("jobs").select("id", { count: "exact", head: true }).in("status", ["accepted", "in_progress", "finished"]),
        sb.from("jobs").select("id", { count: "exact", head: true }).eq("status", "searching"),
        sb.from("jobs").select("fee_cents").or(`and(fee_status.eq.paid,fee_paid_at.gte.${since}),and(status.eq.confirmed,confirmed_at.gte.${since},payment_intent_id.not.is.null)`),
        sb.from("workers").select("id", { count: "exact", head: true }).eq("approved", true),
        sb.from("workers").select("id", { count: "exact", head: true }).eq("online", true),
        sb.from("incidents").select("id", { count: "exact", head: true }).eq("resolved", false),
        sb.from("jobs").select("customer_id,status,searching_at,accepted_at").gte("created_at", since),
        sb.from("fees_owed").select("amount_cents").eq("status", "open"),
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
        owed: (owed.data ?? []).reduce((a, f) => a + f.amount_cents, 0),
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
      <Stat n={money2(s.owed)} l="Cancellation fees owed" />
      <Stat n={money2(s.weekFees)} l="Your fees, last 7 days" />
      {tr && <Stat n={money2(tr.paid_30_cents)} l="Tradie plans paid, 30 days" />}
      {tr && <Stat n={tr.no_quote_jobs} l="Trade jobs with no price after 2 hours" />}
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
                  {!j.payment_intent_id && !["none", "void"].includes(j.fee_status) && <span className={`badge ${j.fee_status === "paid" ? "g" : ""}`} style={{ marginLeft: 6 }}>
                    Fee {money2(j.fee_cents)} {FEE_LABEL[j.fee_status] ?? j.fee_status}</span>}</td>
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
    {review && <span className="badge r">Needs review</span>}
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
          {review && <button className="btn stone" onClick={() => act(() => rpc("admin_clear_review", { p_worker: p.id }), "Cleared. They can go online again.")}>Clear review</button>}
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

// ---------- Areas: open Mahi Man city by city ----------
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

// What each fee state means on the jobs list. Invoice mode: "when it goes ahead" until the job finishes, then invoiced or paid.
const FEE_LABEL: Record<string, string> = { paid: "paid", refunded: "refunded", due: "due", invoice: "when it goes ahead", invoiced: "invoiced" };

// Settings in groups, each with a plain explanation. Money is shown in dollars; nothing saves until Save.
type SetField = { k: string; label: string; hint?: string } & ({ t: "toggle"; on: string; off: string } | { t: "num"; unit: "%" | "$" | "hours" | "minutes" | "days" | "strikes" | "cancels" | "jobs" | "tradies" } | { t: "text"; ph: string });
const SETTING_GROUPS: { title: string; text: string; fields: SetField[] }[] = [
  { title: "Payments", text: "Customers pay workers directly. The connection fee is billed when a job goes ahead, and paid by bank transfer on an invoice or from their balance.", fields: [
    { k: "pilot_mode", label: "Pilot mode", hint: "Customers pay workers directly by bank transfer or cash. Turn off to hold the full price on a card.", t: "toggle", on: "true", off: "false" },
    { k: "fee_mode", label: "Charge the connection fee", hint: "Off: no fee on new jobs. Jobs posted while it's on keep their fee.", t: "toggle", on: "invoice", off: "off" },
    { k: "stripe_publishable_key", label: "Stripe publishable key", hint: "Starts with pk_. Needed before card top-ups.", t: "text", ph: "pk_live_…" },
  ] },
  { title: "Connection fee", text: "Three ways to pay, shown side by side on How you pay. Every invoice is a tax invoice that includes GST.", fields: [
    { k: "booking_fee_percent", label: "Pay as you go", hint: "Invoiced after each job, weekly or every 2 weeks.", t: "num", unit: "%" },
    { k: "booking_fee_max_cents", label: "Pay as you go cap", t: "num", unit: "$" },
    { k: "topup_fee_percent", label: "Top-up", hint: "When their balance covers the fee.", t: "num", unit: "%" },
    { k: "topup_fee_max_cents", label: "Top-up cap", t: "num", unit: "$" },
    { k: "plus_fee_percent", label: "Plus", t: "num", unit: "%" },
    { k: "plus_fee_max_cents", label: "Plus cap", t: "num", unit: "$" },
    { k: "plus_cents", label: "Plus, per month", hint: "Taken from their balance.", t: "num", unit: "$" },
    { k: "invoice_due_days", label: "Invoice after each job is due in", t: "num", unit: "days" },
    { k: "invoice_pause_days", label: "Posting pauses once overdue by", t: "num", unit: "days" },
    { k: "auto_topup_cents", label: "Automatic top-up adds", t: "num", unit: "$" },
    { k: "auto_topup_below_cents", label: "When the balance drops under", t: "num", unit: "$" },
    { k: "boost_cents", label: "Urgent boost", t: "num", unit: "$" },
    { k: "fee_percent", label: "Fee when the card is held", hint: "Only used with pilot mode off.", t: "num", unit: "%" },
  ] },
  { title: "Payment details", text: "Shown on every invoice and top-up. Customers pay to this account with the invoice number as the reference.", fields: [
    { k: "pay_trading_name", label: "Trading name", t: "text", ph: "Mahi Man" },
    { k: "pay_legal_name", label: "Legal name", t: "text", ph: "Company Pty Ltd" },
    { k: "pay_abn", label: "ABN", t: "text", ph: "11 digits" },
    { k: "pay_payid", label: "PayID", hint: "Email, mobile or ABN.", t: "text", ph: "pay@…" },
    { k: "pay_bsb", label: "BSB", t: "text", ph: "000-000" },
    { k: "pay_account", label: "Account number", t: "text", ph: "" },
    { k: "pay_account_name", label: "Account name", t: "text", ph: "Company Pty Ltd" },
  ] },
  { title: "Jobs", text: "Timing rules for every job.", fields: [
    { k: "widen_after_minutes", label: "Show to workers further away after", t: "num", unit: "minutes" },
    { k: "auto_release_hours", label: "Close as done if the customer does nothing for", t: "num", unit: "hours" },
  ] },
  { title: "Cancellations", text: "What cancelling costs, and when. Fees paid by a customer go to the worker; fees paid by a worker become the customer's credit.", fields: [
    { k: "cancel_fee_cents", label: "Cancellation fee", hint: "Customer cancels once the worker is on the way, or isn't there. Worker cancels on the way or doesn't turn up.", t: "num", unit: "$" },
    { k: "worker_late_cancel_cents", label: "Worker cancels close to the start", t: "num", unit: "$" },
    { k: "worker_cancel_window_minutes", label: "Workers can cancel free until", hint: "Before the start time.", t: "num", unit: "minutes" },
    { k: "late_minutes", label: "Late after", hint: "Past the arrival time. Customers can then cancel free, and the worker gets a strike.", t: "num", unit: "minutes" },
    { k: "noshow_wait_minutes", label: "Worker waits at the door for", hint: "Before they can cancel because the customer isn't there.", t: "num", unit: "minutes" },
    { k: "on_way_window_minutes", label: "On the way counts from", hint: "Before the start time, for jobs booked for later.", t: "num", unit: "minutes" },
    { k: "customer_late_cancels_30", label: "Customers pay upfront after", hint: "Late cancels in 30 days. Applies once card payments are on.", t: "num", unit: "cancels" },
  ] },
  { title: "Strikes", text: "Workers get a strike for cancelling late, not turning up, or arriving more than the late time after their arrival time.", fields: [
    { k: "strikes_offline_30", label: "Offline after", hint: "Strikes in 30 days.", t: "num", unit: "strikes" },
    { k: "offline_days", label: "Offline for", t: "num", unit: "days" },
    { k: "strikes_review_90", label: "Account reviewed after", hint: "Strikes in 90 days.", t: "num", unit: "strikes" },
  ] },
  { title: "Trade jobs", text: "Jobs that need a trade licence. Tradies pay for jobs upfront and send a fixed price; customers pay Mahi Man nothing.", fields: [
    { k: "trade_payg_cents", label: "Pay as you go, per job", t: "num", unit: "$" },
    { k: "trade_plan_cents", label: "Trade plan, per month", t: "num", unit: "$" },
    { k: "trade_plan_jobs", label: "Trade plan jobs", t: "num", unit: "jobs" },
    { k: "trade_plan_extra_cents", label: "Trade plan, extra jobs", t: "num", unit: "$" },
    { k: "trade_pro_cents", label: "Trade Pro, per month", t: "num", unit: "$" },
    { k: "trade_pro_jobs", label: "Trade Pro jobs", t: "num", unit: "jobs" },
    { k: "trade_pro_extra_cents", label: "Trade Pro, extra jobs", t: "num", unit: "$" },
    { k: "trade_pro_head_start_minutes", label: "Trade Pro sees new jobs first by", t: "num", unit: "minutes" },
    { k: "trade_quotes_per_job", label: "Prices per job", t: "num", unit: "tradies" },
    { k: "trade_quiet_hours", label: "Job back if the customer doesn't reply in", t: "num", unit: "hours" },
  ] },
  { title: "Partners", text: "Local businesses that pay monthly to show one offer in the app.", fields: [
    { k: "partner_cents", label: "Partner, per month", t: "num", unit: "$" },
    { k: "partner_featured_cents", label: "Featured, per month", t: "num", unit: "$" },
    { k: "partner_grace_days", label: "Offer stays up unpaid for", hint: "After the paid month ends.", t: "num", unit: "days" },
  ] },
  { title: "App links", text: "Where people get the app. Everyone who joins the launch gets the TestFlight link straight away.", fields: [
    { k: "testflight_url", label: "TestFlight public link", hint: "App Store Connect, TestFlight, your external group, Public Link.", t: "text", ph: "https://testflight.apple.com/join/…" },
    { k: "app_store_url", label: "App Store link", hint: "Once Mahi Man is in the App Store. The website then shows Get the app instead of Join the launch.", t: "text", ph: "https://apps.apple.com/…" },
    { k: "play_store_url", label: "Google Play link", t: "text", ph: "https://play.google.com/…" },
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
    if (vals.testflight_url && !/^https:\/\/testflight\.apple\.com\/join\/\w+$/.test(vals.testflight_url)) return toast("The TestFlight link looks like https://testflight.apple.com/join/…");
    if (vals.fee_mode === "invoice" && !vals.pay_payid?.trim() && !(vals.pay_bsb?.trim() && vals.pay_account?.trim())) return toast("Add a PayID or a BSB and account under Payment details before charging the fee");
    if (vals.pay_abn?.trim() && !validAbn(vals.pay_abn)) return toast("That ABN doesn't look right. Check the 11 digits.");
    if (vals.pay_bsb?.trim() && !/^\d{3}-?\d{3}$/.test(vals.pay_bsb.trim())) return toast("A BSB is 6 digits");
    for (const k of changed) {
      const { error } = await sb.from("settings").update({ value: (vals[k] ?? "").trim() }).eq("key", k);
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
                  <input className="set-text" value={vals[f.k] ?? ""} placeholder={f.ph} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} />
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

// People who joined the launch from the website. Download the list as a CSV that TestFlight imports as testers,
// then mark them invited once the TestFlight email has gone.
interface Signup { id: number; first_name: string; last_name: string; email: string; created_at: string; invited_at: string | null }
function LaunchList() {
  const toast = useToast();
  const [rows, setRows] = useState<Signup[] | null>(null);
  const load = useCallback(() => {
    sb.from("launch_signups").select("*").order("created_at", { ascending: false }).then(({ data, error }) => { if (error) toast(error.message); setRows((data ?? []) as Signup[]); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const waiting = (rows ?? []).filter((r) => !r.invited_at);
  function download() {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = waiting.map((r) => [r.first_name, r.last_name, r.email].map(q).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `mahi-man-testers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
  async function markAll() {
    const { error } = await sb.from("launch_signups").update({ invited_at: new Date().toISOString() }).in("id", waiting.map((r) => r.id));
    if (error) toast(error.message); else { toast("Saved"); load(); }
  }
  async function toggle(r: Signup) {
    const { error } = await sb.from("launch_signups").update({ invited_at: r.invited_at ? null : new Date().toISOString() }).eq("id", r.id);
    if (error) toast(error.message); else load();
  }
  if (!rows) return <Loading />;
  return (
    <>
      <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn primary" disabled={!waiting.length} onClick={download}>Download {waiting.length} for TestFlight</button>
        <button className="btn stone" disabled={!waiting.length} onClick={markAll}>Mark {waiting.length} invited</button>
      </div>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Invited</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="w5">{r.first_name} {r.last_name}</td>
                <td className="light">{r.email}</td>
                <td className="light">{new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td><button className={`badge ${r.invited_at ? "g" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => toggle(r)}>{r.invited_at ? "Invited" : "Not yet"}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted">No one yet. Sign-ups from the website show here.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Trust: cancellations and fees, strikes, reviews ---------- */
const day = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const dayTime = (d: string) => new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, (_m, a: string) => ` ${a.toLowerCase()}m`);
const CANCEL_KIND: Record<string, string> = {
  free: "Before the worker set off", fee: "After the worker set off", late: "Worker more than 15 min late", no_show: "Worker didn't turn up",
  new_time: "Didn't accept the new time", not_moving: "Worker wasn't moving", customer_no_show: "Customer not home",
  cant_make_it: "More than 2 hours before", no_answer: "Didn't confirm the day before", cancelled_soon: "Within 2 hours of the start",
  cancelled_on_way: "On the way", emergency: "Emergency", late_arrival: "Arrived more than 15 min late",
};
const FEE_KIND: Record<string, string> = { customer_cancel: "Late cancel", customer_no_show: "Not home", worker_cancel: "Worker cancelled", worker_no_show: "Worker didn't turn up" };
const FEE_FILTERS: [string, string][] = [["open", "Owed"], ["payout", "Paid by card, to pay the worker"], ["paid", "Paid"], ["waived", "Waived"], ["all", "All"]];

interface FeeRow { id: number; created_at: string; kind: string; amount_cents: number; status: string; payer_name: string; payee_id: string | null; payee_name: string; job_title: string | null; paid_at: string | null; payment_ref: string | null; paid_out_at: string | null }
interface CancelRow { at: string; who: string; person: string; other: string | null; job_title: string | null; kind: string; fee_cents: number; strike: boolean }

// Fees people owe for cancelling, and every cancellation in the last 90 days.
function Cancellations({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState("open");
  const [pick, setPick] = useState(false);
  const [fees, setFees] = useState<FeeRow[] | null>(null);
  const [cancels, setCancels] = useState<CancelRow[]>([]);
  const load = useCallback(() => {
    rpc<FeeRow[]>("admin_fees", { p_status: filter }).then(setFees).catch((e) => toast((e as Error).message));
    rpc<CancelRow[]>("admin_cancellations").then(setCancels).catch(() => {});
  }, [filter, toast]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); load(); onChanged(); } catch (e) { toast((e as Error).message); } };
  if (!fees) return <Loading />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12, alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <h2 className="adm-sub" style={{ margin: 0 }}>Fees</h2>
        <button className="cp-select" style={{ height: 44, minWidth: 280, background: "var(--card)" }} onClick={() => setPick(true)}>
          <span>{FEE_FILTERS.find(([k]) => k === filter)?.[1]}</span>{Icon.down("var(--muted)")}
        </button>
      </div>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>Date</th><th>Who pays</th><th>To</th><th>Job</th><th>Why</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                <td className="light" style={{ whiteSpace: "nowrap" }}>{dayTime(f.created_at)}</td>
                <td className="w5">{f.payer_name}</td>
                <td>{f.payee_name}</td>
                <td className="light">{f.job_title ?? "—"}</td>
                <td className="light">{FEE_KIND[f.kind] ?? f.kind}</td>
                <td className="w5">{money2(f.amount_cents)}</td>
                <td>{f.status === "open" ? <span className="badge y">Owed</span> : f.status === "waived" ? <span className="badge">Waived</span>
                  : <span className="badge g">{f.payment_ref === "direct" ? "Paid direct" : f.payment_ref === "admin" ? "Marked paid" : f.paid_out_at || !f.payee_id ? "Paid by card" : "Card, not paid out"}</span>}</td>
                <td><span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  {f.status === "open" && <>
                    <button className="btn stone small" onClick={() => act(() => rpc("admin_fee_status", { p_id: f.id, p_status: "paid" }), "Marked paid")}>Mark paid</button>
                    <button className="btn stone small" onClick={() => act(() => rpc("admin_fee_status", { p_id: f.id, p_status: "waived" }), "Waived")}>Waive</button>
                  </>}
                  {f.status === "paid" && f.payee_id && !f.paid_out_at && f.payment_ref !== "direct" && f.payment_ref !== "admin" &&
                    <button className="btn primary small" onClick={() => act(() => rpc("admin_fee_paid_out", { p_id: f.id }), "Marked paid out")}>Paid {f.payee_name.split(" ")[0]}</button>}
                  {f.status !== "open" && <button className="btn stone small" onClick={() => act(() => rpc("admin_fee_status", { p_id: f.id, p_status: "open" }), "Reopened")}>Reopen</button>}
                </span></td>
              </tr>
            ))}
            {fees.length === 0 && <tr><td colSpan={8} className="muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="adm-sub" style={{ margin: "32px 0 12px" }}>Cancellations, last 90 days</h2>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>Date</th><th>Cancelled by</th><th>Other side</th><th>Job</th><th>What happened</th><th>Fee</th><th>Worker strike</th></tr></thead>
          <tbody>
            {cancels.map((c, i) => (
              <tr key={i}>
                <td className="light">{dayTime(c.at)}</td>
                <td><span className="row" style={{ gap: 8 }}><span className={`badge ${c.who === "Worker" ? "y" : ""}`}>{c.who}</span><span className="w5">{c.person}</span></span></td>
                <td className="light">{c.other ?? "—"}</td>
                <td className="light">{c.job_title ?? "—"}</td>
                <td>{CANCEL_KIND[c.kind] ?? c.kind}</td>
                <td>{c.fee_cents ? money2(c.fee_cents) : <span className="muted">Free</span>}</td>
                <td>{c.strike ? <span className="badge r">Strike</span> : ""}</td>
              </tr>
            ))}
            {cancels.length === 0 && <tr><td colSpan={7} className="muted">No cancellations yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {pick && <SearchPicker title="Show fees" placeholder="Search" options={FEE_FILTERS.map(([id, label]) => ({ id, label }))} value={[filter]}
        onClose={() => setPick(false)} onChange={(v) => setFilter(String(v[0]))} />}
    </>
  );
}

interface StrikeRow { worker_id: string; name: string; photo_path: string | null; strikes_30: number; strikes_90: number; offline_until: string | null; needs_review: boolean; turns_up: number | null; last_at: string | null }
interface DropRow { id: number; created_at: string; kind: string; strike: boolean; fee_cents: number; reason: string | null; job_title: string | null }

// Workers with strikes or cancellations in the last 90 days. Open one to remove a strike or change whether they're offline.
function Strikes({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<StrikeRow[] | null>(null);
  const [open, setOpen] = useState<StrikeRow | null>(null);
  const load = useCallback(() => { rpc<StrikeRow[]>("admin_strikes").then((r) => { setRows(r); setOpen((o) => (o ? r.find((x) => x.worker_id === o.worker_id) ?? null : null)); }).catch((e) => toast((e as Error).message)); }, [toast]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Loading />;
  if (open) return <StrikeDetail w={open} onBack={() => setOpen(null)} onChanged={() => { load(); onChanged(); }} />;
  if (!rows.length) return <AdmEmpty text="No worker has a strike or a cancellation in the last 90 days." />;
  return (
    <div className="table-wrap">
      <table className="rows">
        <thead><tr><th>Worker</th><th>Turns up</th><th>Strikes, 30 days</th><th>Strikes, 90 days</th><th>Status</th><th>Last</th><th /></tr></thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.worker_id} className="click" onClick={() => setOpen(w)}>
              <td><span className="row" style={{ gap: 12 }}>
                {w.photo_path ? <img className="u-pic" src={avatarUrl(w.photo_path)!} alt="" /> : <span className="u-pic none">{w.name.slice(0, 1).toUpperCase()}</span>}
                <span className="w5">{w.name}</span>
              </span></td>
              <td>{w.turns_up != null ? `${w.turns_up}%` : <span className="muted">New</span>}</td>
              <td className={w.strikes_30 >= 3 ? "w5" : ""}>{w.strikes_30} of 3</td>
              <td>{w.strikes_90} of 5</td>
              <td>{w.needs_review ? <span className="badge r">Needs review</span> : w.offline_until ? <span className="badge y">Offline until {day(w.offline_until)}</span> : <span className="badge g">Active</span>}</td>
              <td className="light">{w.last_at ? day(w.last_at) : "—"}</td>
              <td style={{ width: 32 }}>{Icon.chevron("var(--faint)")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StrikeDetail({ w, onBack, onChanged }: { w: StrikeRow; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [drops, setDrops] = useState<DropRow[]>([]);
  const load = useCallback(() => { rpc<DropRow[]>("admin_worker_drops", { p_worker: w.worker_id }).then(setDrops).catch(() => {}); }, [w.worker_id]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); load(); onChanged(); } catch (e) { toast((e as Error).message); } };
  return (
    <div className="u-page">
      <button className="u-back" onClick={onBack}>{Icon.back("var(--emerald)")} All strikes</button>
      <div className="u-head">
        {w.photo_path ? <img className="u-big" src={avatarUrl(w.photo_path)!} alt="" /> : <span className="u-big none">{w.name.slice(0, 1).toUpperCase()}</span>}
        <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <h2>{w.name}</h2>
          <span className="light muted">Turns up {w.turns_up != null ? `${w.turns_up}%` : "new"}, {w.strikes_30} strikes in 30 days, {w.strikes_90} in 90 days</span>
          <span>{w.needs_review ? <span className="badge r">Needs review</span> : w.offline_until ? <span className="badge y">Offline until {day(w.offline_until)}</span> : <span className="badge g">Active</span>}</span>
        </div>
        <div className="row" style={{ gap: 8, alignSelf: "flex-start", flexWrap: "wrap" }}>
          {w.needs_review && <button className="btn primary" onClick={() => act(() => rpc("admin_clear_review", { p_worker: w.worker_id }), "Cleared. They can go online again.")}>Clear review</button>}
          {w.offline_until
            ? <button className="btn stone" onClick={() => act(() => rpc("admin_set_offline", { p_worker: w.worker_id, p_days: null }), "They can go online again")}>Let them back online</button>
            : <button className="btn stone" onClick={() => act(() => rpc("admin_set_offline", { p_worker: w.worker_id, p_days: 7 }), "Offline for 7 days")}>Take offline for 7 days</button>}
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table className="rows">
          <thead><tr><th>Date</th><th>Job</th><th>What happened</th><th>Fee</th><th>Strike</th><th /></tr></thead>
          <tbody>
            {drops.map((d) => (
              <tr key={d.id}>
                <td className="light">{dayTime(d.created_at)}</td>
                <td className="light">{d.job_title ?? "—"}</td>
                <td>{CANCEL_KIND[d.kind] ?? d.kind}{d.reason ? <span className="small muted light" style={{ display: "block" }}>{d.reason}</span> : null}</td>
                <td>{d.fee_cents ? money2(d.fee_cents) : <span className="muted">None</span>}</td>
                <td>{d.strike ? <span className="badge r">Strike</span> : <span className="muted">No</span>}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn stone small" onClick={() => act(() => rpc("admin_strike_set", { p_id: d.id, p_strike: !d.strike }), d.strike ? "Strike removed" : "Strike added back")}>{d.strike ? "Remove strike" : "Add strike back"}</button>
                </td>
              </tr>
            ))}
            {drops.length === 0 && <tr><td colSpan={6} className="muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ReviewRow { job_id: string; from_id: string; created_at: string; from_name: string; to_name: string; of_worker: boolean; recommend: boolean | null; scores: Record<string, number> | null; comment: string | null; job_title: string | null; revealed: boolean }
const SCORE_LABEL: Record<string, string> = { on_time: "On time", prepared: "Prepared", quality: "Quality", communication: "Comms", friendliness: "Friendly", description: "As described", paid: "Paid", respect: "Respect" };

// Every review, newest first. Remove one that breaks the rules.
function Reviews() {
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [side, setSide] = useState<"all" | "worker" | "customer">("all");
  const [pick, setPick] = useState(false);
  const load = useCallback(() => { rpc<ReviewRow[]>("admin_reviews").then(setRows).catch((e) => toast((e as Error).message)); }, [toast]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Loading />;
  const SIDES: [typeof side, string][] = [["all", "All reviews"], ["worker", "Customers reviewing workers"], ["customer", "Workers reviewing customers"]];
  const shown = rows.filter((r) => side === "all" || (side === "worker") === r.of_worker);
  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: "flex-end" }}>
        <button className="cp-select" style={{ height: 44, minWidth: 280, background: "var(--card)" }} onClick={() => setPick(true)}>
          <span>{SIDES.find(([k]) => k === side)?.[1]}</span>{Icon.down("var(--muted)")}
        </button>
      </div>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>Date</th><th>From</th><th>About</th><th>Recommend</th><th>Ratings</th><th>Comment</th><th>Shown</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.job_id + r.from_id}>
                <td className="light" style={{ whiteSpace: "nowrap" }}>{day(r.created_at)}</td>
                <td><span className="stack" style={{ gap: 1 }}><span className="w5">{r.from_name}</span><span className="small muted light">{r.of_worker ? "Customer" : "Worker"}, {r.job_title ?? ""}</span></span></td>
                <td>{r.to_name}</td>
                <td>{r.recommend == null ? <span className="muted">—</span> : r.recommend ? <span className="badge g">Yes</span> : <span className="badge r">No</span>}</td>
                <td className="small">{r.scores ? Object.entries(r.scores).map(([k, v]) => (
                  <span key={k} style={{ display: "inline-block", marginRight: 10, whiteSpace: "nowrap" }}><span className="muted light">{SCORE_LABEL[k] ?? k}</span> <b style={{ color: v <= 2 ? "var(--danger)" : undefined }}>{v}</b></span>
                )) : <span className="muted">—</span>}</td>
                <td className="light" style={{ maxWidth: 260 }}>{r.comment || <span className="muted">—</span>}</td>
                <td>{r.revealed ? <span className="badge g">Shown</span> : <span className="badge">Waiting</span>}</td>
                <td style={{ textAlign: "right" }}><button className="btn stone small" onClick={async () => {
                  try { await rpc("admin_review_delete", { p_job: r.job_id, p_from: r.from_id }); toast("Review removed"); load(); } catch (e) { toast((e as Error).message); }
                }}>Remove</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="muted">No reviews yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {pick && <SearchPicker title="Show reviews" placeholder="Search" options={SIDES.map(([id, label]) => ({ id, label }))} value={[side]}
        onClose={() => setPick(false)} onChange={(v) => setSide(String(v[0]) as typeof side)} />}
    </>
  );
}

// ---------- Tradies: invoices to mark paid, and every tradie's plan ----------
interface TradeSummary { orders_waiting: number; waiting_cents: number; active_plans: number; paid_30_cents: number; trade_jobs_30: number; no_quote_jobs: number }
interface TradeOrder { id: number; created_at: string; worker_id: string; worker_name: string; business_name: string | null; email: string | null; kind: "plan" | "jobs"; plan: string; jobs: number; amount_cents: number; status: string; renewal: boolean; paid_at: string | null; note: string | null }
interface Tradie { worker_id: string; full_name: string; business_name: string | null; licences: string[]; plan: string | null; status: string | null; jobs_left: number; renews_at: string | null; quotes_30: number; won_30: number; paid_cents: number }
interface TradeLog { created_at: string; change: number; reason: string; job_title: string | null }
const PLAN_LABEL: Record<string, string> = { payg: "Pay as you go", trade: "Trade", pro: "Trade Pro" };
const TRADE_VIEWS: [string, string][] = [["requested", "Invoices to be paid"], ["tradies", "Tradies"], ["paid", "Paid invoices"], ["all", "All invoices"]];

function Tradies({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [view, setView] = useState("requested");
  const [pick, setPick] = useState(false);
  const [sum, setSum] = useState<TradeSummary | null>(null);
  const [orders, setOrders] = useState<TradeOrder[] | null>(null);
  const [tradies, setTradies] = useState<Tradie[] | null>(null);
  const [open, setOpen] = useState<Tradie | null>(null);
  const load = useCallback(() => {
    rpc<TradeSummary>("admin_trade_summary").then(setSum).catch(() => {});
    rpc<Tradie[]>("admin_tradies").then((r) => { setTradies(r); setOpen((o) => (o ? r.find((x) => x.worker_id === o.worker_id) ?? null : null)); }).catch((e) => toast((e as Error).message));
    if (view !== "tradies") rpc<TradeOrder[]>("admin_trade_orders", { p_status: view }).then(setOrders).catch((e) => toast((e as Error).message));
  }, [view, toast]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); load(); onChanged(); } catch (e) { toast((e as Error).message); } };
  if (open) return <TradieDetail t={open} onBack={() => setOpen(null)} onChanged={() => { load(); onChanged(); }} />;
  const what = (o: TradeOrder) => o.kind === "plan" && o.plan !== "payg" ? `${PLAN_LABEL[o.plan]}, ${o.jobs} jobs${o.renewal ? ", renewal" : ""}` : `${o.jobs} job${o.jobs === 1 ? "" : "s"}, ${PLAN_LABEL[o.plan].toLowerCase()}`;
  return (
    <>
      {sum && (
        <div className="stats">
          <Stat n={money2(sum.waiting_cents)} l={`${sum.orders_waiting} invoice${sum.orders_waiting === 1 ? "" : "s"} to be paid`} />
          <Stat n={sum.active_plans} l="Monthly plans" />
          <Stat n={money2(sum.paid_30_cents)} l="Paid, 30 days" />
          <Stat n={sum.trade_jobs_30} l="Trade jobs posted, 30 days" />
        </div>
      )}
      <div className="row between" style={{ marginBottom: 12, alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <button className="cp-select" style={{ height: 44, minWidth: 280, background: "var(--card)" }} onClick={() => setPick(true)}>
          <span>{TRADE_VIEWS.find(([k]) => k === view)?.[1]}</span>{Icon.down("var(--muted)")}
        </button>
      </div>
      {view === "tradies" ? (
        !tradies ? <Loading /> : !tradies.length ? <AdmEmpty text="No licensed tradies yet. They show here once a trade licence is sent in." /> : (
          <div className="table-wrap"><table className="rows">
            <thead><tr><th>Tradie</th><th>Licences</th><th>Plan</th><th>Jobs left</th><th>Prices sent, 30 days</th><th>Won</th><th>Paid in total</th><th /></tr></thead>
            <tbody>{tradies.map((t) => (
              <tr key={t.worker_id} className="click" onClick={() => setOpen(t)}>
                <td><span className="w5">{t.business_name ?? t.full_name}</span>{t.business_name && <span className="small muted light" style={{ display: "block" }}>{t.full_name}</span>}</td>
                <td className="light">{t.licences.length ? t.licences.join(", ") : "Being checked"}</td>
                <td>{t.plan ? <span className={`badge ${t.status === "active" ? "g" : ""}`}>{PLAN_LABEL[t.plan]}{t.status === "stopped" ? ", stopped" : ""}</span> : <span className="muted">None</span>}{t.renews_at && <span className="small muted light" style={{ display: "block" }}>Renews {day(t.renews_at)}</span>}</td>
                <td className="w5">{t.jobs_left}</td>
                <td>{t.quotes_30}</td>
                <td>{t.won_30}</td>
                <td>{money2(t.paid_cents)}</td>
                <td style={{ width: 32 }}>{Icon.chevron("var(--faint)")}</td>
              </tr>))}</tbody>
          </table></div>
        )
      ) : !orders ? <Loading /> : !orders.length ? <AdmEmpty text={view === "requested" ? "No invoices waiting to be paid." : "No invoices yet."} /> : (
        <div className="table-wrap"><table className="rows">
          <thead><tr><th>Sent</th><th>Tradie</th><th>Email</th><th>For</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}>
              <td className="light" style={{ whiteSpace: "nowrap" }}>{dayTime(o.created_at)}</td>
              <td><span className="w5">{o.business_name ?? o.worker_name}</span>{o.business_name && <span className="small muted light" style={{ display: "block" }}>{o.worker_name}</span>}</td>
              <td className="light">{o.email ?? "—"}</td>
              <td>{what(o)}</td>
              <td className="w5">{money2(o.amount_cents)}</td>
              <td>{o.status === "paid" ? <span className="badge g">Paid {o.paid_at ? day(o.paid_at) : ""}</span> : o.status === "cancelled" ? <span className="badge">Cancelled</span> : <span className="badge y">To be paid</span>}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {o.status === "requested" && <>
                  <button className="btn stone small" onClick={() => act(() => rpc("admin_trade_order_cancel", { p_id: o.id }), "Invoice cancelled")}>Cancel</button>{" "}
                  <button className="btn primary small" onClick={() => act(() => rpc("admin_trade_order_paid", { p_id: o.id }), `Paid. ${o.jobs} job${o.jobs === 1 ? "" : "s"} added.`)}>Mark paid</button>
                </>}
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
      {view === "requested" && orders && orders.length > 0 && <p className="light muted" style={{ marginTop: 14 }}>Email each tradie an invoice. Mark it paid when the money arrives, and their jobs are added straight away.</p>}
      {pick && <SearchPicker title="Show" placeholder="Search" options={TRADE_VIEWS.map(([id, label]) => ({ id, label }))} value={[view]}
        onClose={() => setPick(false)} onChange={(v) => setView(String(v[0]))} />}
    </>
  );
}

function TradieDetail({ t, onBack, onChanged }: { t: Tradie; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [log, setLog] = useState<TradeLog[]>([]);
  const [pick, setPick] = useState(false);
  const load = useCallback(() => { rpc<TradeLog[]>("admin_trade_log", { p_worker: t.worker_id }).then(setLog).catch(() => {}); }, [t.worker_id]);
  useEffect(() => { load(); }, [load]);
  const adjust = async (n: number) => {
    try { await rpc("admin_trade_adjust", { p_worker: t.worker_id, p_change: n, p_reason: n > 0 ? "Added by Mahi Man" : "Taken off by Mahi Man" }); toast(n > 0 ? `${n} added` : `${-n} taken off`); load(); onChanged(); }
    catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="u-page">
      <button className="u-back" onClick={onBack}>{Icon.back("var(--emerald)")} All tradies</button>
      <div className="u-head">
        <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <h2>{t.business_name ?? t.full_name}</h2>
          <span className="light muted">{t.business_name ? `${t.full_name}, ` : ""}{t.licences.join(", ") || "Licence being checked"}</span>
          <span className="light">{t.plan ? `${PLAN_LABEL[t.plan]}${t.status === "stopped" ? ", stopped" : ""}` : "No plan"}, <b className="w5">{t.jobs_left} jobs left</b>{t.renews_at ? `, renews ${day(t.renews_at)}` : ""}</span>
        </div>
        <button className="btn stone" style={{ alignSelf: "flex-start" }} onClick={() => setPick(true)}>Change jobs left</button>
      </div>
      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table className="rows">
          <thead><tr><th>Date</th><th>Jobs</th><th>Why</th><th>Job</th></tr></thead>
          <tbody>
            {log.map((l, i) => (
              <tr key={i}>
                <td className="light">{dayTime(l.created_at)}</td>
                <td className="w5" style={{ color: l.change > 0 ? "var(--emerald)" : undefined }}>{l.change > 0 ? `+${l.change}` : l.change}</td>
                <td>{l.reason}</td>
                <td className="light">{l.job_title ?? "—"}</td>
              </tr>
            ))}
            {log.length === 0 && <tr><td colSpan={4} className="muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {pick && <SearchPicker title="Change jobs left" value={[]} options={[1, 2, 5, -1, -2].map((n) => ({ id: n, label: n > 0 ? `Add ${n} job${n === 1 ? "" : "s"}` : `Take ${-n} job${n === -1 ? "" : "s"} off` }))}
        onClose={() => setPick(false)} onChange={(v) => adjust(Number(v[0]))} />}
    </div>
  );
}

// ---------- Partners: applications to approve, live offers, payments, and the monthly numbers ----------
interface PartnerRow {
  id: number; business_name: string; abn: string; abn_valid: boolean; contact_name: string; email: string; phone: string; business_type: string; website: string | null;
  plan: "partner" | "featured"; status: string; offer_title: string; offer_terms: string[]; offer_code: string | null; offer_until: string | null; audience: "customers" | "workers" | "both";
  category_ids: number[]; after_job_line: string | null; address: string | null; suburb_id: number | null; photo_path: string | null; paid_until: string | null; note: string | null;
  created_at: string; views_30: number; taps_30: number; uses_30: number; invoice_due_id: number | null; invoice_due_cents: number | null; showing: boolean;
}
interface PartnerInvoice { id: number; period_start: string; amount_cents: number; status: string; created_at: string; paid_at: string | null }
const PARTNER_VIEWS: [string, string][] = [["applied", "Applications"], ["live", "Live"], ["due", "Payment due"], ["stopped", "Stopped"], ["all", "All"]];
const WHO_LABEL: Record<string, string> = { customers: "Customers", workers: "Workers", both: "Customers and workers" };
const fmtAbn = (a: string) => a.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4");

function Partners({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [view, setView] = useState("applied");
  const [pick, setPick] = useState(false);
  const [rows, setRows] = useState<PartnerRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => { rpc<PartnerRow[]>("admin_partners", { p_view: open ? "all" : view }).then(setRows).catch((e) => toast((e as Error).message)); }, [view, open, toast]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); load(); onChanged(); } catch (e) { toast((e as Error).message); } };
  const row = open ? rows?.find((r) => r.id === open) : null;
  if (open && row) return <PartnerDetail p={row} onBack={() => setOpen(null)} onChanged={() => { load(); onChanged(); }} />;
  if (!rows) return <Loading />;
  const label = PARTNER_VIEWS.find(([k]) => k === view)?.[1] ?? "";
  return (
    <>
      <button className="cp-select" style={{ height: 44, minWidth: 280, background: "var(--card)" }} onClick={() => setPick(true)}>
        <span>{label}{view === "applied" ? `, ${rows.length} waiting` : ""}</span>{Icon.down("var(--muted)")}
      </button>
      <div style={{ height: 18 }} />
      {!rows.length ? <AdmEmpty text={view === "applied" ? "No applications waiting." : "Nothing here yet."} /> : view === "applied" ? (
        <div className="table-wrap"><table className="rows"><thead><tr><th>Business</th><th>Contact</th><th>Offer</th><th>For</th><th>Plan</th><th>ABN</th><th>Sent</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
              <td><span className="w5">{r.business_name}</span><br /><span className="light muted">{r.business_type}</span></td>
              <td className="light">{r.contact_name}</td><td>{r.offer_title}</td><td className="light">{WHO_LABEL[r.audience]}</td>
              <td><span className={`badge ${r.plan === "featured" ? "g" : ""}`}>{r.plan === "featured" ? "Featured" : "Partner"}</span></td>
              <td>{r.abn_valid ? <span className="badge g">Valid</span> : <span className="badge r">Not valid</span>}</td>
              <td className="light">{dayTime(r.created_at)}</td>
              <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                <button className="btn stone small" onClick={() => act(() => rpc("admin_partner_decide", { p_id: r.id, p_approve: false }), "Declined")}>Decline</button>{" "}
                <button className="btn primary small" onClick={() => (r.suburb_id && r.offer_code && r.photo_path ? act(() => rpc("admin_partner_decide", { p_id: r.id, p_approve: true }), "Approved. Their first invoice is ready.") : (toast("Add their suburb, code and photo, then approve"), setOpen(r.id)))}>Approve</button>
              </td>
            </tr>))}</tbody></table></div>
      ) : (
        <div className="table-wrap"><table className="rows"><thead><tr><th>Business</th><th>Plan</th><th>Offer</th><th>For</th><th>Views, 30 days</th><th>Taps</th><th>Used</th><th>Payment</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
              <td className="w5">{r.business_name}</td>
              <td><span className={`badge ${r.plan === "featured" ? "g" : ""}`}>{r.plan === "featured" ? "Featured" : "Partner"}</span></td>
              <td>{r.offer_title}</td><td className="light">{WHO_LABEL[r.audience]}</td>
              <td>{r.views_30}</td><td>{r.taps_30}</td><td className="w5">{r.uses_30}</td>
              <td>{r.status === "stopped" || r.status === "declined" ? <span className="badge">{r.status === "declined" ? "Declined" : "Stopped"}</span>
                : r.invoice_due_id ? <span className="badge y">{money2(r.invoice_due_cents ?? 0)} to pay{r.paid_until ? `, due ${day(r.paid_until)}` : ""}</span>
                : r.status === "applied" ? <span className="badge y">Application</span>
                : <span className="badge g">Paid to {r.paid_until ? day(r.paid_until) : "—"}</span>}</td>
              <td style={{ width: 32 }}>{Icon.chevron("var(--faint)")}</td>
            </tr>))}</tbody></table></div>
      )}
      <p className="light muted" style={{ marginTop: 14 }}>{view === "applied" ? "Approving adds their first month's invoice to send them. Their offer goes live when it's marked paid." : "Used means they called, got directions or copied the code. Open a partner to copy their monthly numbers."}</p>
      {pick && <SearchPicker title="Show" placeholder="Search" options={PARTNER_VIEWS.map(([id, l]) => ({ id, label: l }))} value={[view]}
        onClose={() => setPick(false)} onChange={(v) => setView(String(v[0]))} />}
    </>
  );
}

function PartnerDetail({ p, onBack, onChanged }: { p: PartnerRow; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ ...p, terms: p.offer_terms.join("\n") });
  useEffect(() => { setF({ ...p, terms: p.offer_terms.join("\n") }); }, [p]);
  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<{ id: number; name: string; area: string }[]>([]);
  const [inv, setInv] = useState<PartnerInvoice[]>([]);
  const [pick, setPick] = useState<null | "who" | "plan" | "cats" | "suburb">(null);
  const [busy, setBusy] = useState(false);
  const loadInv = useCallback(() => { rpc<PartnerInvoice[]>("admin_partner_invoices", { p_id: p.id }).then(setInv).catch(() => {}); }, [p.id]);
  useEffect(() => {
    sb.from("categories").select("*").order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    sb.from("suburbs").select("id,name,areas(name)").order("name").then(({ data }) => setSubs(((data ?? []) as unknown as { id: number; name: string; areas: { name: string } | null }[]).map((x) => ({ id: x.id, name: x.name, area: x.areas?.name ?? "" }))));
    loadInv();
  }, [loadInv]);
  const dirty = JSON.stringify({ ...p, terms: p.offer_terms.join("\n") }) !== JSON.stringify(f);
  const act = async (fn: () => Promise<unknown>, msg: string) => { setBusy(true); try { await fn(); toast(msg); loadInv(); onChanged(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); } };
  const save = () => act(() => rpc("admin_partner_save", { p_id: p.id, p: {
    business_name: f.business_name, offer_title: f.offer_title, offer_terms: f.terms.split("\n").map((x) => x.trim()).filter(Boolean), offer_code: f.offer_code ?? "",
    offer_until: f.offer_until ?? "", audience: f.audience, plan: f.plan, category_ids: f.category_ids, after_job_line: f.after_job_line ?? "", address: f.address ?? "",
    suburb_id: f.suburb_id ?? "", photo_path: f.photo_path ?? "", phone: f.phone, website: f.website ?? "" } }), "Saved");
  const report = () => {
    const t = `${p.business_name}, last 30 days on Mahi Man\nOffer: ${p.offer_title}\nSeen by ${p.views_30} people\nOpened by ${p.taps_30}\nUsed by ${p.uses_30} (called you, got directions or copied your code)`;
    navigator.clipboard?.writeText(t).then(() => toast("Copied. Paste it in an email."), () => toast(t));
  };
  const In = ({ k, label, ph, wide }: { k: "business_name" | "offer_title" | "offer_code" | "after_job_line" | "address" | "phone" | "website"; label: string; ph?: string; wide?: boolean }) => (
    <label className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}><span className="k">{label}</span>
      <input value={(f[k] as string | null) ?? ""} placeholder={ph} onChange={(e) => setF({ ...f, [k]: k === "offer_code" ? e.target.value.toUpperCase() : e.target.value })} /></label>
  );
  const Sel = ({ label, value, on }: { label: string; value: string; on: () => void }) => (
    <button className="field sel" onClick={on}><span className="k">{label}</span><span className={value ? "v w4" : "v ph"}>{value || "Pick"}</span></button>
  );
  const sub = subs.find((x) => x.id === f.suburb_id);
  return (
    <div className="u-page">
      <button className="u-back" onClick={onBack}>{Icon.back("var(--emerald)")} All partners</button>
      <div className="u-head">
        <label style={{ cursor: "pointer" }}>
          {brandUrl(f.photo_path) ? <img src={brandUrl(f.photo_path)!} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 4, display: "block" }} />
            : <span className="small em w5" style={{ display: "flex", width: 120, height: 90, borderRadius: 4, background: "var(--card)", alignItems: "center", justifyContent: "center" }}>Add photo</span>}
          <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const path = await uploadBrand(file, `partner-${p.id}`); setF((x) => ({ ...x, photo_path: path })); } catch (er) { toast((er as Error).message); } }} />
        </label>
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <h2>{p.business_name}</h2>
          <span className="light muted">{p.contact_name}, {p.email}, {p.phone}</span>
          <span className="light muted">ABN {fmtAbn(p.abn)} {p.abn_valid ? "" : "(not valid)"} · {p.business_type}{p.website ? ` · ${p.website}` : ""}</span>
        </div>
        <div className="row" style={{ gap: 8, alignSelf: "flex-start", flexWrap: "wrap" }}>
          {p.status === "applied" && <>
            <button className="btn stone" disabled={busy || dirty} onClick={() => act(() => rpc("admin_partner_decide", { p_id: p.id, p_approve: false }), "Declined")}>Decline</button>
            <button className="btn primary" disabled={busy || dirty} onClick={() => act(() => rpc("admin_partner_decide", { p_id: p.id, p_approve: true }), "Approved. Their first invoice is ready.")}>Approve</button>
          </>}
          {(p.status === "live" || p.status === "approved") && <button className="btn stone" disabled={busy} onClick={() => act(() => rpc("admin_partner_stop", { p_id: p.id }), "Stopped. The offer is down.")}>Stop</button>}
          {p.status === "stopped" && <button className="btn stone" disabled={busy} onClick={() => act(() => rpc("admin_partner_restart", { p_id: p.id }), "Restarted. A new invoice is ready.")}>Restart</button>}
          {p.status === "live" && <button className="btn stone" onClick={report}>Copy monthly numbers</button>}
        </div>
      </div>
      {p.status !== "applied" && (
        <div className="stats" style={{ marginBottom: 0 }}>
          <Stat n={p.showing ? "Showing" : "Not showing"} l={p.paid_until ? `Paid to ${day(p.paid_until)}` : "Not paid yet"} />
          <Stat n={p.views_30} l="Seen, 30 days" /><Stat n={p.taps_30} l="Opened, 30 days" /><Stat n={p.uses_30} l="Used, 30 days" />
        </div>
      )}
      <section className="set-group" style={{ borderBottom: 0 }}>
        <div className="set-about"><h3>The offer</h3><p>What people see in the app. The code is only shown once someone opens the offer.</p></div>
        <div className="set-card" style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {In({ k: "offer_title", label: "Offer", wide: true })}
          {In({ k: "offer_code", label: "Code", ph: "MAHI10" })}
          <label className="field"><span className="k">Until</span><input type="date" value={f.offer_until ?? ""} onChange={(e) => setF({ ...f, offer_until: e.target.value || null })} /></label>
          <label className="field" style={{ gridColumn: "1 / -1", minHeight: 96, justifyContent: "flex-start" }}><span className="k">Terms, one per line</span>
            <textarea value={f.terms} rows={3} placeholder={"Any skip bin, any size, delivered in Cairns.\nOne use per customer."} onChange={(e) => setF({ ...f, terms: e.target.value })} /></label>
          <Sel label="Who it's for" value={WHO_LABEL[f.audience]} on={() => setPick("who")} />
          <Sel label="Plan" value={f.plan === "featured" ? "Featured" : "Partner"} on={() => setPick("plan")} />
          <Sel label="Show after these jobs" value={cats.filter((c) => f.category_ids.includes(c.id)).map((c) => c.name).join(", ")} on={() => setPick("cats")} />
          {In({ k: "after_job_line", label: "Line before the offer, after a job", ph: "More to clear?" })}
          {In({ k: "address", label: "Street address", ph: "14 Grafton St" })}
          <Sel label="Suburb" value={sub ? `${sub.name}${sub.area ? `, ${sub.area}` : ""}` : ""} on={() => setPick("suburb")} />
          {In({ k: "phone", label: "Phone, for Call them" })}
          {In({ k: "website", label: "Website", ph: "Optional" })}
        </div>
      </section>
      {dirty && (
        <div className="set-bar">
          <span>Unsaved changes</span>
          <span className="row" style={{ gap: 10 }}><button className="btn stone" onClick={() => setF({ ...p, terms: p.offer_terms.join("\n") })}>Discard</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></span>
        </div>
      )}
      <h2 className="adm-sub" style={{ margin: "8px 0 0" }}>Invoices</h2>
      <div className="table-wrap">
        <table className="rows">
          <thead><tr><th>Raised</th><th>For the month from</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {inv.map((i) => (
              <tr key={i.id}>
                <td className="light">{dayTime(i.created_at)}</td><td>{day(i.period_start)}</td><td className="w5">{money2(i.amount_cents)}</td>
                <td>{i.status === "paid" ? <span className="badge g">Paid {i.paid_at ? day(i.paid_at) : ""}</span> : i.status === "cancelled" ? <span className="badge">Cancelled</span> : <span className="badge y">To be paid</span>}</td>
                <td style={{ textAlign: "right" }}>{i.status === "requested" && <button className="btn primary small" disabled={busy} onClick={() => act(() => rpc("admin_partner_paid", { p_invoice: i.id }), "Paid. The offer is live.")}>Mark paid</button>}</td>
              </tr>
            ))}
            {inv.length === 0 && <tr><td colSpan={5} className="muted">No invoices yet. Approving raises the first one.</td></tr>}
          </tbody>
        </table>
      </div>
      {pick === "who" && <SearchPicker title="Who it's for" value={[f.audience]} options={Object.entries(WHO_LABEL).map(([id, label]) => ({ id, label }))} onClose={() => setPick(null)} onChange={(v) => setF({ ...f, audience: String(v[0]) as PartnerRow["audience"] })} />}
      {pick === "plan" && <SearchPicker title="Plan" value={[f.plan]} options={[{ id: "partner", label: "Partner" }, { id: "featured", label: "Featured" }]} onClose={() => setPick(null)} onChange={(v) => setF({ ...f, plan: String(v[0]) as PartnerRow["plan"] })} />}
      {pick === "cats" && <SearchPicker title="Show after these jobs" multi placeholder="Search" value={f.category_ids} options={cats.map((c) => ({ id: c.id, label: c.name }))} onClose={() => setPick(null)} onChange={(v) => setF({ ...f, category_ids: v.map(Number) })} />}
      {pick === "suburb" && <SearchPicker title="Suburb" placeholder="Search suburbs" value={f.suburb_id ? [f.suburb_id] : []} options={subs.map((x) => ({ id: x.id, label: x.name, hint: x.area }))} onClose={() => setPick(null)} onChange={(v) => setF({ ...f, suburb_id: Number(v[0]) })} />}
    </div>
  );
}

// Every invoice in one place: customer connection fees, customer bank top-ups, tradie plans and partner months.
// Match the reference on the bank statement, then mark it paid. "They say paid" means the customer pressed I've paid.
interface MoneyRow { kind: "invoice" | "topup" | "tradie" | "partner"; id: number; ref: string; who: string; what: string; item: string; amount: number; due: string; state: "due" | "late" | "claimed" | "paid"; paused: boolean; created: string; paid_at: string | null }
interface MoneyData { rows: MoneyRow[]; due_week: number; due_week_n: number; late: number; late_n: number; paid_month: number; paid_month_n: number }
const MONEY_VIEWS: [string, string][] = [["open", "To check and due"], ["late", "Overdue"], ["topups", "Top-ups"], ["paid", "Paid"], ["all", "Everything"]];
function MoneyInvoices({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [view, setView] = useState("open");
  const [d, setD] = useState<MoneyData | null>(null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => rpc<MoneyData>("admin_money", { p_view: view }).then(setD).catch((e) => toast(e.message)), [view, toast]);
  useEffect(() => { load(); }, [load]);
  const paid = async (r: MoneyRow) => {
    setBusy(`${r.kind}${r.id}`);
    try {
      if (r.kind === "invoice") await rpc("admin_invoice_set", { p_id: r.id, p_status: "paid" });
      else if (r.kind === "topup") await rpc("admin_topup_paid", { p_id: r.id });
      else if (r.kind === "tradie") await rpc("admin_trade_order_paid", { p_id: r.id, p_note: `Bank transfer ${r.ref}` });
      else await rpc("admin_partner_paid", { p_invoice: r.id });
      toast(`${r.ref} marked paid`); load(); onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" }).replace(",", "");
  const month = new Date().toLocaleDateString("en-AU", { month: "long", timeZone: "Australia/Brisbane" });
  const badge = (r: MoneyRow) => r.state === "paid" ? <span className="badge g">Paid</span> : r.state === "late" ? <span className="badge r">{r.paused ? "Overdue · booking paused" : "Overdue"}</span>
    : r.state === "claimed" ? <span className="badge y">They say paid</span> : <span className="badge">Due</span>;
  if (!d) return <Loading />;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return (
    <>
      <div className="iv-stats">
        <div><span className="t14 light muted">Due this week</span><b>{money2(d.due_week)}</b><span className="t14 light muted">{n(d.due_week_n, "invoice")}</span></div>
        <div><span className="t14 light muted">Overdue</span><b style={d.late ? { color: "var(--danger)" } : undefined}>{money2(d.late)}</b><span className="t14 light muted">{n(d.late_n, "invoice")}</span></div>
        <div><span className="t14 light muted">Paid in {month}</span><b>{money2(d.paid_month)}</b><span className="t14 light muted">{n(d.paid_month_n, "payment")}</span></div>
      </div>
      <button className="cp-select" style={{ height: 44, minWidth: 280, background: "var(--card)", marginBottom: 14 }} onClick={() => setPick(true)}>
        <span>{MONEY_VIEWS.find(([k]) => k === view)?.[1]}</span>{Icon.chevron("var(--muted)")}</button>
      {d.rows.length === 0 ? <p className="light muted">Nothing here.</p> : (
        <div className="table-wrap"><table className="rows"><thead><tr><th>Invoice</th><th>Who</th><th>For</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>{d.rows.map((r) => (
            <tr key={`${r.kind}${r.id}`}>
              <td className="w5">{r.ref}</td>
              <td><span className="w5">{r.who}</span><br /><span className="light muted">{r.what}</span></td>
              <td className="light">{r.item || "—"}</td>
              <td className="w5">{money2(r.amount)}</td>
              <td className="light">{r.state === "paid" && r.paid_at ? `Paid ${day(r.paid_at)}` : day(r.due)}</td>
              <td>{badge(r)}</td>
              <td style={{ textAlign: "right" }}>{r.state !== "paid" && <button className={`btn ${r.state === "claimed" ? "primary" : "stone"} small`} disabled={busy === `${r.kind}${r.id}`} onClick={() => paid(r)}>Mark paid</button>}</td>
            </tr>
          ))}</tbody></table></div>
      )}
      <p className="light muted" style={{ marginTop: 14 }}>Match the reference on your bank statement to the invoice, then mark it paid. "They say paid" means the customer pressed I've paid. Top-ups are added to the customer's balance when you mark them paid.</p>
      {pick && <SearchPicker title="Show" placeholder="Search" options={MONEY_VIEWS.map(([id, label]) => ({ id, label }))} value={[view]} onClose={() => setPick(false)} onChange={(v) => setView(String(v[0]))} />}
    </>
  );
}
