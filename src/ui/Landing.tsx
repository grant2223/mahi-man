import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { rpc, sb, type Category } from "../lib/supabase";
import { money } from "../lib/format";
import { go } from "../lib/router";
import { CatIcon, Icon, Logo } from "./kit";

/* moremahi.com for first-time visitors on the web. Sells to locals with jobs on their list first,
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

export function Landing() {
  useEffect(() => { if (location.hash === "#app") window.setTimeout(toApp, 300); }, []);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState<{ id: string; job_name: string; category: string | null; icon: string; suburb: string; asap: boolean; pay_cents: number }[]>([]);
  useEffect(() => {
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    rpc<typeof open>("jobs_feed", {}).then((r) => setOpen((r ?? []).slice(0, 3))).catch(() => {});
  }, []);

  return (
    <div className="ld">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={link("/")}><Logo /> More Mahi</a>
        <LdLinks />
      </div></header>

      <section className="ld-hero">
        <div className="ld-wrap ld-hero-in">
          <div className="ld-hero-text">
            <span className="ld-pin">{Icon.pin("#d4f04c")} Australia wide</span>
            <h1>Get it done today.</h1>
            <p>Cleaning, yard work, moving, the lot. Locals who can come today, and you only pay when you're happy with it.</p>
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
          {[["What does it cost?", "Posting a job is free while we launch. You set the price and pay the worker directly when it's done."],
            ["Who's coming to my place?", "A local whose ID we've checked by hand. You see their photo, reviews and skills before you choose them."],
            ["What if it's not done right?", "Don't pay yet. Report it in the app and we'll sort it out with both of you."],
            ["Can I post jobs and do work?", "Yes. One account does both. Switch between Get help and Do work any time."]].map(([q, a]) => (
            <details key={q}><summary>{q}{Icon.down("var(--muted)")}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <GetApp />

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
          <h2>More Mahi lives on your phone.</h2>
          <p>Post a job, pick your person and hear the moment someone's keen. Or find work near you. It all happens in the app.</p>
          {desktop()
            ? <span className="ld-app-how">{Icon.arrow("var(--emerald)")} Point your phone's camera at the code</span>
            : <div className="ld-stores">{STORES.filter(([, k]) => urls[k]).map(([name, k]) => <a key={k} className="btn primary" href={urls[k]}>Get it on {name}</a>)}</div>}
        </div>
        {desktop() && <span className="ld-qr" aria-label="QR code to open More Mahi on your phone" dangerouslySetInnerHTML={{ __html: svg }} />}
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
          <p>More Mahi opens first to a pilot group on iPhone. Leave your details and we'll email you the link to get the app.</p>
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
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><Logo /> More Mahi</a>
        <LdLinks />
      </div></header>
      <GetApp full />
    </div>
  );
}
