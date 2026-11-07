import { useCallback, useEffect, useState } from "react";
import { api, avatarUrl, brandUrl, rpc, sb, type Category, type JobType } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money2, shrinkImage } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { Logo, SearchPicker, useToast } from "../ui/kit";

type Tab = "overview" | "jobs" | "ids" | "reports" | "problems" | "people" | "types" | "settings";

const STATUS_BADGE: Record<string, string> = {
  awaiting_payment: "", searching: "y", accepted: "y", in_progress: "y", finished: "y", confirmed: "g", disputed: "r", cancelled: "", refunded: "r",
};

export function Admin() {
  const { session, profile, ready } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [counts, setCounts] = useState({ ids: 0, reports: 0, problems: 0 });
  const recount = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from("id_checks").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb.from("incidents").select("id", { count: "exact", head: true }).eq("resolved", false),
    ]);
    setCounts({ ids: a.count ?? 0, reports: b.count ?? 0, problems: c.count ?? 0 });
  }, []);
  useEffect(() => { if (profile?.is_admin) recount(); }, [profile?.is_admin, recount, tab]);
  const TABS: [Tab, string][] = [["overview", "Overview"], ["jobs", "Jobs"], ["ids", `ID checks${counts.ids ? `  ${counts.ids}` : ""}`],
    ["reports", `Reports${counts.reports ? `  ${counts.reports}` : ""}`], ["problems", `Disputes${counts.problems ? `  ${counts.problems}` : ""}`],
    ["people", "People"], ["types", "Job types"], ["settings", "Settings"]];
  if (!ready) return null;
  if (!session) return <div className="admin"><AuthScreen title="Admin sign in" reason="Sign in with your admin account." onBack={() => go("/")} onDone={() => {}} /></div>;
  if (!profile?.is_admin) return (
    <div className="admin"><div className="admin-head"><span className="brand"><Logo /> More Mahi Admin</span><h1 style={{ margin: "16px 0 0", fontWeight: 600 }}>Admins only</h1>
      <p className="light">This account isn't an admin. <button className="hero-link" onClick={() => sb.auth.signOut()}>Sign out</button></p></div></div>
  );
  return (
    <div className="admin">
      <div className="admin-head">
        <div className="row between">
          <span className="brand"><Logo /> More Mahi Admin</span>
          <button className="hero-link" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
        <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>)}</div>
      </div>
      <div className="admin-body">
        {tab === "overview" && <Overview />}
        {tab === "jobs" && <Jobs />}
        {tab === "ids" && <IdChecks onChanged={recount} />}
        {tab === "reports" && <Reports onChanged={recount} />}
        {tab === "problems" && <Problems />}
        {tab === "people" && <People />}
        {tab === "types" && <Types />}
        {tab === "settings" && <Settings />}
      </div>
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
        sb.from("jobs").select("fee_cents").eq("status", "confirmed").gte("confirmed_at", since),
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
            const j = r as { id: string; created_at: string; status: string; price_cents: number; fee_cents: number; extra_cents: number; address: string;
              job_types: { name: string }; suburbs: { name: string }; customer: { full_name: string } | null; worker: { profiles: { full_name: string } } | null };
            return (
              <tr key={j.id}>
                <td>{new Date(j.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                <td>{j.job_types.name}</td>
                <td>{j.address}, {j.suburbs.name}</td>
                <td>{j.customer?.full_name}</td>
                <td>{j.worker?.profiles.full_name ?? "—"}</td>
                <td>{money2(j.price_cents + j.fee_cents + j.extra_cents)}</td>
                <td><span className={`badge ${STATUS_BADGE[j.status]}`}>{j.status.replace("_", " ")}</span></td>
                <td>{["searching", "accepted", "awaiting_payment"].includes(j.status) && (
                  <button className="btn stone small" onClick={async () => {
                    if (!confirm("Remove this job? It will be cancelled for both sides.")) return;
                    try { await rpc("admin_cancel_job", { p_job: j.id }); load(); } catch (e) { alert((e as Error).message); }
                  }}>Remove</button>)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No jobs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Problems() {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const load = useCallback(() => {
    sb.from("incidents").select("*, reporter:profiles(full_name), jobs(id,status,price_cents,fee_cents,extra_cents,job_types(name))")
      .order("created_at", { ascending: false }).limit(100).then(({ data }) => setRows((data ?? []) as Record<string, unknown>[]));
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Type</th><th>From</th><th>Job</th><th>Details</th><th>Action</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const i = r as { id: string; created_at: string; kind: string; details: string; resolved: boolean; reporter: { full_name: string };
              jobs: { id: string; status: string; price_cents: number; fee_cents: number; extra_cents: number; job_types: { name: string } } | null };
            return (
              <tr key={i.id}>
                <td>{new Date(i.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                <td><span className={`badge ${i.kind === "emergency" ? "r" : "y"}`}>{i.kind}</span></td>
                <td>{i.reporter?.full_name}</td>
                <td>{i.jobs ? `${i.jobs.job_types.name} · ${i.jobs.status}` : "—"}</td>
                <td style={{ maxWidth: 320 }}>{i.details}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {i.resolved ? <span className="badge g">Resolved</span> : i.jobs?.status === "disputed" ? (
                    <span className="row" style={{ gap: 6 }}>
                      <button className="btn primary small" onClick={async () => { try { await api("admin_resolve", { job_id: i.jobs!.id, outcome: "pay" }); toast("Worker paid"); load(); } catch (e) { toast((e as Error).message); } }}>Pay worker</button>
                      <button className="btn stone small" onClick={async () => { try { await api("admin_resolve", { job_id: i.jobs!.id, outcome: "refund" }); toast("Customer refunded"); load(); } catch (e) { toast((e as Error).message); } }}>Refund</button>
                    </span>
                  ) : (
                    <button className="btn stone small" onClick={async () => { await sb.from("incidents").update({ resolved: true }).eq("id", i.id); toast("Saved"); load(); }}>Mark resolved</button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No problems reported.</td></tr>}
        </tbody>
      </table>
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

  if (!rows.length) return <div className="stat" style={{ maxWidth: 560 }}><b style={{ fontSize: 24 }}>Nothing waiting</b><span>New ID checks appear here, oldest first.</span></div>;
  return (
    <div className="row" style={{ alignItems: "stretch", gap: 20, flexWrap: "wrap" }}>
      <div style={{ width: 330, flexShrink: 0, background: "var(--card)", borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>
        <div className="row between" style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Waiting</span><span className="t15 muted">Oldest first</span>
        </div>
        {rows.map((r) => (
          <button key={r.id} className="li" style={r.id === sel ? { background: "var(--emerald-tint)" } : undefined} onClick={() => setSel(r.id)}>
            {r.profiles.photo_path ? <img src={avatarUrl(r.profiles.photo_path)!} alt="" style={{ width: 44, height: 44, borderRadius: 4, objectFit: "cover" }} /> : <span className="tile" style={{ width: 44, height: 44 }} />}
            <span className="t"><b style={{ fontSize: 16 }}>{r.profiles.full_name}</b><span>{r.profiles.is_worker ? "Worker" : "Customer"} · {r.doc_type} · {ago(r.created_at)}</span></span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="stack" style={{ flex: "999 1 560px", minWidth: 0, background: "var(--card)", borderRadius: 6, padding: "20px 22px", gap: 16 }}>
          <div className="row between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>{cur.profiles.full_name}</span>
              <span className="t15 light muted">{cur.profiles.is_worker ? "Worker" : "Customer"} · {cur.country} {cur.doc_type.toLowerCase()} · sent {ago(cur.created_at)}</span>
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
              <td>{r.jobs ? `${r.jobs.job_types.name} · ${r.jobs.status}` : "—"}</td>
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
  const load = useCallback(() => { rpc<Person[]>("admin_people").then(setRows).catch((e) => toast((e as Error).message)); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const shown = rows.filter((r) => `${r.full_name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <label className="search" style={{ margin: "0 0 12px", maxWidth: 420, background: "var(--card)" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
      </label>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Photo</th><th>Name</th><th>Email</th><th>Role</th><th>ID</th><th>ABN</th><th>Jobs</th><th>Joined</th><th>Action</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>{p.photo_path ? <img src={avatarUrl(p.photo_path)!} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, display: "block" }} /> : "—"}</td>
                <td>{p.full_name || "—"}</td>
                <td>{p.email}</td>
                <td>{p.is_worker ? (p.approved ? <span className="badge g">Worker, ready</span> : <span className="badge">Worker, signing up</span>) : "Customer"}</td>
                <td><span className={`badge ${ID_BADGE[p.id_status]?.[0] ?? ""}`}>{ID_BADGE[p.id_status]?.[1] ?? p.id_status}</span></td>
                <td>{p.abn ?? "—"}</td>
                <td>{p.jobs_posted} booked · {p.jobs_worked} worked</td>
                <td>{new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                <td><button className={p.suspended ? "btn primary small" : "btn stone small"} onClick={async () => {
                  try { await rpc("admin_set_suspended", { p_user: p.id, p_suspended: !p.suspended }); toast("Saved"); load(); } catch (e) { toast((e as Error).message); }
                }}>{p.suspended ? "Unpause" : "Pause"}</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="muted">No one yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
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
          <thead><tr><th>Photo</th><th>Name</th><th>Order</th><th>Live</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td><PhotoCell path={cval(c, "photo_path")} onPick={async (f) => { try { setC(c.id, { photo_path: await uploadBrand(f, `cat-${c.id}`) }); } catch (e) { toast((e as Error).message); } }} /></td>
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
          <thead><tr><th>Photo</th><th>Job</th><th>Category</th><th>Worker gets ($)</th><th>Up to (hrs)</th><th>Included (one per line)</th><th>Not included (one per line)</th><th>Needs</th><th>Live</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ verticalAlign: "top" }}>
                <td><PhotoCell path={val(t, "photo_path")} onPick={async (f) => { try { set(t.id, { photo_path: await uploadBrand(f, `type-${t.id}`) }); } catch (e) { toast((e as Error).message); } }} /></td>
                <td><input value={val(t, "name")} onChange={(e) => set(t.id, { name: e.target.value })} style={{ minWidth: 180 }} /></td>
                <td><select value={String(val(t, "category_id") ?? "")} onChange={(e) => set(t.id, { category_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                <td><input inputMode="decimal" value={(val(t, "price_cents") / 100).toString()} onChange={(e) => set(t.id, { price_cents: Math.round(Number(e.target.value || 0) * 100) })} style={{ width: 80 }} /></td>
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
  const F: [string, string, string][] = [
    ["pilot_mode", "Pilot mode", ""],
    ["customer_id_required", "Customer ID check", ""],
    ["fee_percent", "Booking fee (% added to the job price)", "15"],
    ["callout_cents", "Late-cancel payment to worker (cents)", "1500"],
    ["auto_release_hours", "Auto-pay if customer doesn't confirm (hours)", "48"],
    ["widen_after_minutes", "Show to workers further away after (minutes)", "10"],
    ["stripe_publishable_key", "Stripe publishable key (starts pk_)", "pk_live_…"],
  ];
  const changed = F.some(([k]) => vals[k] !== orig[k]);
  return (
    <div style={{ maxWidth: 560 }} className="stack">
      {F.map(([k, l, ph]) => k === "customer_id_required" ? (
        <label key={k} className="field" style={{ background: "var(--card)" }}><span className="k">{l}</span>
          <select value={vals[k] ?? "false"} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} style={{ border: 0, background: "transparent", fontSize: 18, fontWeight: 500, padding: 0 }}>
            <option value="false">Optional: customers are asked after their first booking</option>
            <option value="true">Required before a customer can book</option>
          </select></label>
      ) : k === "pilot_mode" ? (
        <label key={k} className="field" style={{ background: "var(--card)" }}><span className="k">{l}</span>
          <select value={vals[k] ?? "true"} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} style={{ border: 0, background: "transparent", fontSize: 18, fontWeight: 500, padding: 0 }}>
            <option value="true">On: no card, no fee, customers pay workers directly</option>
            <option value="false">Off: card held, 15% fee, paid out by Stripe</option>
          </select></label>
      ) : (
        <label key={k} className="field" style={{ background: "var(--card)" }}><span className="k">{l}</span>
          <input value={vals[k] ?? ""} placeholder={ph} onChange={(e) => setVals({ ...vals, [k]: e.target.value.trim() })} /></label>
      ))}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={!changed} onClick={async () => {
          if (vals.stripe_publishable_key && !vals.stripe_publishable_key.startsWith("pk_")) return toast("The publishable key starts with pk_");
          if (vals.pilot_mode === "false" && !vals.stripe_publishable_key) return toast("Add the Stripe publishable key before turning pilot mode off");
          for (const [k] of F) if (vals[k] !== orig[k]) {
            const { error } = await sb.from("settings").update({ value: vals[k] }).eq("key", k);
            if (error) return toast(error.message);
          }
          setOrig(vals); toast("Saved");
        }}>Save</button>
      </div>
    </div>
  );
}
