import { useCallback, useEffect, useState } from "react";
import { rpc, sb } from "../lib/supabase";
import { areaSuburbs } from "../lib/suburbs";
import { Icon, Screen, SearchPicker, useToast } from "./kit";

/* Tax details for workers and tradies. Mahi Man reports what they earn to the ATO twice a year (Sharing Economy Reporting Regime).
   Name and date of birth come from the ID check; bank details from Getting paid. Only the home address and ABN are asked for here. Never a TFN. */
export interface MyTax {
  first_name: string | null; last_name: string | null; birth_date: string | null; verified: boolean;
  street: string | null; suburb_id: number | null; suburb: string | null; state: string | null; postcode: string | null; area_id: number | null;
  abn: string | null; abn_name: string | null; abn_status: string | null; tradie: boolean;
  bsb: string | null; account_end: string | null; payid: string | null; missing: string[];
}
export function useTax() {
  const [t, setT] = useState<MyTax | null>(null);
  const load = useCallback(() => { rpc<MyTax | null>("my_tax").then(setT).catch(() => {}); }, []);
  useEffect(load, [load]);
  return { tax: t, reload: load };
}
const fmtAbn = (v: string) => { const d = v.replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : v; };
const dob = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function TaxDetails({ onBack, onBank }: { onBack: () => void; onBank: () => void }) {
  const toast = useToast();
  const { tax: t, reload } = useTax();
  const [abn, setAbn] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [addr, setAddr] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!t) return <Screen title="Tax details" onBack={onBack}><div className="screen-body tx" /></Screen>;
  const abnNow = abn ?? (t.abn ? fmtAbn(t.abn) : "");
  const name = [t.first_name, t.last_name].filter(Boolean).join(" ");
  const address = t.street && t.suburb ? `${t.street}, ${t.suburb}${t.postcode ? ` ${t.postcode}` : ""}` : null;
  const bank = t.bsb ? `${t.bsb.replace(/^(\d{3})(\d{3})$/, "$1-$2")}, ending ${t.account_end}` : t.payid ? `PayID ${t.payid}` : null;
  const row = (k: string, v: string | null, empty: string, opts: { go?: () => void; lock?: boolean } = {}) => (
    <button className={`of-r tx-r${opts.lock ? " lock" : ""}`} onClick={opts.go} disabled={!opts.go}>
      <span className="of-k">{k}</span>
      <span className={`of-v${v ? "" : " tx-need"}`}>{v ?? empty}{opts.lock ? Icon.lock("var(--faint)") : Icon.chevron("var(--faint)")}</span>
    </button>
  );
  const save = async () => {
    setBusy(true);
    try {
      await rpc("save_tax", { p_street: null, p_suburb: null, p_postcode: null, p_abn: abnNow });
      if (abnNow.replace(/\D/g, "").length === 11) await sb.functions.invoke("abn-check", { body: {} }).catch(() => {});
      toast("Saved"); setAbn(null); reload();
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const changed = abn !== null && abn.replace(/\D/g, "") !== (t.abn ?? "");
  return (
    <Screen title="Tax details" onBack={onBack} right={<button className="of-i" onClick={() => setInfo(true)} aria-label="Why we ask">{Icon.info("#fff", 22)}</button>}>
      <div className="screen-body tx">
        <div className="of-list">
          {row("Legal name", name || null, "From your ID check", { lock: true })}
          {row("Date of birth", t.birth_date ? dob(t.birth_date) : null, "From your ID check", { lock: true })}
          {row("Home address", address, "Add your address", { go: () => setAddr(true) })}
          <label className="of-r tx-r"><span className="of-k">{t.tradie ? "ABN" : "ABN (if you have one)"}</span>
            <input className="of-v of-in" inputMode="numeric" value={abnNow} placeholder={t.tradie ? "Needed for licensed jobs" : "Optional"} maxLength={14}
              onChange={(e) => setAbn(e.target.value.replace(/[^\d ]/g, ""))} /></label>
          {!changed && t.abn && t.abn_name && <div className={`tx-abn${t.abn_status === "active" ? "" : " off"}`}>{t.abn_status === "active" ? Icon.tick("var(--emerald)", 18) : Icon.x("currentColor")}<span>{t.abn_name}, {t.abn_status === "active" ? "active" : "cancelled"}</span></div>}
          {row("Bank account", bank, "Add your bank account", { go: onBank })}
        </div>
        {!abnNow && <button className="btn stone small tx-get" onClick={() => window.open("https://www.abr.gov.au/business-super-funds-charities/applying-abn", "_blank")}>{Icon.arrow("currentColor")}Get a free ABN</button>}
      </div>
      <div className="mn-foot ps-btns one"><button className="btn primary" disabled={busy || !changed} onClick={save}>{Icon.tick("currentColor", 20)}Save</button></div>
      {info && <Screen title="Why we ask" onBack={() => setInfo(false)}><div className="screen-body of-info">
        <p>Mahi Man reports what you earn on jobs to the ATO twice a year, as the law requires. Every job platform in Australia does this.</p>
        <p>You work for yourself, so your tax is yours to sort out. We never ask for your tax file number.</p>
      </div></Screen>}
      {addr && <AddressScreen t={t} onBack={() => setAddr(false)} onSaved={() => { setAddr(false); reload(); }} />}
    </Screen>
  );
}

function AddressScreen({ t, onBack, onSaved }: { t: MyTax; onBack: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [street, setStreet] = useState(t.street ?? "");
  const [suburb, setSuburb] = useState<{ id: number; name: string } | null>(t.suburb_id ? { id: t.suburb_id, name: t.suburb ?? "" } : null);
  const [postcode, setPostcode] = useState(t.postcode ?? "");
  const [list, setList] = useState<{ id: number; name: string }[]>([]);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t.area_id) areaSuburbs<{ id: number; name: string }>(t.area_id, "id,name").then(setList).catch(() => {}); }, [t.area_id]);
  const save = async () => {
    if (street.trim().length < 3) return toast("Add your street address");
    if (!suburb) return toast("Select your suburb");
    if (!/^\d{4}$/.test(postcode)) return toast("Add your 4-digit postcode");
    setBusy(true);
    try { await rpc("save_tax", { p_street: street, p_suburb: suburb.id, p_postcode: postcode, p_abn: t.abn ?? "" }); toast("Saved"); onSaved(); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Screen title="Home address" onBack={onBack}>
      <div className="screen-body tx">
        <label className="field"><span className="k">Street address</span><input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="22 Boland Street" autoComplete="street-address" /></label>
        <div className="tx-two">
          <button className="field sel" onClick={() => setPick(true)}><span className="k">Suburb</span><span className={`v${suburb ? "" : " ph"}`}>{suburb?.name || "Select"}</span></button>
          <label className="field"><span className="k">Postcode</span><input value={postcode} inputMode="numeric" maxLength={4} placeholder="4870" autoComplete="postal-code" onChange={(e) => setPostcode(e.target.value.replace(/\D/g, ""))} /></label>
        </div>
      </div>
      <div className="mn-foot ps-btns one"><button className="btn primary" disabled={busy} onClick={save}>{Icon.tick("currentColor", 20)}Save</button></div>
      {pick && <SearchPicker title="Suburb" placeholder="Search suburbs" options={list.map((s) => ({ id: s.id, label: s.name }))} value={suburb ? [suburb.id] : []}
        onClose={() => setPick(false)} onChange={(v) => { const s = list.find((x) => x.id === Number(v[0])); if (s) setSuburb(s); }} />}
    </Screen>
  );
}

// The slim reminder on the worker's profile while tax details are missing.
export function TaxNudge({ missing, onOpen }: { missing: string[]; onOpen: () => void }) {
  if (!missing.length) return null;
  const what = missing.includes("home address") ? "your home address" : missing.includes("ABN") ? "your ABN" : missing.includes("bank account") ? "your bank account" : "your details";
  return <div className="tx-nudge"><span>Add {what} for tax</span><button className="btn primary small" onClick={onOpen}>Add</button></div>;
}
