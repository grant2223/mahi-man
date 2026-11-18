import { cardName } from "../lib/format";
import { recLine, type Scores } from "../ui/Ratings";
import { useEffect, useState } from "react";
import { avatarUrl, rpc, sb, type Work, workPhotoUrls } from "../lib/supabase";
import { elapsed } from "../lib/format";
import { CatIcon, Icon, Logo, Screen, SearchPicker, StepHero, useNow, useToast } from "../ui/kit";
import { Note } from "../ui/Completion";
import { ChatScreen } from "../ui/Chat";
import { dayTime, money } from "../lib/format";
import { go } from "../lib/router";
import { shareLink, SITE } from "../lib/share";
import { WorkerProfile } from "../ui/WorkerProfile";
import { AddCardScreen, CardMark, cardLabel, stripeFor } from "./Cards";
import { useSession } from "../lib/session";
import { api } from "../lib/supabase";
import { money2 } from "../lib/format";
import { VerifyFlow } from "../ui/Verify";
import { JobLine, PostedView, postedAgo, useJobLook } from "./Posted";

export interface Offer {
  worker_id: string; full_name: string; photo_path: string | null; id_verified: boolean; rating: number | null; jobs_done: number;
  jobs_for_me: number; eta_minutes: number; distance_km: number | null; expires_at: string; is_new: boolean;
  category: string | null; cat_rating: number | null; cat_jobs: number; local_customers: number; suburb: string;
  turns_up: number | null; scores: Scores | null;
  price_cents: number | null; included: string | null; can_come_at: string | null; business_name: string | null; age?: number | null; gender?: string | null;
}

interface Extra { worker_id: string; skills: string[]; years: number | null; gear: string[]; creds: string[] }

// Gold verified tick: ID checked by the Mahi Man team.
export const GoldTick = ({ s = 24 }: { s?: number }) => <svg className="gold-tick" width={s} height={s} viewBox="0 0 24 24" aria-label="ID verified"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="#f5c518" /><path d="M7.8 12.2l2.8 2.8 5.6-6" fill="none" stroke="#2a2d32" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const clock = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();

// The customer's job while it's open: people who say they're available, and Yes or Ignore on each.
const RAISE = 1000;

export function OffersView({ jobId, title, price, priceCents = 0, asap, startAt, searchingAt, feeDue = 0, onChosen, onCancel, onBoosted, trade }: {
  jobId: string; title: string; price: string; priceCents?: number; asap: boolean; startAt: string; searchingAt: string; feeDue?: number; onChosen: () => void; onCancel: () => void; onBoosted: () => void;
  trade?: boolean;
}) {
  const { profile: me, reload } = useSession();
  const [verifying, setVerifying] = useState(false);
  const unverified = !!me && me.id_status !== "verified" && me.id_status !== "pending";
  const [needCard, setNeedCard] = useState<Offer | null>(null);
  const toast = useToast();
  const now = useNow(1000);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => rpc<Offer[]>("offers_for_job", { p_job: jobId }).then((r) => live && setOffers(r)).catch(() => live && setOffers([]));
    load();
    const t = window.setInterval(load, 8000);
    return () => { live = false; window.clearInterval(t); };
  }, [jobId]);

  const shown = (offers ?? []).filter((o) => new Date(o.expires_at).getTime() > now);
  const [widenMin, setWidenMin] = useState(30);
  const onPlus = !!me?.plus_until && new Date(me.plus_until) > new Date();
  const look = useJobLook(jobId);
  const shareThis = async () => {
    const r = await shareLink(`Paid job on Mahi Man: ${title}, ${price}. Workers keep 100%.`, `${SITE}/work`);
    if (r === "copied") toast("Link copied. Paste it in a message.");
  };
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["widen_after_minutes"]).then(({ data }) => (data ?? []).forEach((r) => setWidenMin(Number(r.value))));
  }, []);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [openCard, setOpenCard] = useState<string | null>(null);
  // How the customer wants the list: soonest there, closest, most recommended or most jobs. The top 10 show; ignoring one brings in the next.
  const [sortBy, setSortBy] = useState<SortKey>("soon");
  const [gender, setGender] = useState<GenderKey>("any");
  const [pickSort, setPickSort] = useState(false);
  const picked = gender === "any" ? shown : shown.filter((o) => o.gender === gender);
  const [profile, setProfile] = useState<string | null>(null);
  const ids = (offers ?? []).map((o) => o.worker_id).join(",");
  useEffect(() => {
    if (!ids) return;
    rpc<Extra[]>("offer_extras", { p_job: jobId })
      .then((r) => setExtras(Object.fromEntries((r ?? []).map((x) => [x.worker_id, x])))).catch(() => {});
  }, [ids, jobId]);
  // Each worker's work in this job's kind of work: photos from finished jobs, reviews and numbers.
  const [work, setWork] = useState<Record<string, Work>>({});
  const [workUrls, setWorkUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ids) return;
    rpc<{ worker_id: string; work: Work }[]>("offer_work", { p_job: jobId }).then(async (r) => {
      const m = Object.fromEntries((r ?? []).map((x) => [x.worker_id, x.work]));
      setWork(m);
      setWorkUrls(await workPhotoUrls(Object.values(m).flatMap((x) => x?.photos ?? [])));
    }).catch(() => {});
  }, [ids, jobId]);
  const widened = now - new Date(searchingAt).getTime() > widenMin * 60000;
  // Nobody has said they're free after 10 minutes: one-tap ways through instead of just waiting.
  const stuck = !shown.length && !trade && now - new Date(searchingAt).getTime() >= 10 * 60000;
  const [rescueBusy, setRescueBusy] = useState(false);
  const [pickWhen, setPickWhen] = useState<null | "day" | "time">(null);
  const [day, setDay] = useState("");
  async function rescue(run: () => Promise<unknown>, done: string) {
    setRescueBusy(true);
    try { await run(); toast(done); onBoosted(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    finally { setRescueBusy(false); }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const days = Array.from({ length: 6 }, (_, i) => {
    const x = new Date(); x.setDate(x.getDate() + i);
    const nice = x.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
    return { id: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`, label: i === 0 ? `Today, ${nice}` : i === 1 ? `Tomorrow, ${nice}` : nice };
  });
  const times = (d: string) => {
    const out: { id: string; label: string }[] = [];
    for (let m = 6 * 60; m <= 20 * 60; m += 30) {
      const hh = pad(Math.floor(m / 60)), mm = pad(m % 60);
      if (new Date(`${d}T${hh}:${mm}`).getTime() < Date.now() + 60 * 60000) continue;
      out.push({ id: `${hh}:${mm}`, label: new Date(2000, 0, 1, m / 60, m % 60).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase() });
    }
    return out;
  };
  const [chat, setChat] = useState<Offer | null>(null);

  async function choose(o: Offer) {
    setBusy(o.worker_id);
    try {
      if (feeDue > 0) {
        // The booking fee is charged to the saved card now; the worker is only booked once it goes through.
        let r = await api<{ booked?: boolean; action?: string; client_secret?: string; publishable_key?: string }>("choose_worker", { job_id: jobId, worker_id: o.worker_id });
        if (r.action === "authenticate" && r.client_secret && r.publishable_key) {
          const stripe = await stripeFor(r.publishable_key);
          const res = await stripe?.handleNextAction({ clientSecret: r.client_secret });
          if (!res || res.error) throw new Error(res?.error?.message ?? "Your bank didn't approve it. Try another card.");
          r = await api("choose_worker", { job_id: jobId, worker_id: o.worker_id });
        }
        if (!r.booked) throw new Error("That didn't go through. Try again.");
      } else {
        await rpc("choose_offer", { p_job: jobId, p_worker: o.worker_id });
      }
      toast(`${o.full_name.split(" ")[0]} is booked`); onChosen();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/card|declined|bank/i.test(msg)) { setNeedCard(o); toast(msg); }
      else { toast(msg); setOffers((x) => (x ?? []).filter((y) => y.worker_id !== o.worker_id)); }
    } finally { setBusy(null); }
  }
  async function ignore(o: Offer) {
    setOffers((x) => (x ?? []).filter((y) => y.worker_id !== o.worker_id));
    rpc("ignore_offer", { p_job: jobId, p_worker: o.worker_id }).catch(() => {});
  }

  if (trade) {
    return (
      <div className="app" style={{ background: "var(--card)" }}>
        <StepHero title="Quotes from tradies" sub={title} onBack={() => go("/")} />
        {!shown.length && (
          <div className="cp-sec">
            <span className="cp-title">Waiting for quotes</span>
            <span className="t15 light muted" style={{ lineHeight: 1.45 }}>Licensed tradies near you have been told. Their quotes show here, and you get an alert for each one.</span>
          </div>
        )}
        <div className="offers">
          {shown.map((o) => {
            const creds = (extras[o.worker_id]?.creds ?? []).filter((c) => c !== "Insured");
            const rec = recLine(o.scores, "customers");
            return (
              <div key={o.worker_id} className="offer">
                <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                  <span className="ph">{avatarUrl(o.photo_path) ? <img src={avatarUrl(o.photo_path)!} alt="" /> : null}</span>
                  <span className="t">
                    <span className="row between" style={{ alignItems: "baseline", gap: 8 }}>
                      <button className="name-link" onClick={() => setProfile(o.worker_id)}>{o.business_name ?? o.full_name}{Icon.chevron("var(--muted)")}</button>
                      <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8 }}>{money(o.price_cents ?? 0)}</span>
                    </span>
                    <span className="row" style={{ gap: "2px 12px", flexWrap: "wrap" }}>
                      {creds.map((c) => <span key={c} className="badge-ver">{Icon.shieldTick("var(--emerald)")}{c === "Driver licence" ? "Licensed driver" : c}</span>)}
                      <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}Insured</span>
                    </span>
                    <span className="m">{o.business_name ? `${o.full_name}, ` : ""}{rec || (o.is_new ? "New to Mahi Man" : `${o.jobs_done} jobs`)}</span>
                    {o.included && <span className="m">Includes {o.included.charAt(0).toLowerCase() + o.included.slice(1)}</span>}
                    {o.can_come_at && <span className="m em">Can come {dayTime(o.can_come_at)}</span>}
                  </span>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn stone" style={{ flex: 1 }} onClick={() => setChat(o)} disabled={!!busy}>{Icon.msg("var(--ink)")} Message</button>
                  <button className="btn primary" style={{ flex: 1 }} onClick={() => choose(o)} disabled={!!busy}>{busy === o.worker_id ? "Booking…" : "Select"}</button>
                </div>
              </div>
            );
          })}
        </div>
        <Note icon="lock">You pay the tradie directly when the job's done. Selecting one tells the others straight away.</Note>
        <div style={{ flex: 1 }} />
        <div className="ps-foot" style={{ paddingTop: 16 }}>
          <div className="ps-btns">
            <button className="btn stone" onClick={shareThis}>{Icon.share("currentColor")}Share</button>
            <button className="btn out" onClick={onCancel}>{Icon.cancel("currentColor")}Cancel job</button>
          </div>
        </div>
        {profile && <WorkerProfile workerId={profile} onBack={() => setProfile(null)} />}
        {chat && me && <ChatScreen jobId={jobId} me={me.id} workerId={chat.worker_id} otherName={chat.business_name ?? chat.full_name} otherPhoto={chat.photo_path}
          sub={`${money(chat.price_cents ?? 0)}, ${title}`} onBack={() => setChat(null)} />}
      </div>
    );
  }

  // Nobody free yet: the "job posted" screen. Once people say they're free, they show below instead.
  if (!shown.length && !stuck) return (
    <>
      <PostedView jobId={jobId} title={title} price={price} when={asap ? "As soon as possible" : startAt ? dayTime(startAt) : ""} onCancel={onCancel} />
      {verifying && <VerifyFlow onClose={() => { setVerifying(false); reload(); }} />}
    </>
  );

  // Nobody free after 10 minutes: the same look as the posted screen, ways to get it taken faster, and Share, Cancel, Home. No clock.
  if (!shown.length && stuck) {
    const shareJob = async () => {
      const r = await shareLink(`Paid job on Mahi Man: ${title}, ${price}. Workers keep 100%.`, `${SITE}/work`);
      if (r === "copied") toast("Link copied. Paste it in a message.");
    };
    return (
      <div className="app ps cx" style={{ background: "var(--card)" }}>
        <section className="hero ps-hero">
          <div className="hero-top"><button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button></div>
          <h1 className="ps-h">Nobody's free yet.</h1>
          <JobLine photo={look.photo} title={title} parts={[price, look.suburb, asap ? "As soon as possible" : startAt ? dayTime(startAt) : ""]} />
          <span className="cx-when">{postedAgo(searchingAt)}</span>
        </section>
        <div className="rs">
          <h2>Get it taken faster</h2>
          <p>Workers near you are busy right now. Any one of these usually gets an answer in minutes.</p>
          <div className="rs-opt">
            <span className="t"><b>Pay {money(RAISE)} more</b><small>{money(priceCents + RAISE)} instead of {money(priceCents)}. Higher prices get taken faster.</small></span>
            <button className="btn rs-gold" disabled={rescueBusy} onClick={() => rescue(() => rpc("raise_job_price", { p_job: jobId, p_add_cents: RAISE }), `Now ${money(priceCents + RAISE)}.`)}>Add {money(RAISE)}</button>
          </div>
          {asap && (
            <div className="rs-opt">
              <span className="t"><b>Pick a time instead</b><small>More people are free later today or tomorrow.</small></span>
              <button className="btn stone" disabled={rescueBusy} onClick={() => setPickWhen("day")}>Pick a time</button>
            </div>
          )}
          {!onPlus && (
            <div className="rs-opt">
              <span className="t"><b>Join Plus</b><small>This job goes to workers nearby straight away, and every job after.</small></span>
              <button className="btn stone" onClick={() => go("/plus")}>See Plus</button>
            </div>
          )}
          {unverified && (
            <div className="rs-opt">
              <span className="t"><b>Verify your ID</b><small>Workers pick verified customers first. It takes about 2 minutes.</small></span>
              <button className="btn stone" onClick={() => setVerifying(true)}>Verify</button>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div className="ps-foot">
          <div className="ps-btns three">
            <button className="btn stone" onClick={shareJob}>{Icon.share("currentColor")}Share</button>
            <button className="btn out" onClick={onCancel}>{Icon.cancel("currentColor")}Cancel</button>
            <button className="btn primary" onClick={() => go("/", true)}>{Icon.home("currentColor")}Home</button>
          </div>
        </div>
        {pickWhen === "day" && <SearchPicker title="Which day?" placeholder="Search" value={[]} options={days} onClose={() => setPickWhen(null)}
          onChange={(v) => { setDay(String(v[0])); setPickWhen("time"); }} />}
        {pickWhen === "time" && <SearchPicker title="What time?" placeholder="Search" value={[]} options={times(day)} onClose={() => setPickWhen(null)}
          onChange={(v) => { setPickWhen(null); rescue(() => rpc("set_job_time", { p_job: jobId, p_start_at: new Date(`${day}T${v[0]}`).toISOString() }), "Time set."); }} />}
        {verifying && <VerifyFlow onClose={() => { setVerifying(false); reload(); }} />}
      </div>
    );
  }

  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <section className="hero cp-hero" style={{ paddingBottom: 24 }}>
        <div className="hero-top cp-top">
          <button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button>
          <span className="jn">{title}, {price}</span>
        </div>
        {shown.length ? (
          <>
            <div className="av-line"><b>{picked.length} available</b>
              {!trade && shown.length > 1 && <button className="av-sort" onClick={() => setPickSort(true)}>{Icon.filter("#fff")}Filter{gender !== "any" && <i className="av-dot" />}</button>}</div>
          </>
        ) : (
          <>
            <span className="label" style={{ marginTop: 18 }}>Waiting for people who are free</span>
            <span className="big">{elapsed(searchingAt, now)}</span>
            <span className="sub" style={{ marginTop: 6 }}>{widened ? "Nobody nearby yet, so workers further out can see it now." : "They show up here and you choose."}</span>
          </>
        )}
      </section>
      {stuck && (
        <div className="rs">
          <h2>Nobody's free yet</h2>
          <p>Workers near you are busy right now. Any one of these usually gets an answer in minutes.</p>
          <div className="rs-opt">
            <span className="t"><b>Pay {money(RAISE)} more</b><small>{money(priceCents + RAISE)} instead of {money(priceCents)}. Higher prices get taken faster.</small></span>
            <button className="btn rs-gold" disabled={rescueBusy} onClick={() => rescue(() => rpc("raise_job_price", { p_job: jobId, p_add_cents: RAISE }), `Now ${money(priceCents + RAISE)}.`)}>Add {money(RAISE)}</button>
          </div>
          {!onPlus && (
            <div className="rs-opt">
              <span className="t"><b>Get help faster with Plus</b><small>Workers nearby are alerted the moment you post.</small></span>
              <button className="btn rs-gold" onClick={() => go("/plus")}>See Plus</button>
            </div>
          )}
          {asap && (
            <div className="rs-opt">
              <span className="t"><b>Pick a time instead</b><small>More people are free for later today or tomorrow.</small></span>
              <button className="btn stone" disabled={rescueBusy} onClick={() => setPickWhen("day")}>Pick a time</button>
            </div>
          )}
        </div>
      )}
      {pickWhen === "day" && <SearchPicker title="Which day?" placeholder="Search" value={[]} options={days} onClose={() => setPickWhen(null)}
        onChange={(v) => { setDay(String(v[0])); setPickWhen("time"); }} />}
      {pickWhen === "time" && <SearchPicker title="What time?" placeholder="Search" value={[]} options={times(day)} onClose={() => setPickWhen(null)}
        onChange={(v) => { setPickWhen(null); rescue(() => rpc("set_job_time", { p_job: jobId, p_start_at: new Date(`${day}T${v[0]}`).toISOString() }), "Time set."); }} />}
      {unverified && !shown.length && (
        <div className="boost-row">
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <b>Get help faster</b>
            <span>Workers pick verified customers first. It takes about 2 minutes.</span>
          </span>
          <button className="btn primary small" onClick={() => setVerifying(true)}>Verify</button>
        </div>
      )}
      {feeDue > 0 && shown.length > 0 && (
        <div className="row" style={{ gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--line)", alignItems: "center", background: "var(--card)" }}>
          {me?.card_last4 && <CardMark brand={me.card_brand} />}
          <span className="t15 light" style={{ flex: 1 }}>
            {me?.card_last4 ? <>Choosing someone charges the <b className="w5">{money2(feeDue)}</b> connection fee to {cardLabel(me)}.</> : <>Choosing someone charges the <b className="w5">{money2(feeDue)}</b> connection fee. You'll add a card first.</>}
          </span>
        </div>
      )}
      <div className="offers">
        {shown.length > 0 && !picked.length && (
          <div className="av-none"><span>Nobody available matches.</span><button className="btn stone small" onClick={() => setGender("any")}>Show everyone</button></div>
        )}
        {sortOffers(picked, sortBy, work).slice(0, 10).map((o) => {
          const at = asap ? clock(new Date(Date.now() + o.eta_minutes * 60000)) : clock(new Date(startAt));
          const photo = avatarUrl(o.photo_path);
          const first = o.full_name.split(" ")[0];
          const ex = extras[o.worker_id];
          const w = work[o.worker_id];
          const kind = (w?.category ?? o.category ?? "").toLowerCase();
          const pics = (w?.photos ?? []).filter((x) => workUrls[x.path]);
          const ownOnly = pics.length > 0 && pics.every((x) => x.src === "work");
          const jobs = w?.jobs ?? 0;
          const years = w?.years ?? ex?.years ?? null;
          const yrs = years == null ? null : years >= 10 ? "10+ yrs" : years === 0 ? "<1 yr" : `${years} yr${years === 1 ? "" : "s"}`;
          const skills = w?.skills?.length ? w.skills : ex?.skills ?? [];
          const gear = w?.gear?.length ? w.gear : ex?.gear ?? [];
          const rv = w?.reviews?.[0];
          const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
          const stats: [string, string][] = jobs > 0
            ? [[String(jobs), `${kind} job${jobs === 1 ? "" : "s"} on Mahi Man`],
               [w!.reviewed ? `${w!.recommended}` : "New", w!.reviewed ? "recommend" : "no reviews yet"],
               [yrs ?? `${o.jobs_done}`, yrs ? `${kind} experience` : "jobs done in all"]]
            : [["New", "first Mahi Man job"], [yrs ?? "–", `${kind} experience`], [o.id_verified ? "ID" : "No ID", o.id_verified ? "checked by Mahi Man" : "not checked yet"]];
          const creds = ex?.creds ?? [];
          // Everyone side by side first: their work, face, record and when they can be there. Tap to see the full card.
          if (openCard !== o.worker_id) {
            const line = jobs > 0
              ? `${jobs} ${kind} job${jobs === 1 ? "" : "s"}${w!.recommended ? `, ${w!.recommended} recommend` : ""}`
              : `New to Mahi Man${yrs ? `, ${yrs} ${kind} experience` : ""}`;
            return (
              <section key={o.worker_id} className="cr">
                <button className={`cr-ph n${Math.min(pics.length, 3)}`} onClick={() => setOpenCard(o.worker_id)} aria-label={`${first}'s work`}>
                  {pics.slice(0, 3).map((x) => (
                    <i key={x.path} style={{ backgroundImage: `url("${workUrls[x.path]}")` }}><em>{x.src === "work" ? "Before Mahi Man" : x.suburb}</em></i>
                  ))}
                  {!pics.length && <i className="ini">{o.full_name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</i>}
                </button>
                <div className="cr-b">
                  <button className="cr-main" onClick={() => setOpenCard(o.worker_id)}>
                    <span className="cr-f" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>{!photo && o.full_name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                    <span className="cr-t">
                      <b>{cardName(o.full_name)}{o.id_verified && <GoldTick s={20} />}</b>
                      <span className="g">{line}</span>
                      <span>Can be there {at}{o.distance_km != null ? `, ${o.distance_km} km` : ""}</span>
                    </span>
                  </button>
                </div>
                <div className="cr-btns">
                  <button className="btn stone" onClick={() => ignore(o)} disabled={!!busy}>Ignore</button>
                  <button className="btn primary" onClick={() => choose(o)} disabled={!!busy}>{busy === o.worker_id ? "Booking…" : "Select"}</button>
                </div>
              </section>
            );
          }
          return (
            <section key={o.worker_id} className="ox">
              {/* Their work in this kind of job comes first: photos from finished jobs, or their own past work, clearly marked. */}
              {pics.length > 0 ? (
                <button className={`ow${pics.length === 1 ? " one" : pics.length === 2 ? " two" : ""}`} onClick={() => setProfile(o.worker_id)} aria-label={`${first}'s work`}>
                  {pics.slice(0, 3).map((x, i) => (
                    <span key={x.path} className={i === 0 ? "p a" : "p"} style={{ backgroundImage: `url("${workUrls[x.path]}")` }}>
                      {i === 0 && <span>{x.src === "work" ? `${w!.category}, before Mahi Man` : x.suburb}</span>}
                    </span>
                  ))}
                  {jobs > 3 && <span className="more">{jobs} {kind} jobs</span>}
                </button>
              ) : (
                <button className="ox-pic" onClick={() => setProfile(o.worker_id)} style={photo ? { backgroundImage: `url(${photo})` } : undefined} aria-label={`${first}'s work`}>
                  {!photo && <span className="ox-ini">{o.full_name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>}
                </button>
              )}
              {ownOnly && <span className="ox-added">{Icon.camera("var(--ink)")}Photos added by {first}. Not Mahi Man jobs yet</span>}
              <button className="ox-who" onClick={() => setProfile(o.worker_id)}>
                <span className="ox-face" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>{!photo && o.full_name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                <span>
                  <span className="n"><span>{cardName(o.full_name)}</span>{o.id_verified && <GoldTick s={22} />}</span>
                  <span className="s">{[o.distance_km != null ? `${o.distance_km} km away` : "", o.jobs_for_me > 0 ? `${o.jobs_for_me} job${o.jobs_for_me === 1 ? "" : "s"} for you` : ""].filter(Boolean).join(", ")}</span>
                </span>
              </button>
              {kind && <div className="ox-kind"><CatIcon name={w?.icon ?? null} size={18} color="var(--emerald)" />{w?.category ?? o.category} work</div>}
              <div className="ox-st">{stats.map(([b, s]) => <div key={s}><b>{b}</b><small>{s}</small></div>)}</div>
              {rv && <div className="ox-q"><q>{rv.comment}</q><span>{rv.who}{rv.job ? `, ${lcFirst(rv.job)}` : ""} in {rv.suburb}</span></div>}
              {(skills.length > 0 || gear.length > 0) && (
                <div className="ox-does">
                  {skills.length > 0 && <><b>Does:</b> {skills.map(lcFirst).join(", ")}. </>}
                  {gear.length > 0 && <><b>Brings:</b> {gear.map(lcFirst).join(", ")}.</>}
                </div>
              )}
              {(creds.length > 0 || o.turns_up != null) && (
                <div className="ox-ver">
                  {creds.map((c) => <span key={c} className="badge-ver">{Icon.shieldTick("var(--emerald)")}{c === "Driver licence" ? "Licensed driver" : c}</span>)}
                  {o.turns_up != null && <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}Turns up {o.turns_up}%</span>}
                </div>
              )}
              <div className="ox-eta">Can be there <b>{at}</b></div>
              <div className="ox-btns">
                <button className="btn stone" onClick={() => ignore(o)} disabled={!!busy}>Ignore</button>
                <button className="btn primary" onClick={() => choose(o)} disabled={!!busy}>{busy === o.worker_id ? "Booking…" : "Select"}</button>
              </div>
              <button className="btn stone small ox-see" onClick={() => setProfile(o.worker_id)}>See all of {first}'s work{Icon.chevron("currentColor")}</button>
            </section>
          );
        })}
      </div>

      {!stuck && (
        <div className="cp-note">
          {Icon.msg("var(--muted)")}
          <span>Messages open with the person you choose. Everyone else is told the job's taken.</span>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div className="ps-foot" style={{ paddingTop: 16 }}>
        <div className="ps-btns">
          <button className="btn stone" onClick={shareThis}>{Icon.share("currentColor")}Share</button>
          <button className="btn out" onClick={onCancel}>{Icon.cancel("currentColor")}Cancel job</button>
        </div>
      </div>
      {verifying && <VerifyFlow onClose={() => { setVerifying(false); reload(); }} />}
      {pickSort && <FilterScreen sortBy={sortBy} gender={gender} onClose={() => setPickSort(false)}
        onSave={(sb, g) => { setSortBy(sb); setGender(g); setOpenCard(null); setPickSort(false); }} />}
      {profile && <WorkerProfile workerId={profile} category={work[profile]?.category_id ?? null} onBack={() => setProfile(null)} />}
      {needCard && <AddCardScreen onBack={() => setNeedCard(null)} onSaved={() => { const o = needCard; setNeedCard(null); window.setTimeout(() => choose(o), 200); }} />}
    </div>
  );
}

type SortKey = "soon" | "near" | "rate";
type GenderKey = "any" | "woman" | "man";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "soon", label: "Arrival time" },
  { id: "near", label: "Distance" },
  { id: "rate", label: "Rating" },
];
const GENDER_OPTS: { id: GenderKey; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "woman", label: "Women" },
  { id: "man", label: "Men" },
];
// Filter: how to order the list and who to show. Nothing changes until Save.
function FilterScreen(props: { sortBy: SortKey; gender: GenderKey; onClose: () => void; onSave: (s: SortKey, g: GenderKey) => void }) {
  const [sb, setSb] = useState(props.sortBy);
  const [g, setG] = useState(props.gender);
  const row = (on: boolean, label: string, pick: () => void) => (
    <button key={label} className="opt" onClick={pick}>
      <b>{label}</b>
      <span className="on" style={{ width: 22, display: "flex" }}>{on && Icon.tick("var(--emerald)")}</span>
    </button>
  );
  return (
    <Screen title="Filter" onBack={props.onClose} right={<button className="btn primary small" onClick={() => props.onSave(sb, g)}>Save</button>}>
      <div className="screen-body fl" style={{ background: "var(--card)" }}>
        <h4 className="fl-h">Sort by</h4>
        {SORTS.map((x) => row(sb === x.id, x.label, () => setSb(x.id)))}
        <h4 className="fl-h">Gender</h4>
        {GENDER_OPTS.map((x) => row(g === x.id, x.label, () => setG(x.id)))}
      </div>
    </Screen>
  );
}
function sortOffers<T extends { worker_id: string; eta_minutes: number; distance_km: number | null; can_come_at?: string | null; rating: number | null; cat_rating: number | null }>(list: T[], by: SortKey, work: Record<string, Work | undefined>): T[] {
  const eta = (o: T) => (o.can_come_at ? new Date(o.can_come_at).getTime() : Date.now() + o.eta_minutes * 60000);
  const km = (o: T) => o.distance_km ?? 999;
  const rec = (o: T) => work[o.worker_id]?.recommended ?? 0;
  const jobs = (o: T) => work[o.worker_id]?.jobs ?? 0;
  const rate = (o: T) => o.cat_rating ?? o.rating ?? 0;
  const by2 = (a: T, b: T) => (by === "soon" ? eta(a) - eta(b) : by === "near" ? km(a) - km(b) : rate(b) - rate(a) || rec(b) - rec(a) || jobs(b) - jobs(a)) || eta(a) - eta(b);
  return [...list].sort(by2);
}
