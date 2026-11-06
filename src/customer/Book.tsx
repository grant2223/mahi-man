import { useEffect, useMemo, useState } from "react";
import { rpc, sb, type JobType, type Suburb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { hours, money2 } from "../lib/format";
import { Icon, Perf, Screen, SearchPicker } from "../ui/kit";
import { AuthScreen } from "../ui/Auth";
import { PayScreen } from "./Pay";

interface Draft { jobTypeId: number | null; suburbId: number | null; address: string; notes: string; asap: boolean; startAt: string }
const DRAFT_KEY = "oj-draft";
const blank: Draft = { jobTypeId: null, suburbId: null, address: "", notes: "", asap: true, startAt: "" };

export function Book() {
  const { session } = useSession();
  const [types, setTypes] = useState<JobType[]>([]);
  const [suburbs, setSuburbs] = useState<Suburb[]>([]);
  const [fee, setFee] = useState(15);
  const [d, setD] = useState<Draft>(() => { try { return { ...blank, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") }; } catch { return blank; } });
  const [open, setOpen] = useState<null | "job" | "where" | "when" | "auth">(null);
  const [payJob, setPayJob] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from("job_types").select("*").eq("active", true).order("sort").then(({ data }) => setTypes((data ?? []) as JobType[]));
    sb.from("suburbs").select("id,name").order("name").then(({ data }) => setSuburbs((data ?? []) as Suburb[]));
    sb.from("settings").select("value").eq("key", "fee_percent").single().then(({ data }) => data && setFee(Number(data.value)));
  }, []);
  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }, [d]);

  const jt = types.find((t) => t.id === d.jobTypeId) ?? null;
  const suburb = suburbs.find((s) => s.id === d.suburbId) ?? null;
  const feeCents = jt ? Math.round((jt.price_cents * fee) / 100) : 0;
  const total = jt ? jt.price_cents + feeCents : 0;
  const ready = !!jt && !!suburb && d.address.trim().length >= 3 && (d.asap || !!d.startAt);

  async function book() {
    setErr("");
    if (!ready) {
      setOpen(!jt ? "job" : !suburb || d.address.trim().length < 3 ? "where" : "when");
      return;
    }
    if (!session) { setOpen("auth"); return; }
    setBusy(true);
    try {
      const id = await rpc<string>("create_job", {
        p_job_type: d.jobTypeId, p_suburb: d.suburbId, p_address: d.address, p_notes: d.notes,
        p_asap: d.asap, p_start_at: d.asap ? new Date().toISOString() : new Date(d.startAt).toISOString(),
      });
      setPayJob(id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="app">
      <section className="hero">
        <span className="deco" aria-hidden="true">?</span>
        <div className="hero-top" style={{ position: "relative" }}>
          <button className="wordmark" onClick={() => go("/")}>oddjobs.</button>
          <span className="row" style={{ gap: 14 }}>
            {session && <a className="hero-link" href="/jobs" onClick={(e) => { e.preventDefault(); go("/jobs"); }}>My jobs</a>}
            <span className="row t15" style={{ gap: 6 }}>{Icon.pin("#fff")} Cairns</span>
          </span>
        </div>
        <h1 style={{ position: "relative" }}>Need a<br />hand?</h1>
        <p className="lede" style={{ position: "relative" }}>Locals nearby, one fixed price. Booked in a minute, done today.</p>
      </section>

      <div className="ticket">
        <div className="stack" style={{ padding: 14 }}>
          <button className="field" onClick={() => setOpen("job")}>
            <span className="row between" style={{ width: "100%" }}>
              <span className="stack" style={{ gap: 2 }}>
                <span className="k">The job</span>
                <span className={jt ? "v" : "v ph"}>{jt?.name ?? "What needs doing?"}</span>
              </span>
              {Icon.search()}
            </span>
          </button>
          <div className="grid2">
            <button className="field" onClick={() => setOpen("where")}>
              <span className="k">Where</span>
              <span className={d.address ? "v" : "v ph"} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.address || "Add address"}</span>
            </button>
            <button className="field" onClick={() => setOpen("when")}>
              <span className="k">When</span>
              <span className="v">{d.asap ? "Today, ASAP" : d.startAt ? new Date(d.startAt).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "Pick a time"}</span>
            </button>
          </div>
        </div>
        <Perf />
        <div style={{ padding: "10px 16px 18px" }} className="stack">
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <span className="stack" style={{ gap: 4 }}>
              <span className="small w5 em">{jt ? `Fixed price, up to ${hours(jt.max_hours)}` : "Fixed price"}</span>
              <span className="price">{jt ? money2(total) : "$—"}</span>
            </span>
            {jt && <span className="small light muted" style={{ textAlign: "right", lineHeight: 1.5 }}>Job {money2(jt.price_cents)}<br />Fee {money2(feeCents)}</span>}
          </div>
          <div className="row between" style={{ marginTop: 6 }}>
            <span className="small light muted" style={{ maxWidth: 150, lineHeight: 1.4 }}>Held until you confirm it's done.</span>
            <button className="btn primary" disabled={busy} onClick={book}>Book it {Icon.arrow("#fff")}</button>
          </div>
          {err && <p className="err">{err}</p>}
        </div>
      </div>

      <section className="grid3" style={{ margin: "auto 0 0", padding: "28px 20px calc(var(--safe-bottom) + 30px)" }}>
        {[["Book", "Pick the job, see the price"], ["Matched", "A local accepts in minutes"], ["Confirm", "Then they get paid"]].map(([t, s], i) => (
          <div key={t} className="stack" style={{ gap: 4 }}>
            <span className="em" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{i + 1}</span>
            <span className="t15 w5">{t}</span>
            <span className="small light muted" style={{ lineHeight: 1.4 }}>{s}</span>
          </div>
        ))}
      </section>

      {open === "job" && (
        <SearchPicker title="What needs doing?" placeholder="Search jobs" value={d.jobTypeId ? [d.jobTypeId] : []}
          options={types.map((t) => ({ id: t.id, label: t.name, hint: `${money2(t.price_cents + Math.round((t.price_cents * fee) / 100))} · up to ${hours(t.max_hours)} · ${t.description}` }))}
          onChange={(v) => setD({ ...d, jobTypeId: Number(v[0]) })} onClose={() => setOpen(null)} />
      )}
      {open === "where" && <WhereScreen suburbs={suburbs} draft={d} onSave={(p) => { setD({ ...d, ...p }); setOpen(null); }} onBack={() => setOpen(null)} />}
      {open === "when" && <WhenScreen draft={d} onSave={(p) => { setD({ ...d, ...p }); setOpen(null); }} onBack={() => setOpen(null)} />}
      {open === "auth" && (
        <AuthScreen title="Almost booked" reason="Create an account so your worker can find you and you can track the job." onBack={() => setOpen(null)}
          onDone={() => { setOpen(null); window.setTimeout(book, 300); }} />
      )}
      {payJob && <PayScreen jobId={payJob} amountLabel={money2(total)} onBack={() => setPayJob(null)}
        onPaid={() => { sessionStorage.removeItem(DRAFT_KEY); go(`/job/${payJob}`); }} />}
    </div>
  );
}

function WhereScreen({ suburbs, draft, onSave, onBack }: { suburbs: Suburb[]; draft: Draft; onSave: (p: Partial<Draft>) => void; onBack: () => void }) {
  const [suburbId, setSuburbId] = useState(draft.suburbId);
  const [address, setAddress] = useState(draft.address);
  const [notes, setNotes] = useState(draft.notes);
  const [pick, setPick] = useState(false);
  const name = useMemo(() => suburbs.find((s) => s.id === suburbId)?.name, [suburbs, suburbId]);
  return (
    <Screen title="Where" onBack={onBack}>
      <div className="screen-body" style={{ padding: "16px" }}>
        <div className="stack">
          <label className="field"><span className="k">Street address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="14 Lake St" autoComplete="street-address" /></label>
          <button className="field" onClick={() => setPick(true)}>
            <span className="row between" style={{ width: "100%" }}>
              <span className="stack" style={{ gap: 2 }}><span className="k">Suburb</span><span className={name ? "v" : "v ph"}>{name ?? "Pick your suburb"}</span></span>
              {Icon.search()}
            </span>
          </button>
          <label className="field"><span className="k">Anything they should know? (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, parking, pets, where the key is" /></label>
        </div>
        <p className="small light muted" style={{ lineHeight: 1.45 }}>Your street address is only shown to the worker once they take the job.</p>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn primary" disabled={!suburbId || address.trim().length < 3}
            onClick={() => onSave({ suburbId, address: address.trim(), notes: notes.trim() })}>Save</button>
        </div>
      </div>
      {pick && <SearchPicker title="Suburb" placeholder="Search Cairns suburbs" value={suburbId ? [suburbId] : []}
        options={suburbs.map((s) => ({ id: s.id, label: s.name }))} onChange={(v) => setSuburbId(Number(v[0]))} onClose={() => setPick(false)} />}
    </Screen>
  );
}

function WhenScreen({ draft, onSave, onBack }: { draft: Draft; onSave: (p: Partial<Draft>) => void; onBack: () => void }) {
  const [asap, setAsap] = useState(draft.asap);
  const [startAt, setStartAt] = useState(draft.startAt);
  const min = new Date(Date.now() + 60 * 60 * 1000);
  const max = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <Screen title="When" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <button className="opt" onClick={() => setAsap(true)}><span className="stack" style={{ gap: 2 }}><b>Today, as soon as possible</b><span className="small muted light">The first local free takes it</span></span>{asap && Icon.tick("var(--emerald)")}</button>
        <button className="opt" onClick={() => setAsap(false)}><span className="stack" style={{ gap: 2 }}><b>Pick a time</b><span className="small muted light">Up to 5 days ahead</span></span>{!asap && Icon.tick("var(--emerald)")}</button>
        {!asap && (
          <div style={{ padding: 16 }}>
            <label className="field"><span className="k">Date and time</span>
              <input type="datetime-local" value={startAt} min={local(min)} max={local(max)} onChange={(e) => setStartAt(e.target.value)} /></label>
          </div>
        )}
        <div className="row" style={{ justifyContent: "flex-end", padding: 16 }}>
          <button className="btn primary" disabled={!asap && !startAt} onClick={() => onSave({ asap, startAt: asap ? "" : startAt })}>Save</button>
        </div>
      </div>
    </Screen>
  );
}
