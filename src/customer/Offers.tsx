import { useEffect, useState } from "react";
import { avatarUrl, rpc } from "../lib/supabase";
import { elapsed } from "../lib/format";
import { Icon, Logo, useNow, useToast } from "../ui/kit";
import { go } from "../lib/router";
import { shareLink, SITE } from "../lib/share";
import { WorkerProfile } from "../ui/WorkerProfile";
import { AddCardScreen, CardMark, cardLabel, stripeFor } from "./Cards";
import { useSession } from "../lib/session";
import { api } from "../lib/supabase";
import { money2 } from "../lib/format";
import { expLabel } from "../worker/Skills";
import { VerifyFlow } from "../ui/Verify";

export interface Offer {
  worker_id: string; full_name: string; photo_path: string | null; id_verified: boolean; rating: number | null; jobs_done: number;
  jobs_for_me: number; eta_minutes: number; distance_km: number | null; expires_at: string; is_new: boolean;
  category: string | null; cat_rating: number | null; cat_jobs: number; local_customers: number; suburb: string;
}

interface Extra { worker_id: string; skills: string[]; years: number | null; gear: string[]; creds: string[] }

const clock = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();

// The customer's job while it's open: people who say they're available, and Yes or Ignore on each.
export function OffersView({ jobId, title, price, asap, startAt, searchingAt, boosted, feeDue = 0, onChosen, onCancel, onBoosted }: {
  jobId: string; title: string; price: string; asap: boolean; startAt: string; searchingAt: string; boosted: boolean; feeDue?: number; onChosen: () => void; onCancel: () => void; onBoosted: () => void;
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
  const [recs, setRecs] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [profile, setProfile] = useState<string | null>(null);
  const ids = (offers ?? []).map((o) => o.worker_id).join(",");
  useEffect(() => {
    if (!ids) return;
    rpc<{ worker_id: string; people: number }[]>("recommended_counts", { p_workers: ids.split(",") })
      .then((r) => setRecs(Object.fromEntries((r ?? []).map((x) => [x.worker_id, Number(x.people)])))).catch(() => {});
    rpc<Extra[]>("offer_extras", { p_job: jobId })
      .then((r) => setExtras(Object.fromEntries((r ?? []).map((x) => [x.worker_id, x])))).catch(() => {});
  }, [ids, jobId]);
  const widened = now - new Date(searchingAt).getTime() > 10 * 60000;

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

  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <section className="hero cp-hero" style={{ paddingBottom: 24 }}>
        <div className="hero-top cp-top">
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          <span className="jn">{title}, {price}</span>
        </div>
        {shown.length ? (
          <>
            <span className="label" style={{ marginTop: 18 }}>Who's available</span>
            <span className="big lime">{shown.length}</span>
            <span className="sub" style={{ marginTop: 6 }}>Pick who you want. Each offer lasts 15 minutes.</span>
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
            <span>Every worker in your category gets an alert and your job goes to the top. Free during the pilot.</span>
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
            {me?.card_last4 ? <>Choosing someone charges the <b className="w5">{money2(feeDue)}</b> booking fee to {cardLabel(me)}.</> : <>Choosing someone charges the <b className="w5">{money2(feeDue)}</b> booking fee. You'll add a card first.</>}
          </span>
        </div>
      )}
      <div className="offers">
        {shown.map((o) => {
          const left = Math.max(0, Math.ceil((new Date(o.expires_at).getTime() - now) / 60000));
          const at = asap ? clock(new Date(Date.now() + o.eta_minutes * 60000)) : clock(new Date(startAt));
          const photo = avatarUrl(o.photo_path);
          const first = o.full_name.split(" ")[0];
          return (
            <div key={o.worker_id} className="offer">
              <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                <span className="ph">{photo ? <img src={photo} alt="" /> : null}</span>
                <span className="t">
                  <span className="row between" style={{ gap: 8, alignItems: "baseline" }}>
                    <button className="name-link" onClick={() => setProfile(o.worker_id)}>{o.full_name}{Icon.chevron("var(--muted)")}</button>
                    <span className={`left${left <= 3 ? " soon" : ""}`}>{left} min left</span>
                  </span>
                  <span className="row" style={{ gap: "2px 12px", flexWrap: "wrap" }}>
                    {o.id_verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not ID verified</span>}
                    {o.jobs_for_me > 0 && <span className="badge-ver">Used before</span>}
                    {(extras[o.worker_id]?.creds ?? []).map((c) => <span key={c} className="badge-ver">{Icon.shieldTick("var(--emerald)")}{c}</span>)}
                  </span>
                  {(() => {
                    const x = extras[o.worker_id];
                    if (!x) return null;
                    const exp = [x.years != null ? expLabel(x.years) : "", x.gear.length ? `brings ${x.gear.slice(0, 2).join(", ").toLowerCase()}` : ""].filter(Boolean).join(", ");
                    return <>
                      {x.skills.length > 0 && <span className="m sk">{x.skills.slice(0, 2).join(", ")}{x.skills.length > 2 ? ` +${x.skills.length - 2}` : ""}</span>}
                      {exp && <span className="m">{exp.charAt(0).toUpperCase() + exp.slice(1)}</span>}
                    </>;
                  })()}
                  <span className="m">
                    {o.is_new ? `New to More Mahi, ${o.jobs_done} job${o.jobs_done === 1 ? "" : "s"}`
                      : o.category && o.cat_jobs > 0 ? `${o.cat_rating ? `${o.cat_rating} for ${o.category.toLowerCase()}, ` : ""}${o.cat_jobs} job${o.cat_jobs === 1 ? "" : "s"}`
                      : `${o.rating ? `${o.rating} rating, ` : ""}${o.jobs_done} jobs`}
                    {o.jobs_for_me > 0 ? `, ${o.jobs_for_me} for you` : ""}
                  </span>
                  {(() => {
                    const r = recs[o.worker_id] ?? 0;
                    const parts = [r > 0 ? `Recommended by ${r} ${r === 1 ? "person" : "people"}` : "", o.local_customers > 0 ? `${r > 0 ? "used" : "Used"} by ${o.local_customers} in ${o.suburb}` : ""].filter(Boolean);
                    return parts.length ? <span className={r > 0 ? "m em" : "m"}>{parts.join(", ")}</span> : null;
                  })()}
                  <span className="e">Can be there {at}{o.distance_km != null ? `, ${o.distance_km} km away` : ""}</span>
                </span>
              </div>
              <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
                <button className="btn stone" onClick={() => ignore(o)} disabled={!!busy}>Ignore</button>
                <button className="btn primary" onClick={() => choose(o)} disabled={!!busy}>{busy === o.worker_id ? "Booking…" : `Yes, choose ${first}`}</button>
              </div>
            </div>
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
            const r = await shareLink(`Paid job on More Mahi: ${title}, ${price}. Workers keep 100%.`, `${SITE}/work`);
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
