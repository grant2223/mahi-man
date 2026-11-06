import { useCallback, useEffect, useState } from "react";
import { api, avatarUrl, sb, type JobType } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money2 } from "../lib/format";
import { AuthScreen } from "../ui/Auth";
import { useToast } from "../ui/kit";

type Tab = "overview" | "jobs" | "problems" | "workers" | "types" | "settings";
const TABS: [Tab, string][] = [["overview", "Overview"], ["jobs", "Jobs"], ["problems", "Problems"], ["workers", "Workers"], ["types", "Job types and prices"], ["settings", "Settings"]];

const STATUS_BADGE: Record<string, string> = {
  awaiting_payment: "", searching: "y", accepted: "y", in_progress: "y", finished: "y", confirmed: "g", disputed: "r", cancelled: "", refunded: "r",
};

export function Admin() {
  const { session, profile, ready } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  if (!ready) return null;
  if (!session) return <div className="admin"><AuthScreen title="Admin sign in" reason="Sign in with your admin account." onBack={() => go("/")} onDone={() => {}} /></div>;
  if (!profile?.is_admin) return (
    <div className="admin"><div className="admin-head"><span className="wordmark">oddjobs.</span><h1 style={{ margin: "16px 0 0", fontWeight: 600 }}>Admins only</h1>
      <p className="light">This account isn't an admin. <button className="hero-link" onClick={() => sb.auth.signOut()}>Sign out</button></p></div></div>
  );
  return (
    <div className="admin">
      <div className="admin-head">
        <div className="row between">
          <span className="wordmark">oddjobs. <span className="light" style={{ fontSize: 16, letterSpacing: 0 }}>admin</span></span>
          <button className="hero-link" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
        <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>)}</div>
      </div>
      <div className="admin-body">
        {tab === "overview" && <Overview />}
        {tab === "jobs" && <Jobs />}
        {tab === "problems" && <Problems />}
        {tab === "workers" && <Workers />}
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
        <thead><tr><th>Booked</th><th>Job</th><th>Where</th><th>Customer</th><th>Worker</th><th>Total</th><th>Status</th></tr></thead>
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
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No jobs yet.</td></tr>}
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

function Workers() {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const load = useCallback(() => {
    sb.from("workers").select("*, profiles(full_name, photo_path), suburbs(name)").order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Record<string, unknown>[]));
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Photo</th><th>Name</th><th>Suburb</th><th>ABN</th><th>Checked by you</th><th>Insurance</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const w = r as { id: string; abn: string | null; payouts_ready: boolean; admin_approved: boolean; approved: boolean; suspended: boolean; online: boolean;
              insurance_path: string | null; insurance_expiry: string | null; profiles: { full_name: string; photo_path: string | null }; suburbs: { name: string } | null };
            return (
              <tr key={w.id}>
                <td>{w.profiles.photo_path ? <a href={avatarUrl(w.profiles.photo_path)!} target="_blank" rel="noreferrer"><img src={avatarUrl(w.profiles.photo_path)!} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, display: "block" }} /></a> : "—"}</td>
                <td>{w.profiles.full_name}</td>
                <td>{w.suburbs?.name ?? "—"}</td>
                <td>{w.abn ?? "—"}</td>
                <td><button className={w.admin_approved ? "btn stone small" : "btn primary small"} onClick={async () => {
                  try { await api("admin_approve_worker", { worker_id: w.id, approved: !w.admin_approved }); toast("Saved"); load(); } catch (e) { toast((e as Error).message); }
                }}>{w.admin_approved ? "Approved" : "Approve"}</button></td>
                <td>{w.insurance_path ? (
                  <button className="link" onClick={async () => { const { data } = await sb.storage.from("insurance").createSignedUrl(w.insurance_path!, 600); if (data) window.open(data.signedUrl); }}>
                    To {w.insurance_expiry ? new Date(w.insurance_expiry).toLocaleDateString("en-AU") : "?"}
                  </button>) : "—"}</td>
                <td>{w.suspended ? <span className="badge r">Paused</span> : w.approved ? <span className="badge g">{w.online ? "Online" : "Ready"}</span> : <span className="badge">Signing up</span>}</td>
                <td><button className="btn stone small" onClick={async () => {
                  const { error } = await sb.from("workers").update({ suspended: !w.suspended, online: false }).eq("id", w.id);
                  if (error) return toast(error.message);
                  toast("Saved"); load();
                }}>{w.suspended ? "Unpause" : "Pause"}</button></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No workers yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Types() {
  const toast = useToast();
  const [rows, setRows] = useState<JobType[]>([]);
  const [dirty, setDirty] = useState<Record<number, Partial<JobType>>>({});
  const load = useCallback(() => { sb.from("job_types").select("*").order("sort").then(({ data }) => { setRows((data ?? []) as JobType[]); setDirty({}); }); }, []);
  useEffect(() => { load(); }, [load]);
  const set = (id: number, p: Partial<JobType>) => setDirty((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const val = <K extends keyof JobType>(t: JobType, k: K): JobType[K] => (dirty[t.id]?.[k] ?? t[k]) as JobType[K];
  async function save() {
    for (const [id, p] of Object.entries(dirty)) {
      const { error } = await sb.from("job_types").update(p).eq("id", Number(id));
      if (error) return toast(error.message);
    }
    toast("Saved"); load();
  }
  async function add() {
    const { error } = await sb.from("job_types").insert({ name: "New job", price_cents: 5000, max_hours: 2, sort: rows.length + 1, active: false });
    if (error) return toast(error.message);
    load();
  }
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Job</th><th>Description</th><th>Worker gets ($)</th><th>Up to (hrs)</th><th>Needs insurance</th><th>Needs vehicle</th><th>Live</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><input value={val(t, "name")} onChange={(e) => set(t.id, { name: e.target.value })} style={{ minWidth: 180 }} /></td>
                <td><input value={val(t, "description")} onChange={(e) => set(t.id, { description: e.target.value })} style={{ minWidth: 240 }} /></td>
                <td><input inputMode="decimal" value={(val(t, "price_cents") / 100).toString()} onChange={(e) => set(t.id, { price_cents: Math.round(Number(e.target.value || 0) * 100) })} /></td>
                <td><input inputMode="decimal" value={String(val(t, "max_hours"))} onChange={(e) => set(t.id, { max_hours: Number(e.target.value || 0) })} /></td>
                <td><select value={val(t, "needs_insurance") ? "1" : "0"} onChange={(e) => set(t.id, { needs_insurance: e.target.value === "1" })}><option value="0">No</option><option value="1">Yes</option></select></td>
                <td><select value={val(t, "needs_vehicle") ? "1" : "0"} onChange={(e) => set(t.id, { needs_vehicle: e.target.value === "1" })}><option value="0">No</option><option value="1">Yes</option></select></td>
                <td><select value={val(t, "active") ? "1" : "0"} onChange={(e) => set(t.id, { active: e.target.value === "1" })}><option value="1">Live</option><option value="0">Hidden</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row between" style={{ marginTop: 16 }}>
        <button className="btn stone small" onClick={add}>Add a job type</button>
        <button className="btn primary" disabled={!Object.keys(dirty).length} onClick={save}>Save</button>
      </div>
      <p className="small muted">The customer pays this price plus your booking fee. Changes only apply to new bookings.</p>
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
    ["fee_percent", "Booking fee (% added to the job price)", "15"],
    ["callout_cents", "Late-cancel payment to worker (cents)", "1500"],
    ["auto_release_hours", "Auto-pay if customer doesn't confirm (hours)", "48"],
    ["widen_after_minutes", "Show to workers further away after (minutes)", "10"],
    ["stripe_publishable_key", "Stripe publishable key (starts pk_)", "pk_live_…"],
  ];
  const changed = F.some(([k]) => vals[k] !== orig[k]);
  return (
    <div style={{ maxWidth: 560 }} className="stack">
      {F.map(([k, l, ph]) => k === "pilot_mode" ? (
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
