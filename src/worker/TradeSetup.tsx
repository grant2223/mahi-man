import { useEffect, useState } from "react";
import { avatarUrl, rpc } from "../lib/supabase";
import { useSession } from "../lib/session";
import { DIAL_CODES, flag } from "../lib/people";
import { Icon, SearchPicker, StepHero, useToast } from "../ui/kit";
import { GoldTick } from "../customer/Offers";
import { AddCredential, latestCreds, lc, useCatalog, useMine } from "./Skills";

/* The tradie profile: sole trader or company, business details, services, licences and certificates, done.
   Opened from Are you a trades person? straight after sign-up, or Create Tradie Profile on their profile.
   Their ID is already checked at sign-up, so it isn't asked again. Everything is saved before they can quote. */

type Kind = "sole" | "company";
interface Business { kind: Kind | null; abn: string | null; acn: string | null; gst: boolean | null; name: string | null; address: string | null; dial: string | null; phone: string | null; email: string | null; website: string | null }
const INSURANCE = "Public liability insurance";
const spaced = (d: string, at: number[]) => { const x = d.replace(/\D/g, ""); let o = ""; [...x].forEach((c, i) => { if (at.includes(i)) o += " "; o += c; }); return o; };
const abnOk = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  return [...d].reduce((s, c, i) => s + (Number(c) - (i === 0 ? 1 : 0)) * w[i], 0) % 89 === 0;
};

export function TradeSetup({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const cat = useCatalog();
  const { mine, load } = useMine();
  const [step, setStep] = useState(1);
  const [b, setB] = useState<Business>({ kind: null, abn: "", acn: "", gst: null, name: "", address: "", dial: "AU", phone: "", email: "", website: "" });
  const [trades, setTrades] = useState<number[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<"gst" | "dial" | "doc" | null>(null);
  const [have, setHave] = useState<number[] | null>(null);
  const [add, setAdd] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // What they've saved before, so editing starts from it.
  useEffect(() => {
    rpc<Business | null>("trade_business").then((x) => {
      if (!x) return;
      const dial = DIAL_CODES.find(([, , d]) => d === (x.dial ?? "61"))?.[0] ?? "AU";
      setB({ kind: x.kind, abn: x.abn ? spaced(x.abn, [2, 5, 8]) : "", acn: x.acn ? spaced(x.acn, [3, 6]) : "", gst: x.gst, name: x.name ?? "", address: x.address ?? "",
        dial, phone: x.phone ?? "", email: x.email ?? "", website: x.website ?? "" });
    }).catch(() => {});
  }, []);
  const tradeSkills = (cat?.skills ?? []).filter((k) => (k as { trade?: boolean }).trade && k.kind === "skill").sort((x, y) => x.name.localeCompare(y.name));
  useEffect(() => { if (mine && cat && trades == null) setTrades(mine.skills.filter((id) => tradeSkills.some((k) => k.id === id))); }, [mine, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = mine ? latestCreds(mine.creds) : new Map();
  const insurance = cat?.creds.find((c) => c.name === INSURANCE);
  useEffect(() => {
    if (!mine || !cat || have != null) return;
    setHave([...new Set([...(insurance ? [insurance.id] : []), ...[...latestCreds(mine.creds).keys()]])]);
  }, [mine, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (x: Partial<Business>) => { setErr(""); setB({ ...b, ...x }); };
  const back = () => { setErr(""); if (step > 1) setStep(step - 1); else onBack(); };
  const bar = (label: string, ok: boolean, go: () => void) => (
    <div className="bottombar" style={{ justifyContent: "flex-end" }}>
      {err && <span className="err ts-err">{err}</span>}
      <button className="btn primary" disabled={busy} style={ok ? undefined : { opacity: 0.45 }} onClick={() => ok && go()}>{busy ? "Saving…" : label} {!busy && Icon.arrow("#fff")}</button>
    </div>
  );
  const dc = DIAL_CODES.find(([c]) => c === b.dial) ?? DIAL_CODES[0];

  if (step === 1) return (
    <div className="screen" style={{ background: "var(--card)" }}>
      <StepHero title="How do you trade?" onBack={back} />
      <div className="st-body">
        <button className={`st-big gold${b.kind === "sole" ? " on" : ""}`} onClick={() => { set({ kind: "sole" }); setStep(2); }}>
          {Icon.face("#14211c")}
          <span><b>Sole trader</b><small>Just you, under your own ABN</small></span></button>
        <button className={`st-big em${b.kind === "company" ? " on" : ""}`} onClick={() => { set({ kind: "company" }); setStep(2); }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" /></svg>
          <span><b>Company</b><small>A Pty Ltd, with an ACN</small></span></button>
      </div>
    </div>
  );

  if (step === 2) {
    const company = b.kind === "company";
    const ok = abnOk(b.abn ?? "") && (!company || (b.acn ?? "").replace(/\D/g, "").length === 9) && b.gst != null && (b.name ?? "").trim().length > 1
      && (b.address ?? "").trim().length > 7 && (b.phone ?? "").replace(/\D/g, "").length >= 8 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((b.email ?? "").trim());
    const save = async () => {
      setBusy(true); setErr("");
      try {
        await rpc("trade_save_business", { p: { kind: b.kind, abn: b.abn, acn: b.acn, gst: b.gst, name: b.name, address: b.address, dial: dc[2], phone: b.phone, email: b.email, website: b.website } });
        setStep(3);
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      setBusy(false);
    };
    const abnDigits = (b.abn ?? "").replace(/\D/g, "");
    return (
      <div className="screen" style={{ background: "var(--card)" }}>
        <StepHero title={company ? "Your company" : "Your business"} sub="Customers see your business name on every quote." onBack={back} />
        <div className="step-body ts-form">
          <div className="sec">
            <h2>Registration</h2>
            <label className="field"><span className="k">ABN</span><input inputMode="numeric" value={b.abn ?? ""} placeholder="51 824 753 556" onChange={(e) => set({ abn: spaced(e.target.value.slice(0, 14), [2, 5, 8]).slice(0, 14) })} /></label>
            {abnDigits.length === 11 && !abnOk(abnDigits) && <span className="ts-bad">That ABN isn't right. Check the numbers.</span>}
            {company && <label className="field"><span className="k">ACN</span><input inputMode="numeric" value={b.acn ?? ""} placeholder="640 157 811" onChange={(e) => set({ acn: spaced(e.target.value, [3, 6]).slice(0, 11) })} /></label>}
            <button className="field sel" onClick={() => setPick("gst")}><span className="k">Registered for GST</span><span className={b.gst == null ? "v ph" : "v"}>{b.gst == null ? "Select" : b.gst ? "Yes" : "No"}</span></button>
          </div>
          <div className="sec">
            <h2>Business</h2>
            <label className="field"><span className="k">{company ? "Trading name" : "Business or trading name"}</span><input value={b.name ?? ""} placeholder="Taylor Landscaping" onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="field"><span className="k">Business address</span><input autoComplete="street-address" value={b.address ?? ""} placeholder="Street, suburb, state, postcode" onChange={(e) => set({ address: e.target.value })} /></label>
            <div className="ts-phone">
              <button className="field sel" onClick={() => setPick("dial")}><span className="k">Code</span><span className="v">{flag(dc[0])} +{dc[2]}</span></button>
              <label className="field"><span className="k">Business phone</span><input inputMode="tel" autoComplete="tel-national" value={b.phone ?? ""} placeholder="412 345 678" onChange={(e) => set({ phone: e.target.value.replace(/[^\d ]/g, "").slice(0, 16) })} /></label>
            </div>
            <label className="field"><span className="k">Business email</span><input inputMode="email" autoComplete="email" value={b.email ?? ""} placeholder="you@business.com.au" onChange={(e) => set({ email: e.target.value.trim() })} /></label>
            <label className="field"><span className="k">Website <span className="ts-opt">optional</span></span><input inputMode="url" value={b.website ?? ""} placeholder="yourbusiness.com.au" onChange={(e) => set({ website: e.target.value.trim() })} /></label>
          </div>
        </div>
        {bar("Next", ok, save)}
        {pick === "gst" && <SearchPicker title="Registered for GST" value={b.gst == null ? [] : [b.gst ? 1 : 0]} options={[{ id: 1, label: "Yes" }, { id: 0, label: "No" }]}
          onClose={() => setPick(null)} onChange={(v) => set({ gst: v[0] === 1 })} />}
        {pick === "dial" && <SearchPicker title="Country code" placeholder="Search countries" value={[b.dial ?? "AU"]}
          options={DIAL_CODES.map(([c, n, d]) => ({ id: c, label: `${flag(c)}  ${n}`, right: `+${d}` }))} onClose={() => setPick(null)} onChange={(v) => set({ dial: String(v[0]) })} />}
      </div>
    );
  }

  if (step === 3) {
    const sel = trades ?? [];
    const shown = tradeSkills.filter((k) => k.name.toLowerCase().includes(q.trim().toLowerCase()));
    const save = async () => {
      setBusy(true); setErr("");
      try { await rpc("trade_set_trades", { p_skills: sel }); await load(); setStep(4); }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      setBusy(false);
    };
    return (
      <div className="screen" style={{ background: "var(--card)" }}>
        <StepHero title="Your services" sub="Select every service you offer. You only get jobs for these." onBack={back} />
        <div className="ts-search"><label className="search">{Icon.search("var(--muted)")}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" /></label></div>
        <div className="screen-body" style={{ background: "var(--card)" }}>
          {shown.map((k) => {
            const on = sel.includes(k.id);
            const needs = k.credential_type_id ? cat?.creds.find((c) => c.id === k.credential_type_id)?.name : null;
            return (
              <button key={k.id} className="opt" onClick={() => setTrades(on ? sel.filter((x) => x !== k.id) : [...sel, k.id])}>
                <span className="stack" style={{ gap: 2 }}><b>{k.name}</b>{needs && <span className="small muted light">Needs your {lc(needs)}</span>}</span>
                <span className="on" style={{ width: 22, display: "flex" }}>{on && Icon.tick("var(--emerald)")}</span>
              </button>
            );
          })}
        </div>
        <div className="bottombar">
          <span className="small muted">{err ? <span className="err">{err}</span> : sel.length ? `${sel.length} selected` : ""}</span>
          <button className="btn primary" disabled={busy} style={sel.length ? undefined : { opacity: 0.45 }} onClick={() => sel.length && save()}>{busy ? "Saving…" : "Next"} {!busy && Icon.arrow("#fff")}</button>
        </div>
      </div>
    );
  }

  if (step === 4) {
    const list = have ?? [];
    // Insurance, any licence their services need, and the other trade licences and tickets.
    const needed = new Set(tradeSkills.filter((k) => (trades ?? []).includes(k.id) && k.credential_type_id).map((k) => k.credential_type_id as number));
    const tradeIds = new Set(tradeSkills.map((k) => k.credential_type_id).filter(Boolean) as number[]);
    const types = (cat?.creds ?? []).filter((c) => c.name === INSURANCE || needed.has(c.id) || tradeIds.has(c.id) || ["QBCC licence", "White Card", "First aid certificate"].includes(c.name));
    const insOk = !!insurance && latest.has(insurance.id) && latest.get(insurance.id).status !== "rejected";
    const allOk = list.every((id) => latest.has(id) && latest.get(id).status !== "rejected");
    return (
      <div className="screen" style={{ background: "var(--card)" }}>
        <StepHero title="Licences and certificates" onBack={back} />
        <div className="step-body">
          <button className="field sel" onClick={() => setPick("doc")}><span className="v">{list.length > 1 ? "Add another" : "Select what you have"}</span></button>
          {list.map((id) => {
            const t = types.find((x) => x.id === id) ?? cat?.creds.find((x) => x.id === id);
            const c = latest.get(id);
            return (
              <div key={id} className="ts-doc">
                <span className="ts-dt"><b>{t?.name}</b>{t?.name === INSURANCE && !c && <span className="ts-st">Needed for trade jobs</span>}</span>
                {c?.status === "verified" ? <span className="ts-up">{Icon.tick("var(--emerald)", 20)}Verified</span>
                  : c?.status === "pending" ? <span className="ts-up">{Icon.tick("var(--emerald)", 20)}Uploaded</span>
                  : <button className="btn primary small" onClick={() => setAdd(id)}>{Icon.camera("#fff")} {c ? "Send again" : "Upload proof"}</button>}
              </div>
            );
          })}
        </div>
        {bar("Next", insOk && allOk, () => setStep(5))}
        {pick === "doc" && <SearchPicker title="What do you have?" multi placeholder="Search" value={list}
          options={types.map((t) => ({ id: t.id, label: t.name }))}
          onClose={() => setPick(null)} onChange={(v) => setHave([...new Set([...(insurance ? [insurance.id] : []), ...v.map(Number)])])} />}
        {add != null && cat && <AddCredential types={cat.creds} initial={add} onBack={() => setAdd(null)} onSaved={() => { setAdd(null); load(); toast("Sent for checking"); }} />}
      </div>
    );
  }

  const pic = avatarUrl(profile?.photo_path);
  const ins = insurance ? latest.get(insurance.id) : undefined;
  const services = tradeSkills.filter((k) => (trades ?? []).includes(k.id)).map((k) => k.name);
  return (
    <div className="screen" style={{ background: "var(--card)" }}>
      <div className="ts-done">
        <div className="ts-hero" style={pic ? { backgroundImage: `url("${pic}")` } : undefined}>
          <button className="ts-back" onClick={back} aria-label="Back">{Icon.back("#fff")}</button>
          <span className="ts-name">{b.name} {profile?.id_status === "verified" && <GoldTick s={26} />}</span>
          <span className="ts-sub">{profile?.full_name}</span>
        </div>
        <div className="ts-checks">
          {profile?.id_status === "verified" && <span>{Icon.tick("var(--emerald)", 20)}ID</span>}
          <span>{Icon.tick("var(--emerald)", 20)}ABN</span>
          {ins?.status === "verified" ? <span>{Icon.tick("var(--emerald)", 20)}Insured</span> : <span className="ts-wait">Insurance being checked</span>}
        </div>
        <p className="ts-svc">{services.join(", ")}</p>
      </div>
      <div className="bottombar" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={onDone}>Next {Icon.arrow("#fff")}</button></div>
    </div>
  );
}

/* Straight after sign-up, once: are they a trades person? Yes opens the tradie profile; No I am not goes to jobs.
   Later, Create Tradie Profile on their profile page opens the same steps. */
export function TradieAsk({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="screen ta">
      <section className="hero ta-hero">
        <img className="mascot" src="/mascot.png" alt="" />
        <h1 className="mid">Are you a<br />trades person?</h1>
        <div className="ta-go">
          <button className="btn ta-yes" onClick={onYes}>Complete Tradie profile</button>
          <button className="btn ta-no" onClick={onNo}>No I am not</button>
        </div>
      </section>
    </div>
  );
}
