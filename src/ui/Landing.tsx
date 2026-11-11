import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { rpc, sb, type Category } from "../lib/supabase";
import { money } from "../lib/format";
import { go } from "../lib/router";
import { CatIcon, Icon, Logo } from "./kit";

/* mahiman.app for first-time visitors on the web. Sells to locals with jobs on their list first,
   then to people who want extra work. The app itself opens straight on Get help. */

// The website is this page only. Every way in leads to the app section; only the legal pages open on the web.
const desktop = () => window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)").matches;
const toApp = () => document.getElementById("app")?.scrollIntoView({ behavior: "smooth" });
const link = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); if (["/privacy", "/terms", "/support"].includes(to)) go(to); else toApp(); };

// If a photo can't load, its frame shows a quiet label instead of a broken image.
function Photo({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [ok, setOk] = useState(true);
  return ok ? <img className={className} src={src} alt={alt} onError={() => setOk(false)} /> : <span className={`${className} ld-photo-empty`}>{alt}</span>;
}

// Free photos from Unsplash (Unsplash License), served by Unsplash at the size each frame needs.
const UNS = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`;
// The three most booked kinds of odd job in Australia (Airtasker's own numbers: removals, cleaning, rubbish removal).
// Eight of the most common jobs, behind the hero headline. [photo id, which part of the photo to keep in view]
const MOSAIC: [string, string][] = [
  ["1493135637657-c2411b3497ad", "50% 40%"], ["1758273705627-937374bfa978", "38% 50%"], ["1781425009053-2baffa997d8c", "50% 50%"], ["1743130940714-91b221fa49ec", "72% 30%"],
  ["1779636489740-6077a4198be6", "45% 60%"], ["1724556295135-ff92b9aa0a55", "45% 40%"], ["1571018400279-7f33252d0ad6", "40% 55%"], ["1688372199140-cade7ae820fe", "50% 40%"],
];
const USES: [string, string, string][] = [
  ["Moving", "Extra hands to lift, carry and load. Bring a ute or van if you need one.", "1769972557854-7eae6f95585b"],
  ["Cleaning", "Bond cleans, regular cleans and Airbnb turnovers, booked for today.", "1758273238415-01ec03d9ef27"],
  ["Rubbish removal", "Tip runs, green waste and clean-outs. Loaded up and gone.", "1670175035057-eec020c03eb9"],
];

// Every answer here is how the platform actually works (the terms and privacy policy say the same). Fees and windows come from the live settings.
type Fee = { pct: number; max: number; plus: number; cancel: number; soon: number; late: number; wait: number; window: number; s30: number; off: number; s90: number; lc30: number; tpayg: number; tplan: number; tquiet: number };
const faq = (fee: Fee): [string, [string, string][]][] => [
  ["Getting help", [
    ["How fast can someone come?", "The moment you post, workers who are switched on near you get an alert. If nobody says they're keen within 10 minutes, workers further out can see your job too."],
    ["What jobs can I post?", "Cleaning, moving, rubbish removal, garden, assembly, handyman, pets, errands, events, babysitting and tutoring, tech help, and anything else you need a hand with."],
    ["Who sets the price?", "You do. Your price covers what you list as included. Anything extra needs your OK in the app before it's done."],
    ["Do I get to choose who comes?", "Yes. People who are available say they're keen, and you see their photo, skills, verified licences, how often they turn up, and how past customers rated them before you choose one."],
    ["Can I post jobs and do work?", "Yes. One account does both. Switch between Get help and Do work any time."],
  ]],
  ["Doing work", [
    ["Who can work on Mahi Man?", "Anyone 18 or over with their real name and photo. You verify your ID before you take your first job."],
    ["Do I need an ABN?", "No. You can start without one."],
    ["Do you take a cut of my pay?", "No. Workers keep 100% of the job price, now and after launch. The connection fee is paid by the customer."],
    ["How do I get paid?", "During the pilot, the customer pays you directly by bank transfer or cash when the job is finished. From launch, you're paid through the app once the customer confirms the job is done."],
    ["Can I choose when I work?", "Yes. Switch on when you're available, take only the jobs you want, and switch off when you're done."],
    ["What about jobs that need a licence?", "Electrical work, an RSA and similar jobs only go to workers whose licence we've checked and is in date."],
  ]],
  ["Trade jobs", [
    ["What's a trade job?", "Work that needs a trade licence: electrical, plumbing, gas fitting, building work over $3,300, pest control and pool safety inspections. Only tradies whose licence and insurance we've checked can take them."],
    ["How do I get a price?", "Post the job with photos and a budget, From and Up to. Up to 2 licensed tradies send you a fixed price, what it includes and when they can come. You choose one, or say no to both."],
    ["Can I ask the tradie questions first?", "Yes. Message either tradie from their price before you choose. Your number is never shared."],
    ["What does it cost me?", "Nothing to Mahi Man. You pay the tradie their price directly when the job's done."],
    ["I'm a tradie. How does it work?", `You buy jobs upfront: ${money(fee.tpayg)} a job, or a monthly plan from ${money(fee.tplan)}. You see the job and the budget before you send a price, and only 2 tradies can send one. You keep 100% of the job.`],
    ["What if the customer goes quiet?", `If they don't reply within ${fee.tquiet} hours, or cancel before choosing, the job goes back on your plan. Unused jobs roll over for one month. No contract.`],
  ]],
  ["Cancelling: customers", [
    ["Can I cancel?", `Yes. It's free until your worker is on the way. After that it's ${money(fee.cancel)}, and all of it goes to your worker for their time.`],
    ["What if my worker is late?", `If they're more than ${fee.late} minutes past the time they gave you, you can cancel for free. If they change their time, you can accept it or cancel for free.`],
    ["What if my worker cancels or doesn't turn up?", "Your job goes straight back to the top and everyone who can take it is told. If they cancel close to the start or don't turn up, you get credit and they get a strike."],
    ["What if I'm not home when they arrive?", `Your worker waits ${fee.wait} minutes. If they still can't get in, the job is cancelled and the ${money(fee.cancel)} fee goes to them.`],
    ["Is the connection fee refunded?", "Yes, if you cancel before your worker is on the way, or if they cancel. Once they're on the way, it isn't."],
    ["What if I cancel a lot?", `After ${fee.lc30} late cancels in 30 days, you pay for your next jobs upfront.`],
    ["What about storms or emergencies?", "Tell us through Get help. Nobody pays a cancellation fee."],
  ]],
  ["Cancelling: workers", [
    ["Can I cancel a job I took?", `Yes. It's free more than ${fee.window / 60} hours before the start. Closer than that it's ${money(fee.soon)}, and once you're on the way it's ${money(fee.cancel)}. Either way it's a strike, and the fee goes to the customer as credit.`],
    ["I'm running late. What do I do?", "Change your arrival time in the app before it passes. You can do it once per job. The customer can accept it or cancel for free, and there's no strike."],
    ["What's a strike?", `Cancelling within ${fee.window / 60} hours of a job, cancelling on the way, not turning up, or arriving more than ${fee.late} minutes late.`],
    ["What happens with strikes?", `${fee.s30} in 30 days and you're offline for ${fee.off} days. ${fee.s90} in 90 days and we review your account. Each strike drops off after 90 days.`],
    ["What if the customer isn't home?", `Tap I'm here. If they still haven't answered after ${fee.wait} minutes, you can cancel and they pay you ${money(fee.cancel)} for your time.`],
    ["What if I have an emergency?", "Tell us what happened when you cancel. Your first emergency in 90 days has no fee and no strike."],
    ["What's my Turns up score?", "How often you turn up on time for the jobs you take. Customers see it on every offer you send."],
  ]],
  ["Payments and fees", [
    ["What does it cost?", `Nothing during the pilot: you pay your worker directly by bank transfer or cash. From launch, customers pay a ${fee.pct}% connection fee, up to ${money(fee.max)} a job.`],
    ["How do payments work after the pilot?", `You pay in the app when you accept someone. We hold the money while the job is done. When you confirm it's done, the payment is released to your worker, and the ${fee.pct}% connection fee stays with Mahi Man.`],
    ["Is my card safe?", "Cards are stored by Stripe, our payment provider. We never see or keep your full card number."],
    ["Is there a way to skip the fees?", `Mahi Man Plus, $${(fee.plus / 100).toFixed(2)} a month, has no booking fees and puts your jobs first. It opens with in-app payments.`],
  ]],
  ["Local offers", [
    ["What are local offers?", "Deals from local businesses for Mahi Man customers and workers, like money off a skip bin or at the hardware store. Tap the tag at the top of the app to see them."],
    ["How do I use one?", "Open the offer and show the code at the counter, or quote it when you book. Each business sets its own terms."],
    ["I own a business. How do I join?", "Apply on our Partner with us page. We check your ABN and offer, usually within a day, and your offer goes live once the first month is paid. No contract."],
  ]],
  ["Safety and trust", [
    ["Who's coming to my place?", "Someone whose ID we've checked by hand. You see their photo, skills and how past customers rated them before you choose them."],
    ["Who sees my address?", "Only the worker who takes your job. Everyone else sees just your suburb."],
    ["Will they get my phone number?", "No. Phone numbers and emails are never shown. You message each other in the app."],
    ["Can I see when they're on the way?", "Yes. From when your worker taps \"I'm on my way\" until they arrive, you see them on a map. Their location is never shared at any other time."],
    ["What if it's not done right?", "Don't pay yet. Report it in the app and we'll sort it out with both of you."],
    ["How do reviews work?", "Only people who booked each other can review. Customers rate workers on being on time, prepared, quality, communication and friendliness. Workers rate customers on the job description, being ready, paying on time and respect. Neither of you sees the other's review until you've both left one, or 7 days pass."],
    ["What happens to my ID photos?", "Only the Mahi Man team sees them, and they're deleted as soon as your check is done."],
  ]],
];

export function Landing() {
  useEffect(() => { if (location.hash === "#app") window.setTimeout(toApp, 300); }, []);
  const [cats, setCats] = useState<Category[]>([]);
  // The connection fee customers pay from launch, from the live settings.
  const [fee, setFee] = useState<Fee>({ pct: 12, max: 3000, plus: 999, cancel: 2000, soon: 1000, late: 15, wait: 15, window: 120, s30: 3, off: 7, s90: 5, lc30: 3, tpayg: 3500, tplan: 14900, tquiet: 48 });
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["booking_fee_percent", "booking_fee_max_cents", "plus_cents", "cancel_fee_cents", "worker_late_cancel_cents", "late_minutes",
      "noshow_wait_minutes", "worker_cancel_window_minutes", "strikes_offline_30", "offline_days", "strikes_review_90", "customer_late_cancels_30",
      "trade_payg_cents", "trade_plan_cents", "trade_quiet_hours"]).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
      setFee((f) => ({ pct: m.booking_fee_percent || f.pct, max: m.booking_fee_max_cents || f.max, plus: m.plus_cents || f.plus,
        cancel: m.cancel_fee_cents || f.cancel, soon: m.worker_late_cancel_cents || f.soon, late: m.late_minutes || f.late, wait: m.noshow_wait_minutes || f.wait,
        window: m.worker_cancel_window_minutes || f.window, s30: m.strikes_offline_30 || f.s30, off: m.offline_days || f.off, s90: m.strikes_review_90 || f.s90,
        lc30: m.customer_late_cancels_30 || f.lc30, tpayg: m.trade_payg_cents || f.tpayg, tplan: m.trade_plan_cents || f.tplan, tquiet: m.trade_quiet_hours || f.tquiet }));
    });
  }, []);
  const [open, setOpen] = useState<{ id: string; job_name: string; category: string | null; icon: string; suburb: string; asap: boolean; pay_cents: number }[]>([]);
  useEffect(() => {
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    rpc<typeof open>("jobs_feed", {}).then((r) => setOpen((r ?? []).slice(0, 3))).catch(() => {});
  }, []);

  return (
    <div className="ld">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={link("/")}><Logo /> Mahi Man</a>
        <LdLinks />
      </div></header>

      <section className="ld-hero">
        <div className="ld-wrap ld-hero-in">
          <div className="ld-hero-text">
            <span className="ld-pin">{Icon.pin("#d4f04c")} Australia wide</span>
            <h1>Get the help you need within minutes.</h1>
            <span className="ld-tag">Post, accept, job done!</span>
            <div className="row ld-ctas">
              <a className="btn lime" href="/post" onClick={link("/post")}>Post a job, free {Icon.arrow("var(--ink)")}</a>
              <a className="btn ghost" href="/find" onClick={link("/find")}>Want work?</a>
            </div>
          </div>
          <div className="ld-mosaic" aria-hidden="true">
            {MOSAIC.map(([id, pos]) => <img key={id} src={UNS(id, 500)} alt="" style={{ objectPosition: pos }} loading="eager" />)}
          </div>
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
          <span className="ld-kicker">Most booked</span>
          <div className="ld-uses">
            {USES.map(([t, d, id]) => (
              <a key={t} className="ld-use" href="/post" onClick={link("/post")}>
                <Photo className="ld-use-photo" src={UNS(id, 900)} alt={t} />
                <b>{t}</b>
                <span>{d}</span>
              </a>
            ))}
          </div>
          <span className="ld-kicker">Everything else</span>
          <div className="ld-cats">
            {cats.filter((c) => !USES.some(([t]) => t === c.name)).map((c) => (
              <a key={c.id} className="ld-cat" href="/post" onClick={link("/post")}>
                <CatIcon name={c.icon} size={26} color="var(--emerald)" />
                <span>{c.name}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <HowItWorks link={link} />

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
              <span className="ld-jobs-k">Open now</span>
              {open.map((j) => (
                <a key={j.id} className="ld-job" href="/find" onClick={link("/find")}>
                  <CatIcon name={j.icon} size={26} color="var(--emerald)" />
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}><b>{j.job_name}</b><span>{j.category}, {j.suburb}{j.asap ? ", now" : ""}</span></span>
                  <span className="p">{money(j.pay_cents)}</span>
                </a>
              ))}
            </div>
          ) : <Photo className="ld-earn-photo" src={UNS("1724556295135-ff92b9aa0a55", 1000)} alt="A local doing yard work" />}
        </div>
      </section>

      <section className="ld-sec">
        <div className="ld-wrap ld-faq">
          <h2>Good questions.</h2>
          <div className="ld-faq-groups">
            {faq(fee).map(([group, items]) => (
              <div key={group} className="ld-faq-group">
                <h3>{group}</h3>
                {items.map(([q, a]) => <details key={q}><summary>{q}{Icon.down("var(--muted)")}</summary><p>{a}</p></details>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <GetApp />

      <footer className="ld-foot">
        <div className="ld-wrap ld-foot-in">
          <span className="brand"><Logo /> Mahi Man</span>
          <span className="row" style={{ gap: 20 }}>
            <a href="/partners" onClick={(e) => { e.preventDefault(); go("/partners"); }}>Partner with us</a>
            <a href="/privacy" onClick={link("/privacy")}>Privacy</a>
            <a href="/terms" onClick={link("/terms")}>Terms</a>
            <a href="/support" onClick={link("/support")}>Help</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function LdLinks() {
  const urls = useStores();
  return (
    <>
      <nav className="ld-links"><a href="/#how" onClick={(e) => { if (location.pathname === "/") return; e.preventDefault(); go("/"); }}>How it works</a></nav>
      <a className="btn small ld-nav-cta" href="#app" onClick={(e) => { e.preventDefault(); if (document.getElementById("app")) toApp(); }}>{urls && Object.keys(urls).length ? "Get the app" : "Join the launch"}</a>
    </>
  );
}

// The one way in. Before the app is in the stores: join the launch, and we email the TestFlight pilot link.
// Once listed: on a computer, scan the code; on a phone, the store buttons. Both go through /get.
const STORES: [string, string][] = [["App Store", "app_store_url"], ["Google Play", "play_store_url"]];
let storeCache: Record<string, string> | null = null;
function useStores() {
  const [urls, setUrls] = useState(storeCache);
  useEffect(() => {
    if (storeCache) return;
    sb.from("settings").select("key,value").in("key", STORES.map(([, k]) => k))
      .then(({ data }) => { storeCache = Object.fromEntries((data ?? []).filter((r) => r.value).map((r) => [r.key, r.value])); setUrls(storeCache); });
  }, []);
  return urls;
}

function GetApp({ full }: { full?: boolean }) {
  const urls = useStores();
  const listed = !!urls && Object.keys(urls).length > 0;
  const [svg, setSvg] = useState("");
  useEffect(() => { if (listed) QRCode.toString(`${location.origin}/get`, { type: "svg", margin: 0, color: { dark: "#14211c", light: "#00000000" } }).then(setSvg); }, [listed]);
  if (!urls) return <section className={`ld-app${full ? " full" : ""}`} id="app" />;
  if (!listed) return <JoinLaunch full={full} />;
  return (
    <section className={`ld-app${full ? " full" : ""}`} id="app">
      <div className="ld-wrap ld-app-in">
        <div className="ld-app-text">
          <h2>Mahi Man lives on your phone.</h2>
          <p>Post a job, pick your person and hear the moment someone's keen. Or find work near you. It all happens in the app.</p>
          {desktop()
            ? <span className="ld-app-how">{Icon.arrow("var(--emerald)")} Point your phone's camera at the code</span>
            : <div className="ld-stores">{STORES.filter(([, k]) => urls[k]).map(([name, k]) => <a key={k} className="btn primary" href={urls[k]}>Get it on {name}</a>)}</div>}
        </div>
        {desktop() && <span className="ld-qr" aria-label="QR code to open Mahi Man on your phone" dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </section>
  );
}

function JoinLaunch({ full }: { full?: boolean }) {
  const [f, setF] = useState({ first: "", last: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await rpc("join_launch", { p_first: f.first, p_last: f.last, p_email: f.email }); setDone(f.first.trim()); }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  }
  return (
    <section className={`ld-app${full ? " full" : ""}`} id="app">
      <div className="ld-wrap">
        <div className="ld-app-text">
          <h2>Join the launch.</h2>
          <p>Mahi Man opens first to a pilot group on iPhone. Leave your details and we'll email you the link to get the app.</p>
        </div>
        {done ? (
          <div className="ld-joined">{Icon.shieldTick("var(--emerald)")}<span><b>You're on the list, {done}.</b><span>Watch your inbox for the link to get the app.</span></span></div>
        ) : (
          <form className="ld-join" onSubmit={submit}>
            <input aria-label="First name" placeholder="First name" autoComplete="given-name" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} required />
            <input aria-label="Last name" placeholder="Last name" autoComplete="family-name" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} required />
            <input aria-label="Email" placeholder="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
            <button className="btn primary" disabled={busy}>{busy ? "Joining…" : "Join the launch"}</button>
          </form>
        )}
        {err && <p className="ld-join-err">{err}</p>}
      </div>
    </section>
  );
}

// Any app screen opened on a computer.
export function GetAppPage() {
  return (
    <div className="ld">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><Logo /> Mahi Man</a>
        <LdLinks />
      </div></header>
      <GetApp full />
    </div>
  );
}

// How it works: the real app screens for each step, customers and workers on their own tab.
const HOW = {
  help: { tab: "Get help", line: "Post a job, select help, job done.", cta: ["Post a job, free", "/post"], steps: [
    ["Post a job", "Add a photo, say what needs doing and set your price.", "/how/post.jpg"],
    ["Select help", "People who are available say so. See their photo, reviews and skills, and choose.", "/how/choose.jpg"],
    ["Job done", "Check the after photos and pay when you're happy.", "/how/done.jpg"]] },
  work: { tab: "Do work", line: "See the work, accept the job, get paid.", cta: ["See jobs near you", "/find"], steps: [
    ["See the work", "Switch on when you're available and see the jobs near you.", "/how/find.jpg"],
    ["Accept the job", "Say you're keen on the ones you want. The customer picks who goes.", "/how/keen.jpg"],
    ["Get paid", "Do the job, add the after photos, and get paid to your bank.", "/how/paid.jpg"]] },
} as const;
type Side = keyof typeof HOW;

function HowItWorks({ link }: { link: (to: string) => (e: React.MouseEvent) => void }) {
  const [side, setSide] = useState<Side>("help");
  const d = HOW[side];
  const tabs = (
    <div className="hw-tabs" role="tablist">
      {(Object.keys(HOW) as Side[]).map((k) => <button key={k} role="tab" aria-selected={side === k} className={side === k ? "on" : ""} onClick={() => setSide(k)}>{HOW[k].tab}</button>)}
    </div>
  );
  const cta = <a className="btn primary" href={d.cta[1]} onClick={link(d.cta[1])}>{d.cta[0]} {Icon.arrow("#fff")}</a>;
  return (
    <section className="ld-sec alt" id="how"><div className="ld-wrap">
      <div className="hw-head"><h2>How it works.</h2>{tabs}</div>
      <p className="hw-line">{d.line}</p>
      <div className="hw-a">
        {d.steps.map(([t, x, img], i) => (
          <div key={t} className="hw-a-step">
            <div className="hw-phone"><img src={img} alt={t} /></div>
            <div className="hw-a-t"><span className="ld-n">{i + 1}</span><span><b>{t}</b><span>{x}</span></span></div>
          </div>
        ))}
      </div>
      {cta}
    </div></section>
  );
}
