import { useEffect, useState } from "react";
import { avatarUrl, rpc, type Work, workPhotoUrls } from "../lib/supabase";
import { CatIcon, Icon, Screen } from "./kit";
import { GoldTick } from "../customer/Offers";
import type { Scores } from "./Ratings";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { heart } from "../customer/People";
import { cardName } from "../lib/format";

interface Portfolio {
  name: string; age: number | null; photo: string | null; verified: boolean; since: string; suburb: string | null;
  jobs: number; scores: Scores | null; turns_up: number | null;
  sections: Work[];
  creds: { name: string; expiry: string | null }[];
  driver?: boolean; licence_class?: string | null; vehicles?: string[]; online?: boolean;
}

const monthYear = (d: string) => new Date(d).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const yearsLine = (y: number | null) => y == null || y === 0 ? "" : y >= 10 ? "10+ yrs" : `${y} yr${y === 1 ? "" : "s"}`;

// A worker's work, built from their finished jobs: the kind of work in the customer's job first.
// The same profile wherever a customer meets a worker: their offer, their card's link, Your people.
// From the card or Your people it also has Save and Book (a job sent to them first).
export function WorkerProfile({ workerId, category = null, onBack, onBook }: { workerId: string; category?: number | null; onBack: () => void; onBook?: () => void }) {
  const { session, profile } = useSession();
  const onPlus = !!profile?.plus_until && new Date(profile.plus_until) > new Date();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (onBook && session) rpc<boolean>("is_saved_worker", { p_key: workerId }).then((v) => setSaved(!!v)).catch(() => {}); }, [workerId, session, onBook]);
  // Saving people is part of Plus: without it, the heart opens Plus.
  const toggle = () => {
    if (!saved && !onPlus) { go("/plus"); return; }
    setSaved(!saved); rpc(saved ? "unsave_worker" : "save_worker", saved ? { p_worker: workerId } : { p_worker: workerId, p_heart: true }).catch(() => setSaved(saved));
  };
  const [p, setP] = useState<Portfolio | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  useEffect(() => {
    rpc<Portfolio | null>("worker_portfolio", { p_worker: workerId, p_category: category }).then(async (r) => {
      if (!r) { setErr("This profile isn't available."); return; }
      setP(r);
      setUrls(await workPhotoUrls(r.sections.flatMap((s) => s.photos)));
    }).catch((e) => setErr(e.message));
  }, [workerId, category]);
  const first = p?.name.split(" ")[0] ?? "";
  const face = avatarUrl(p?.photo);
  const rec = p?.scores?.reviewed ? `${p.scores.recommended}` : "New";

  return (
    <Screen title={p ? `${first}'s work` : "Their work"} onBack={onBack}
      right={onBook && session ? <button className={saved ? "pf-save on" : "pf-save"} onClick={toggle}>{heart(saved, "var(--gold)")}{saved ? "Saved" : "Save"}</button> : undefined}>
      <div className="screen-body pf">
        {err && <p className="t15 muted" style={{ padding: 16 }}>{err}</p>}
        {p && <>
          <div className={face ? "pf-top" : "pf-top noface"} style={face ? { backgroundImage: `url(${face})` } : { background: "var(--hero)" }}>
            <div className="w">
              <div className="n"><span>{cardName(p.name)}{p.age != null && <i> {p.age}</i>}</span>{p.verified && <GoldTick s={26} />}</div>
              <div className="s">{[p.suburb, `Since ${monthYear(p.since)}`].filter(Boolean).join(", ")}</div>
            </div>
          </div>
          {onBook && <div className={p.online ? "wp-now on" : "wp-now"}>{p.online ? <><i />Available now</> : "Offline, book for later"}</div>}
          <div className="pf-all">
            <div><b>{p.jobs}</b><small>Jobs</small></div>
            <div><b>{rec}</b><small>{p.scores?.reviewed ? "Thumbs up" : "No reviews"}</small></div>
            <div><b>{p.turns_up != null ? `${p.turns_up}%` : "New"}</b><small>On time</small></div>
          </div>
          {p.sections.map((s, i) => {
            const big = i === 0 || s.category_id === category;
            const pics = s.photos.filter((x) => urls[x.path]);
            const own = pics.length > 0 && pics.every((x) => x.src === "work");
            const line = [
              s.jobs ? `${s.jobs} job${s.jobs === 1 ? "" : "s"}` : "New here",
              s.recommended ? `${s.recommended} thumbs up` : "",
              yearsLine(s.years),
            ].filter(Boolean).join(", ");
            return (
              <section key={s.category_id} className={big ? "pf-sec" : "pf-sec small"}>
                <h2><CatIcon name={s.icon} size={big ? 24 : 22} color="var(--emerald)" />{s.category}{s.category_id === category && <em>Your job</em>}</h2>
                <div className="pf-line">{line}</div>
                {own && <span className="pf-added">{Icon.camera("var(--ink)")}Added by {first}. Not Mahi Man jobs yet</span>}
                {pics.length > 0 && (big
                  ? <div className="pf-grid">{pics.map((x) => <a key={x.path} href={urls[x.path]} target="_blank" rel="noreferrer" style={{ backgroundImage: `url("${urls[x.path]}")` }}>{x.suburb && <span className="c">{x.suburb}</span>}</a>)}</div>
                  : <div className="pf-thumbs">{pics.slice(0, 4).map((x) => <a key={x.path} href={urls[x.path]} target="_blank" rel="noreferrer" style={{ backgroundImage: `url("${urls[x.path]}")` }} />)}</div>)}
                {big && s.reviews.map((r) => (
                  <div key={r.at} className="pf-rv"><q>{r.comment}</q><span>{r.who}{r.job ? `, ${lcFirst(r.job)}` : ""} in {r.suburb}</span></div>
                ))}
                {big && (s.skills.length > 0 || s.gear.length > 0) && (
                  <div className="pf-kv">
                    {s.skills.length > 0 && <><b>Does:</b> {s.skills.map(lcFirst).join(", ")}<br /></>}
                    {s.gear.length > 0 && <><b>Brings:</b> {s.gear.map(lcFirst).join(", ")}</>}
                  </div>
                )}
              </section>
            );
          })}
          <section className="pf-sec small">
            <h2>{Icon.shieldTick("var(--emerald)")}Checked by Mahi Man</h2>
            <div className="pf-line">
              {[p.verified ? "ID verified" : "ID not checked yet",
                ...p.creds.map((c) => c.expiry ? `${c.name}, valid to ${monthYear(c.expiry)}` : c.name)].join(". ")}
            </div>
          </section>
          <div style={{ height: "calc(var(--safe-bottom) + 24px)" }} />
        </>}
      </div>
      {onBook && p && <div className="bottombar pf-book"><button className="btn primary" onClick={onBook}>Book {first}</button></div>}
    </Screen>
  );
}
