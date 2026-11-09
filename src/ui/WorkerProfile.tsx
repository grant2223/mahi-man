import { useEffect, useState } from "react";
import { rpc } from "../lib/supabase";
import { CatIcon, Icon, Screen, Tile } from "./kit";
import { expLabel } from "../worker/Skills";

interface Profile {
  name: string; photo: string | null; verified: boolean; rating: number | null; jobs: number; since: string;
  types: { category: string; icon: string; years: number | null; skills: string[]; gear: string[] }[];
  creds: string[];
}

// What a customer sees when they tap a worker: skills for each type of job, and verified licences.
export function WorkerProfile({ workerId, onBack }: { workerId: string; onBack: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { rpc<Profile | null>("worker_profile", { p_worker: workerId }).then((r) => r ? setP(r) : setErr("This profile isn't available.")).catch((e) => setErr(e.message)); }, [workerId]);
  const since = p ? new Date(p.since).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) : "";
  return (
    <Screen title="Profile" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--ground)" }}>
        {err && <p className="t15 muted" style={{ padding: 16 }}>{err}</p>}
        {p && <>
          <div className="cp-sec">
            <div className="row" style={{ gap: 14 }}>
              <Tile name={p.name} photo={p.photo} size={72} />
              <span className="stack" style={{ gap: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>{p.name}</span>
                {p.verified ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">Not ID verified</span>}
                <span className="t15 light muted">{p.rating ? `${p.rating} rating, ` : ""}{p.jobs} job{p.jobs === 1 ? "" : "s"}, since {since}</span>
              </span>
            </div>
          </div>
          {p.types.length > 0 && (
            <div className="cp-sec" style={{ marginTop: 10 }}>
              <span className="cp-title">Skills</span>
              {p.types.map((t) => (
                <div key={t.category} className="row" style={{ gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <CatIcon name={t.icon} size={24} color="var(--emerald)" />
                  <span className="stack" style={{ gap: 2, flex: 1 }}>
                    <span className="t17 w5">{t.category} {t.years != null && <span className="light muted">{expLabel(t.years)}</span>}</span>
                    {t.skills.length > 0 && <span className="t15 light">{t.skills.join(", ")}</span>}
                    <span className="small muted light">{t.gear.length ? `Brings ${t.gear.join(", ").toLowerCase()}` : "No gear"}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {p.creds.length > 0 && (
            <div className="cp-sec" style={{ marginTop: 10 }}>
              <span className="cp-title">Licences and certificates</span>
              {p.creds.map((c) => (
                <div key={c} className="row between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <span className="t17">{c}</span><span className="badge-ver">{Icon.shieldTick("var(--emerald)")}Verified</span>
                </div>
              ))}
            </div>
          )}
        </>}
      </div>
    </Screen>
  );
}
