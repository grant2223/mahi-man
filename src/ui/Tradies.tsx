import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { money } from "../lib/format";
import { go } from "../lib/router";
import { Icon, Logo } from "./kit";
import { LdLinks, SiteFooter, StoreBadges } from "./Landing";

/* mahiman.app/tradies: one job, get tradespeople to download Mahi Man and finish a tradie profile.
   Same message as the printed tradie flyer. Every price and number comes from the live settings. */

const JOIN = "/get?utm_source=web&utm_campaign=tradies";
const TRADES: [string, string][] = [
  ["Electrical", "electrical"], ["Plumbing", "plumbing"], ["Carpentry", "carpentry"],
  ["Concreting", "concreting"], ["Roofing", "roofing"], ["Landscaping", "landscaping"],
];
const MORE = "Plus air conditioning, painting, tiling, fencing, cleaning, mobile mechanics, appliance repairs, locksmiths and more.";

type T = { win: number; month: number; year: number; after: number; early: number; first: number; more: number; every: number; max: number; open: number; life: number; seats: number; sold: number };
const DEF: T = { win: 9900, month: 24900, year: 249900, after: 60, early: 10, first: 5, more: 5, every: 30, max: 15, open: 48, life: 250000, seats: 20, sold: 0 };

function useTradeNumbers() {
  const [t, setT] = useState<T>(DEF);
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["trade_win_fee_cents", "trade_premium_month_cents", "trade_premium_year_cents",
      "trade_standard_after_minutes", "trade_standard_early_minutes", "trade_first_quotes", "trade_more_quotes", "trade_more_every_minutes", "trade_max_quotes", "trade_quiet_hours", "trade_lifetime_cents", "trade_lifetime_seats", "trade_lifetime_sold"]).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
      setT((d) => ({ ...d, win: m.trade_win_fee_cents ?? d.win, month: m.trade_premium_month_cents ?? d.month, year: m.trade_premium_year_cents ?? d.year,
        after: m.trade_standard_after_minutes ?? d.after, early: m.trade_standard_early_minutes ?? d.early, first: m.trade_first_quotes ?? d.first,
        more: m.trade_more_quotes ?? d.more, every: m.trade_more_every_minutes ?? d.every, max: m.trade_max_quotes ?? d.max, open: m.trade_quiet_hours ?? d.open, life: m.trade_lifetime_cents ?? d.life, seats: m.trade_lifetime_seats ?? d.seats, sold: m.trade_lifetime_sold ?? d.sold }));
    });
  }, []);
  return t;
}

const after = (min: number) => min >= 60 && min % 60 === 0 ? `${min / 60} hour${min === 60 ? "" : "s"}` : `${min} minutes`;
const join = (e: React.MouseEvent) => { e.preventDefault(); location.href = JOIN; };

export function TradiesPage() {
  const t = useTradeNumbers();
  const left = Math.max(0, t.seats - t.sold);
  return (
    <div className="ld td">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><Logo /> Mahi Man</a>
        <LdLinks cta={<a className="btn small td-gold td-nav-cta" href={JOIN} onClick={join}>Join free</a>} />
      </div></header>
      <Hero />
      {/* How it works, the trades we need, then the money. */}
      <div className="td-flow">
        <Steps />
        <Trades />
        <Plans t={t} />
      </div>
      {left > 0 && <Launch t={t} left={left} />}
      <div className="td-flow">
        <Need />
        <Faq t={t} />
      </div>
      <Final />
      <SiteFooter />
      <div className="td-sticky"><a className="btn td-gold" href={JOIN} onClick={join}>Join free</a></div>
    </div>
  );
}

function Hero() {
  return (
    <section className="td-hero2">
      <div className="ld-wrap td-hero2-in">
        <div className="td-hero2-text">
          <h1>Receive job alerts directly on your phone.</h1>
          <p>The fastest, easiest way to win local jobs. No paying for leads, no bidding wars against 10 others.</p>
          <a className="btn td-gold" href={JOIN} onClick={join}>Join free {Icon.arrow("var(--ink)")}</a>
        </div>
        <div className="td-hero2-pic">
          <img src="/tradies/roofing.jpg" alt="A roofer at work" />
          <div className="td-notif">
            <img src="/mahi-head.png" alt="" />
            <span><b>Mahi Man</b><span>New job: re-sheet a garage roof, Edge Hill. Send your quote.</span></span>
            <small>now</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function Trades() {
  return (
    <section className="td-sec">
      <div className="ld-wrap">
        <h2>Tradies wanted.</h2>
        <div className="td-strip">
          {TRADES.map(([label, f]) => (
            <figure key={f} className="td-trade"><img src={`/tradies/${f}.jpg`} alt={label} loading="lazy" /><figcaption>{label}</figcaption></figure>
          ))}
        </div>
        <p className="td-more">{MORE}</p>
      </div>
    </section>
  );
}

function Steps() {
  const s: [string, string][] = [["Alert", "Receive a job alert"], ["Quote", "Send your quote"], ["Work", "Complete the job"]];
  return (
    <section className="td-sec">
      <div className="ld-wrap">
        <h2>How it works.</h2>
        <div className="td-arrows down">
          {s.map(([b, l], i) => <div key={b} className={`td-arrow a${i}`}><b>{b}</b><span>{l}</span></div>)}
        </div>
      </div>
    </section>
  );
}

function Plans({ t }: { t: T }) {
  const tick = (c: string) => Icon.tick(c, 22);
  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    ["Job alerts", `Up to ${after(t.after)} later`, <b className="em">Instant</b>, <b className="gd">Instant</b>],
    ["Send quotes", tick("var(--emerald)"), tick("var(--emerald)"), tick("var(--gold)")],
    ["No commission", tick("var(--emerald)"), tick("var(--emerald)"), tick("var(--gold)")],
    ["Job fees", `${money(t.win)} per job`, "$0", "$0"],
    ["Billed", "Never", "Monthly", "Yearly"],
  ];
  return (
    <section className="td-sec">
      <div className="ld-wrap">
        <h2>Membership options.</h2>
        <div className="td-plans">
          <div className="td-ph"><span /></div>
          <div className="td-ph"><span>Free</span><b>$0</b><small>to join</small></div>
          <div className="td-ph"><span>Premium Monthly</span><b>{money(t.month)}</b><small>a month</small></div>
          <div className="td-ph on"><span>Premium Annual</span><b>{money(t.year)}</b><small>a year</small></div>
          {rows.map(([k, a, b, c], i) => (
            <div key={k} className={`td-pr${i % 2 ? "" : " z"}`}>
              <span className="k">{k}</span><span>{a}</span><span>{b}</span><span className="on">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Launch({ t, left }: { t: T; left: number }) {
  return (
    <section className="td-launch">
      <div className="td-launch-band">
        <div className="ld-wrap td-launch-in">
          <span className="td-launch-k">Exclusive launch offer for Cairns</span>
          <div className="td-launch-p"><b>{money(t.life)}</b><span><b>Lifetime</b><span>Only {t.seats} available</span></span></div>
          <p>Pay once and keep Premium for life.</p>
          <span className="td-left"><i style={{ width: `${(left / t.seats) * 100}%` }} />{left} of {t.seats} left</span>
        </div>
      </div>
      <img className="td-launch-man" src="/mascot.png" alt="" />
    </section>
  );
}

function Need() {
  const items: [string, string][] = [
    ["ABN", "Your Australian Business Number"],
    ["Public liability insurance", "A current certificate of currency"],
    ["A trade licence, if the law requires one", "In Queensland, a QBCC licence for building work over $3,300"],
  ];
  return (
    <section className="td-sec">
      <div className="ld-wrap">
        <h2>What you need.</h2>
        <div className="td-need">
          {items.map(([b, s]) => <div key={b}>{Icon.tick("var(--emerald)", 26)}<span><b>{b}</b><span>{s}</span></span></div>)}
        </div>
      </div>
    </section>
  );
}

// Every answer is how the platform works (the terms say the same). Numbers come from the live settings.
function Faq({ t }: { t: T }) {
  const groups: [string, [string, string][]][] = [
    ["Joining", [
      ["Who can join as a tradie?", "Sole traders and companies with an ABN and public liability insurance. Work that always needs a licence, like electrical, plumbing, gas, air conditioning or locksmithing, needs that licence too."],
      ["How do I sign up?", "Download Mahi Man and create your account with your photo. Verify your ID, then tap Complete tradie profile: sole trader or company, your details, your services, your licences and certificates. We check your ABN, insurance and any licence by hand before you quote."],
      ["What does it cost to join?", "Nothing. Joining, job alerts and quoting are free."],
      ["What kind of work comes through?", "Work at the customer's place: electrical, plumbing, gas, carpentry, concreting, roofing, landscaping, painting, tiling, fencing, decking, air conditioning, bond and carpet cleaning, pressure washing, window cleaning, mobile mechanics, appliance repairs and locksmithing. You always go to the customer."],
      ["Can I still do normal jobs?", "Yes. Lawn mowing, yard tidy-ups, moving help and similar jobs stay normal jobs at the customer's price, and your account can take them too."],
    ]],
    ["Jobs and quotes", [
      ["How do job alerts work?", `Premium members get the alert the moment a job is posted. On Free, a job comes to you ${after(t.after)} after it's posted, or after ${t.early} minutes if no Premium member has quoted.`],
      ["How many tradies quote on a job?", `${t.first} quotes at first. If the customer hasn't selected anyone, ${t.more} more open every ${t.every} minutes, up to ${t.max}. No race to the bottom against a crowd.`],
      ["How do I quote?", "Send a fixed price, what it includes and when you can come. The customer can message you about your quote before they select one."],
      ["How long does my quote stay open?", `${t.open} hours, unless the customer selects someone before then.`],
      ["What happens when I'm selected?", "Your quote becomes the job's fixed price. You do the job, and the customer pays you."],
    ]],
    ["Money", [
      ["How do I get paid?", "The customer pays you directly, by bank transfer or cash, when the job's done. Mahi Man never holds your money."],
      ["Does Mahi Man take a commission?", "No. You keep 100% of every job."],
      ["What does Free cost when I win?", `${money(t.win)} for each job where the customer selects your quote, on your invoice from Mahi Man. Quotes that aren't selected cost nothing.`],
      ["How do I pay for Premium?", "By bank transfer for now. Monthly starts once your first payment is in."],
      ["Can I cancel Premium?", "Yes, any time. There's no contract. Premium runs to the end of what you've paid. If a renewal isn't paid within 7 days, you move to Free."],
      ["What is the lifetime offer?", `A Cairns launch offer: pay ${money(t.life)} once and keep Premium for life. Only ${t.seats} are available, and the offer closes when they're gone.`],
    ]],
  ];
  return (
    <section className="td-sec">
      <div className="ld-wrap">
        <h2>Good questions.</h2>
        <div className="td-faq">
          {groups.map(([g, items]) => (
            <div key={g} className="td-faq-g">
              <h3>{g}</h3>
              {items.map(([q, a]) => <details key={q} className="td-q"><summary>{q}{Icon.down("var(--emerald)")}</summary><p>{a}</p></details>)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Final() {
  return (
    <section className="td-final">
      <div className="ld-wrap td-final-in">
        <img src="/mascot.png" alt="Mahi Man" />
        <div>
          <h2>Get your first job alert.</h2>
          <a className="btn td-gold" href={JOIN} onClick={join}>Join free {Icon.arrow("var(--ink)")}</a>
          <StoreBadges />
        </div>
      </div>
    </section>
  );
}
