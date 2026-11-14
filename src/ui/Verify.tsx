import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { rpc, sb, type IdStatus } from "../lib/supabase";
import { useSession } from "../lib/session";
import { shrinkImage } from "../lib/format";
import { Icon, SearchPicker, StepHero } from "./kit";

const DOC_TYPES = ["Passport", "National ID card", "Australian driver licence"];
const REGIONS = "AF AL DZ AD AO AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");

type Stage = "intro" | "doc" | "selfie" | "sending" | "sent";
type Shot = { blob: Blob; url: string };

// Example pictures: what a good photo looks like, filling the frame.
const Corners = () => (
  <g stroke="#c9d23a" strokeWidth="5" fill="none" strokeLinecap="square"><path d="M4 18V4h14M158 4h14v14M172 122v14h-14M18 136H4v-14" /></g>
);
const IdArt = () => (
  <svg viewBox="0 0 176 140" className="vf-art" aria-hidden="true">
    <Corners />
    <rect x="14" y="16" width="148" height="108" rx="6" fill="#f1f3f2" />
    <rect x="14" y="16" width="148" height="20" rx="6" fill="#0b6b4f" /><rect x="14" y="28" width="148" height="8" fill="#0b6b4f" />
    <rect x="26" y="48" width="42" height="56" rx="3" fill="#dfe5e2" />
    <circle cx="47" cy="66" r="9" fill="#2a2d32" /><path d="M31 102c1-14 8-20 16-20s15 6 16 20z" fill="#2a2d32" />
    <rect x="78" y="50" width="70" height="8" rx="4" fill="#2a2d32" /><rect x="78" y="66" width="58" height="6" rx="3" fill="#b9c2be" />
    <rect x="78" y="80" width="64" height="6" rx="3" fill="#b9c2be" /><rect x="78" y="94" width="44" height="6" rx="3" fill="#b9c2be" />
  </svg>
);
const SelfieArt = () => (
  <svg viewBox="0 0 176 140" className="vf-art" aria-hidden="true">
    <Corners />
    <path d="M14 140c3-34 22-48 46-48s43 14 46 48z" fill="#0b6b4f" />
    <rect x="48" y="72" width="24" height="22" fill="#c9a27e" />
    <ellipse cx="60" cy="52" rx="24" ry="28" fill="#d8b38f" />
    <path d="M36 48c0-20 11-29 24-29s24 9 24 29c-6-10-14-13-24-13s-18 3-24 13z" fill="#2a2d32" />
    <rect x="90" y="50" width="76" height="52" rx="5" fill="#f1f3f2" />
    <rect x="90" y="50" width="76" height="11" rx="5" fill="#0b6b4f" /><rect x="90" y="56" width="76" height="5" fill="#0b6b4f" />
    <rect x="98" y="68" width="19" height="24" rx="2" fill="#dfe5e2" /><circle cx="107.5" cy="76" r="4" fill="#2a2d32" />
    <rect x="123" y="70" width="36" height="5" rx="2.5" fill="#2a2d32" /><rect x="123" y="80" width="28" height="4" rx="2" fill="#b9c2be" />
    <path d="M98 106c-3-10 0-18 8-18h8c5 0 8 4 8 8v44H94z" fill="#d8b38f" />
  </svg>
);

// A quick check on the phone before a photo is used: too dark, glare on the card, or blurry.
// It can be wrong, so there's always "Use it anyway"; a person checks every ID after this.
export async function photoProblem(b: Blob, kind: "doc" | "face"): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(b);
    const w = 400, h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; sum += v; }
    const mean = sum / (w * h);
    // Glare: blown-out patches in the middle of the shot, where the card sits.
    let hot = 0, mid = 0;
    for (let y = Math.floor(h * 0.2); y < h * 0.8; y++) for (let xx = Math.floor(w * 0.15); xx < w * 0.85; xx++) { mid++; if (g[y * w + xx] > 248) hot++; }
    // Sharpness: how much the edges change (variance of the Laplacian). Blurry photos have soft edges.
    let n = 0, s1 = 0, s2 = 0;
    for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
      const k = y * w + xx;
      const l = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - w] - g[k + w];
      n++; s1 += l; s2 += l * l;
    }
    const sharp = s2 / n - (s1 / n) ** 2;
    if (mean < 55) return "It's too dark to read. Find more light and take it again.";
    if (mean > 235) return "It's too bright to read. Move out of direct light and take it again.";
    if (hot / mid > 0.04) return "There's glare on it. Tilt it away from the light and take it again.";
    // An ID is all hard-edged text, so it needs to be sharper than a photo of a face.
    if (sharp < (kind === "doc" ? 150 : 50)) return "It looks blurry. Hold still, let it focus, and take it again.";
    return null;
  } catch { return null; }
}

// One screen: which ID, then the two photos side by side with an example of each. Photos go to a private store.
export function VerifyFlow({ onClose, onSubmitted }: { onClose: () => void; onSubmitted?: () => void }) {
  const { session, profile, reload } = useSession();
  const names = useMemo(() => {
    const dn = new Intl.DisplayNames(["en-AU"], { type: "region" });
    return REGIONS.map((c) => ({ id: dn.of(c) ?? c, label: dn.of(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label));
  }, []);
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState("");
  const [pick, setPick] = useState<null | "country" | "type">(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [doc, setDoc] = useState<Shot | null>(null);
  const [selfie, setSelfie] = useState<Shot | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const status: IdStatus = profile?.id_status ?? "none";

  async function send() {
    if (!session) return;
    if (!docType) return setErr("Select which ID you're using");
    if (!country) return setErr("Select the country that issued it");
    if (!doc || !selfie) return setErr("Add both photos");
    setStage("sending"); setErr("");
    try {
      const uid = session.user.id;
      const stamp = Date.now();
      const docPath = `${uid}/doc-${stamp}.jpg`;
      const selfiePath = `${uid}/selfie-${stamp}.jpg`;
      const a = await sb.storage.from("ids").upload(docPath, doc.blob, { contentType: "image/jpeg" });
      if (a.error) throw new Error("The ID photo didn't upload. Check your signal and try again.");
      const b = await sb.storage.from("ids").upload(selfiePath, selfie.blob, { contentType: "image/jpeg" });
      if (b.error) throw new Error("The photo of you didn't upload. Check your signal and try again.");
      await rpc("submit_id_check", { p_doc_type: docType, p_country: country, p_doc_path: docPath, p_selfie_path: selfiePath });
      await reload();
      setStage("sent");
      onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("intro");
    }
  }

  const keep = (set: (s: Shot) => void) => (b: Blob) => { set({ blob: b, url: URL.createObjectURL(b) }); setStage("intro"); };
  if (stage === "doc") {
    return <Camera key="doc" step={1} facing="environment" title={docType === "Passport" ? "Photo page of your passport" : (docType ? `Front of your ${docType.toLowerCase().replace("id card", "ID card")}` : "Front of your ID")}
      sub="Fill the frame with it and tap the button." tip="All four corners showing, no glare" next="Next: you, holding it."
      onBack={() => setStage("intro")} onShot={keep(setDoc)} />;
  }
  if (stage === "selfie") {
    return <Camera key="selfie" step={2} facing="user" face title="You, holding your ID"
      sub="Hold it beside your face so both are clear." tip="Face the light, no hat or sunglasses" next="A person checks it, usually within a few hours."
      onBack={() => setStage("intro")} onShot={keep(setSelfie)} />;
  }
  if (stage === "sent") {
    return (
      <div className="screen" role="dialog" aria-label="Sent for checking" style={{ background: "var(--ground)" }}>
        <section className="hero" style={{ padding: "calc(var(--safe-top) + 60px) 20px 40px" }}>
          {Icon.clock("var(--lime)")}
          <h1 style={{ margin: "18px 0 8px", fontSize: 44 }}>Sent for<br />checking</h1>
          <p className="lede" style={{ maxWidth: 300 }}>We check it by hand, usually within a few hours.</p>
        </section>
        <div style={{ flex: 1 }} />
        <div className="bottombar" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" onClick={onClose}>Done {Icon.arrow("#fff")}</button>
        </div>
      </div>
    );
  }

  const PhotoCard = ({ title, art, shot, open, tip }: { title: string; art: ReactNode; shot: Shot | null; open: () => void; tip: string }) => (
    <div className="vf-col">
      <span className="vf-k">{title}</span>
      <div className="vf-card">
        {shot ? <span className="vf-shot"><img src={shot.url} alt="" /><span className="vf-ok">{Icon.tick("#fff", 16)} Added</span></span>
          : <span className="vf-ex-wrap"><span className="vf-ex">Example</span>{art}</span>}
        <button className={`btn ${shot ? "stone" : "primary"} vf-take`} onClick={open}>{Icon.camera(shot ? "var(--ink)" : "#fff")}{shot ? "Retake" : "Take photo"}</button>
      </div>
      <p className="vf-tip">{tip}</p>
    </div>
  );
  const ready = !!doc && !!selfie;
  return (
    <div className="screen vf" role="dialog" aria-label="Verify your ID">
      <div className="screen-body" style={{ paddingBottom: 0 }}>
        <StepHero title="Verify your ID" onBack={onClose}
          sub={status === "retake" ? `Please retake: ${profile?.id_note ?? "the photo wasn't clear"}.`
            : status === "rejected" ? `Not approved: ${profile?.id_note ?? "try a different ID"}. You can try again.`
            : status === "pending" ? "We're checking your last one. Sending again replaces it."
            : "People see an ID verified tick on your profile, so they know you're real. It's free."} />
        <div className="vf-body">
          <div className="vf-pickers">
            <button className="field" onClick={() => setPick("type")}>
              <span className="stack" style={{ gap: 2 }}><span className="k">Which ID</span><span className={docType ? "v" : "v ph"}>{docType || "Select"}</span></span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <button className="field" onClick={() => setPick("country")}>
              <span className="stack" style={{ gap: 2 }}><span className="k">Country that issued it</span><span className={country ? "v" : "v ph"}>{country || "Select the country"}</span></span>
              {Icon.search()}
            </button>
          </div>
          <div className="vf-pair">
            <PhotoCard title="Your ID" art={<IdArt />} shot={doc} open={() => setStage("doc")} tip="The whole card filling the frame, all four corners. No glare on the name or photo." />
            <PhotoCard title="You, holding it" art={<SelfieArt />} shot={selfie} open={() => setStage("selfie")} tip="The ID beside your face, both clear. Nothing covered." />
          </div>
          {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : <p className="vf-note">We check it by hand, usually within a few hours.</p>}
        </div>
      </div>
      <div className="bottombar" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={stage === "sending"} style={ready ? undefined : { opacity: 0.45 }} onClick={send}>{stage === "sending" ? "Sending…" : "Send for checking"} {Icon.arrow("#fff")}</button>
      </div>
      {pick === "country" && <SearchPicker title="Country that issued it" placeholder="Search countries" value={country ? [country] : []} options={names} onChange={(v) => setCountry(String(v[0]))} onClose={() => setPick(null)} />}
      {pick === "type" && <SearchPicker title="Which ID" value={docType ? [docType] : []} options={DOC_TYPES.map((d) => ({ id: d, label: d }))} onChange={(v) => setDocType(String(v[0]))} onClose={() => setPick(null)} />}
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
  const [problem, setProblem] = useState<string | null>(null);
  const took = (blob: Blob) => { setShot({ blob, url: URL.createObjectURL(blob) }); setProblem(null); photoProblem(blob, face ? "face" : "doc").then(setProblem); };

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
      took(blob);
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
        {shot && problem ? <span className="cam-warn">{problem}</span> : <>
          <span className="row t15 light" style={{ gap: 10, color: "rgba(255,255,255,0.85)" }}>{Icon.tick("var(--lime)", 20)}{tip}</span>
          <span className="small light" style={{ color: "rgba(255,255,255,0.65)" }}>{next}</span></>}
        {shot ? (
          <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
            {problem ? <>
              <button className="btn light" disabled={busy} onClick={() => onShot(shot.blob)}>Use it anyway</button>
              <button className="btn primary" disabled={busy} onClick={() => { setShot(null); setProblem(null); }}>Take it again</button>
            </> : <>
              <button className="btn light" disabled={busy} onClick={() => setShot(null)}>Retake</button>
              <button className="btn primary" disabled={busy} onClick={() => onShot(shot.blob)}>{busy ? "Sending…" : "Use this photo"} {Icon.arrow("#fff")}</button>
            </>}
          </div>
        ) : (
          <button className="shutter" onClick={capture} aria-label="Take photo" />
        )}
      </div>
      <input ref={file} type="file" accept="image/*" capture={facing} hidden onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const blob = await shrinkImage(f, 2000).catch(() => f);
        took(blob);
        e.target.value = "";
      }} />
    </div>
  );
}

// Standalone page at /verify for customers.
export function VerifyPage({ onClose }: { onClose: () => void }) {
  return <div className="app"><VerifyFlow onClose={onClose} /></div>;
}
