import { recLine, type Scores } from "../ui/Ratings";
import { useEffect, useState } from "react";
import { avatarUrl, rpc, sb } from "../lib/supabase";
import { elapsed } from "../lib/format";
import { Icon, Logo, StepHero, useNow, useToast } from "../ui/kit";
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

export interface Offer {
  worker_id: string; full_name: string; photo_path: string | null; id_verified: boolean; rating: number | null; jobs_done: number;
  jobs_for_me: number; eta_minutes: number; distance_km: number | null; expires_at: string; is_new: boolean;
  category: string | null; cat_rating: number | null; cat_jobs: number; local_customers: number; suburb: string;
  turns_up: number | null; scores: Scores | null;
  price_cents: number | null; included: string | null; can_come_at: string | null; business_name: string | null; age?: number | null;
}

interface Extra { worker_id: string; skills: string[]; years: number | null; gear: string[]; creds: string[] }

// Gold verified tick: ID checked by the Mahi Man team.
export const GoldTick = ({ s = 24 }: { s?: number }) => <svg className="gold-tick" width={s} height={s} viewBox="0 0 24 24" aria-label="ID verified"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="#f5c518" /><path d="M7.8 12.2l2.8 2.8 5.6-6" fill="none" stroke="#2a2d32" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const clock = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();

// The customer's job while it's open: people who say they're available, and Yes or Ignore on each.
export function OffersView({ jobId, title, price, asap, startAt, searchingAt, boosted, feeDue = 0, onChosen, onCancel, onBoosted, trade }: {
  jobId: string; title: string; price: string; asap: boolean; startAt: string; searchingAt: string; boosted: boolean; feeDue?: number; onChosen: () => void; onCancel: () => void; onBoosted: () => void;
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
  const [boosting, setBoosting] = useState(false);
  const [boostCents, setBoostCents] = useState<number | null>(null);
  const [widenMin, setWidenMin] = useState(30);
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["boost_cents", "widen_after_minutes"]).then(({ data }) => (data ?? []).forEach((r) => {
      if (r.key === "boost_cents") setBoostCents(Number(r.value)); else setWidenMin(Number(r.value));
    }));
  }, []);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [profile, setProfile] = useState<string | null>(null);
  const ids = (offers ?? []).map((o) => o.worker_id).join(",");
  useEffect(() => {
    if (!ids) return;
    rpc<Extra[]>("offer_extras", { p_job: jobId })
      .then((r) => setExtras(Object.fromEntries((r ?? []).map((x) => [x.worker_id, x])))).catch(() => {});
  }, [ids, jobId]);
  const widened = now - new Date(searchingAt).getTime() > widenMin * 60000;
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
            const first = o.full_name.split(" ")[0];
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
                      {creds.map((c) => <span key={c} className="badge-ver">{Icon.shieldTick("var(--emerald)")}{c}</span>)}
                      <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}Insured</span>
                    </span>
                    <span className="m">{o.business_name ? `${o.full_name}, ` : ""}{rec || (o.is_new ? "New to Mahi Man" : `${o.jobs_done} jobs`)}</span>
                    {o.included && <span className="m">Includes {o.included.charAt(0).toLowerCase() + o.included.slice(1)}</span>}
                    {o.can_come_at && <span className="m em">Can come {dayTime(o.can_come_at)}</span>}
                  </span>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn stone" style={{ flex: 1 }} onClick={() => setChat(o)} disabled={!!busy}>{Icon.msg("var(--ink)")} Message</button>
                  <button className="btn primary" style={{ flex: 1 }} onClick={() => choose(o)} disabled={!!busy}>{busy === o.worker_id ? "Booking…" : `Select ${first}`}</button>
                </div>
              </div>
            );
          })}
        </div>
        <Note icon="lock">You pay the tradie directly when the job's done. Selecting one tells the others straight away.</Note>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "0 16px calc(var(--safe-bottom) + 24px)" }}>
          <button className="link quiet" onClick={onCancel}>Cancel this job</button>
        </div>
        {profile && <WorkerProfile workerId={profile} onBack={() => setProfile(null)} />}
        {chat && me && <ChatScreen jobId={jobId} me={me.id} workerId={chat.worker_id} otherName={chat.business_name ?? chat.full_name} otherPhoto={chat.photo_path}
          sub={`${money(chat.price_cents ?? 0)}, ${title}`} onBack={() => setChat(null)} />}
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
            <span className="label" style={{ marginTop: 18 }}>Who's available</span>
            <span className="big lime">{shown.length}</span>
            <span className="sub" style={{ marginTop: 6 }}>Select who you want. Each offer lasts 15 minutes.</span>
          </>
        ) : (
          <>
            <span className="label" style={{ marginTop: 18 }}>Waiting for people who are free</span>
            <span className="big">{elapsed(searchingAt, now)}</span>
            <span className="sub" style={{ marginTop: 6 }}>{widened ? "Nobody nearby yet, so workers further out can see it now." : "They show up here and you choose."}</span>
          </>
        )}
      </section>
      {!boosted && !shown.length && (
        <div className="boost-row">
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <b>Urgent boost</b>
            <span>Every worker in your category gets an alert and your job goes to the top.{boostCents ? ` ${money(boostCents)}, added to what you owe Mahi Man. Free with Plus.` : ""}</span>
          </span>
          <button className="btn primary small" disabled={boosting} onClick={async () => {
            setBoosting(true);
            try { await rpc("boost_job", { p_job: jobId }); toast("Boosted. Every worker in your category has been told."); onBoosted(); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); }
            finally { setBoosting(false); }
          }}>Boost</button>
        </div>
      )}
      {boosted && !shown.length && <div className="cp-note">{Icon.clockLine("var(--muted)")}<span>Boosted. Every worker in your category has been told.</span></div>}

      {unverified && !shown.length && (
        <div className="boost-row">
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <b>Get offers faster</b>
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
        {shown.map((o) => {
          const left = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - now) / 60000));
          const at = asap ? clock(new Date(Date.now() + o.eta_minutes * 60000)) : clock(new Date(startAt));
          const photo = avatarUrl(o.photo_path);
          const first = o.full_name.split(" ")[0];
          const insured = (extras[o.worker_id]?.creds ?? []).includes("Insured");
          const sub = [insured ? "Insured" : "", o.jobs_for_me > 0 ? `${o.jobs_for_me} job${o.jobs_for_me === 1 ? "" : "s"} for you` : "", o.id_verified ? "" : "ID not checked"].filter(Boolean).join(" · ");
          const reviewed = o.scores?.reviewed ?? 0;
          const rec = reviewed ? `${Math.round(((o.scores?.recommended ?? 0) / reviewed) * 100)}%` : "New";
          const recSub = reviewed ? "recommend" : "no reviews yet";
          return (
            <section key={o.worker_id} className="ox">
              {/* Photo first, with name, age and the gold ID tick on it: the way Uber and Airbnb show the person who's coming. */}
              <button className="ox-pic" onClick={() => setProfile(o.worker_id)} style={photo ? { backgroundImage: `url(${photo})` } : undefined} aria-label={`${o.full_name}'s profile`}>
                {!photo && <span className="ox-ini">{o.full_name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>}
                <span className={`ox-left${left <= 3 ? " soon" : ""}`}>{left} min left</span>
                <span className="ox-nm">
                  <span className="n">{o.full_name}{o.age != null && <>, <i>{o.age}</i></>}{o.id_verified && <GoldTick />}</span>
                  {sub && <span className="s">{sub}</span>}
                </span>
              </button>
              <div className="ox-st">
                <div><b>{rec}</b><small>{recSub}</small></div>
                <div><b>{o.jobs_done}</b><small>jobs done</small></div>
                <div><b>{o.turns_up != null ? `${o.turns_up}%` : "New"}</b><small>turn up</small></div>
              </div>
              <div className="ox-eta">Can be there <b>{at}</b>{o.distance_km != null && <i>{o.distance_km} km away</i>}</div>
              <div className="ox-btns">
                <button className="btn stone" onClick={() => ignore(o)} disabled={!!busy}>Ignore</button>
                <button className="btn primary" onClick={() => choose(o)} disabled={!!busy}>{busy === o.worker_id ? "Booking…" : `Select ${first}`}</button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="cp-note">
        {Icon.msg("var(--muted)")}
        <span>Messages open with the person you choose. Everyone else is told the job's taken.</span>
      </div>
      {!shown.length && (
        <div className="cp-note">
          <span>Know someone who could do this? <button className="link" style={{ padding: 0 }} onClick={async () => {
            const r = await shareLink(`Paid job on Mahi Man: ${title}, ${price}. Workers keep 100%.`, `${SITE}/work`);
            if (r === "copied") toast("Link copied. Paste it in a message.");
          }}>Share the job</button></span>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 16px calc(var(--safe-bottom) + 24px)" }}>
        <button className="link quiet" onClick={onCancel}>Cancel this job</button>
      </div>
      {verifying && <VerifyFlow onClose={() => { setVerifying(false); reload(); }} />}
      {profile && <WorkerProfile workerId={profile} onBack={() => setProfile(null)} />}
      {needCard && <AddCardScreen onBack={() => setNeedCard(null)} onSaved={() => { const o = needCard; setNeedCard(null); window.setTimeout(() => choose(o), 200); }} />}
    </div>
  );
}
