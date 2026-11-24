import { money } from "../lib/format";
import { go } from "../lib/router";
import { Icon, Logo } from "./kit";
import { LdLinks, SiteFooter, StoreBadges, useSiteFees, workerLine } from "./Landing";

/* mahiman.app/tradies: one job, get businesses and tradespeople to download Mahi Man and finish a business profile.
   Every price and number comes from the live settings. */

const JOIN = "/get?utm_source=web&utm_campaign=tradies";
const TRADES: [string, string][] = [
  ["Electrical", "electrical"], ["Plumbing", "plumbing"], ["Carpentry", "carpentry"],
  ["Concreting", "concreting"], ["Roofing", "roofing"], ["Landscaping", "landscaping"],
];
const MORE = "Plus air conditioning, painting, tiling, fencing, cleaning, mobile mechanics, appliance repairs, locksmiths and more.";

type T = ReturnType<typeof useSiteFees>;
const cents2 = (c: number) => "$" + (c / 100).toLocaleString("en-AU", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const fee = (price: number, t: T) => Math.min(t.wmax, Math.round((price * t.wpct) / 100));
const rule = (t: T) => `${t.wpct}%, max ${money(t.wmax)}`;

const join = (e: React.MouseEvent) => { e.preventDefault(); location.href = JOIN; };

export function TradiesPage() {
  const t = useSiteFees();
  return (
    <div className="ld td">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><Logo /> Mahi Man</a>
        <LdLinks cta={<a className="btn small td-gold td-nav-cta" href={JOIN} onClick={join}>Join free</a>} />
      </div></header>
      <Hero t={t} />
      {/* How it works, the trades we need, then the money. */}
      <div className="td-flow">
        <Steps />
        <Trades />
        <Plans t={t} />
      </div>
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

function Hero({ t }: { t: T }) {
  return (
    <section className="td-hero2">
      <div className="ld-wrap td-hero2-in">
        <div className="td-hero2-text">
          <h1>Receive job alerts directly on your phone.</h1>
          <p>{workerLine(t)}</p>
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
        <h2>Businesses wanted.</h2>
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
  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    ["Job alerts", <b className="em">Instant</b>, <b className="em">Instant</b>, <b className="gd">Instant</b>],
    ["Mahi Man takes", rule(t), <b className="em">0%</b>, <b className="gd">0%</b>],
    [`On a ${money(150000)} job`, money(fee(150000, t)), "$0", "$0"],
    ["Billed", "Per job", "Monthly", "Yearly"],
  ];
  return (
    <section className="td-sec">
      <div className="ld-wrap">
        <h2>How you pay.</h2>
        <div className="td-plans">
          <div className="td-ph"><span /></div>
          <div className="td-ph"><span>Pay per job</span><b>$0</b><small>to join</small></div>
          <div className="td-ph"><span>Premium Monthly</span><b>{money(t.pmonth)}</b><small>a month</small></div>
          <div className="td-ph on"><span>Premium Annual</span><b>{money(t.pyear)}</b><small>a year</small></div>
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
      ["Who can join as a business?", "Sole traders and companies with an ABN and public liability insurance. Work that always needs a licence, like electrical, plumbing, gas, air conditioning or locksmithing, needs that licence too."],
      ["How do I sign up?", "Download Mahi Man and create your account with your photo. Verify your ID, then tap Complete Business profile: sole trader or company, your details, your services, your licences and certificates. We check your ABN, insurance and any licence by hand before you quote."],
      ["What does it cost to join?", "Nothing. Joining, job alerts and quoting are free."],
      ["What kind of work comes through?", "Work at the customer's place: electrical, plumbing, gas, carpentry, concreting, roofing, landscaping, painting, tiling, fencing, decking, air conditioning, bond and carpet cleaning, pressure washing, window cleaning, mobile mechanics, appliance repairs and locksmithing. You always go to the customer."],
      ["Can I still do normal jobs?", "Yes. Lawn mowing, yard tidy-ups, moving help and similar jobs stay normal jobs at the customer's price, and your account can take them too."],
    ]],
    ["Jobs and quotes", [
      ["How do job alerts work?", "Every business available nearby gets the alert the moment a job is posted. Everyone at the same time, no head starts."],
      ["How do I quote?", "Send a fixed price and when you can come. Add a note if you need to."],
      ["How long does my quote stay open?", `${t.tquiet} hours, unless the customer selects someone before then.`],
      ["What happens when I'm selected?", "Your quote becomes the job's fixed price. You do the job, and the customer pays you."],
    ]],
    ["Money", [
      ["How do I get paid?", "The customer pays you directly, by bank transfer or cash, when the job's done. Mahi Man never holds your money."],
      ["What does Mahi Man take?", `${t.wpct}% of the agreed price, never more than ${money(t.wmax)} a job, invoiced when a customer selects you. A $170 job is ${cents2(fee(17000, t))}. Quotes that aren't selected cost nothing. You have 7 days to pay.`],
      ["What if I don't pay?", `Owing ${money(t.block)} or more pauses new jobs and quotes until it's paid. Pay in the app in a minute.`],
      ["How much is Premium?", `${money(t.pmonth)} a month or ${money(t.pyear)} a year, and you keep 100% of every job.`],
      ["How do I pay for Premium?", "By bank transfer for now. Premium starts once your first payment is in."],
      ["Can I cancel Premium?", "Yes, any time. There's no contract. Premium runs to the end of what you've paid. If a renewal isn't paid within 7 days, you're back to paying per job."],
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
