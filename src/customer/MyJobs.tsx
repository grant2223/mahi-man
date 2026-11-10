import { useEffect, useState } from "react";
import { firstPhoto, mediaUrls, sb, type Job } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money2, whenLabel } from "../lib/format";
import { Icon, Loading, Logo } from "../ui/kit";
import { SideSwitch } from "../ui/SideSwitch";
import { HeaderIcons } from "../ui/HeaderIcons";

const STATUS: Record<string, string> = {
  awaiting_payment: "Not booked", searching: "Finding someone", accepted: "On the way", in_progress: "Working",
  finished: "Confirm to pay", confirmed: "Done", disputed: "Being looked at", cancelled: "Cancelled", refunded: "Refunded",
};

export function MyJobs() {
  const { session, profile } = useSession();
  const [jobs, setJobs] = useState<(Job & { job_types: { name: string }; job_media: { path: string; kind: string; sort: number }[] })[] | null>(null);
  const [pics, setPics] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!session) return;
    sb.from("jobs").select("*, job_types(name), job_media(path,kind,sort)").eq("customer_id", session.user.id).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setJobs((data ?? []) as never));
  }, [session]);
  useEffect(() => { if (jobs?.length) mediaUrls(jobs.map((j) => firstPhoto(j.job_media)).filter(Boolean) as string[]).then(setPics); }, [jobs]);

  return (
    <div className="app">
      <section className="hero short">
        <div className="hero-top">
          <button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button>
          <HeaderIcons jobs={false} />
        </div>
        <SideSwitch side="help" />
        <h1 className="mid">My jobs</h1>
        <p className="lede">{profile?.full_name}</p>
      </section>
      <div className="ticket">
        {!jobs && <Loading />}
        {jobs?.length === 0 && <div className="pad muted">No bookings yet.</div>}
        {jobs?.map((j) => (
          <button key={j.id} className="li" onClick={() => go(`/job/${j.id}`)}>
            {(() => { const p = firstPhoto(j.job_media); return p && pics[p] ? <span className="li-pic" style={{ backgroundImage: `url("${pics[p]}")` }} /> : null; })()}
            <span className="t">
              <b>{j.title || j.job_types.name}</b>
              <span>{whenLabel(j.asap, j.start_at)}, {money2(j.price_cents + j.extra_cents + (j.payment_intent_id ? j.fee_cents : 0))}</span>
            </span>
            <span className={j.status === "finished" ? "t15 w5 em" : "small muted"}>{STATUS[j.status]}</span>
            {Icon.chevron("var(--faint)")}
          </button>
        ))}
      </div>
      <div className="footer" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={() => go("/post")}>Post a job</button>
      </div>
    </div>
  );
}
