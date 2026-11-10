import { useEffect, useState } from "react";
import { api, rpc, sb, type IdStatus, type Suburb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { shrinkImage, validAbn } from "../lib/format";
import { Icon, Logo, NameFields, Screen, SearchPicker, Tile, nameError, nameRow, type NameParts } from "../ui/kit";
import { VerifyFlow } from "../ui/Verify";
import { Credentials, JobsAndSkills } from "./Skills";
import { setSide } from "../ui/SideSwitch";
import { go } from "../lib/router";
import { useArea, useChangeArea } from "../lib/area";

export interface Steps { photo: boolean; id_and_bank: boolean; abn: boolean; area: boolean; jobs: boolean }
type StepKey = keyof Steps | "creds";

const STEP_INFO: { key: keyof Steps; title: string; hint: string }[] = [
  { key: "photo", title: "Your photo", hint: "Customers see it before you arrive" },
  { key: "id_and_bank", title: "Verify your ID", hint: "Passport or national ID, plus a selfie" },
  { key: "abn", title: "Getting paid", hint: "Your PayID or bank account" },
  { key: "area", title: "Where you work", hint: "Your suburb and how far you'll travel" },
  { key: "jobs", title: "My skills", hint: "The kinds of work you're happy to do" },
];

export function Signup({ steps, pilot, idStatus, idNote, onChanged, onBack }: { steps: Steps; pilot: boolean; idStatus: IdStatus; idNote: string | null; onChanged: () => void; onBack?: () => void }) {
  const [open, setOpen] = useState<StepKey | null>(null);
  const idHint = idStatus === "pending" ? "Being checked, usually within a few hours"
    : idStatus === "retake" ? `Retake needed: ${idNote ?? "photo wasn't clear"}`
    : idStatus === "rejected" ? `Not approved: ${idNote ?? "try a different ID"}`
    : idStatus === "verified" && !pilot && !steps.id_and_bank ? "ID verified. Now add your bank for payouts"
    : "Passport or national ID, plus a selfie";
  const info = STEP_INFO.map((s) => (s.key === "id_and_bank" ? { ...s, hint: idHint } : s));
  const done = info.filter((s) => steps[s.key]).length;
  const waiting = (k: keyof Steps) => k === "id_and_bank" && idStatus === "pending";
  const next = info.find((s) => !steps[s.key] && !waiting(s.key))?.key;

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <span className="row" style={{ gap: 6 }}>
            <button className="hero-back" aria-label="Back" onClick={() => { if (onBack) onBack(); else { setSide("help"); go("/"); } }}>{Icon.back("#fff")}</button>
            <span className="brand"><Logo /> Mahi Man</span>
          </span>
          <span className="t15 light" style={{ color: "rgba(255,255,255,0.85)" }}>Worker</span>
        </div>
        <h1 className="mid">Get ready<br />to earn</h1>
        <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.5, color: "var(--lime)" }}>{done} of 5</span>
          <span className="t15 light" style={{ color: "rgba(255,255,255,0.88)" }}>done. {5 - done} {5 - done === 1 ? "step" : "steps"} to your first job.</span>
        </div>
        <div className="progress" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
          {info.map((s) => <span key={s.key} className={steps[s.key] ? "on" : ""} />)}
        </div>
      </section>

      <div className="ticket" style={{ marginTop: -76 }}>
        {info.map((s, i) => (
          <button key={s.key} className={s.key === next ? "li current" : "li"} onClick={() => setOpen(s.key)}>
            {steps[s.key] ? <span style={{ width: 24, display: "flex", justifyContent: "center" }}>{Icon.tick("var(--emerald)", 24)}</span> : <span className="n">{i + 1}</span>}
            <span className="t"><b>{s.title}</b><span>{s.hint}</span></span>
            {waiting(s.key) ? <span className="small muted">Checking</span> : s.key === next ? <span className="btn primary small">{s.key === "id_and_bank" && (idStatus === "retake" || idStatus === "rejected") ? "Retry" : "Add"}</span> : steps[s.key] ? <span className="small muted">Edit</span> : null}
          </button>
        ))}
      </div>

      <section className="row" style={{ margin: "22px 20px 0", alignItems: "flex-start", gap: 14 }}>
        {Icon.shield("var(--ink)")}
        <span className="stack" style={{ flex: 1, gap: 4 }}>
          <span className="t17 w5">Licences and certificates <span className="light muted">optional</span></span>
          <span className="small light muted" style={{ lineHeight: 1.45 }}>Insurance, RSA, Blue Card, trade licences. Unlocks jobs that need them.</span>
        </span>
        <button className="btn stone small" onClick={() => setOpen("creds")}>Add</button>
      </section>

      {open === "photo" && <PhotoStep onBack={() => setOpen(null)} onSaved={() => { setOpen(null); onChanged(); }} />}
      {open === "id_and_bank" && (idStatus === "verified"
        ? (pilot ? <ApprovalStep onBack={() => setOpen(null)} /> : <PayoutStep done={steps.id_and_bank} onBack={() => setOpen(null)} />)
        : <VerifyFlow onClose={() => { setOpen(null); onChanged(); }} onSubmitted={onChanged} />)}
      {open === "abn" && <AbnStep onBack={() => setOpen(null)} onSaved={() => { setOpen(null); onChanged(); }} />}
      {open === "area" && <AreaStep onBack={() => setOpen(null)} onSaved={() => { setOpen(null); onChanged(); }} />}
      {open === "jobs" && <JobsAndSkills onBack={() => { setOpen(null); rpc("worker_status").catch(() => {}).finally(onChanged); }} />}
      {open === "creds" && <Credentials onBack={() => { setOpen(null); onChanged(); }} />}
    </>
  );
}

export function PhotoStep({ onBack, onSaved, note = "A clear photo of your face. Customers see it before you arrive.", saveLabel = "Save", photoOnly = false }: { onBack: () => void; onSaved: () => void; note?: string; saveLabel?: string; photoOnly?: boolean }) {
  const { session, profile, reload } = useSession();
  const fromProfile = (): NameParts => ({ first: profile?.first_name ?? "", middle: profile?.middle_names ?? "", last: profile?.last_name ?? "" });
  const [name, setName] = useState<NameParts>(fromProfile());
  useEffect(() => { if (profile && !name.first && !name.last) setName(fromProfile()); }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!session) return;
    setBusy(true); setErr("");
    try {
      const ne = nameError(name); if (ne) throw new Error(ne);
      let photo_path = profile?.photo_path ?? null;
      if (file) {
        const blob = await shrinkImage(file, 800);
        photo_path = `${session.user.id}/face-${Date.now()}.jpg`;
        const { error } = await sb.storage.from("avatars").upload(photo_path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
      }
      if (!photo_path) throw new Error("Add a clear photo of your face");
      const { error } = await sb.from("profiles").update({ ...nameRow(name), photo_path }).eq("id", session.user.id);
      if (error) throw error;
      await reload();
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <Screen title="Your photo" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <div className="row" style={{ gap: 16, marginBottom: 16 }}>
          {preview ? <span className="tile" style={{ width: 96, height: 96 }}><img src={preview} alt="" /></span> : <Tile name={`${name.first} ${name.last}`.trim() || "?"} photo={profile?.photo_path} size={96} />}
          <label className="btn stone small" style={{ cursor: "pointer" }}>
            {Icon.camera()} {profile?.photo_path || preview ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" capture="user" hidden onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return; setFile(f); setPreview(URL.createObjectURL(f));
            }} />
          </label>
        </div>
        <p className="small light muted" style={{ lineHeight: 1.45 }}>{note}</p>
        {!photoOnly && <NameFields value={name} onChange={setName} />}
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : saveLabel}</button></div>
      </div>
    </Screen>
  );
}

function ApprovalStep({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="ID verified" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>Your ID is verified.</p>
        <p className="t15 light muted" style={{ lineHeight: 1.45 }}>Customers pay you directly by bank transfer or cash when each job is done. You keep 100%.</p>
      </div>
    </Screen>
  );
}

function PayoutStep({ done, onBack }: { done: boolean; onBack: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Screen title="ID check and bank" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>{done ? "You're verified and your bank is set up." : "Check your ID and set up your pay. About 3 minutes."}</p>
        <ul className="t15 light" style={{ paddingLeft: 18, lineHeight: 1.7, marginTop: 0 }}>
          <li>Passport or driver licence, plus a quick selfie</li>
          <li>Any Australian bank account (BSB and number)</li>
          <li>Run securely by Stripe. We never see your bank details.</li>
        </ul>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" disabled={busy} onClick={async () => {
            setBusy(true); setErr("");
            try {
              const r = await api<{ url: string }>("worker_payouts", { return_url: location.origin + "/work?payouts=1" });
              location.href = r.url;
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{done ? "Update details" : "Start"} {Icon.arrow("#fff")}</button>
        </div>
      </div>
    </Screen>
  );
}

export function AbnStep({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  // Customers pay the worker straight to their bank when the job's done: PayID, or BSB and account number.
  // ABN is optional. Most customers are households, who don't need one.
  const [abn, setAbn] = useState("");
  const [payid, setPayid] = useState("");
  const [bsb, setBsb] = useState("");
  const [acct, setAcct] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { sb.from("workers").select("abn,payid,bsb,account_number").single().then(({ data }) => {
    if (data?.abn) setAbn(data.abn); if (data?.payid) setPayid(data.payid); if (data?.bsb) setBsb(data.bsb); if (data?.account_number) setAcct(data.account_number);
  }); }, []);
  const digits = (v: string) => v.replace(/\D/g, "");
  return (
    <Screen title="Getting paid" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16, background: "var(--card)" }}>
        <p className="t15 light" style={{ marginTop: 0, lineHeight: 1.45 }}>Customers pay you straight to your bank when the job's done. They only see these details then.</p>
        <label className="field"><span className="k">PayID: your mobile or email</span><input value={payid} onChange={(e) => setPayid(e.target.value)} placeholder="0412 345 678" autoCapitalize="none" /></label>
        <div className="or-line"><span>or</span></div>
        <div className="row" style={{ gap: 10 }}>
          <label className="field" style={{ flex: "0 0 38%" }}><span className="k">BSB</span><input inputMode="numeric" value={bsb} onChange={(e) => setBsb(e.target.value)} placeholder="064 000" /></label>
          <label className="field" style={{ flex: 1 }}><span className="k">Account number</span><input inputMode="numeric" value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="1234 5678" /></label>
        </div>
        <label className="field" style={{ marginTop: 26 }}><span className="k">ABN, if you have one</span><input inputMode="numeric" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="51 824 753 556" /></label>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn primary" disabled={busy} onClick={async () => {
            setErr("");
            const hasBank = !!(digits(bsb) || digits(acct));
            if (!payid.trim() && !hasBank) return setErr("Add your PayID, or your BSB and account number.");
            if (hasBank && digits(bsb).length !== 6) return setErr("A BSB is 6 digits.");
            if (hasBank && (digits(acct).length < 5 || digits(acct).length > 10)) return setErr("Check your account number.");
            if (abn.trim() && !validAbn(abn)) return setErr("That ABN doesn't look right. Check the 11 digits.");
            setBusy(true);
            try { await api("worker_save", { abn: abn.trim(), payid: payid.trim(), bsb: digits(bsb), account_number: digits(acct) }); onSaved(); }
            catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Screen>
  );
}

function AreaStep({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [suburbs, setSuburbs] = useState<Suburb[]>([]);
  const [base, setBase] = useState<number | null>(null);
  const [radius, setRadius] = useState(15);
  const [vehicle, setVehicle] = useState(false);
  const [pick, setPick] = useState<null | "suburb" | "radius" | "vehicle">(null);
  const [err, setErr] = useState("");
  const { area } = useArea();
  const changeArea = useChangeArea();
  useEffect(() => {
    if (area) sb.from("suburbs").select("id,name,area_id").eq("area_id", area.id).order("name").then(({ data }) => setSuburbs((data ?? []) as Suburb[]));
  }, [area?.id]);
  useEffect(() => {
    sb.from("workers").select("base_suburb_id,radius_km,has_vehicle").single().then(({ data }) => {
      if (data) { setBase(data.base_suburb_id); setRadius(data.radius_km); setVehicle(data.has_vehicle); }
    });
  }, []);
  const radii = [5, 10, 15, 20, 30, 50];
  return (
    <Screen title="Where you work" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <div className="stack">
          <button className="field sel" onClick={() => setPick("suburb")}><span className="k">Your suburb</span><span className={base ? "v" : "v ph"}>{suburbs.find((s) => s.id === base)?.name ?? "Pick your suburb"}</span></button>
          <button className="field sel" onClick={() => setPick("radius")}><span className="k">How far you'll travel</span><span className={radius ? "v" : "v ph"}>{radius ? `Up to ${radius} km` : "Pick how far"}</span></button>
          <button className="field sel" onClick={() => setPick("vehicle")}><span className="k">Ute or trailer</span><span className="v">{vehicle ? "Yes, I have one" : "No"}</span></button>
        </div>
        <p className="small light muted" style={{ lineHeight: 1.45 }}>Tip runs and mowing need a vehicle.</p>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn primary" disabled={!base} onClick={async () => {
            try { await api("worker_save", { base_suburb_id: base, radius_km: radius, has_vehicle: vehicle }); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}>Save</button>
        </div>
      </div>
      {changeArea.picker}
      {pick === "suburb" && <SearchPicker title="Your suburb" placeholder={`Search ${area?.name ?? ""} suburbs`} value={base ? [base] : []} options={[...(changeArea.option ? [changeArea.option] : []), ...suburbs.map((s) => ({ id: s.id, label: s.name }))]} onChange={(v) => setBase(Number(v[0]))} onClose={() => setPick(null)} />}
      {pick === "radius" && <SearchPicker title="How far you'll travel" value={[radius]} options={radii.map((r) => ({ id: r, label: `Up to ${r} km` }))} onChange={(v) => setRadius(Number(v[0]))} onClose={() => setPick(null)} />}
      {pick === "vehicle" && <SearchPicker title="Ute or trailer" value={[vehicle ? 1 : 0]} options={[{ id: 1, label: "Yes, I have one" }, { id: 0, label: "No" }]} onChange={(v) => setVehicle(v[0] === 1)} onClose={() => setPick(null)} />}
    </Screen>
  );
}
