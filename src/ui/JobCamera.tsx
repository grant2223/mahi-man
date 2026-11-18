import { useEffect, useRef, useState } from "react";
import { Icon } from "./kit";

/* Snap it: a full-screen camera for photographing a job. Take up to `max` photos, then Done.
   If the camera can't be opened live, the phone's own camera or photo library takes over. */
export function JobCamera({ max, onBack, onDone }: { max: number; onBack: () => void; onDone: (photos: Blob[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [shots, setShots] = useState<{ blob: Blob; url: string }[]>([]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } setLive(true); })
      .catch(() => setLive(false));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const full = shots.length >= max;
  async function capture() {
    if (full) return;
    if (!live || !video.current) { file.current?.click(); return; }
    const v = video.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.88));
    setFlash(true); window.setTimeout(() => setFlash(false), 120);
    setShots((s) => [...s, { blob, url: URL.createObjectURL(blob) }]);
  }

  return (
    <div className="jc" role="dialog" aria-label="Take photos of the job">
      <div className="jc-view">
        <video ref={video} playsInline muted style={{ display: live ? "block" : "none" }} />
        {live === false && (
          <button className="jc-open" onClick={() => file.current?.click()}>
            {Icon.camera("#fff")}<span>Tap to take photos</span>
          </button>
        )}
        {flash && <span className="jc-flash" />}
        <button className="jc-back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button>
        <span className="jc-tip">Show the whole job, then the worst bit</span>
      </div>
      <span className="jc-count">{full ? `${max} photos, that's the most` : shots.length ? `${shots.length} photo${shots.length === 1 ? "" : "s"}` : ""}</span>
      <div className="jc-bar">
        <div className="jc-thumbs">
          {/* Photos already on the phone: always a way in, even when the camera can't open. */}
          {!shots.length && <button className="jc-lib" onClick={() => file.current?.click()} aria-label="Choose from your photos"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5.5-5.5L6 20" /></svg></button>}
          {shots.slice(-3).map((s) => (
            <button key={s.url} style={{ backgroundImage: `url("${s.url}")` }} aria-label="Remove photo"
              onClick={() => setShots((all) => all.filter((x) => x.url !== s.url))} />
          ))}
        </div>
        <button className="jc-shutter" onClick={capture} disabled={full} aria-label="Take photo"><i /></button>
        <button className="jc-done" disabled={!shots.length} onClick={() => onDone(shots.map((s) => s.blob))}>Done</button>
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => {
        const fs = Array.from(e.target.files ?? []).slice(0, max - shots.length);
        e.target.value = "";
        if (!fs.length) return;
        const next = [...shots, ...fs.map((f) => ({ blob: f as Blob, url: URL.createObjectURL(f) }))];
        // No live camera: the phone's camera or library already did the picking, so go straight on.
        if (!live) onDone(next.map((s) => s.blob)); else setShots(next);
      }} />
    </div>
  );
}
