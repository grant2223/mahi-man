// Straight after posting, until the first person says they're free.
// Like an order-placed screen (Uber Eats, DoorDash, Airtasker's "task posted"): a clear "it worked",
// the job itself, what happens next, then Share, Cancel and Home side by side. No clock.
import { useEffect, useState } from "react";
import { mediaUrls, sb } from "../lib/supabase";
import { go } from "../lib/router";
import { shareLink, SITE } from "../lib/share";
import { Icon, Logo, useToast } from "../ui/kit";

const hmShort = (d: string) => new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
// "Posted 3:02 pm today, 37 minutes ago": when, without a ticking clock.
export const postedAgo = (d: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  const today = new Date(d).toDateString() === new Date().toDateString();
  const span = m < 1 ? "just now" : m < 60 ? `${m} minute${m === 1 ? "" : "s"} ago` : m < 1440 ? `${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? "" : "s"} ago` : `${Math.round(m / 1440)} days ago`;
  return `Posted ${hmShort(d)}${today ? " today" : `, ${new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}, ${span}`;
};

// The job's suburb and first photo, for the job line on the posted, cancel and cancelled screens.
export function useJobLook(jobId: string) {
  const [suburb, setSuburb] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    sb.from("jobs").select("suburbs(name)").eq("id", jobId).single().then(({ data }) => setSuburb((data?.suburbs as unknown as { name: string } | null)?.name ?? ""));
    sb.from("job_media").select("path").eq("job_id", jobId).eq("kind", "photo").order("sort").limit(1).then(async ({ data }) => {
      const p = data?.[0]?.path; if (p) setPhoto((await mediaUrls([p]))[p] ?? null);
    });
  }, [jobId]);
  return { suburb, photo };
}
export function JobLine({ photo, title, parts }: { photo: string | null; title: string; parts: (string | null | undefined)[] }) {
  return (
    <div className="ps-job">
      {photo ? <img src={photo} alt="" /> : <span className="ps-ph" />}
      <span><b>{title}</b><small>{parts.filter(Boolean).join(", ")}</small></span>
    </div>
  );
}

export function PostedView({ jobId, title, price, when, trade, onCancel }: {
  jobId: string; title: string; price: string; when: string; trade?: boolean; onCancel: () => void;
}) {
  const toast = useToast();
  const { suburb, photo } = useJobLook(jobId);
  const share = async () => {
    const r = await shareLink(`Paid job on Mahi Man: ${title}, ${price}${suburb ? ` in ${suburb}` : ""}.`, `${SITE}/work`);
    if (r === "copied") toast("Link copied. Paste it in a message.");
  };
  const job = <JobLine photo={photo} title={title} parts={[price, suburb, when]} />;
  const buttons = (
    <div className="ps-btns three">
      <button className="btn stone" onClick={share}>{Icon.share("currentColor")}Share</button>
      <button className="btn out" onClick={onCancel}>{Icon.cancel("currentColor")}Cancel</button>
      <button className="btn primary" onClick={() => go("/", true)}>{Icon.home("currentColor")}Home</button>
    </div>
  );
  const who = trade ? "tradies" : "people";

  // Light, like the rest of the app: the green header says it worked, the radar shows we're looking.
  return (
    <div className="app ps" style={{ background: "var(--ground)" }}>
      <section className="hero ps-hero">
        <div className="hero-top"><button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button></div>
        <h1 className="ps-h">Your job is posted.</h1>
        {job}
      </section>
      <div className="sb-a ps-look" aria-live="polite">
        <div className="sb-radar" aria-hidden="true">
          <span className="ring" /><span className="ring" /><span className="ring" /><span className="sweep" />
          <span className="dot" style={{ left: "22%", top: "30%" }} /><span className="dot" style={{ left: "74%", top: "24%", animationDelay: "1.1s" }} />
          <span className="dot" style={{ left: "66%", top: "72%", animationDelay: "2.3s" }} />
          <span className="pin"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg></span>
        </div>
        <p className="sb-h">Finding {who} near you<span className="sb-dots"><i>.</i><i>.</i><i>.</i></span></p>
        <p className="sb-s">When someone's free, they'll show here and you select who does it. We'll send you an alert.</p>
      </div>
      <div style={{ flex: 1 }} />
      <div className="ps-foot">{buttons}</div>
    </div>
  );
}
