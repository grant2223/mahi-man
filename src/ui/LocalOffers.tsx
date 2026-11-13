import { useEffect, useState, type CSSProperties } from "react";
import { Capacitor } from "@capacitor/core";
import { brandUrl, rpc } from "../lib/supabase";
import { go } from "../lib/router";
import { useArea } from "../lib/area";
import { Icon, Loading, useToast } from "./kit";
import { useSession } from "../lib/session";
import { inviteText, shareLink, SITE } from "../lib/share";
import { TabBar } from "./TabBar";
import { ActionBar } from "./Completion";

/* Offers from local partner businesses. Customers and workers each see the offers meant for them.
   Featured partners sit at the top, in the workers' job feed, and after a matching job. */

export interface PartnerOffer {
  id: number; business: string; title: string; terms: string[]; until: string | null; audience: "customers" | "workers" | "both"; featured: boolean;
  type: string; photo: string | null; address: string | null; suburb: string | null; lat: number | null; lng: number | null; phone: string; website: string | null;
  after_line: string | null; km: number | null; code?: string | null;
}

const S = { fill: "none", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const TagIcon = ({ c = "#fff", s = 26 }: { c?: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" {...S} stroke={c} aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.4" /></svg>
);

const where = (o: PartnerOffer) => [o.business, o.km != null ? `${o.km} km` : o.suburb].filter(Boolean).join(" · ");
const Pic = ({ o, w, h }: { o: PartnerOffer; w: number | string; h: number }) => {
  const url = brandUrl(o.photo);
  return url ? <img src={url} alt="" style={{ width: w, height: h, objectFit: "cover", display: "block", borderRadius: 4, flex: "none" }} />
    : <span style={{ display: "block", width: w, height: h, borderRadius: 4, background: "var(--stone-2)", flex: "none" }} />;
};

// 1. The Offers page.
export function OffersPage() {
  // Opened from Settings: workers see offers for both sides, everyone else the customer offers.
  const { profile } = useSession();
  const param = new URLSearchParams(location.search).get("side") ?? (profile?.is_worker ? "all" : "help");
  const side = param === "work" ? "work" : param === "all" ? "all" : "help";
  const toast = useToast();
  const { area } = useArea();
  const [list, setList] = useState<PartnerOffer[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const sides = side === "all" ? ["help", "work"] : [side];
    Promise.all(sides.map((p) => rpc<PartnerOffer[]>("partner_offers", { p_side: p }).then((r) => r ?? [])))
      .then((rs) => { const seen = new Set<number>(); setList(rs.flat().filter((o) => !seen.has(o.id) && seen.add(o.id)).sort((a, b) => Number(b.featured) - Number(a.featured))); })
      .catch(() => setList([]));
  }, [side]);
  const shown = (list ?? []).filter((o) => !q || `${o.title} ${o.business} ${o.type}`.toLowerCase().includes(q.toLowerCase()));
  const featured = shown.find((o) => o.featured);
  const rest = shown.filter((o) => o !== featured);
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-top" />
        <h1 className="mid" style={{ margin: "22px 0 6px" }}>Local offers</h1>
        <p className="lede" style={{ margin: 0 }}>From {area?.name ?? "local"} businesses, for Mahi Man {side === "work" ? "workers" : side === "all" ? "customers and workers" : "customers"}.</p>
      </section>
      <div className="invite-band">
        <span className="t"><b>Invite a mate</b><span>Send a friend the link to Mahi Man</span></span>
        <button className="btn primary small" onClick={async () => { const r = await shareLink(inviteText, SITE); if (r === "copied") toast("Link copied. Paste it in a message."); }}>Invite</button>
      </div>
      {!list ? <Loading /> : !list.length ? (
        <p className="t17 light" style={{ padding: "24px 16px", margin: 0, lineHeight: 1.45 }}>No offers near you yet. New ones show here.</p>
      ) : (
        <>
          <div style={{ paddingTop: 16 }}><label className="search"><span>{Icon.search("var(--muted)")}</span><input placeholder="Search offers" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
          {featured && (
            <div style={{ padding: "4px 16px 16px" }}>
              <span className="small muted">Featured</span>
              <button onClick={() => go(`/offers/${featured.id}`)} style={{ display: "block", width: "100%", marginTop: 8, padding: 0, border: 0, borderRadius: 4, overflow: "hidden", background: "var(--ground)", textAlign: "left", cursor: "pointer" }}>
                <Pic o={featured} w="100%" h={150} />
                <span className="row between" style={{ padding: "12px 14px", alignItems: "flex-end", gap: 12 }}>
                  <span className="stack" style={{ gap: 2 }}><span style={{ fontSize: 21, fontWeight: 600, letterSpacing: -0.4, color: "var(--ink)" }}>{featured.title}</span><span className="t15 light muted">{where(featured)}</span></span>
                  <span className="btn primary small">Get it</span>
                </span>
              </button>
            </div>
          )}
          {rest.map((o) => (
            <button key={o.id} className="row" onClick={() => go(`/offers/${o.id}`)} style={{ gap: 14, padding: "12px 16px", width: "100%", border: 0, borderTop: "1px solid var(--line)", background: "none", textAlign: "left", cursor: "pointer" }}>
              <Pic o={o} w={72} h={72} />
              <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 500, color: "var(--ink)" }}>{o.title}</span>
                <span className="t15 light muted">{where(o)}</span>
              </span>
              {Icon.chevron("var(--faint)")}
            </button>
          ))}
          {!shown.length && <p className="t15 light muted" style={{ padding: "8px 16px" }}>No offers match that.</p>}
        </>
      )}
      <TabBar on="offers" />
    </div>
  );
}

// 2. One offer, with the code to show at the counter.
export function OfferDetail({ id }: { id: number }) {
  const toast = useToast();
  const [o, setO] = useState<PartnerOffer | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { rpc<PartnerOffer>("partner_offer", { p_id: id }).then(setO).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, [id]);
  const used = () => { rpc("partner_used", { p_id: id }).catch(() => {}); };
  const back = () => (history.length > 1 ? history.back() : go("/offers"));
  if (err) return <div className="app"><div className="screen-head brand"><button className="back" onClick={back} aria-label="Back">{Icon.back("#fff")}</button><h3>Offer</h3></div><p className="t17 light" style={{ padding: 16 }}>{err}</p></div>;
  if (!o) return <div className="app"><Loading /></div>;
  const until = o.until ? new Date(o.until + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null;
  const mapQ = encodeURIComponent([o.business, o.address, o.suburb].filter(Boolean).join(", "));
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <div className="screen-head brand" style={{ position: "sticky", top: 0, zIndex: 2 }}><button className="back" onClick={back} aria-label="Back">{Icon.back("#fff")}</button><h3>{o.business}</h3></div>
      <Pic o={o} w="100%" h={190} />
      <div className="cp-sec">
        <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.1 }}>{o.title}</span>
        <span className="t15 light muted">{[o.type, [o.address, o.suburb].filter(Boolean).join(", "), o.km != null ? `${o.km} km` : null].filter(Boolean).join(" · ")}</span>
      </div>
      {o.code && (
        <button className="cp-sec" onClick={() => { used(); navigator.clipboard?.writeText(o.code!).then(() => toast("Code copied"), () => {}); }}
          style={{ alignItems: "center", background: "var(--ground)", margin: "0 16px", borderRadius: 4, border: 0, cursor: "pointer", width: "calc(100% - 32px)" }}>
          <span className="small muted">Your code</span>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: 6, color: "var(--ink)" }}>{o.code}</span>
          <span className="small light muted">Show it at the counter, or quote it when you book</span>
        </button>
      )}
      <div className="cp-sec" style={{ paddingBottom: 110 }}>
        {o.terms.map((t) => <div key={t} className="price-li">{Icon.tick("var(--emerald)", 20)}<span>{t}</span></div>)}
        {until && <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>Until {until}.</b></span></div>}
      </div>
      <ActionBar>
        <a className="btn stone" style={{ flex: 1 }} href={Capacitor.getPlatform() === "android" ? `https://www.google.com/maps/search/?api=1&query=${mapQ}` : `https://maps.apple.com/?q=${mapQ}`} target="_blank" rel="noreferrer" onClick={used}>{Icon.pin("var(--ink)")} Directions</a>
        <a className="btn primary" style={{ flex: 1 }} href={`tel:${o.phone.replace(/[^\d+]/g, "")}`} onClick={used}>Call them</a>
      </ActionBar>
    </div>
  );
}

// 3. After a matching job: one offer on the done screen.
export function AfterJobOffer({ jobId }: { jobId: string }) {
  const [o, setO] = useState<PartnerOffer | null>(null);
  useEffect(() => { rpc<PartnerOffer | null>("partner_after_job", { p_job: jobId }).then(setO).catch(() => {}); }, [jobId]);
  if (!o) return null;
  return (
    <button className="row" onClick={() => go(`/offers/${o.id}`)} style={{ gap: 14, padding: 16, width: "100%", border: 0, borderTop: "1px solid var(--line)", background: "var(--card)", alignItems: "center", textAlign: "left", cursor: "pointer" }}>
      <Pic o={o} w={64} h={64} />
      <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span className="small em">Offer for you</span>
        <span style={{ fontSize: 17, fontWeight: 500, color: "var(--ink)" }}>{o.after_line ? `${o.after_line} ${o.title.charAt(0).toLowerCase() + o.title.slice(1)}` : o.title}</span>
        <span className="t15 light muted">{where(o)}</span>
      </span>
      {Icon.chevron("var(--faint)")}
    </button>
  );
}

// 4. A featured offer in the feed: between jobs for workers, under recent jobs for customers.
export function useFeedOffer(enabled: boolean, side: "help" | "work" = "work") {
  const [o, setO] = useState<PartnerOffer | null>(null);
  useEffect(() => {
    if (!enabled) return;
    rpc<PartnerOffer[]>("partner_offers", { p_side: side }).then((r) => setO((r ?? []).find((x) => x.featured) ?? null)).catch(() => {});
  }, [enabled, side]);
  return o;
}
export function FeedOfferCard({ o, side = "work", style }: { o: PartnerOffer; side?: "help" | "work"; style?: CSSProperties }) {
  return (
    <button className="row" onClick={() => go(`/offers/${o.id}`)} style={{ gap: 14, padding: "14px 16px", width: "100%", border: 0, background: "#f4f6ec", borderBottom: "1px solid var(--line)", textAlign: "left", cursor: "pointer", ...style }}>
      <Pic o={o} w={84} h={84} />
      <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
        <span className="small muted">Partner offer for {side === "work" ? "workers" : "customers"}</span>
        <span style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)" }}>{o.title} at {o.business}</span>
        <span className="t15 light muted">{o.terms[0] ?? where(o)}</span>
      </span>
    </button>
  );
}
