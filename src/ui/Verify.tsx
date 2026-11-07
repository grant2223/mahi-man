import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { rpc, sb, type IdStatus } from "../lib/supabase";
import { useSession } from "../lib/session";
import { shrinkImage } from "../lib/format";
import { Icon, SearchPicker, StepHero } from "./kit";

const DOC_TYPES = ["Passport", "National ID card", "Australian driver licence"];
const REGIONS = "AF AL DZ AD AO AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");

type Stage = "intro" | "doc" | "selfie" | "sending" | "sent";

// Full-bleed ID check. Photos go to a private store, only the More Mahi team sees them, and they're deleted once checked.
export function VerifyFlow({ onClose, onSubmitted }: { onClose: () => void; onSubmitted?: () => void }) {
  const { session, profile, reload } = useSession();
  const names = useMemo(() => {
    const dn = new Intl.DisplayNames(["en-AU"], { type: "region" });
    return REGIONS.map((c) => ({ id: dn.of(c) ?? c, label: dn.of(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label));
  }, []);
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState("Passport");
  const [pick, setPick] = useState<null | "country" | "type">(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [doc, setDoc] = useState<Blob | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const status: IdStatus = profile?.id_status ?? "none";

  async function send(selfie: Blob) {
    if (!session || !doc) return;
    setStage("sending"); setErr("");
    try {
      const uid = session.user.id;
      const stamp = Date.now();
      const docPath = `${uid}/doc-${stamp}.jpg`;
      const selfiePath = `${uid}/selfie-${stamp}.jpg`;
      const a = await sb.storage.from("ids").upload(docPath, doc, { contentType: "image/jpeg" });
      if (a.error) throw new Error("The ID photo didn't upload. Check your signal and try again.");
      const b = await sb.storage.from("ids").upload(selfiePath, selfie, { contentType: "image/jpeg" });
      if (b.error) throw new Error("The selfie didn't upload. Check your signal and try again.");
      await rpc("submit_id_check", { p_doc_type: docType, p_country: country, p_doc_path: docPath, p_selfie_path: selfiePath });
      await reload();
      setStage("sent");
      onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("selfie");
    }
  }

  if (stage === "doc") {
    return <Camera key="doc" step={1} facing="environment" title={docType === "Passport" ? "Photo page of your passport" : `Front of your ${docType.toLowerCase()}`}
      sub="Fit it inside the frame and tap the button." tip="No glare, all four corners showing" next="Next: a selfie holding your ID next to your face."
      onBack={() => setStage("intro")} onShot={(b) => { setDoc(b); setStage("selfie"); }} />;
  }
  if (stage === "selfie" || stage === "sending") {
    return <Camera key="selfie" step={2} facing="user" face title="Selfie holding your ID"
      sub="Hold your ID next to your face so both are clear." tip="Face the light, no hat or sunglasses" next={err || "We check it by hand, usually within a few hours."}
      busy={stage === "sending"} onBack={() => setStage("doc")} onShot={send} />;
  }
  if (stage === "sent") {
    return (
      <div className="screen" role="dialog" aria-label="Sent for checking" style={{ background: "var(--ground)" }}>
        <section className="hero" style={{ padding: "calc(var(--safe-top) + 60px) 20px 40px" }}>
          {Icon.clock("var(--lime)")}
          <h1 style={{ margin: "18px 0 8px", fontSize: 44 }}>Sent for<br />checking</h1>
          <p className="lede" style={{ maxWidth: 300 }}>A real person checks it, usually within a few hours. You'll see the result here.</p>
        </section>
        <p className="t15 light muted" style={{ margin: "20px 20px 0", lineHeight: 1.45 }}>
          If a photo is blurry we'll tell you exactly what to retake. Your ID photos are deleted as soon as they're checked.
        </p>
        <div style={{ flex: 1 }} />
        <div className="bottombar" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" onClick={onClose}>Done {Icon.arrow("#fff")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" role="dialog" aria-label="Verify your ID">
      <div className="screen-body" style={{ paddingBottom: 0 }}>
        <StepHero title="Verify your ID" onBack={onClose}
          sub={status === "retake" ? `Please retake: ${profile?.id_note ?? "the photo wasn't clear"}.`
            : status === "rejected" ? `Not approved: ${profile?.id_note ?? "try a different ID"}. You can try again.`
            : status === "pending" ? "We're checking your last one. Sending again replaces it."
            : "About 2 minutes. Everyone on More Mahi sees the ID verified badge on your profile."} />
        <div className="step-body" style={{ gap: 22 }}>
          <div className="sec" style={{ gap: 14 }}>
            <h2>You'll need</h2>
            <span className="row" style={{ gap: 14 }}>{Icon.idcard("var(--emerald)")}
              <span className="stack" style={{ gap: 2 }}><span className="t17 w5">Your passport or national ID card</span><span className="t15 light muted">From any country. Not expired.</span></span></span>
            <span className="row" style={{ gap: 14 }}>{Icon.face("var(--emerald)")}
              <span className="stack" style={{ gap: 2 }}><span className="t17 w5">A selfie holding it</span><span className="t15 light muted">So we can match your face to the ID.</span></span></span>
          </div>
          <div className="stack">
            <button className="field" onClick={() => setPick("country")}>
              <span className="row between" style={{ width: "100%" }}>
                <span className="stack" style={{ gap: 2 }}><span className="k">Country that issued it</span><span className={country ? "v" : "v ph"}>{country || "Pick the country"}</span></span>
                {Icon.search()}
              </span>
            </button>
            <button className="field" onClick={() => setPick("type")}>
              <span className="row between" style={{ width: "100%" }}>
                <span className="stack" style={{ gap: 2 }}><span className="k">ID type</span><span className="v">{docType}</span></span>
                {Icon.search()}
              </span>
            </button>
          </div>
          <p className="small light muted" style={{ margin: 0, lineHeight: 1.45 }}>Only the More Mahi team sees your ID, to check it. It's never shown to customers or workers, and it's deleted once checked.</p>
          {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
        </div>
      </div>
      <div className="bottombar" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={() => { if (!country) return setErr("Pick the country that issued your ID"); setErr(""); setStage("doc"); }}>Start {Icon.arrow("#fff")}</button>
      </div>
      {pick === "country" && <SearchPicker title="Country that issued it" placeholder="Search countries" value={country ? [country] : []} options={names} onChange={(v) => setCountry(String(v[0]))} onClose={() => setPick(null)} />}
      {pick === "type" && <SearchPicker title="ID type" value={[docType]} options={DOC_TYPES.map((d) => ({ id: d, label: d }))} onChange={(v) => setDocType(String(v[0]))} onClose={() => setPick(null)} />}
    </div>
  );
}

// Camera with a live viewfinder. If the browser won't share the camera, it falls back to the phone's own camera app.
function Camera({ step, facing, face, title, sub, tip, next, busy, onBack, onShot }: {
  step: number; facing: "user" | "environment"; face?: boolean; title: string; sub: string; tip: string; next: string; busy?: boolean;
  onBack: () => void; onShot: (b: Blob) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); setLive(true); } })
      .catch(() => setLive(false));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  async function capture() {
    if (live && video.current) {
      const v = video.current;
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
      setShot({ blob, url: URL.createObjectURL(blob) });
    } else file.current?.click();
  }

  const corners: CSSProperties[] = [
    { left: -2, top: -2, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 6 },
    { right: -2, top: -2, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 6 },
    { left: -2, bottom: -2, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 6 },
    { right: -2, bottom: -2, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 6 },
  ];

  return (
    <div className="cam" role="dialog" aria-label={title}>
      <div className="row between" style={{ padding: "calc(var(--safe-top) + 12px) 16px 0", minHeight: 56 }}>
        <button className="back" style={{ marginLeft: -8 }} onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
        <span className="t15" style={{ color: "rgba(255,255,255,0.75)" }}>Step {step} of 2</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, padding: "6px 16px 0" }}>
        <span style={{ height: 6, borderRadius: 2, background: "var(--lime)" }} />
        <span style={{ height: 6, borderRadius: 2, background: step === 2 ? "var(--lime)" : "rgba(255,255,255,0.22)" }} />
      </div>
      <div style={{ padding: "24px 20px 0" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 30, lineHeight: 1, fontWeight: 600, letterSpacing: -1.2 }}>{title}</h1>
        <p className="t15 light" style={{ margin: 0, color: "rgba(255,255,255,0.85)" }}>{sub}</p>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
        <div className={face ? "frame face" : "frame"}>
          {shot ? <img src={shot.url} alt="" /> : <video ref={video} playsInline muted style={{ transform: facing === "user" ? "scaleX(-1)" : undefined, display: live ? "block" : "none" }} />}
          {!live && !shot && <span className="t15 light" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, color: "rgba(255,255,255,0.7)" }}>Tap the button to open your camera</span>}
          {corners.map((st, i) => <span key={i} className="corner" style={st} />)}
        </div>
      </div>
      <div className="stack" style={{ padding: "0 20px calc(var(--safe-bottom) + 30px)", gap: 14 }}>
        <span className="row t15 light" style={{ gap: 10, color: "rgba(255,255,255,0.85)" }}>{Icon.tick("var(--lime)", 20)}{tip}</span>
        <span className="small light" style={{ color: "rgba(255,255,255,0.65)" }}>{next}</span>
        {shot ? (
          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button className="btn light" disabled={busy} onClick={() => setShot(null)}>Retake</button>
            <button className="btn primary" disabled={busy} onClick={() => onShot(shot.blob)}>{busy ? "Sending…" : "Use this photo"} {Icon.arrow("#fff")}</button>
          </div>
        ) : (
          <button className="shutter" onClick={capture} aria-label="Take photo" />
        )}
      </div>
      <input ref={file} type="file" accept="image/*" capture={facing} hidden onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const blob = await shrinkImage(f, 2000).catch(() => f);
        setShot({ blob, url: URL.createObjectURL(blob) });
        e.target.value = "";
      }} />
    </div>
  );
}

// Standalone page at /verify for customers.
export function VerifyPage({ onClose }: { onClose: () => void }) {
  return <div className="app"><VerifyFlow onClose={onClose} /></div>;
}
