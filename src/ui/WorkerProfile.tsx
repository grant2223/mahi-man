import { useEffect, useState } from "react";
import { avatarUrl, rpc, type Work, workPhotoUrls } from "../lib/supabase";
import { CatIcon, Icon, Screen } from "./kit";
import { GoldTick } from "../customer/Offers";
import type { Scores } from "./Ratings";

interface Portfolio {
  name: string; age: number | null; photo: string | null; verified: boolean; since: string; suburb: string | null;
  jobs: number; scores: Scores | null; turns_up: number | null;
  sections: Work[];
  creds: { name: string; expiry: string | null }[];
}

const monthYear = (d: string) => new Date(d).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const yearsLine = (y: number | null, kind: string) => y == null ? "" : y >= 10 ? `10+ years doing ${kind}` : y === 0 ? `New to ${kind}` : `${y} year${y === 1 ? "" : "s"} doing ${kind}`;

// A worker's work, built from their finished jobs: the kind of work in the customer's job first.
export function WorkerProfile({ workerId, category = null, onBack }: { workerId: string; category?: number | null; onBack: () => void }) {
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
  const rec = p?.scores?.reviewed ? `${p.scores.recommended} of ${p.scores.reviewed}` : "New";

  return (
    <Screen title={p ? `${first}'s work` : "Their work"} onBack={onBack}>
      <div className="screen-body pf">
        {err && <p className="t15 muted" style={{ padding: 16 }}>{err}</p>}
        {p && <>
          <div className={face ? "pf-top" : "pf-top noface"} style={face ? { backgroundImage: `url(${face})` } : { background: "var(--hero)" }}>
            <div className="w">
              <div className="n"><span>{p.name}{p.age != null && <i>, {p.age}</i>}</span>{p.verified && <GoldTick s={26} />}</div>
              <div className="s">{[p.suburb, `On Mahi Man since ${monthYear(p.since)}`].filter(Boolean).join(". ")}</div>
            </div>
          </div>
          <div className="pf-all">
            <div><b>{p.jobs}</b><small>jobs done</small></div>
            <div><b>{rec}</b><small>{p.scores?.reviewed ? "would hire again" : "no reviews yet"}</small></div>
            <div><b>{p.turns_up != null ? `${p.turns_up}%` : "New"}</b><small>turn up on time</small></div>
          </div>
          {p.sections.map((s, i) => {
            const kind = s.category.toLowerCase();
            const big = i === 0 || s.category_id === category;
            const pics = s.photos.filter((x) => urls[x.path]);
            const own = pics.length > 0 && pics.every((x) => x.src === "work");
            const line = [
              s.jobs ? `${s.jobs} job${s.jobs === 1 ? "" : "s"}` : "No Mahi Man jobs yet",
              s.reviewed ? (s.recommended === s.reviewed ? (s.reviewed === 1 ? "would hire again" : "all would hire again") : `${s.recommended} would hire again`) : "",
            ].filter(Boolean).join(", ") + (s.years != null ? `. ${yearsLine(s.years, kind)}` : "");
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
    </Screen>
  );
}
