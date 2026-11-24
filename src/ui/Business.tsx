import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { go } from "../lib/router";
import { money } from "../lib/format";
import { connFee } from "../lib/fee";
import { CAT_PHOTO, UNS } from "../lib/catPhotos";
import { Icon, Logo } from "./kit";
import { LdLinks, SiteFooter } from "./Landing";

/* mahiman.app/business: Mahi Man for Business. One yearly price, no booking fees, a few staff on one account
   and one statement a month. Sold by Mahi Man directly, so the button opens an email. */

const nav = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); go(to); };
const EMAIL = "hello@mahiman.app";

// Who books odd jobs every week, and what they book. [who, typical jobs, photo]
const WHO: [string, string, string][] = [
  ["Cafés and restaurants", "Kitchen hands, waiting staff, deliveries", CAT_PHOTO.cooking],
  ["Pubs, bars and venues", "Bar staff, glassies, set-up and pack-down", CAT_PHOTO.events],
  ["Holiday rentals and Airbnb hosts", "Turnover cleans, linen runs, pool care", CAT_PHOTO.pool],
  ["Hotels and backpackers", "Room cleans, laundry runs, odd repairs", CAT_PHOTO.cleaning],
  ["Property managers", "Vacate cleans, mowing, rubbish removal", CAT_PHOTO.garden],
  ["Real estate agents", "Listing photos and video, styling help", CAT_PHOTO.camera],
  ["Builders and trades", "Labourers, site cleans, tip runs", CAT_PHOTO.handyman],
  ["Shops and retail", "Stocktake help, fit-outs, flat-pack builds", CAT_PHOTO.assembly],
  ["Offices", "Admin, data entry, desk moves, tech help", CAT_PHOTO.admin],
  ["Gyms and studios", "Trainers, class cover, social media", CAT_PHOTO.fitness],
  ["Salons and barbers", "Extra hands on busy days, bookings help", CAT_PHOTO.barber],
  ["Tour operators", "Vehicle cleans, drivers' runs, guest set-up", CAT_PHOTO.car],
  ["Online stores", "Product photos, social posts, packing orders", CAT_PHOTO.social],
  ["Accountants and professionals", "Data entry, filing, typing, bookkeeping", CAT_PHOTO.accounting],
  ["Schools and childcare", "Set-up for events, tutoring, cleaning", CAT_PHOTO.kids],
  ["Warehouses and removals", "Packing, heavy lifting, loading", CAT_PHOTO.moving],
];

export function BusinessPage() {
  const [s, setS] = useState({ price: 49900, pct: 20, min: 500, max: 2000, seats: 5 });
  const [jobs, setJobs] = useState(4);
  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["business_year_cents", "business_seats", "booking_fee_percent", "booking_fee_min_cents", "booking_fee_max_cents"]).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
      setS((c) => ({ price: m.business_year_cents || c.price, seats: m.business_seats || c.seats, pct: m.booking_fee_percent || c.pct, min: m.booking_fee_min_cents || c.min, max: m.booking_fee_max_cents || c.max }));
    });
  }, []);
  // A typical $150 job, booked this many times a month, for a year.
  const avg = 15000;
  const fees = connFee(avg, s.pct, s.min, s.max) * jobs * 12;
  const saved = fees - s.price;
  const mail = `mailto:${EMAIL}?subject=${encodeURIComponent("Mahi Man for Business")}`;

  return (
    <div className="ld bz">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={nav("/")}><Logo /> Mahi Man</a>
        <LdLinks />
      </div></header>

      <section className="bz-hero">
        <div className="ld-wrap bz-hero-in">
          <div>
            <h1>Extra hands for your business, on demand.</h1>
            <p>A busy shift, social media posts, a delivery or a quick clean-up. Verified locals, booked in minutes. No agency, no hiring.</p>
            <div className="row ld-ctas">
              <a className="btn lime" href="/post" onClick={nav("/post")}>Post a job, free {Icon.arrow("var(--ink)")}</a>
              <a className="btn ghost" href={mail}>{Icon.mail("#fff")} Email us</a>
            </div>
          </div>
          <img className="bz-hero-img" src={UNS("1743130940714-91b221fa49ec", 900)} alt="A local worker in hi-vis" />
        </div>
      </section>

      <section className="ld-wrap bz-sec">
        <h2>Why businesses use Mahi Man</h2>
        <div className="bz-why">
          {([
            ["Extra hands on a busy day", "Kitchen help, bar staff, set-up and pack-down when it's flat out.", "1551529563-fce9529e67ac"],
            ["The jobs nobody has time for", "Cleans, deliveries, tip runs, flyers and social media posts.", CAT_PHOTO.delivery],
            ["No agency, no hiring", "Pick a checked local, pay them for the job, done.", "1688372199140-cade7ae820fe"],
          ] as const).map(([b, t, id]) => (
            <div key={b} className="bz-who-i">
              <img src={UNS(id, 700)} alt="" loading="lazy" />
              <b>{b}</b><span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-wrap bz-sec">
        <h2>Book often? Mahi Man for Business</h2>
        <div className="bz-price"><b>{money(s.price)}</b><span>a year</span></div>
        <div className="bz-get">
          {([
            ["$0 booking fees", "On every job, all year. You still pay workers directly."],
            [`Up to ${s.seats} staff`, "Managers and staff post and select on one business account."],
            ["One statement a month", "Every job, every worker's ABN, ready for your bookkeeper."],
            ["ABN-only workers", "Choose to only take workers with an ABN, so their invoices are in order."],
          ] as const).map(([b, t]) => (
            <div key={b} className="bz-get-i">{Icon.tick("var(--emerald)", 26)}<span><b>{b}</b><span>{t}</span></span></div>
          ))}
        </div>
      </section>

      <section className="bz-calc">
        <div className="ld-wrap bz-calc-in">
          <div>
            <h2>It pays for itself</h2>
            <p>Jobs a month, at about $150 each</p>
            <div className="bz-jobs"><b>{jobs}</b><span>job{jobs === 1 ? "" : "s"} a month</span></div>
            <input className="mm-range" type="range" min={1} max={20} value={jobs} onChange={(e) => setJobs(Number(e.target.value))} aria-label="Jobs a month"
              style={{ background: `linear-gradient(90deg, var(--lime) ${((jobs - 1) / 19) * 100}%, rgba(255,255,255,.2) ${((jobs - 1) / 19) * 100}%) center / 100% 10px no-repeat` }} />
          </div>
          <div className="bz-calc-out">
            <div><span>Booking fees in a year</span><b>{money(fees)}</b></div>
            <div><span>Mahi Man for Business</span><b>{money(s.price)}</b></div>
            <div className="bz-save"><span>{saved > 0 ? "You save" : "Worth it from about 2 jobs a month"}</span><b>{saved > 0 ? money(saved) : ""}</b></div>
          </div>
        </div>
      </section>

      <section className="ld-wrap bz-sec">
        <h2>Who uses it</h2>
        <div className="bz-who">
          {WHO.map(([w, t, id]) => (
            <div key={w} className="bz-who-i">
              <img src={UNS(id, 700)} alt={w} loading="lazy" />
              <b>{w}</b><span>{t}</span>
            </div>
          ))}
        </div>
        <div className="sv-cta">
          <a className="btn primary" href={mail}>{Icon.mail("#fff")} Email us</a>
          <a className="btn stone" href="/services" onClick={nav("/services")}>See all services {Icon.arrow("currentColor")}</a>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
