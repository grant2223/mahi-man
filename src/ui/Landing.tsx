import { useEffect, useState } from "react";
import { rpc, sb, type Category } from "../lib/supabase";
import { money } from "../lib/format";
import { go } from "../lib/router";
import { CatIcon, Icon, Logo } from "./kit";

/* moremahi.com for first-time visitors on the web. Leads with the customer (the job gets done today),
   shows why it's safe, then gives workers their own section. The app itself opens straight on Get help. */

const link = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); go(to); };

export function Landing() {
  const [cats, setCats] = useState<Category[]>([]);
  // Real open jobs for the Earn section, so workers see actual work. Hidden when there are none.
  const [open, setOpen] = useState<{ id: string; job_name: string; category: string | null; icon: string; suburb: string; asap: boolean; pay_cents: number }[]>([]);
  useEffect(() => { rpc<typeof open>("jobs_feed").then((r) => setOpen((r ?? []).slice(0, 3))).catch(() => {}); }, []);
  useEffect(() => { sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[])); }, []);

  return (
    <div className="ld">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={link("/")}><Logo /> More Mahi</a>
        <nav className="ld-links">
          <a href="#how">How it works</a>
          <a href="#earn">Earn</a>
          <a href="/post" onClick={link("/post")}>Sign in</a>
        </nav>
        <a className="btn primary small" href="/post" onClick={link("/post")}>Post a job</a>
      </div></header>

      <section className="ld-hero">
        <div className="ld-wrap ld-hero-in">
          <div className="ld-hero-text">
            <span className="ld-pin">{Icon.pin("#d4f04c")} Cairns</span>
            <h1>Odd jobs,<br />done today.</h1>
            <p>Say what you need. Local, ID-checked people tell you they're free. You pick who, and pay them when it's done.</p>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <a className="btn lime" href="/post" onClick={link("/post")}>Post a job {Icon.arrow("var(--ink)")}</a>
              <a className="btn ghost" href="/find" onClick={link("/find")}>Find work</a>
            </div>
          </div>
          <img className="ld-mascot" src="/mascot.png" alt="" />
        </div>
      </section>

      <section className="ld-trust">
        <div className="ld-wrap ld-trust-in">
          {[["ID checked", "Every worker's passport or ID is checked by hand."], ["Licences checked", "Jobs that need a licence only go to people who have one."],
            ["Pay when it's done", "Bank transfer or cash, straight to the worker."], ["Real reviews", "Only from people who actually booked them."]].map(([b, t]) => (
            <div key={b} className="ld-trust-item">{Icon.shieldTick("var(--emerald)")}<span><b>{b}</b><span>{t}</span></span></div>
          ))}
        </div>
      </section>

      <section className="ld-sec">
        <div className="ld-wrap">
          <h2>What do you need done?</h2>
          <div className="ld-cats">
            {cats.map((c) => (
              <a key={c.id} className="ld-cat" href="/post" onClick={link("/post")}>
                <CatIcon name={c.icon} size={30} color="var(--emerald)" />
                <span>{c.name}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-sec alt" id="how">
        <div className="ld-wrap">
          <h2>How it works</h2>
          <div className="ld-steps">
            {[["Just say it", "Talk it through or type it. We write up the job, what's included and what isn't."],
              ["Choose who", "People who are free right now offer. See their photo, reviews and skills, then pick one."],
              ["Pay when it's done", "Check the after photos, then pay them directly. No card needed during the pilot."]].map(([b, t], i) => (
              <div key={b} className="ld-step"><span className="ld-n">{i + 1}</span><b>{b}</b><span>{t}</span></div>
            ))}
          </div>
          <a className="btn primary" href="/post" onClick={link("/post")}>Post a job {Icon.arrow("#fff")}</a>
        </div>
      </section>

      <section className="ld-earn" id="earn">
        <div className="ld-wrap ld-earn-in">
          <div>
            <h2>Earn on your terms.</h2>
            <p>Pick the work you're happy to do, go online when it suits you, and keep 100% of the price. Customers pay you straight to your bank.</p>
            <ul>
              <li>{Icon.tick("var(--lime)", 18)} See open jobs before you sign up</li>
              <li>{Icon.tick("var(--lime)", 18)} No ABN needed to start</li>
              <li>{Icon.tick("var(--lime)", 18)} Set up in about 10 minutes</li>
            </ul>
            <a className="btn lime" href="/find" onClick={link("/find")}>See jobs near you {Icon.arrow("var(--ink)")}</a>
          </div>
          {open.length > 0 && (
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
          )}
        </div>
      </section>

      <section className="ld-sec">
        <div className="ld-wrap ld-faq">
          <h2>Questions</h2>
          {[["What does it cost?", "Posting is free during the Cairns pilot. You set the price of the job and pay the worker directly."],
            ["Who are the workers?", "Local people whose ID we've checked by hand. Licensed work only goes to people whose licence we've checked."],
            ["What if something goes wrong?", "Report it in the app before you pay. We look at every report and sort it out with both of you."],
            ["Can I do both?", "Yes. One account lets you post jobs and do work. Switch between Get help and Do work any time."]].map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <footer className="ld-foot">
        <div className="ld-wrap row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <span className="brand"><Logo /> More Mahi</span>
          <span className="row" style={{ gap: 18 }}>
            <a href="/privacy" onClick={link("/privacy")}>Privacy</a>
            <a href="/terms" onClick={link("/terms")}>Terms</a>
            <a href="/support" onClick={link("/support")}>Help</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
