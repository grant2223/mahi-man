import { useEffect, useState } from "react";
import { sb, type Job } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money2, whenLabel } from "../lib/format";
import { Icon, Logo } from "../ui/kit";

const STATUS: Record<string, string> = {
  awaiting_payment: "Not booked", searching: "Finding someone", accepted: "On the way", in_progress: "Working",
  finished: "Confirm to pay", confirmed: "Done", disputed: "Being looked at", cancelled: "Cancelled", refunded: "Refunded",
};

export function MyJobs() {
  const { session, profile } = useSession();
  const [jobs, setJobs] = useState<(Job & { job_types: { name: string } })[]>([]);
  useEffect(() => {
    if (!session) return;
    sb.from("jobs").select("*, job_types(name)").eq("customer_id", session.user.id).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setJobs((data ?? []) as never));
  }, [session]);

  return (
    <div className="app">
      <section className="hero short">
        <div className="hero-top">
          <button className="brand" onClick={() => go("/")}><Logo /> More Mahi</button>
          <button className="hero-link" onClick={() => go("/settings")}>Settings</button>
        </div>
        <h1 className="mid">My jobs</h1>
        <p className="lede">{profile?.full_name}</p>
      </section>
      <div className="ticket">
        {jobs.length === 0 && <div className="pad muted">No bookings yet.</div>}
        {jobs.map((j) => (
          <button key={j.id} className="li" onClick={() => go(`/job/${j.id}`)}>
            <span className="t">
              <b>{j.title || j.job_types.name}</b>
              <span>{whenLabel(j.asap, j.start_at)}, {money2(j.price_cents + j.extra_cents + (j.payment_intent_id ? j.fee_cents : 0))}</span>
            </span>
            <span className={j.status === "finished" ? "t15 w5 em" : "small muted"}>{STATUS[j.status]}</span>
            {Icon.chevron("var(--faint)")}
          </button>
        ))}
      </div>
      <div className="footer between">
        <button className="link" onClick={() => go("/work")}>Earn with More Mahi</button>
        <button className="btn primary" onClick={() => go("/post")}>Post a job</button>
      </div>
    </div>
  );
}
