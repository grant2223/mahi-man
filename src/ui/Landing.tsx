import { useEffect, useState } from "react";
import { rpc, sb, type Category } from "../lib/supabase";
import { money } from "../lib/format";
import { go } from "../lib/router";
import { CatIcon, Icon, Logo } from "./kit";

/* moremahi.com for first-time visitors on the web. Sells to Cairns locals with jobs on their list first,
   then to people who want extra work. The app itself opens straight on Get help. */

const link = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); go(to); };

// Real photos live in /public/landing. Until a photo is there, its frame shows a quiet label instead.
function Photo({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [ok, setOk] = useState(true);
  return ok ? <img className={className} src={src} alt={alt} onError={() => setOk(false)} /> : <span className={`${className} ld-photo-empty`}>{alt}</span>;
}

const USES: [string, string, string][] = [
  ["Moving out", "Bond clean, booked for today. Get your full deposit back without losing your weekend.", "/landing/bond-clean.jpg"],
  ["Hosting on Airbnb", "Turnover cleans between guests, even when check-in is in three hours.", "/landing/airbnb.jpg"],
  ["Yard gone wild", "Mowing, edges and green waste gone before the wet season hits.", "/landing/yard.jpg"],
];

export function Landing() {
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState<{ id: string; job_name: string; category: string | null; icon: string; suburb: string; asap: boolean; pay_cents: number }[]>([]);
  useEffect(() => {
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    rpc<typeof open>("jobs_feed").then((r) => setOpen((r ?? []).slice(0, 3))).catch(() => {});
  }, []);

  return (
    <div className="ld">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={link("/")}><Logo /> More Mahi</a>
        <nav className="ld-links">
          <a href="#how">How it works</a>
          <a href="#earn">Find work</a>
          <a href="/post" onClick={link("/post")}>Sign in</a>
        </nav>
        <a className="btn small ld-nav-cta" href="/post" onClick={link("/post")}>Post a job</a>
      </div></header>

      <section className="ld-hero">
        <div className="ld-wrap ld-hero-in">
          <div className="ld-hero-text">
            <span className="ld-pin">{Icon.pin("#d4f04c")} Now in Cairns</span>
            <h1>Get it done today.</h1>
            <p>Cleaning, yard work, moving, the lot. Locals who can come today, and you only pay when you're happy with it.</p>
            <div className="row ld-ctas">
              <a className="btn lime" href="/post" onClick={link("/post")}>Post a job, free {Icon.arrow("var(--ink)")}</a>
              <a className="btn ghost" href="/find" onClick={link("/find")}>Want work?</a>
            </div>
          </div>
          <Photo className="ld-hero-photo" src="/landing/hero.jpg" alt="A local worker on a job" />
        </div>
      </section>

      <section className="ld-trust">
        <div className="ld-wrap ld-trust-in">
          {[["ID checked by hand", "Every worker, before their first job."], ["Licensed where it counts", "Trade jobs only go to people with the licence."],
            ["Pay when you're happy", "Straight to them by bank transfer or cash."], ["Reviewed by locals", "Only people who booked them can review."]].map(([b, t]) => (
            <div key={b} className="ld-trust-item">{Icon.shieldTick("var(--emerald)")}<span><b>{b}</b><span>{t}</span></span></div>
          ))}
        </div>
      </section>

      <section className="ld-sec">
        <div className="ld-wrap">
          <h2>Whatever's on your list.</h2>
          <div className="ld-uses">
            {USES.map(([t, d, src]) => (
              <a key={t} className="ld-use" href="/post" onClick={link("/post")}>
                <Photo className="ld-use-photo" src={src} alt={t} />
                <b>{t}</b>
                <span>{d}</span>
              </a>
            ))}
          </div>
          <div className="ld-cats">
            {cats.map((c) => (
              <a key={c.id} className="ld-cat" href="/post" onClick={link("/post")}>
                <CatIcon name={c.icon} size={26} color="var(--emerald)" />
                <span>{c.name}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-sec alt" id="how">
        <div className="ld-wrap">
          <h2>Sorted in three steps.</h2>
          <div className="ld-steps">
            {[["Tell us the job", "Talk or type. It takes a minute, and you set the price."],
              ["Pick your person", "Locals who are free say so. See their photo, reviews and skills, and choose."],
              ["Pay when it's done", "Check the after photos. Happy? Pay them directly. Not happy? Tell us first."]].map(([b, t], i) => (
              <div key={b} className="ld-step"><span className="ld-n">{i + 1}</span><b>{b}</b><span>{t}</span></div>
            ))}
          </div>
          <a className="btn primary" href="/post" onClick={link("/post")}>Post a job, free {Icon.arrow("#fff")}</a>
        </div>
      </section>

      <section className="ld-earn" id="earn">
        <div className="ld-wrap ld-earn-in">
          <div className="ld-earn-text">
            <h2>Make more mahi.</h2>
            <p>Turn spare hours into cash. Pick the jobs you like, close to where you are, whenever it suits you.</p>
            <ul>
              <li>{Icon.tick("var(--lime)", 18)} Keep 100% of every job</li>
              <li>{Icon.tick("var(--lime)", 18)} Paid straight to your bank</li>
              <li>{Icon.tick("var(--lime)", 18)} No ABN needed to start</li>
            </ul>
            <a className="btn lime" href="/find" onClick={link("/find")}>See jobs near you {Icon.arrow("var(--ink)")}</a>
          </div>
          {open.length > 0 ? (
            <div className="ld-jobs">
              <span className="ld-jobs-k">Open now in Cairns</span>
              {open.map((j) => (
                <a key={j.id} className="ld-job" href="/find" onClick={link("/find")}>
                  <CatIcon name={j.icon} size={26} color="var(--emerald)" />
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}><b>{j.job_name}</b><span>{j.category}, {j.suburb}{j.asap ? ", now" : ""}</span></span>
                  <span className="p">{money(j.pay_cents)}</span>
                </a>
              ))}
            </div>
          ) : <Photo className="ld-earn-photo" src="/landing/worker.jpg" alt="A local earning on More Mahi" />}
        </div>
      </section>

      <section className="ld-sec">
        <div className="ld-wrap ld-faq">
          <h2>Good questions.</h2>
          {[["What does it cost?", "Posting a job is free while we launch in Cairns. You set the price and pay the worker directly when it's done."],
            ["Who's coming to my place?", "A local whose ID we've checked by hand. You see their photo, reviews and skills before you choose them."],
            ["What if it's not done right?", "Don't pay yet. Report it in the app and we'll sort it out with both of you."],
            ["Can I post jobs and do work?", "Yes. One account does both. Switch between Get help and Do work any time."]].map(([q, a]) => (
            <details key={q}><summary>{q}{Icon.down("var(--muted)")}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="ld-final">
        <div className="ld-wrap ld-final-in">
          <h2>Got a job? Get it off your list today.</h2>
          <a className="btn primary" href="/post" onClick={link("/post")}>Post a job, free {Icon.arrow("#fff")}</a>
        </div>
      </section>

      <footer className="ld-foot">
        <div className="ld-wrap ld-foot-in">
          <span className="brand"><Logo /> More Mahi</span>
          <span className="row" style={{ gap: 20 }}>
            <a href="/privacy" onClick={link("/privacy")}>Privacy</a>
            <a href="/terms" onClick={link("/terms")}>Terms</a>
            <a href="/support" onClick={link("/support")}>Help</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
