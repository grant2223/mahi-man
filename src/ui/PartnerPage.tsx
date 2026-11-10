import { useEffect, useState, type ReactNode } from "react";
import { rpc, sb } from "../lib/supabase";
import { go } from "../lib/router";
import { money } from "../lib/format";
import { Icon, Logo, SearchPicker } from "./kit";
import { TagIcon } from "./LocalOffers";

/* mahiman.app/partners: how a local business becomes a partner. What they get, the plans, and the form.
   Applications go to admin; nothing is paid until they're approved. */

const TYPES = ["Skip bin hire", "Hardware", "Tool hire", "Removalists", "Storage", "Cleaning supplies", "Garden centre", "Landscape supplies", "Auto parts",
  "Car wash", "Workwear", "Pet shop", "Vet", "Cafe", "Bakery", "Takeaway", "Gym", "Hairdresser", "Printing", "Phone repairs", "Other"];
const WHO: [string, string][] = [["customers", "Customers"], ["workers", "Workers"], ["both", "Customers and workers"]];

const Tick = ({ children }: { children: ReactNode }) => <li style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 16, fontWeight: 300, lineHeight: 1.45 }}>{Icon.tick("var(--emerald)", 20)}<span>{children}</span></li>;
const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

// The offer as it shows in the app, so a business sees exactly what they're buying.
function Preview() {
  return (
    <div style={{ background: "var(--card)", color: "var(--ink)", borderRadius: 6, overflow: "hidden", width: "100%", maxWidth: 400 }} aria-hidden="true">
      <div style={{ padding: "14px 16px", background: "#0b6b4f", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="brand" style={{ color: "#fff" }}><Logo /> Mahi Man</span><TagIcon s={22} />
      </div>
      <div style={{ padding: "16px 16px 6px" }}><span className="small muted">Featured</span></div>
      <div style={{ margin: "0 16px", background: "var(--ground)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: 130, background: "#8c7f6b" }} />
        <div className="row between" style={{ padding: "12px 14px", alignItems: "flex-end" }}>
          <span className="stack" style={{ gap: 2 }}><span style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4 }}>10% off any skip bin</span><span className="t15 light muted">Your business · 3 km</span></span>
          <span className="btn primary small">Get it</span>
        </div>
      </div>
      <div className="row" style={{ gap: 12, padding: "14px 16px 18px" }}>
        <div style={{ width: 56, height: 56, background: "#5f7a63", borderRadius: 4, flex: "none" }} />
        <span className="stack" style={{ gap: 2 }}><span style={{ fontSize: 16, fontWeight: 500 }}>15% off everything</span><span className="t15 light muted">Another local business · 2 km</span></span>
      </div>
    </div>
  );
}

export function PartnerPage() {
  const [price, setPrice] = useState({ partner: 9900, featured: 24900 });
  const [f, setF] = useState({ business: "", abn: "", name: "", phone: "", email: "", type: "", plan: "featured", offer: "", audience: "customers", website: "" });
  const [pick, setPick] = useState<null | "type" | "plan" | "who">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    document.title = "Partner with Mahi Man";
    sb.from("settings").select("key,value").in("key", ["partner_cents", "partner_featured_cents"]).then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
      setPrice((p) => ({ partner: m.partner_cents || p.partner, featured: m.partner_featured_cents || p.featured }));
    });
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setErr(""); };
  const planLabel = (k: string) => k === "featured" ? `Featured, ${money(price.featured)} a month` : `Partner, ${money(price.partner)} a month`;
  async function send() {
    setBusy(true); setErr("");
    try {
      await rpc("partner_apply", { p_business: f.business, p_abn: f.abn, p_name: f.name, p_email: f.email, p_phone: f.phone, p_type: f.type, p_plan: f.plan, p_offer: f.offer, p_audience: f.audience, p_website: f.website || null });
      setSent(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const Input = ({ k, label, ph, span, type = "text" }: { k: keyof typeof f; label: string; ph?: string; span?: boolean; type?: string }) => (
    <label className="field" style={span ? { gridColumn: "1 / -1" } : undefined}><span className="k">{label}</span>
      <input type={type} value={f[k]} placeholder={ph} onChange={set(k)} /></label>
  );
  const Sel = ({ label, value, onClick, span }: { label: string; value: string; onClick: () => void; span?: boolean }) => (
    <button className="field sel" style={span ? { gridColumn: "1 / -1" } : undefined} onClick={onClick}><span className="k">{label}</span><span className={value ? "v w4" : "v ph"}>{value || "Pick one"}</span></button>
  );
  return (
    <div className="ld">
      <style>{".pa-hero{grid-template-columns:minmax(0,1fr) minmax(0,400px)!important}.pa-form .field input{font-weight:400}@media(max-width:860px){.pa-hero{grid-template-columns:1fr!important;padding-top:36px!important;padding-bottom:40px!important}}"}</style>
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><Logo /> Mahi Man</a>
        <nav className="ld-links"><a href="#how" onClick={scrollTo("how")}>How it works</a><a href="#plans" onClick={scrollTo("plans")}>Plans</a><a href="#apply" onClick={scrollTo("apply")}>Apply</a></nav>
      </div></header>

      <section className="ld-hero">
        <div className="ld-wrap ld-hero-in pa-hero">
          <div className="ld-hero-text">
            <span className="ld-pin"><TagIcon c="#d4f04c" s={18} /> For local businesses</span>
            <h1 style={{ fontSize: "clamp(44px, 6vw, 72px)" }}>Put your offer in front of locals.</h1>
            <p>Mahi Man customers and workers in Cairns see your offer every time they open the app. Month to month.</p>
            <div className="row ld-ctas">
              <a className="btn lime" href="#apply" onClick={scrollTo("apply")}>Apply {Icon.arrow("var(--ink)")}</a>
              <a className="btn ghost" href="#plans" onClick={scrollTo("plans")}>See plans</a>
            </div>
          </div>
          <Preview />
        </div>
      </section>

      <section className="ld-sec" id="how">
        <div className="ld-wrap">
          <h2>How it works.</h2>
          <div className="ld-steps">
            {[["Apply", "Tell us your business and the offer you want to run. Two minutes."],
              ["We check you", "We confirm your ABN and the offer, usually within a day."],
              ["Go live", "Pay the first month and your offer shows straight away. Stop any time."]].map(([b, t], i) => (
              <div key={b} className="ld-step"><span className="ld-n">{i + 1}</span><b>{b}</b><span>{t}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-sec alt" id="plans">
        <div className="ld-wrap">
          <h2>Plans.</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {[{ n: "Partner", p: price.partner, l: ["Your offer on the Offers page", "Shown after matching jobs, like skip bins after a tip run", "Views, taps and uses sent to you each month"] },
              { n: "Featured", p: price.featured, l: ["Everything in Partner", "Top of the Offers page", "A card in the jobs feed for workers or customers", "Push alert when your offer launches"] }].map((x) => (
              <div key={x.n} style={{ background: "var(--card)", borderRadius: 6, padding: "28px 28px 30px" }}>
                <span className="row between" style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }}>{x.n}</span>
                  <span><span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.4 }}>{money(x.p)}</span><span className="t15 light muted"> a month</span></span>
                </span>
                <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>{x.l.map((t) => <Tick key={t}>{t}</Tick>)}</ul>
              </div>
            ))}
          </div>
          <p className="light muted" style={{ margin: "20px 0 0", fontSize: 16 }}>Plus GST. No contract, no setup fee. One offer at a time, change it whenever you like.</p>
        </div>
      </section>

      <section className="ld-sec" id="apply">
        <div className="ld-wrap" style={{ maxWidth: 820 }}>
          <h2>Apply.</h2>
          {sent ? (
            <div className="stack" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 10, fontSize: 22, fontWeight: 500 }}>{Icon.tick("var(--emerald)", 26)} Thanks, {f.name.split(" ")[0]}. We've got it.</span>
              <p className="light muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>We'll check your ABN and offer and email {f.email} within a day. Nothing to pay until you're approved.</p>
            </div>
          ) : (
            <>
              <div className="pa-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
                {Input({ k: "business", label: "Business name" })}
                {Input({ k: "abn", label: "ABN", ph: "11 digits" })}
                {Input({ k: "name", label: "Your name" })}
                {Input({ k: "phone", label: "Phone", type: "tel" })}
                {Input({ k: "email", label: "Email", type: "email", span: true })}
                <Sel label="Type of business" value={f.type} onClick={() => setPick("type")} />
                <Sel label="Plan" value={planLabel(f.plan)} onClick={() => setPick("plan")} />
                {Input({ k: "offer", label: "Your offer", ph: "10% off any skip bin", span: true })}
                <Sel label="Who it's for" value={WHO.find(([k]) => k === f.audience)?.[1] ?? ""} onClick={() => setPick("who")} />
                {Input({ k: "website", label: "Website", ph: "Optional" })}
              </div>
              {err && <p className="err" style={{ margin: "14px 0 0" }}>{err}</p>}
              <div className="row" style={{ gap: 16, marginTop: 24, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send application"} {Icon.arrow("#fff")}</button>
                <span className="t15 light muted">Nothing to pay until you're approved.</span>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="ld-foot"><div className="ld-wrap ld-foot-in"><span className="brand"><Logo /> Mahi Man</span>
        <span className="row" style={{ gap: 20 }}>
          <a href="/privacy" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy</a>
          <a href="/terms" onClick={(e) => { e.preventDefault(); go("/terms"); }}>Terms</a>
          <a href="/support" onClick={(e) => { e.preventDefault(); go("/support"); }}>Help</a>
        </span></div></footer>

      {pick === "type" && <SearchPicker title="Type of business" placeholder="Search" value={f.type ? [f.type] : []} options={TYPES.map((t) => ({ id: t, label: t }))}
        onClose={() => setPick(null)} onChange={(v) => setF({ ...f, type: String(v[0]) })} />}
      {pick === "plan" && <SearchPicker title="Plan" value={[f.plan]} options={["partner", "featured"].map((k) => ({ id: k, label: planLabel(k) }))}
        onClose={() => setPick(null)} onChange={(v) => setF({ ...f, plan: String(v[0]) })} />}
      {pick === "who" && <SearchPicker title="Who it's for" value={[f.audience]} options={WHO.map(([id, label]) => ({ id, label }))}
        onClose={() => setPick(null)} onChange={(v) => setF({ ...f, audience: String(v[0]) })} />}
    </div>
  );
}
