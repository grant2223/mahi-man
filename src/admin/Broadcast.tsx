import { useEffect, useMemo, useState } from "react";
import { avatarUrl, brandUrl, rpc, sb } from "../lib/supabase";
import { shrinkImage } from "../lib/format";
import { AGES, GENDERS, HEARD, NATIONALITIES } from "../lib/people";
import { Screen, SearchPicker, useToast, type Option } from "../ui/kit";
import { COMPARES, compareOf, CustomDates, Delta, fmt, PERIODS, rangeLabel, rangeOf, type CompareId, type PeriodId, type Range } from "./Users";

/* Broadcast: send an alert to a chosen group of people, see what it'll look like, then see what happened.
   Audience and channel counts come from the server, so what it says is who it reaches. */

type F = { people?: string; area?: number; suburbs?: number[]; skill?: number; booked?: string; last_in?: string; age?: string; gender?: string;
  nationality?: string; phone?: string; heard?: string; signed?: string; online?: boolean };
type Count = { total: number; offers_on: number; skipped: number; sendable: number; push: number; email: number; none: number };
type Saved = { audiences: { id: number; name: string; filters: F }[]; templates: { id: number; name: string; title: string; body: string; url: string | null }[] };
const OPENS: [string, string][] = [["/", "Get help: post a job"], ["/jobs", "My jobs"], ["/offers", "Local offers"], ["/plus", "Plus"], ["/gift", "Gift cards"], ["/payments", "Payments"], ["/work", "Work: go online"]];
const BOOKED: [string, string][] = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["never", "Never"]];
const LAST_IN: [string, string][] = [["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["not30", "Not in 30 days"]];
const SIGNED: [string, string][] = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]];
const PEOPLE: [string, string][] = [["everyone", "Everyone"], ["customers", "Customers"], ["workers", "Workers"]];
type Key = "people" | "area" | "suburbs" | "skill" | "booked" | "last_in" | "age" | "gender" | "nationality" | "phone" | "heard" | "signed" | "online";

export function BroadcastPage() {
  const [tab, setTab] = useState<"new" | "results">("new");
  return (
    <div className="ov">
      {tab === "new" ? <><div className="ov-top"><h1>Broadcast</h1></div><Tabs tab={tab} setTab={setTab} /><NewBroadcast onSent={() => setTab("results")} /></>
        : <Results tabs={<Tabs tab={tab} setTab={setTab} />} />}
    </div>
  );
}
function Tabs({ tab, setTab }: { tab: string; setTab: (t: "new" | "results") => void }) {
  return <div className="mu-tabs">{([["new", "New broadcast"], ["results", "Results"]] as const).map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>;
}

function NewBroadcast({ onSent }: { onSent: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<F>({ people: "everyone" });
  const [kind, setKind] = useState<"news" | "offer">("news");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [photo, setPhoto] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [skip, setSkip] = useState(true);
  const [hold, setHold] = useState(true);
  const [later, setLater] = useState<string | null>(null);
  const [count, setCount] = useState<Count | null>(null);
  const [areas, setAreas] = useState<{ id: number; name: string }[]>([]);
  const [suburbs, setSuburbs] = useState<{ id: number; name: string; area_id: number }[]>([]);
  const [skills, setSkills] = useState<{ id: number; name: string }[]>([]);
  const [saved, setSaved] = useState<Saved>({ audiences: [], templates: [] });
  const [pick, setPick] = useState<Key | "opens" | "audience" | "template" | "when" | null>(null);
  const [naming, setNaming] = useState<"audience" | "template" | null>(null);
  const [seeWho, setSeeWho] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadSaved = () => rpc<Saved>("admin_broadcast_saved").then((s) => s && setSaved(s)).catch(() => {});
  useEffect(() => {
    sb.from("areas").select("id,name").eq("active", true).order("sort").then(({ data }) => setAreas((data ?? []) as { id: number; name: string }[]));
    sb.from("suburbs").select("id,name,area_id").order("name").then(({ data }) => setSuburbs((data ?? []) as { id: number; name: string; area_id: number }[]));
    sb.from("skills").select("id,name").eq("kind", "skill").eq("active", true).order("name").then(({ data }) => setSkills((data ?? []) as { id: number; name: string }[]));
    loadSaved();
  }, []);
  // The live count, a moment after each change.
  useEffect(() => {
    const t = window.setTimeout(() => rpc<Count>("admin_broadcast_count", { p_filters: f, p_kind: kind, p_skip_recent: skip, p_email: email }).then(setCount).catch((e) => toast((e as Error).message)), 300);
    return () => window.clearTimeout(t);
  }, [f, kind, skip, email, toast]);

  const name = (k: Key): string => {
    const v = f[k as keyof F];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return k === "people" ? "Everyone" : "Any";
    switch (k) {
      case "people": return PEOPLE.find(([x]) => x === v)?.[1] ?? "Everyone";
      case "area": return areas.find((a) => a.id === v)?.name ?? "Any";
      case "suburbs": return (v as number[]).length === 1 ? suburbs.find((s) => s.id === (v as number[])[0])?.name ?? "1 picked" : `${(v as number[]).length} picked`;
      case "skill": return skills.find((s) => s.id === v)?.name ?? "Any";
      case "booked": return BOOKED.find(([x]) => x === v)?.[1] ?? "Any";
      case "last_in": return LAST_IN.find(([x]) => x === v)?.[1] ?? "Any";
      case "signed": return SIGNED.find(([x]) => x === v)?.[1] ?? "Any";
      case "gender": return GENDERS.find(([x]) => x === v)?.[1] ?? "Any";
      case "phone": return v === "ios" ? "iPhone" : "Android";
      case "online": return "Online now";
      default: return String(v);
    }
  };
  const audience = useMemo(() => {
    const parts = [name("people")];
    (["area", "suburbs", "skill", "booked", "last_in", "age", "gender", "nationality", "phone", "heard", "signed", "online"] as Key[]).forEach((k) => {
      const v = f[k as keyof F]; if (v != null && v !== "" && !(Array.isArray(v) && !v.length) && v !== false) parts.push(k === "booked" ? `Booked ${name(k).toLowerCase()}` : k === "last_in" ? `In the app ${name(k).toLowerCase()}` : k === "signed" ? `Signed up ${name(k).toLowerCase()}` : name(k));
    });
    if (kind === "offer") parts.push("Offers on");
    return parts.join(" · ");
  }, [f, kind, areas, suburbs, skills]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = (k: Key): Option[] => {
    const any: Option = { id: "", label: "Any" };
    switch (k) {
      case "people": return PEOPLE.map(([id, label]) => ({ id, label }));
      case "area": return [any, ...areas.map((a) => ({ id: a.id, label: a.name }))];
      case "suburbs": return suburbs.filter((s) => !f.area || s.area_id === f.area).map((s) => ({ id: s.id, label: s.name }));
      case "skill": return [any, ...skills.map((s) => ({ id: s.id, label: s.name }))];
      case "booked": return [any, ...BOOKED.map(([id, label]) => ({ id, label }))];
      case "last_in": return [any, ...LAST_IN.map(([id, label]) => ({ id, label }))];
      case "signed": return [any, ...SIGNED.map(([id, label]) => ({ id, label }))];
      case "age": return [any, ...AGES.map((a) => ({ id: a, label: a }))];
      case "gender": return [any, ...GENDERS.map(([id, label]) => ({ id, label }))];
      case "nationality": return [any, ...NATIONALITIES.map((n) => ({ id: n, label: n }))];
      case "phone": return [any, { id: "ios", label: "iPhone" }, { id: "android", label: "Android" }];
      case "heard": return [any, ...HEARD.map((h) => ({ id: h, label: h }))];
      case "online": return [{ id: "", label: "Any" }, { id: "yes", label: "Online now", hint: "Workers who are online right now" }];
    }
  };
  const setKey = (k: Key, v: (string | number)[]) => {
    const x = v[0];
    const next: F = { ...f };
    if (k === "suburbs") next.suburbs = v.map(Number);
    else if (k === "online") next.online = x === "yes" ? true : undefined;
    else if (k === "area" || k === "skill") (next as Record<string, unknown>)[k] = x === "" ? undefined : Number(x);
    else (next as Record<string, unknown>)[k] = x === "" ? undefined : String(x);
    if (k === "area") next.suburbs = [];
    if (k === "people" && x !== "workers") next.online = undefined;
    setF(next);
  };
  const fields: [Key, string][] = [["people", "People"], ["area", "City"], ["suburbs", "Suburbs"], ["skill", f.people === "workers" ? "Skill" : "Skill booked"],
    ["booked", f.people === "workers" ? "Worked a job" : "Booked a job"], ["last_in", "Last in the app"], ["age", "Age"], ["gender", "Gender"],
    ["nationality", "Nationality"], ["phone", "Phone"], ["heard", "Heard about us"], f.people === "workers" ? ["online", "Online"] : ["signed", "Signed up"]];

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await shrinkImage(file, 1200);
      const path = `broadcasts/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("brand").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setPhoto(brandUrl(path));
    } catch (e) { toast((e as Error).message); }
  };
  const sendAt = later ? new Date(`${later}:00+10:00`) : null;
  const n = count?.sendable ?? 0;
  const ready = title.trim().length >= 3 && body.trim().length >= 3 && n > 0 && (!sendAt || sendAt.getTime() > Date.now());
  const send = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ held: boolean; reached: number; send_at: string }>("admin_broadcast_send", { p_title: title, p_body: body, p_url: url, p_photo: photo, p_kind: kind,
        p_filters: f, p_audience: audience, p_email: email, p_skip_recent: skip, p_hold_night: hold, p_send_at: sendAt?.toISOString() ?? null });
      const when = new Date(r.send_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      toast(r.reached ? `Sent to ${r.reached} ${r.reached === 1 ? "person" : "people"}` : `Scheduled for ${when}${r.held ? ", after the overnight hold" : ""}`);
      setConfirm(false); onSent();
    } catch (e) { toast((e as Error).message); setBusy(false); }
  };
  const test = async () => {
    try { await rpc("admin_broadcast_test", { p_title: title, p_body: body, p_url: url, p_photo: photo }); toast("Sent to you. Check your phone."); } catch (e) { toast((e as Error).message); }
  };
  const tpl = saved.templates;
  const whenLabel = sendAt ? sendAt.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Now";

  return (
    <div className="mb-grid">
      <div className="mb-form">
        <section className="mb-step">
          <div className="row between"><h2>Who gets it</h2><button className="link" onClick={() => setNaming("audience")}>Save this audience</button></div>
          {saved.audiences.length > 0 && <button className="field sel mb-saved" onClick={() => setPick("audience")}><span className="k">Start from a saved audience</span><span className="v">Pick one</span></button>}
          <div className="mb-fields">
            {fields.map(([k, l]) => <button key={k} className="field sel" onClick={() => setPick(k)}><span className="k">{l}</span><span className="v">{name(k)}</span></button>)}
          </div>
          <div className="mb-reach">
            <b>{count ? `${fmt(count.sendable)} ${count.sendable === 1 ? "person" : "people"}` : "…"}</b>
            <span>{count ? [`${count.push} get an alert on their phone`, email && count.email ? `${count.email} by email only` : "", !email && count.none ? `${count.none} only see it in the app` : "", count.skipped ? `${count.skipped} skipped` : ""].filter(Boolean).join(" · ") : "Counting"}</span>
            {!!count?.sendable && <button className="link" onClick={() => setSeeWho(true)}>See who</button>}
          </div>
        </section>

        <section className="mb-step">
          <h2>What kind</h2>
          <div className="mb-kind">
            <button className={kind === "news" ? "on" : ""} onClick={() => setKind("news")}><b>News or an update</b><span>Goes to everyone you picked</span></button>
            <button className={kind === "offer" ? "on" : ""} onClick={() => setKind("offer")}><b>An offer or promotion</b><span>Only people who turned on offers{count ? `: ${count.offers_on} of ${count.total}` : ""}</span></button>
          </div>
        </section>

        <section className="mb-step">
          <div className="row between"><h2>The message</h2><button className="link" disabled={!title.trim() || !body.trim()} onClick={() => setNaming("template")}>Save as a template</button></div>
          {tpl.length > 0 && <button className="field sel" onClick={() => setPick("template")}><span className="k">Start from a template</span><span className="v">Pick one</span></button>}
          <label className="field"><span className="k">Title · {title.length} of 50</span><input value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} placeholder="Rain's cleared. Lawns booked today" /></label>
          <label className="field mb-body"><span className="k">Message · {body.length} of 150</span><textarea value={body} maxLength={150} onChange={(e) => setBody(e.target.value)} placeholder="Book a mow by 9am and a local worker will have it done this afternoon." /></label>
          <div className="mb-fields two">
            <button className="field sel" onClick={() => setPick("opens")}><span className="k">Tapping it opens</span><span className="v">{OPENS.find(([u]) => u === url)?.[1]}</span></button>
            <label className="field mb-photo"><span className="k">Photo, if you want one</span><span className="v">{photo ? "Change photo" : "Add a photo"}</span>
              <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} /></label>
          </div>
        </section>

        <section className="mb-step">
          <h2>Sending</h2>
          <div className="mb-sw"><span><b>Also email people without phone alerts</b><span>{count ? `${count.email || count.none} people` : ""}</span></span><button className={email ? "switch on mb-switch" : "switch mb-switch"} onClick={() => setEmail(!email)} aria-pressed={email} /></div>
          <div className="mb-sw"><span><b>Skip anyone sent a broadcast in the last 3 days</b><span>{count?.skipped ? `${count.skipped} skipped, so no one is flooded` : "So no one is flooded"}</span></span><button className={skip ? "switch on mb-switch" : "switch mb-switch"} onClick={() => setSkip(!skip)} aria-pressed={skip} /></div>
          <div className="mb-sw"><span><b>Hold overnight sends until 8am</b><span>Nothing lands between 9pm and 8am Cairns time</span></span><button className={hold ? "switch on mb-switch" : "switch mb-switch"} onClick={() => setHold(!hold)} aria-pressed={hold} /></div>
          <div className="mb-when">
            <button className="field sel" onClick={() => setPick("when")}><span className="k">Send</span><span className="v">{whenLabel}</span></button>
            <span style={{ flex: 1 }} />
            <button className="btn stone" disabled={!title.trim() || !body.trim()} onClick={test}>Send a test to me</button>
            <button className="btn primary" disabled={!ready} onClick={() => setConfirm(true)}>{sendAt ? `Schedule for ${fmt(n)}` : `Send to ${fmt(n)} ${n === 1 ? "person" : "people"}`}</button>
          </div>
        </section>
      </div>

      <aside className="mb-preview">
        <span className="mb-pl">What they'll see</span>
        <div className="mb-phone">
          <span className="mb-time">9:41</span>
          <div className="mb-push">
            <img src="/icon-192.png" alt="" />
            <span className="t"><span className="row between"><b>Mahi Man</b><small>now</small></span>
              <b className="h">{title || "Your title"}</b><span>{body || "Your message shows here."}</span></span>
          </div>
        </div>
        <span className="mb-pl">In their Alerts</span>
        <div className="mb-alert">
          {photo ? <img className="mb-img" src={photo} alt="" /> : <img className="mb-img mm" src="/mahi-head.png" alt="" />}
          <span className="t"><b>{title || "Your title"}</b><span>{body || "Your message shows here."}</span></span>
          <small>Now</small>
        </div>
      </aside>

      {pick && pick !== "opens" && pick !== "audience" && pick !== "template" && pick !== "when" && (
        <SearchPicker title={fields.find(([k]) => k === pick)?.[1] ?? ""} placeholder="Search" multi={pick === "suburbs"}
          value={pick === "suburbs" ? f.suburbs ?? [] : pick === "online" ? [f.online ? "yes" : ""] : [((f as Record<string, unknown>)[pick] as string | number | undefined) ?? (pick === "people" ? "everyone" : "")]}
          options={opts(pick)} onClose={() => setPick(null)} onChange={(v) => setKey(pick, v)} />
      )}
      {pick === "opens" && <SearchPicker title="Tapping it opens" placeholder="Search" value={[url]} options={OPENS.map(([id, label]) => ({ id, label }))} onClose={() => setPick(null)} onChange={(v) => setUrl(String(v[0]))} />}
      {pick === "audience" && <SearchPicker title="Saved audiences" placeholder="Search" value={[]}
        options={saved.audiences.map((a) => ({ id: a.id, label: a.name }))} onClose={() => setPick(null)}
        onChange={(v) => { const a = saved.audiences.find((x) => x.id === v[0]); if (a) setF(a.filters); }} />}
      {pick === "template" && <SearchPicker title="Templates" placeholder="Search" value={[]}
        options={tpl.map((t) => ({ id: t.id, label: t.name, hint: t.title }))} onClose={() => setPick(null)}
        onChange={(v) => { const t = tpl.find((x) => x.id === v[0]); if (t) { setTitle(t.title); setBody(t.body); setUrl(t.url ?? "/"); } }} />}
      {pick === "when" && <WhenScreen value={later} onClose={() => setPick(null)} onSave={(v) => { setLater(v); setPick(null); }} />}
      {naming && <NameScreen what={naming} onClose={() => setNaming(null)} onSave={async (nm) => {
        try {
          if (naming === "audience") await rpc("admin_broadcast_save_audience", { p_name: nm, p_filters: f });
          else await rpc("admin_broadcast_save_template", { p_name: nm, p_title: title, p_body: body, p_url: url });
          toast("Saved"); setNaming(null); loadSaved();
        } catch (e) { toast((e as Error).message); }
      }} />}
      {seeWho && <SeeWho filters={f} onClose={() => setSeeWho(false)} />}
      {confirm && (
        <Screen title={sendAt ? "Schedule this broadcast" : "Send this broadcast"} onBack={() => setConfirm(false)}>
          <div className="screen-body" style={{ padding: "24px 16px" }}>
            <p className="t17 light" style={{ margin: "0 0 6px" }}>{sendAt ? `On ${whenLabel}` : "Right now"}, to</p>
            <p className="mb-big">{fmt(n)} {n === 1 ? "person" : "people"}</p>
            <p className="t15 light muted" style={{ margin: "0 0 24px" }}>{audience}</p>
            <p className="t17" style={{ margin: "0 0 4px" }}><b className="w5">{title}</b></p>
            <p className="t15 light" style={{ margin: "0 0 28px" }}>{body}</p>
            <p className="t14 muted" style={{ margin: "0 0 18px" }}>{sendAt ? "You can cancel it under Results until it goes out." : "Once it's sent it can't be taken back."}</p>
            <button className="btn primary" disabled={busy} onClick={send}>{busy ? "Sending…" : sendAt ? "Schedule it" : `Send to ${fmt(n)} ${n === 1 ? "person" : "people"}`}</button>
          </div>
        </Screen>
      )}
    </div>
  );
}

function WhenScreen({ value, onClose, onSave }: { value: string | null; onClose: () => void; onSave: (v: string | null) => void }) {
  const soon = new Date(Date.now() + 10 * 3600000 + 3600000).toISOString().slice(0, 16);
  const [v, setV] = useState(value ?? soon);
  return (
    <Screen title="When to send" onBack={onClose}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        <div className="stack">
          <button className="opt" onClick={() => onSave(null)}><span className="stack" style={{ gap: 2 }}><b>Now</b><span className="small muted light">As soon as you press send</span></span></button>
          <label className="field"><span className="k">Or a time, Cairns time</span><input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} /></label>
          <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={!v} onClick={() => onSave(v)}>Use this time</button>
        </div>
      </div>
    </Screen>
  );
}
function NameScreen({ what, onClose, onSave }: { what: "audience" | "template"; onClose: () => void; onSave: (n: string) => void }) {
  const [n, setN] = useState("");
  return (
    <Screen title={what === "audience" ? "Save this audience" : "Save as a template"} onBack={onClose} right={<button className="btn primary small" disabled={n.trim().length < 2} onClick={() => onSave(n)}>Save</button>}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        <label className="field"><span className="k">Name</span><input autoFocus value={n} onChange={(e) => setN(e.target.value)} placeholder={what === "audience" ? "Lawn customers, northern beaches" : "Weather's cleared, book today"} /></label>
      </div>
    </Screen>
  );
}
function SeeWho({ filters, onClose }: { filters: F; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; full_name: string; email: string; photo_path: string | null; is_worker: boolean }[] | null>(null);
  useEffect(() => { rpc<typeof rows>("admin_broadcast_people", { p_filters: filters }).then(setRows).catch(() => setRows([])); }, [filters]);
  return (
    <Screen title={rows ? `${rows.length}${rows.length === 500 ? "+" : ""} people` : "Who"} onBack={onClose}>
      <div className="screen-body">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="mb-who">
            {r.photo_path ? <img className="u-pic" src={avatarUrl(r.photo_path)!} alt="" /> : <span className="u-pic none">{(r.full_name || r.email).slice(0, 1).toUpperCase()}</span>}
            <span className="stack" style={{ gap: 1, flex: 1 }}><span className="w5">{r.full_name || "No name yet"}</span><span className="small muted light">{r.email}</span></span>
            <span className={r.is_worker ? "badge g" : "badge"}>{r.is_worker ? "Worker" : "Customer"}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ---------- Results ----------
type Tot = { sent: number; scheduled: number; reached: number; by_push: number; by_email: number; opened: number; jobs: number; gmv: number };
type BRow = { id: number; title: string; body: string; audience: string; kind: string; status: string; at: string; reached: number; opened: number; jobs: number; gmv: number; went_online: number; workers: boolean };
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dollars = (c: number) => "$" + Math.round(c / 100).toLocaleString("en-AU");

function Results({ tabs }: { tabs: React.ReactNode }) {
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [custom, setCustom] = useState<Range | undefined>();
  const [cmpId, setCmpId] = useState<CompareId>("prev");
  const [pick, setPick] = useState<"period" | "compare" | "dates" | null>(null);
  const range = useMemo(() => rangeOf(period, custom), [period, custom]);
  const cmp = useMemo(() => compareOf(period, range, cmpId), [period, range, cmpId]);
  const [d, setD] = useState<{ cur: Tot; cmp: Tot | null; rows: BRow[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = () => rpc<typeof d>("admin_broadcast_results", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_cfrom: cmp?.from.toISOString() ?? null, p_cto: cmp?.to.toISOString() ?? null })
    .then(setD).catch((e) => toast((e as Error).message));
  useEffect(() => { setD(null); load(); }, [range, cmp]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = d?.cur, p = cmp ? d?.cmp ?? null : undefined;
  const pct = (t?: Tot | null) => (t && t.reached ? Math.round((t.opened / t.reached) * 100) : null);
  const pLabel = period === "custom" ? "Custom dates" : PERIODS.find(([k]) => k === period)![1];
  return (
    <>
      <div className="ov-top"><h1>Broadcast</h1>
        <div className="mu-when">
          <button className="mu-drop" onClick={() => setPick("period")}><span className="k">Showing</span><span className="v">{pLabel} · {rangeLabel(range)}</span></button>
          <button className="mu-drop" onClick={() => setPick("compare")} disabled={period === "all"}><span className="k">Compared to</span><span className="v">{cmp ? `${COMPARES.find(([k]) => k === cmpId)![1]} · ${rangeLabel(cmp)}` : "Nothing"}</span></button>
        </div>
      </div>
      {tabs}
      <section className="ov-sec ov-first">
        <div className="ov-h"><h2>{pLabel}</h2><span>{cmp ? `Compared to ${COMPARES.find(([k]) => k === cmpId)![1].toLowerCase()}` : ""}</span></div>
        <div className="mu-kpis">
          <div className="mu-kpi"><span className="t">Broadcasts sent</span><b>{fmt(c?.sent ?? 0)}</b>{p !== undefined && <Delta cur={c?.sent ?? 0} prev={p?.sent ?? 0} />}<small>{c?.scheduled ? `${c.scheduled} scheduled` : "None scheduled"}</small></div>
          <div className="mu-kpi"><span className="t">People reached</span><b>{fmt(c?.reached ?? 0)}</b>{p !== undefined && <Delta cur={c?.reached ?? 0} prev={p?.reached ?? 0} />}<small>{fmt(c?.by_push ?? 0)} by phone · {fmt(c?.by_email ?? 0)} by email</small></div>
          <div className="mu-kpi"><span className="t">Opened</span><b>{pct(c) == null ? "—" : `${pct(c)}%`}</b>{p !== undefined && <Delta cur={pct(c)} prev={pct(p)} pct />}<small>Tapped the alert on their phone or in the app</small></div>
          <div className="mu-kpi"><span className="t">Jobs booked after</span><b>{fmt(c?.jobs ?? 0)}</b>{p !== undefined && <Delta cur={c?.jobs ?? 0} prev={p?.jobs ?? 0} />}<small>Within 2 days · {dollars(c?.gmv ?? 0)} through Mahi Man</small></div>
        </div>
      </section>
      <section className="ov-sec">
        <div className="ov-h"><h2>Each broadcast</h2><span>Tap one for who opened it</span></div>
        <div className="table-wrap">
          <table className="rows">
            <thead><tr><th>When</th><th>Message</th><th>Who</th><th>Reached</th><th>Opened</th><th>What happened after</th><th /></tr></thead>
            <tbody>
              {(d?.rows ?? []).map((r) => (
                <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                  <td className="light">{when(r.at)}</td><td className="w5">{r.title}</td><td className="light">{r.audience}</td>
                  <td className="light">{r.status === "sent" ? fmt(r.reached) : "—"}</td>
                  <td className="light">{r.status === "sent" && r.reached ? `${Math.round((r.opened / r.reached) * 100)}%` : "—"}</td>
                  <td className="light">{r.status !== "sent" ? "—" : r.workers ? `${r.went_online} went online` : `${r.jobs} ${r.jobs === 1 ? "job" : "jobs"} · ${dollars(r.gmv)}`}</td>
                  <td><span className={r.status === "sent" ? "badge g" : r.status === "scheduled" ? "badge y" : "badge"}>{r.status === "sent" ? "Sent" : r.status === "scheduled" ? "Scheduled" : "Sending"}</span></td>
                </tr>
              ))}
              {d && !d.rows.length && <tr><td colSpan={7} className="muted">No broadcasts in this period.</td></tr>}
              {!d && <tr><td colSpan={7} className="muted">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {pick === "period" && <SearchPicker title="Showing" placeholder="Search" value={[period]}
        options={[...PERIODS.map(([id, label]) => ({ id, label, hint: rangeLabel(rangeOf(id)) })), { id: "custom", label: "Custom dates", hint: "Pick a start and end", action: () => setPick("dates") }]}
        onClose={() => setPick(null)} onChange={(v) => setPeriod(v[0] as PeriodId)} />}
      {pick === "compare" && <SearchPicker title="Compared to" placeholder="Search" value={[cmpId]}
        options={COMPARES.map(([id, label]) => { const x = compareOf(period, range, id); return { id, label, hint: x ? rangeLabel(x) : undefined }; })}
        onClose={() => setPick(null)} onChange={(v) => setCmpId(v[0] as CompareId)} />}
      {pick === "dates" && <CustomDates start={custom ?? range} onClose={() => setPick(null)} onSave={(r) => { setCustom(r); setPeriod("custom"); setPick(null); }} />}
      {open != null && <BroadcastDetail id={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </>
  );
}

type Detail = { b: { id: number; title: string; body: string; audience: string; status: string; send_at: string; sent_at: string | null; reached: number; by_push: number; by_email: number; photo: string | null };
  people: { id: string; name: string; photo: string | null; channel: string; opened_at: string | null }[] };
function BroadcastDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => { rpc<Detail>("admin_broadcast_detail", { p_id: id }).then(setD).catch((e) => toast((e as Error).message)); }, [id, toast]);
  const opened = d?.people.filter((x) => x.opened_at).length ?? 0;
  return (
    <Screen title={d?.b.title ?? "Broadcast"} onBack={onClose}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        {d && <>
          <p className="t15 light" style={{ margin: "0 0 6px" }}>{d.b.body}</p>
          <p className="t14 muted" style={{ margin: "0 0 18px" }}>{d.b.audience} · {d.b.status === "sent" ? `Sent ${when(d.b.sent_at!)}` : `Goes out ${when(d.b.send_at)}`}</p>
          {d.b.status === "scheduled" && <button className="btn stone" style={{ marginBottom: 20 }} onClick={async () => {
            try { await rpc("admin_broadcast_cancel", { p_id: id }); toast("Cancelled. It won't go out."); onChanged(); } catch (e) { toast((e as Error).message); }
          }}>Cancel it</button>}
          {d.b.status === "sent" && <p className="t17" style={{ margin: "0 0 14px" }}><b className="w5">{opened} of {d.b.reached}</b> <span className="light">opened it</span></p>}
          {d.people.map((x) => (
            <div key={x.id} className="mb-who">
              {x.photo ? <img className="u-pic" src={avatarUrl(x.photo)!} alt="" /> : <span className="u-pic none">{(x.name || "?").slice(0, 1).toUpperCase()}</span>}
              <span className="stack" style={{ gap: 1, flex: 1 }}><span className="w5">{x.name || "No name yet"}</span><span className="small muted light">{x.channel === "push" ? "Phone alert" : x.channel === "email" ? "Email" : "In the app"}</span></span>
              <span className={x.opened_at ? "badge g" : "badge"}>{x.opened_at ? "Opened" : "Not opened"}</span>
            </div>
          ))}
        </>}
      </div>
    </Screen>
  );
}
