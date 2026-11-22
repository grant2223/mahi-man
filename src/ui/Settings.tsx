import { TaxDetails, useTax } from "./Tax";
import { AboutEdit, ContactEdit, SuburbEdit } from "./Profile";
import { GENDERS, showPhone } from "../lib/people";
import { Capacitor } from "@capacitor/core";
import { Reliability } from "../worker/Reliability";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, avatarUrl, mediaUrls, rpc, sb, type PersonCard } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money, shrinkImage } from "../lib/format";
import { Icon, Screen, StepHero, useToast } from "./kit";
import { VerifyFlow } from "./Verify";
import { AbnStep, AreaStep } from "../worker/Signup";
import { AddDriverLicence, Credentials, DRIVER, JobsAndSkills } from "../worker/Skills";
import { PaymentMethods, cardLabel } from "../customer/Cards";
import { alertsState, pushSupported, signOut, turnOnAlerts } from "../lib/push";
import { isSoon, useArea } from "../lib/area";
import { TabBar } from "./TabBar";
import { PeopleScreen, YourPeople } from "../customer/People";
import { ProfileHero, ShareCard, WorkerHome, type Driving, type TradeWork, type WorkerHomeData } from "./ProfileHome";

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
type Sub = null | "account" | "card" | "verify" | "payid" | "skills" | "creds" | "cards" | "reliability" | "licence" | "vehicles" | "people";

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


function jobLine(j: HubJob): string {
  const w = j.worker ?? "Your worker";
  switch (j.status) {
    case "searching": return j.keen ? `${j.keen} keen, pick one` : "Finding someone";
    case "accepted": return j.on_way ? `${w} is on the way` : `${w} is booked`;
    case "in_progress": return `${w} is there now`;
    case "finished": return "Done, check and confirm";
    case "confirmed": return `Done, ${money(j.total)}`;
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
  const [sub, setSub] = useState<Sub>(() => (new URLSearchParams(location.search).has("tax") ? "account" : null));
  useEffect(() => { const f = () => setSub("account"); window.addEventListener("mm-open-tax", f); return () => window.removeEventListener("mm-open-tax", f); }, []);
  const [wh, setWh] = useState<WorkerHomeData | null>(null);
  const [card, setCard] = useState<PersonCard | null>(null);
  const [place, setPlace] = useState<{ suburb: string; area: string }>({ suburb: "", area: "" });
  const [onlineBusy, setOnlineBusy] = useState(false);
  // Driving on their profile: their driver licence and vehicles.
  const [drive, setDrive] = useState<Driving | null>(null);
  const loadDrive = () => {
    if (!profile?.is_worker) return;
    Promise.all([
      sb.from("workers").select("vehicles").eq("id", profile.id).maybeSingle(),
      sb.from("worker_credentials").select("status,expiry,created_at,credential_types!inner(name)").eq("worker_id", profile.id).eq("credential_types.name", DRIVER).order("created_at", { ascending: false }).limit(1),
    ]).then(([w, c]) => {
      const last = (c.data ?? [])[0] as { status: Driving["status"]; expiry: string | null } | undefined;
      const expired = last?.status === "verified" && !!last.expiry && last.expiry < new Date().toISOString().slice(0, 10);
      setDrive({ status: last ? (expired ? "expired" : last.status) : null, expiry: last?.expiry ?? null, vehicles: ((w.data?.vehicles as string[] | null) ?? []) });
    });
  };
  useEffect(loadDrive, [profile?.is_worker]); // eslint-disable-line react-hooks/exhaustive-deps
  // Trade work on their profile: Create Tradie Profile, or their trade jobs, how they pay and tradie profile.
  const [tw, setTw] = useState<TradeWork | null>(null);
  useEffect(() => {
    if (profile?.is_worker) rpc<{ trades?: number[]; business_name: string | null; plan: { plan: "standard" | "premium"; premium: boolean } | null }>("trade_status")
      .then((t) => setTw({ tradie: !!t?.trades?.length, business: t?.business_name ?? null, plan: t?.plan ? (t.plan.premium ? "premium" : "standard") : null })).catch(() => {});
  }, [profile?.is_worker]);

  const load = () => rpc<Hub>("my_hub").then((h) => {
    setHub(h);
    mediaUrls(h.jobs.map((j) => j.cover).filter(Boolean) as string[]).then(setCovers).catch(() => {});
  }).catch(() => {});
  const loadWorker = () => { if (profile?.is_worker) rpc<WorkerHomeData>("worker_home").then(setWh).catch(() => {}); };
  const home = (profile as { home_suburb_id?: number | null } | null)?.home_suburb_id ?? null;
  useEffect(() => { if (session) { load(); rpc<PersonCard[]>("person_card", { p_person: session.user.id }).then((c) => setCard(c?.[0] ?? null)).catch(() => {}); } }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadWorker(); }, [profile?.is_worker]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!home) return;
    sb.from("suburbs").select("name, areas(name)").eq("id", home).maybeSingle().then(({ data }) =>
      setPlace({ suburb: (data as { name?: string } | null)?.name ?? "", area: ((data as { areas?: { name: string } | null } | null)?.areas?.name) ?? "" }));
  }, [home]);

  if (ready && !session) { go("/", true); return null; }
  if (!session || !profile) return <div className="app"><StepHero title="Profile" /></div>;
  const worker = !!profile.is_worker;
  const idLabel = { none: "Not verified", pending: "ID being checked", verified: "ID verified", retake: "ID retake needed", rejected: "ID not approved" }[profile.id_status];

  // Everything on this page and the Account page, so search finds it.
  const items: { label: string; hint: string; act: () => void; worker?: boolean }[] = [
    { label: "Photo", hint: "Change your photo", act: () => setSub("account") },
    { label: "Contact", hint: "Mobile, WhatsApp and email", act: () => setSub("account") },
    { label: "Your share card", hint: "QR code and link to book you", act: () => setSub("card"), worker: true },
    { label: "Verify your ID", hint: idLabel, act: () => setSub(profile.id_status === "verified" ? "account" : "verify") },
    { label: "Your area", hint: "Where you use Mahi Man", act: () => setSub("account") },
    { label: "Alerts", hint: "New jobs, messages and local offers", act: () => setSub("account") },
    { label: "Payment card", hint: "Card for fees", act: () => setSub("cards") },
    { label: "Blocked people", hint: "People you've blocked", act: () => setSub("account") },
    { label: "Sign out", hint: "At the bottom of Settings", act: () => setSub("account") },
    { label: "Balance and history", hint: "Payments, invoices and receipts", act: () => go("/payments") },
    { label: "Mahi Man Plus", hint: "Half fees, faster help", act: () => go("/plus") },
    { label: "Buy a gift card", hint: "Mahi Man help for someone else", act: () => go("/gift") },
    { label: "Redeem a gift card", hint: "Add a gift code", act: () => go("/gift-code") },
    { label: "How payment works", hint: "Who you pay and when", act: () => go("/pricing") },
    { label: "Your jobs", hint: "Jobs you've posted", act: () => go("/jobs") },
    { label: "Turns up score", hint: "Reliability and strikes", act: () => setSub("reliability"), worker: true },
    { label: "Skills", hint: "What customers see when you're available", act: () => setSub("skills"), worker: true },
    { label: "Licences and certificates", hint: "Insurance, RSA, Blue Card, trade licences", act: () => setSub("creds"), worker: true },
    { label: "Getting paid", hint: "Where customers pay you", act: () => setSub("payid"), worker: true },
    { label: "Help and support", hint: "Contact the Mahi Man team", act: () => go("/support") },
    { label: "Privacy policy", hint: "Your data, and deleting your account", act: () => go("/privacy") },
    { label: "Delete account", hint: "On the Privacy page", act: () => go("/privacy") },
    { label: "Terms of use", hint: "The rules for using Mahi Man", act: () => go("/terms") },
  ].filter((x) => !x.worker || worker);
  const bal = hub?.balance ?? 0, gift = Math.min(hub?.gift_balance ?? 0, bal);
  const plus = !!profile.plus_until && new Date(profile.plus_until) > new Date();
  const goOnline = async () => {
    setOnlineBusy(true);
    try { await rpc("set_online", { p_online: true }); toast("You're online"); loadWorker(); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); if (m.startsWith("Add your PayID")) setSub("payid"); else toast(m); }
    setOnlineBusy(false);
  };
  const finishProfile = () => setSub(profile.id_status !== "verified" ? "verify" : !profile.photo_path ? "account" : "payid");
  const recPct = card?.reviewed ? Math.round(((card.recommended ?? 0) / card.reviewed) * 100) : null;

  return (
    <div className="app pr">
      <ProfileHero photo={profile.photo_path} name={card?.full_name ?? profile.full_name ?? ""} age={card?.age ?? null} verified={profile.id_status === "verified"}
        place={[place.suburb, place.area].filter(Boolean).join(", ")} onCard={worker ? () => setSub("card") : undefined} onCog={() => setSub("account")} />

      {worker ? (wh ? <WorkerHome d={wh} onlineBusy={onlineBusy} onOnline={goOnline} onStep={finishProfile} onSkills={() => setSub("skills")} onBadge={() => setSub("creds")} trade={tw} drive={drive} onLicence={() => setSub(drive?.status === "verified" || drive?.status === "pending" ? "creds" : "licence")} onVehicles={() => setSub("vehicles")} /> : <div className="pr-sec"><p className="ac-none">Loading</p></div>) : (<>
        <section className="pr-sec pr-3">
          <div><b>{hub?.jobs_total ?? 0}</b><small>jobs posted</small></div>
          <div><b>{recPct == null ? "New" : `${recPct}%`}</b><small>{recPct == null ? "no reviews yet" : "recommend"}</small></div>
          <div><b>{profile.id_status === "verified" ? "Yes" : "No"}</b><small>ID checked</small></div>
        </section>
        {profile.id_status !== "verified" && (
          <section className="pr-sec pr-tight"><button className="pr-line" onClick={() => setSub("verify")}><span><b>Verify your ID</b><small>{profile.id_status === "pending" ? "We're checking it now" : "Passport or national ID, plus a selfie"}</small></span>{Icon.chevron("var(--faint)")}</button></section>
        )}
        {!plus && <section className="pr-sec pr-tight"><PlusRow /></section>}
        <YourPeople onAll={() => setSub("people")} />
        <section className="pr-sec">
          <h2>Your jobs{(hub?.jobs_total ?? 0) > 0 && <button onClick={() => go("/jobs")}>All {hub!.jobs_total}</button>}</h2>
          {hub && hub.jobs.length > 0 ? (
            <div className="hb-jobs">
              {hub.jobs.map((j) => (
                <button key={j.id} onClick={() => go(`/job/${j.id}`)}>
                  {j.cover && covers[j.cover] ? <img src={covers[j.cover]} alt="" /> : <i className="hb-nocover" />}
                  <b>{j.title}</b><span>{jobLine(j)}</span>
                </button>
              ))}
            </div>
          ) : <p className="pr-none">{hub ? "None yet" : "Loading"}</p>}
        </section>
        <section className="pr-sec">
          <h2>Your money<button onClick={() => go("/payments")}>History</button></h2>
          <div className="pr-bal"><b>{money(bal)}</b><small>{gift > 0 ? `credit, gift card ${money(gift)}` : "credit"}</small></div>
          <button className="pr-line" onClick={() => go("/gift")}>{I.gift()}<span><b>Buy a gift card</b></span></button>
          <button className="pr-line" onClick={() => go("/gift-code")}>{I.ticket()}<span><b>Redeem a gift card</b></span></button>
        </section>
      </>)}

      <TabBar on="you" />
      {sub === "account" && <Account prefs={hub?.prefs ?? null} onPrefs={(p) => setHub((h) => (h ? { ...h, prefs: p } : h))}
        items={items} balance={bal} plus={plus} onBack={() => { setSub(null); load(); loadWorker(); }} onOpen={(s) => setSub(s)} />}
      {sub === "card" && <ShareCard onBack={() => setSub(null)} />}
      {sub === "payid" && <AbnStep onBack={() => setSub(null)} onSaved={() => { setSub(null); toast("Saved"); loadWorker(); }} />}
      {sub === "cards" && <PaymentMethods onBack={() => setSub(null)} />}
      {sub === "reliability" && <Reliability onBack={() => setSub(null)} />}
      {sub === "skills" && <JobsAndSkills onBack={() => { setSub(null); load(); loadWorker(); }} />}
      {sub === "people" && <PeopleScreen onBack={() => setSub(null)} />}
      {sub === "licence" && <AddDriverLicence onBack={() => setSub(null)} onSaved={() => { setSub(null); loadDrive(); }} />}
      {sub === "vehicles" && <AreaStep onBack={() => setSub(null)} onSaved={() => { setSub(null); toast("Saved"); loadDrive(); loadWorker(); }} />}
      {sub === "creds" && <Credentials onBack={() => { setSub(null); load(); loadWorker(); }} />}
      {sub === "verify" && <VerifyFlow onClose={() => { setSub(null); reload(); loadWorker(); }} />}
    </div>
  );
}

/* Mahi Man Plus, in gold: on a customer's Profile and in Settings. */
export function PlusRow() {
  return (
    <button className="pr-plus" onClick={() => go("/plus")}>
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="#f5c518" /><path d="M12 7.5v9M7.5 12h9" stroke="#14211c" strokeWidth="2.4" strokeLinecap="round" /></svg>
      <span><b>Mahi Man Plus</b><small>Half fees, faster help</small></span>{Icon.chevron("var(--faint)")}
    </button>
  );
}


/* Account: details, photo, area, alerts, card, blocked people and sign out. Delete account is on the Privacy page. */
type Item = { label: string; hint: string; act: () => void; worker?: boolean };
/* Settings, behind the cog on the Profile tab: search, contact, about you, area, alerts, money, work, card, blocked people and sign out. */
function Account({ prefs, onPrefs, onBack, onOpen, items, balance, plus }: { prefs: Prefs | null; onPrefs: (p: Prefs) => void; onBack: () => void; onOpen: (s: Sub) => void; items: Item[]; balance: number; plus: boolean }) {
  const { session, profile, reload } = useSession();
  const toast = useToast();
  const { area } = useArea();
  const [editing, setEditing] = useState<"contact" | "about" | "suburb" | null>(null);
  const [subName, setSubName] = useState("");
  const [contact, setContact] = useState<{ phone: string; dial: string; whatsapp: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [showBlocked, setShowBlocked] = useState(false);
  const [tax, setTax] = useState(() => { const on = new URLSearchParams(location.search).has("tax") || sessionStorage.getItem("mm-tax") === "1"; sessionStorage.removeItem("mm-tax"); return on; });
  const { tax: myTax, reload: reloadTax } = useTax();
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

  const t = q.trim().toLowerCase();
  const found = t ? items.filter((x) => (!x.worker || worker) && `${x.label} ${x.hint}`.toLowerCase().includes(t)) : [];
  const bday = me.birth_date ? new Date(me.birth_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
  const pic = avatarUrl(profile.photo_path);
  const ic = (d: ReactNode) => <svg className="ax-ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
  const A = {
    phone: ic(<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />),
    mail: ic(<><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 7l9 6 9-6" /></>),
    id: ic(<><rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="9" cy="11" r="2.3" /><path d="M5.8 16c.7-1.6 1.8-2.4 3.2-2.4s2.5.8 3.2 2.4M14.5 10h4M14.5 13h3" /></>),
    cake: ic(<path d="M4 21h16M5 21v-8h14v8M12 13V9M12 6.5a1.5 1.5 0 0 0 0-3" />),
    person: ic(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
    globe: ic(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>),
    pin: ic(<><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
    card: ic(<><rect x="3" y="6" width="18" height="13" rx="1" /><path d="M3 10h18M7 15h4" /></>),
    block: ic(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>),
    help: ic(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></>),
    doc: ic(<><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>),
    bank: ic(<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />),
    clock: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    tool: ic(<path d="M14.5 5.5a4 4 0 0 0 4.9 5L20 11l-9 9-3-3 9-9 .5.6a4 4 0 0 0-3-5.1z" />),
    cert: ic(<><rect x="4" y="3" width="16" height="13" rx="1" /><path d="M8 8h8M8 11h5M10 16l-1 5 3-2 3 2-1-5" /></>),
    wallet: ic(<><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7l12-3v3M16 13.5h2" /></>),
    plus: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
    gift: ic(<><rect x="3" y="8" width="18" height="13" rx="1" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" /></>),
    ticket: ic(<><path d="M3 8V6h18v2a2 2 0 0 0 0 4 2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4 2 2 0 0 0 0-4z" /><path d="M13 6v12" strokeDasharray="2 2" /></>),
  };
  const chev = Icon.chevron("var(--faint)");

  return (
    <div className="screen hb hb-acct ax" role="dialog" aria-label="Your account">
      {editing === "contact" && <ContactEdit onBack={() => setEditing(null)} onDone={(m) => { setEditing(null); toast(m); }} />}
      {editing === "about" && <AboutEdit onBack={() => setEditing(null)} onDone={() => { setEditing(null); toast("Saved"); }} />}
      {editing === "suburb" && <SuburbEdit value={me.home_suburb_id ?? null} onBack={() => setEditing(null)} onDone={() => { setEditing(null); toast("Saved"); }} />}
      {showBlocked && (
        <Screen title="Blocked people" onBack={() => setShowBlocked(false)}>
          <div className="screen-body ax-list">
            {blocked && blocked.length > 0 ? blocked.map((b) => (
              <div key={b.id} className="ax-row"><span className="ax-one">{b.name}</span>
                <button className="ax-link" onClick={async () => {
                  const { error } = await sb.from("blocks").delete().eq("blocker_id", session.user.id).eq("blocked_id", b.id);
                  if (error) { toast(error.message); return; }
                  setBlocked((x) => (x ?? []).filter((y) => y.id !== b.id)); toast("Unblocked");
                }}>Unblock</button></div>
            )) : <p className="ax-empty">You haven't blocked anyone.</p>}
          </div>
        </Screen>
      )}
      {tax && <TaxDetails onBack={() => { setTax(false); reloadTax(); if (location.search.includes("tax")) history.replaceState(null, "", "/settings"); }} onBank={() => onOpen("payid")} />}
      <div className="screen-body">
        <div className="ax-head"><button onClick={onBack} aria-label="Back">{Icon.back("var(--ink)")}</button><h1>Settings</h1></div>
        <label className="search ax-search">{Icon.search("var(--muted)")}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" /></label>
        {t ? (
          <section className="ax-sec ax-found">
            {found.map((x) => <button key={x.label} className="ax-row ax-plain" onClick={() => { setQ(""); x.act(); }}><span className="ax-t"><b>{x.label}</b><small>{x.hint}</small></span>{chev}</button>)}
            {found.length === 0 && <p className="ax-empty">Nothing matches "{q}".</p>}
          </section>
        ) : (<>
        <section className="ax-sec">
          <h2>Photo<button onClick={() => file.current?.click()}>Change</button></h2>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) photo(f); }} />
          <button className="ax-photo" onClick={() => file.current?.click()} aria-label="Change photo" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>{!pic && Icon.camera("var(--muted)")}</button>
        </section>

        <section className="ax-sec">
          <h2>Contact<button onClick={() => setEditing("contact")}>Edit</button></h2>
          <button className="ax-row" onClick={() => !contact && setEditing("contact")}>{A.phone}
            <span className="ax-t"><small>Mobile</small>{contact ? <b>{showPhone(contact.phone, contact.dial)}</b> : <b className="none">Not added yet</b>}</span>
            {contact?.whatsapp && <span className="ax-wa">{waMark(20)}</span>}</button>
          <div className="ax-row">{A.mail}<span className="ax-t"><small>Email</small><b>{session.user.email ?? ""}</b></span></div>
          {profile.id_status !== "verified" && (
            <button className="ax-row" onClick={() => onOpen("verify")}>{A.id}
              <span className="ax-t"><small>ID</small><b className="add">{profile.id_status === "pending" ? "Being checked" : "Verify your ID"}</b></span></button>
          )}
        </section>

        <section className="ax-sec">
          <h2>About you<button onClick={() => setEditing("about")}>Edit</button></h2>
          <div className="ax-3 ax-cells">
            <div>{A.cake}<small>Birthday</small><b>{bday || "Not added"}</b></div>
            <div>{A.person}<small>Gender</small><b>{GENDERS.find(([k]) => k === me.gender)?.[1] ?? "Not added"}</b></div>
            <div>{A.globe}<small>Nationality</small><b>{me.nationality || "Not added"}</b></div>
          </div>
        </section>

        {area && (
          <section className="ax-sec">
            <h2>Your area<button onClick={() => setEditing("suburb")}>Change</button></h2>
            <div className="ax-row">{A.pin}<span className="ax-t"><small>{isSoon(area) ? "Coming soon" : worker && radius ? `Jobs within ${radius} km` : area.state}</small><b>{[subName, area.name].filter(Boolean).join(", ")}</b></span></div>
          </section>
        )}

        {pushSupported() && (
          <section className="ax-sec">
            <h2>Alerts</h2>
            {phone !== "granted" && (
              <div className="ax-row ax-plain"><span className="ax-one muted">{phone === "denied" ? `Off in ${settingsName}` : "Off on this phone"}</span>
                {phone === "prompt" && <button className="ax-link" onClick={async () => setPhone(await turnOnAlerts())}>Turn on</button>}</div>
            )}
            {rows.map(([k, label]) => (
              <label key={k} className="ax-row ax-plain"><span className="ax-one">{label}</span>
                <button className={`ax-sw${on[k] ? " on" : ""}`} role="switch" aria-checked={on[k]} aria-label={label} onClick={() => setOn((p) => ({ ...p, [k]: !p[k] }))}><i /></button>
              </label>
            ))}
            <button className="btn ac-save" disabled={!changed || busy} onClick={save}>{busy ? "Saving" : "Save"}</button>
          </section>
        )}

        {worker && (
          <section className="ax-sec ax-links">
            <h2>Your work</h2>
            <button className="ax-row" onClick={() => onOpen("payid")}>{A.bank}<span className="ax-one">Getting paid</span><span className="ax-r">{chev}</span></button>
            <button className="ax-row" onClick={() => setTax(true)}>{A.doc}<span className="ax-one">Tax details</span><span className="ax-r">{myTax?.missing.length ? <span className="tx-need">{myTax.missing[0].replace(/^./, (c) => c.toUpperCase())} needed</span> : null}{chev}</span></button>
            <button className="ax-row" onClick={() => onOpen("reliability")}>{A.clock}<span className="ax-one">Turn-up score</span><span className="ax-r">{chev}</span></button>
            <button className="ax-row" onClick={() => onOpen("skills")}>{A.tool}<span className="ax-one">Skills</span><span className="ax-r">{chev}</span></button>
            <button className="ax-row" onClick={() => onOpen("creds")}>{A.cert}<span className="ax-one">Licences and certificates</span><span className="ax-r">{chev}</span></button>
          </section>
        )}

        <section className="ax-sec ax-links">
          <h2>Money<button onClick={() => go("/payments")}>History</button></h2>
          <div className="ax-row">{A.wallet}<span className="ax-t"><small>Credit</small><b>{money(balance)}</b></span></div>
          <button className="ax-row" onClick={() => go("/gift")}>{A.gift}<span className="ax-one">Buy a gift card</span><span className="ax-r">{chev}</span></button>
          <button className="ax-row" onClick={() => go("/gift-code")}>{A.ticket}<span className="ax-one">Redeem a gift card</span><span className="ax-r">{chev}</span></button>
          <button className="ax-row" onClick={() => onOpen("cards")}>{A.card}<span className="ax-t"><small>Payment card</small><b>{profile.card_last4 ? cardLabel(profile) : "Add a card"}</b></span><span className="ax-r">{chev}</span></button>
          {!plus && <PlusRow />}
        </section>

        <section className="ax-sec ax-links">
          <button className="ax-row" onClick={() => setShowBlocked(true)}>{A.block}<span className="ax-one">Blocked people</span>
            <span className="ax-r">{blocked == null ? "" : blocked.length ? blocked.length : "None"}{chev}</span></button>
          <button className="ax-row" onClick={() => go("/support")}>{A.help}<span className="ax-one">Help and support</span><span className="ax-r">{chev}</span></button>
          <button className="ax-row" onClick={() => go("/privacy")}>{A.doc}<span className="ax-one">Privacy and terms</span><span className="ax-r">{chev}</span></button>
          <button className="btn stone ax-out" onClick={() => signOut().then(() => go("/"))}>Sign out</button>
        </section>
        </>)}
      </div>
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
