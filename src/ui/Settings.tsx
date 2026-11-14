import { ProfileScreen } from "./Profile";
import { GENDERS, showPhone } from "../lib/people";
import { Capacitor } from "@capacitor/core";
import { createPortal } from "react-dom";
import { Reliability } from "../worker/Reliability";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, mediaUrls, rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money, shrinkImage } from "../lib/format";
import { Icon, Screen, SearchPicker, StepHero, Tile, useToast } from "./kit";
import { VerifyFlow } from "./Verify";
import { AbnStep } from "../worker/Signup";
import { Credentials, JobsAndSkills } from "../worker/Skills";
import { PaymentMethods, cardLabel } from "../customer/Cards";
import { alertsState, pushSupported, signOut, turnOnAlerts } from "../lib/push";
import { isSoon, useArea } from "../lib/area";
import { TabBar } from "./TabBar";

/* The You page. Each band shows how things stand right now (money, jobs, work), and tapping it opens the detail.
   Account details, area, alerts, card and blocked people live on their own Account page. */

type Prefs = { jobs: boolean; messages: boolean; offers: boolean };
interface HubJob { id: string; title: string; status: string; worker: string | null; keen: number; cover: string | null; on_way: boolean; arrived: boolean; total: number }
interface Hub {
  balance: number; gift_balance: number; jobs_total: number; jobs: HubJob[]; prefs: Prefs | null;
  worker: null | {
    turns_up: number | null; done: number; total: number; last: ("ok" | "late" | "miss")[];
    payday: { on: string | null; cents: number | null } | null;
    skills: { n: number; names: string | null } | null;
    licences: { n: number; pending: number; next: { name: string; expiry: string } | null } | null;
  };
}
type Sub = null | "account" | "verify" | "payid" | "skills" | "creds" | "cards" | "reliability";

const S = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.9 };
const ic = (d: ReactNode, c = "var(--emerald)", z = 22) => <svg width={z} height={z} viewBox="0 0 24 24" {...S} stroke={c}>{d}</svg>;
const I = {
  card: () => ic(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>),
  tool: () => ic(<path d="M14.5 5.5a4 4 0 0 0 4.9 5L20 11l-9 9-3-3 9-9 .5.6a4 4 0 0 0-3-5.1z" />),
  cert: () => ic(<><rect x="4" y="3" width="16" height="13" rx="1" /><path d="M8 8h8M8 11h5M10 16l-1 5 3-2 3 2-1-5" /></>),
  plus: () => ic(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  gift: () => ic(<><rect x="3" y="8" width="18" height="13" rx="1" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" /></>),
  ticket: () => ic(<><path d="M3 8V6h18v2a2 2 0 0 0 0 4 2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4 2 2 0 0 0 0-4z" /><path d="M13 6v12" strokeDasharray="2 2" /></>),
  help: () => ic(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></>),
  doc: () => ic(<><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
};
// The chat-bubble mark used beside a number that's on WhatsApp.
export const waMark = (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#1a9c4a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M4 20l1.4-4A8 8 0 1 1 8 18.6z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z" fill="#1a9c4a" stroke="none" /></svg>;

const dayShort = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const monthYear = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-AU", { month: "short", year: "numeric" });

function jobLine(j: HubJob): string {
  const w = j.worker ?? "Your worker";
  switch (j.status) {
    case "searching": return j.keen ? `${j.keen} keen, pick one` : "Finding someone";
    case "accepted": return j.on_way ? `${w} is on the way` : `${w} is booked`;
    case "in_progress": return `${w} is there now`;
    case "finished": return "Done, check and confirm";
    case "confirmed": return `Done · ${money(j.total)}`;
    case "disputed": return "Being sorted";
    case "refunded": return "Refunded";
    default: return "";
  }
}

export function Settings() {
  const { session, profile, reload, ready } = useSession();
  const toast = useToast();
  const [hub, setHub] = useState<Hub | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [sub, setSub] = useState<Sub>(null);
  const [q, setQ] = useState("");

  const load = () => rpc<Hub>("my_hub").then((h) => {
    setHub(h);
    mediaUrls(h.jobs.map((j) => j.cover).filter(Boolean) as string[]).then(setCovers).catch(() => {});
  }).catch(() => {});
  useEffect(() => { if (session) load(); }, [session]);

  if (ready && !session) { go("/", true); return null; }
  if (!session || !profile) return <div className="app"><StepHero title="You" /></div>;
  const worker = !!profile.is_worker;
  const idLabel = { none: "Not verified", pending: "ID being checked", verified: "ID verified", retake: "ID retake needed", rejected: "ID not approved" }[profile.id_status];

  // Everything on this page and the Account page, so search finds it.
  const items: { label: string; hint: string; act: () => void; worker?: boolean }[] = [
    { label: "Account", hint: "Your profile, mobile, email, photo", act: () => setSub("account") },
    { label: "Verify your ID", hint: idLabel, act: () => setSub(profile.id_status === "verified" ? "account" : "verify") },
    { label: "Your area", hint: "Where you use Mahi Man", act: () => setSub("account") },
    { label: "Alerts", hint: "New jobs, messages and local offers", act: () => setSub("account") },
    { label: "Payment card", hint: "Card for top-ups and fees", act: () => setSub("cards") },
    { label: "Blocked people", hint: "People you've blocked", act: () => setSub("account") },
    { label: "Sign out", hint: "On the Account page", act: () => setSub("account") },
    { label: "Balance and history", hint: "Payments, invoices and receipts", act: () => go("/payments") },
    { label: "Top up", hint: "Add to your balance", act: () => go("/topup") },
    { label: "Mahi Man Plus", hint: "Lower fees, urgent jobs free", act: () => go("/plus") },
    { label: "Buy a gift card", hint: "Mahi Man help for someone else", act: () => go("/gift") },
    { label: "Redeem a gift card", hint: "Add a gift code", act: () => go("/gift-code") },
    { label: "How payment works", hint: "Who you pay and when", act: () => go("/pricing") },
    { label: "Your jobs", hint: "Jobs you've posted", act: () => go("/jobs") },
    { label: "Turns up score", hint: "Reliability and strikes", act: () => setSub("reliability"), worker: true },
    { label: "Skills", hint: "What customers see on your offers", act: () => setSub("skills"), worker: true },
    { label: "Licences and certificates", hint: "Insurance, RSA, Blue Card, trade licences", act: () => setSub("creds"), worker: true },
    { label: "Getting paid", hint: "Where customers pay you", act: () => setSub("payid"), worker: true },
    { label: "Help and support", hint: "Contact the Mahi Man team", act: () => go("/support") },
    { label: "Privacy policy", hint: "Your data, and deleting your account", act: () => go("/privacy") },
    { label: "Delete account", hint: "On the Privacy page", act: () => go("/privacy") },
    { label: "Terms of use", hint: "The rules for using Mahi Man", act: () => go("/terms") },
  ].filter((x) => !x.worker || worker);
  const t = q.trim().toLowerCase();
  const found = t ? items.filter((x) => `${x.label} ${x.hint}`.toLowerCase().includes(t)) : [];

  const bal = hub?.balance ?? 0, gift = Math.min(hub?.gift_balance ?? 0, bal), topup = Math.max(bal - gift, 0);
  const w = hub?.worker;

  return (
    <div className="app hb">
      <section className="hb-hero">
        <div className="hb-top"><span style={{ width: 44 }} /><span>You</span><span style={{ width: 44 }} /></div>
        <div className="hb-me">
          <Tile name={profile.full_name || "?"} photo={profile.photo_path} size={64} />
          <div className="hb-who">
            <b>{profile.full_name || "Your account"}</b>
            <span>{profile.id_status === "verified" && Icon.shieldTick("var(--lime)")}{idLabel}<HeroArea /></span>
          </div>
          <button className="hb-edit" onClick={() => setSub("account")}>Account</button>
        </div>
      </section>

      <label className="search hb-search">{Icon.search("var(--muted)")}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" /></label>

      {t ? (
        <section className="hb-found">
          {found.map((x) => (
            <button key={x.label} onClick={() => { setQ(""); x.act(); }}><span><b>{x.label}</b><small>{x.hint}</small></span>{Icon.chevron("var(--faint)")}</button>
          ))}
          {found.length === 0 && <p className="ac-none">Nothing matches "{q}".</p>}
        </section>
      ) : (<>
        {profile.id_status !== "verified" && (
          <section className="hb-band hb-verify">
            <button onClick={() => setSub("verify")}><span><b>Verify your ID</b><small>{profile.id_status === "pending" ? "We're checking it now" : "Passport or national ID, plus a selfie"}</small></span>{Icon.chevron("var(--faint)")}</button>
          </section>
        )}

        <section className="hb-band">
          <div className="hb-h"><h2>Your money</h2><button onClick={() => go("/payments")}>History</button></div>
          <div className="hb-card">
            <small>Balance</small><div className="hb-bal">{money(bal)}</div>
            {bal > 0 && <div className="hb-split">{gift > 0 && <i style={{ flex: gift }} />}{topup > 0 && <i className={gift > 0 ? "" : "t"} style={{ flex: topup }} />}</div>}
            {bal > 0 && <span>{[gift > 0 && `Gift card ${money(gift)}`, topup > 0 && `Top-up ${money(topup)}`].filter(Boolean).join(" · ")}</span>}
          </div>
          <div className="hb-m3">
            <button onClick={() => go("/topup")}>{I.plus()}Top up</button>
            <button onClick={() => go("/gift")}>{I.gift()}Buy gift card</button>
            <button onClick={() => go("/gift-code")}>{I.ticket()}Redeem</button>
          </div>
        </section>

        <section className="hb-band">
          <div className="hb-h"><h2>Your jobs</h2>{(hub?.jobs_total ?? 0) > 0 && <button onClick={() => go("/jobs")}>All {hub!.jobs_total}</button>}</div>
          {hub && hub.jobs.length > 0 ? (
            <div className="hb-jobs">
              {hub.jobs.map((j) => (
                <button key={j.id} onClick={() => go(`/job/${j.id}`)}>
                  {j.cover && covers[j.cover] ? <img src={covers[j.cover]} alt="" /> : <i className="hb-nocover" />}
                  <b>{j.title}</b><span>{jobLine(j)}</span>
                </button>
              ))}
            </div>
          ) : <p className="ac-none">{hub ? "Jobs you post show here." : "Loading"}</p>}
        </section>

        {worker && (
          <section className="hb-band">
            <div className="hb-h"><h2>Your work</h2><button onClick={() => setSub("payid")}>Getting paid</button></div>
            <div className="hb-work">
              <button className="hb-rel" onClick={() => setSub("reliability")}>
                {w && w.total > 0 ? (<>
                  <div className="hb-big">{w.turns_up ?? Math.round((w.done / w.total) * 100)}<small>%</small></div>
                  <span>Turned up to {w.done} of {w.total} job{w.total === 1 ? "" : "s"}</span>
                  <div className="hb-dots">{w.last.map((d, i) => <i key={i} className={d === "ok" ? "" : "n"} />)}</div>
                </>) : (<>
                  <div className="hb-big">0</div>
                  <span>Jobs done</span>
                </>)}
                {w?.payday?.on && w.payday.cents ? <span className="hb-pay">Next payday {dayShort(w.payday.on)} · <b>{money(w.payday.cents)}</b></span> : null}
              </button>
            </div>
            <div className="hb-more">
              <button onClick={() => setSub("skills")}>{I.tool()}<span><b>Skills</b><small>{w?.skills?.n ? `${w.skills.names}${w.skills.n > 3 ? ` +${w.skills.n - 3}` : ""}` : "Add what you can do"}</small></span>{Icon.chevron("var(--faint)")}</button>
              <button onClick={() => setSub("creds")}>{I.cert()}<span><b>Licences</b><small>{
                w?.licences?.next ? `${w.licences.next.name} ends ${monthYear(w.licences.next.expiry)}`
                  : w?.licences?.n ? `${w.licences.n} approved`
                  : w?.licences?.pending ? `${w.licences.pending} being checked` : "Insurance, RSA, Blue Card, trade licences"
              }</small></span>{Icon.chevron("var(--faint)")}</button>
            </div>
          </section>
        )}

      </>)}

      <TabBar on="you" />
      {sub === "account" && <Account prefs={hub?.prefs ?? null} onPrefs={(p) => setHub((h) => (h ? { ...h, prefs: p } : h))}
        onBack={() => setSub(null)} onOpen={(s) => setSub(s)} />}
      {sub === "payid" && <AbnStep onBack={() => setSub(null)} onSaved={() => { setSub(null); toast("Saved"); }} />}
      {sub === "cards" && <PaymentMethods onBack={() => setSub(null)} />}
      {sub === "reliability" && <Reliability onBack={() => setSub(null)} />}
      {sub === "skills" && <JobsAndSkills onBack={() => { setSub(null); load(); }} />}
      {sub === "creds" && <Credentials onBack={() => { setSub(null); load(); }} />}
      {sub === "verify" && <VerifyFlow onClose={() => { setSub(null); reload(); }} />}
    </div>
  );
}

function HeroArea() {
  const { area } = useArea();
  return area ? <> · {area.name}</> : null;
}

/* Account: details, photo, area, alerts, card, blocked people and sign out. Delete account is on the Privacy page. */
function Account({ prefs, onPrefs, onBack, onOpen }: { prefs: Prefs | null; onPrefs: (p: Prefs) => void; onBack: () => void; onOpen: (s: Sub) => void }) {
  const { session, profile, reload } = useSession();
  const toast = useToast();
  const { area, areas, choose } = useArea();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subName, setSubName] = useState("");
  const [contact, setContact] = useState<{ phone: string; dial: string; whatsapp: boolean } | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; name: string }[] | null>(null);
  const [on, setOn] = useState<Prefs>({ jobs: true, messages: true, offers: false, ...(prefs ?? {}) });
  const saved = useMemo(() => ({ jobs: true, messages: true, offers: false, ...(prefs ?? {}) }), [prefs]);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState<"granted" | "prompt" | "denied" | "unsupported">("unsupported");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    if (!session) return;
    rpc<{ id: string; name: string }[]>("my_blocks").then((r) => setBlocked(r ?? [])).catch(() => setBlocked([]));
    if (profile?.is_worker) sb.from("workers").select("radius_km").eq("id", session.user.id).maybeSingle().then(({ data }) => setRadius(data?.radius_km ?? null));
    alertsState().then(setPhone).catch(() => {});
  }, [session?.user.id]);
  // Read again after Edit, so a new number shows straight away.
  useEffect(() => {
    if (!session || editing) return;
    sb.from("profile_contact").select("phone,dial,whatsapp").eq("id", session.user.id).maybeSingle().then(({ data }) => setContact(data ?? null));
  }, [session?.user.id, editing]);
  const me = (profile ?? {}) as { birth_date?: string | null; gender?: string | null; nationality?: string | null; home_suburb_id?: number | null };
  useEffect(() => {
    if (me.home_suburb_id) sb.from("suburbs").select("name").eq("id", me.home_suburb_id).maybeSingle().then(({ data }) => setSubName(data?.name ?? ""));
  }, [me.home_suburb_id]);
  if (!session || !profile) return null;
  const worker = !!profile.is_worker;
  const changed = on.jobs !== saved.jobs || on.messages !== saved.messages || on.offers !== saved.offers;

  const photo = async (f: File) => {
    try {
      const blob = await shrinkImage(f, 800);
      const path = `${session.user.id}/face-${Date.now()}.jpg`;
      const up = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await sb.from("profiles").update({ photo_path: path }).eq("id", session.user.id);
      if (error) throw error;
      await reload(); toast("Photo saved");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save the photo"); }
  };
  const save = async () => {
    setBusy(true);
    try { await rpc("set_alert_prefs", { p: on }); onPrefs(on); toast("Saved"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save"); }
    setBusy(false);
  };
  const rows: [keyof Prefs, string][] = [
    ...(worker ? [["jobs", "New jobs near you"] as [keyof Prefs, string]] : []),
    ["messages", "Messages"], ["offers", "Offers from local businesses"],
  ];
  const settingsName = Capacitor.getPlatform() === "android" ? "your phone's Settings, Apps" : "iPhone Settings";

  return (
    <div className="screen hb hb-acct" role="dialog" aria-label="Your account">
      {editing && <ProfileScreen mode="edit" onBack={() => setEditing(false)} onDone={() => { setEditing(false); toast("Saved"); }} />}
      <div className="screen-body">
        <section className="hb-hero">
          <div className="hb-top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button><span>Your account</span><span style={{ width: 44 }} /></div>
          <div className="ac-me">
            <Tile name={profile.full_name || "?"} photo={profile.photo_path} size={88} />
            <button className="hb-edit" onClick={() => file.current?.click()}>Change photo</button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) photo(f); }} />
          </div>
        </section>

        <section className="hb-band">
          <div className="hb-h"><h2>Your details</h2><button onClick={() => setEditing(true)}>Edit</button></div>
          <div className="hb-grid">
            <div><small>Name</small><b>{profile.full_name || "Not added"}</b></div>
            <div><small>Date of birth</small><b>{me.birth_date ? new Date(me.birth_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not added"}</b></div>
            <div><small>Gender</small><b>{GENDERS.find(([k]) => k === me.gender)?.[1] ?? "Not added"}</b></div>
            <div><small>Nationality</small><b>{me.nationality || "Not added"}</b></div>
            <div><small>Suburb</small><b>{subName || "Not added"}</b></div>
            {profile.id_status === "verified"
              ? <div><small>ID</small><b className="ac-ok">{Icon.shieldTick("var(--emerald)")}Verified</b></div>
              : <button onClick={() => onOpen("verify")}><small>ID</small><b className="ac-todo">{profile.id_status === "pending" ? "Being checked" : "Verify now"}</b></button>}
            <div><small>Mobile</small><b>{contact ? showPhone(contact.phone, contact.dial) : "Not added"}</b>{contact?.whatsapp && <span className="ac-wa">{waMark(16)}On WhatsApp</span>}</div>
            <div><small>Email</small><b className="ac-mail">{session.user.email ?? ""}</b></div>
          </div>
        </section>

        {area && (
          <section className="hb-band">
            <div className="hb-h"><h2>Your area</h2>{(areas?.length ?? 0) > 1 && <button onClick={() => setPicking(true)}>Change</button>}</div>
            <div className="ac-area"><div className="ac-ring"><i /><i /><b /></div>
              <div><div className="db-num">{area.name}</div><span>{isSoon(area) ? "Coming soon" : worker && radius ? `Jobs within ${radius} km` : area.state}</span></div></div>
          </section>
        )}

        {pushSupported() && (
          <section className="hb-band">
            <div className="hb-h"><h2>Alerts</h2></div>
            {phone !== "granted" && (
              <div className="ac-phone">
                <span>{phone === "denied" ? `Alerts are off on this phone. Turn them on in ${settingsName}, Mahi Man, Notifications.` : "Alerts are off on this phone."}</span>
                {phone === "prompt" && <button className="btn stone" onClick={async () => setPhone(await turnOnAlerts())}>Turn on</button>}
              </div>
            )}
            <div className="ac-sw">
              {rows.map(([k, label]) => (
                <label key={k}><span>{label}</span>
                  <button className={on[k] ? "on" : ""} role="switch" aria-checked={on[k]} aria-label={label} onClick={() => setOn((p) => ({ ...p, [k]: !p[k] }))}><i /></button>
                </label>
              ))}
            </div>
            <p className="ac-always">Alerts about your jobs, payments and account are always on.</p>
            <button className="btn ac-save" disabled={!changed || busy} onClick={save}>{busy ? "Saving" : "Save"}</button>
          </section>
        )}

        <section className="hb-band">
          <div className="hb-h"><h2>Payment card</h2><button onClick={() => onOpen("cards")}>{profile.card_last4 ? "Change" : "Add"}</button></div>
          {profile.card_last4
            ? <div className="ac-card">{I.card()}<b>{cardLabel(profile)}</b><span>Used for top-ups</span></div>
            : <span className="ac-none">No card yet. Add one for top-ups and fees.</span>}
        </section>

        <section className="hb-band">
          <div className="hb-h"><h2>Blocked people</h2></div>
          {blocked && blocked.length > 0 ? blocked.map((b) => (
            <div key={b.id} className="ac-blk"><span>{b.name}</span>
              <button className="link" onClick={async () => {
                const { error } = await sb.from("blocks").delete().eq("blocker_id", session.user.id).eq("blocked_id", b.id);
                if (error) { toast(error.message); return; }
                setBlocked((x) => (x ?? []).filter((y) => y.id !== b.id)); toast("Unblocked");
              }}>Unblock</button></div>
          )) : <span className="ac-none">{blocked ? "You haven't blocked anyone." : "Loading"}</span>}
        </section>

        <section className="hb-band ac-help">
          <div className="hb-rows">
            <button onClick={() => go("/support")}>{I.help()}<span>Help and support</span>{Icon.chevron("var(--faint)")}</button>
            <button onClick={() => go("/privacy")}>{I.doc()}<span>Privacy and terms</span>{Icon.chevron("var(--faint)")}</button>
          </div>
        </section>

        <section className="ac-end"><div className="hb-out"><button className="btn stone" onClick={() => signOut().then(() => go("/"))}>Sign out</button></div></section>
      </div>
      {picking && area && createPortal(<SearchPicker title="Where are you?" placeholder="Search areas" value={[area.id]}
        options={(areas ?? []).map((a) => ({ id: a.id, label: a.name, hint: isSoon(a) ? `${a.state}, coming soon` : a.state }))}
        onClose={() => setPicking(false)} onChange={(v) => choose(Number(v[0]))} />, document.body)}
    </div>
  );
}

export function DeleteAccount({ onBack }: { onBack: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Screen title="Delete account" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>This deletes your account straight away and can't be undone.</p>
        <ul className="t15 light" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Your profile, photos, ID check, messages and reviews are deleted.</li>
          <li>Open bookings are cancelled. Jobs you finished stay in the other person's history without your name.</li>
          <li>You can make a new account later with the same email.</li>
        </ul>
        <label className="field"><span className="k">Type DELETE to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" /></label>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button className="btn stone" onClick={onBack}>Keep my account</button>
          <button className="btn danger" disabled={busy || typed.trim().toUpperCase() !== "DELETE"} onClick={async () => {
            setBusy(true); setErr("");
            try {
              await api("delete_account", { confirm: "DELETE" });
              await signOut();
              sessionStorage.clear();
              go("/", true);
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? "Deleting…" : "Delete account"}</button>
        </div>
      </div>
    </Screen>
  );
}
