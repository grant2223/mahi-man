import { useEffect, useState } from "react";
import { rpc } from "../lib/supabase";
import { money } from "../lib/format";
import { Icon, Loading, Screen } from "../ui/kit";

/* How reliable a worker is: the "Turns up" score customers see, their strikes, and anything they owe. */

interface Rel {
  turns_up: number | null; strikes_30: number; strikes_90: number; limit_30: number; limit_90: number; offline_days: number;
  last: { at: string; kind: string; job: string } | null; offline_until: string | null; owed_cents: number; payments_live: boolean;
}
const KIND: Record<string, string> = {
  cancelled_soon: "cancelled within 2 hours", cancelled_on_way: "cancelled on the way", late: "more than 15 minutes late",
  no_show: "didn't turn up", late_arrival: "arrived late",
};
const day = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export function Reliability({ onBack }: { onBack: () => void }) {
  const [r, setR] = useState<Rel | null>(null);
  useEffect(() => { rpc<Rel>("my_reliability").then(setR).catch(() => {}); }, []);
  if (!r) return <Screen title="Reliability" onBack={onBack}><Loading /></Screen>;
  const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
    <div className="row between" style={{ padding: "7px 0" }}><span className="t16 light">{k}</span><span className={strong ? "t17 w5" : "t16"}>{v}</span></div>
  );
  const Li = ({ b, s }: { b: string; s: string }) => <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>{b}</b> {s}</span></div>;
  return (
    <div className="screen" role="dialog" aria-label="Reliability">
      <div className="screen-body" style={{ background: "var(--card)" }}>
        <section className="step-hero" style={{ paddingBottom: 28 }}>
          <div className="top"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button></div>
          <span style={{ color: "rgba(255,255,255,.8)", fontSize: 15 }}>You turn up</span>
          <h1 style={{ fontSize: 56, letterSpacing: -2 }}>{r.turns_up != null ? `${r.turns_up}%` : "New"}</h1>
          <p>{r.turns_up != null ? "Customers see this on every offer you send." : "Shown to customers after your first 3 jobs."}</p>
        </section>
        {r.offline_until && (
          <div className="cp-sec" style={{ background: "#fbf3e4" }}>
            <span className="t17 w5" style={{ color: "#8a5a10" }}>Offline until {day(r.offline_until)}</span>
            <span className="t15 light muted">{r.limit_30} strikes in 30 days. You can go online again after that.</span>
          </div>
        )}
        <div className="cp-sec">
          <span className="cp-title">Strikes</span>
          <Row k="Last 30 days" v={`${r.strikes_30} of ${r.limit_30}`} strong />
          <Row k="Last 90 days" v={`${r.strikes_90} of ${r.limit_90}`} />
          {r.last && <Row k="Last strike" v={`${day(r.last.at)}, ${KIND[r.last.kind] ?? r.last.kind}`} />}
          {r.owed_cents > 0 && <Row k="Fees owed" v={money(r.owed_cents)} strong />}
          {r.owed_cents > 0 && <span className="t15 light muted" style={{ marginTop: 4 }}>{r.payments_live ? "Paid from your saved card before you go online." : "Collected once card payments start in the app."}</span>}
        </div>
        <div className="cp-sec" style={{ paddingBottom: "calc(var(--safe-bottom) + 32px)" }}>
          <span className="cp-title">How strikes work</span>
          <Li b={`${r.limit_30} in 30 days:`} s={`you're offline for ${r.offline_days} days.`} />
          <Li b={`${r.limit_90} in 90 days:`} s="we review your account." />
          <Li b="Strikes drop off on their own." s="Each one lasts 90 days." />
          <Li b="What's a strike?" s="Cancelling within 2 hours of a job, cancelling on the way, not turning up, or arriving more than 15 minutes late." />
        </div>
      </div>
    </div>
  );
}
