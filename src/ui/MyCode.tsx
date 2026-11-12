import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Capacitor } from "@capacitor/core";
import { go } from "../lib/router";
import { useSession } from "../lib/session";
import { rpc, type PersonCard } from "../lib/supabase";
import { shareLink } from "../lib/share";

// Codes point at the address that works today and keeps working after mahiman.app is connected,
// so a saved or printed code never goes dead.
const CODE_HOST = "https://mahiman.vercel.app";
import { Icon, Tile, useToast } from "./kit";

/* Your Mahi Man code. A worker shows it at the end of a job: the customer scans it with their phone camera
   and lands on posting a job sent to that worker (or gets the app first). Everyone else's code invites a mate. */
export function MyCode({ onBack }: { onBack?: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [svg, setSvg] = useState("");
  const [card, setCard] = useState<PersonCard | null>(null);
  const worker = !!profile?.is_worker;
  const name = profile?.full_name ?? "";
  const first = name.split(" ")[0];
  const url = worker && profile ? `${CODE_HOST}/w/${profile.id}` : `${CODE_HOST}/get`;
  const say = worker ? `Scan to book ${first} again` : "Scan to get Mahi Man";
  const sub = worker ? "Opens Mahi Man, or gets the app first." : "Get help with any job, or earn doing them.";
  useEffect(() => { QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "H", color: { dark: "#13241d", light: "#00000000" } }).then(setSvg); }, [url]);
  useEffect(() => { if (profile) rpc<PersonCard[]>("person_card", { p_person: profile.id }).then((c) => setCard(c[0] ?? null)).catch(() => {}); }, [profile?.id]);
  const back = onBack ?? (() => (history.length > 1 ? history.back() : go("/settings")));
  if (!profile) return null;
  const stats = card ? [card.rating != null ? `${card.rating.toFixed(1)} rating` : null, card.jobs_done ? `${card.jobs_done} job${card.jobs_done === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") : "";

  const share = async () => {
    const r = await shareLink(worker ? `Need a hand again? Book me on Mahi Man.` : `Get help with any job, or earn doing them. Get Mahi Man.`, url);
    if (r === "copied") toast("Link copied");
  };
  const save = async () => {
    try {
      const png = await cardImage({ name, verified: profile.id_status === "verified", stats, say, url });
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const f = await Filesystem.writeFile({ path: "mahi-man-code.png", data: png.split(",")[1], directory: Directory.Cache });
        await Share.share({ files: [f.uri], dialogTitle: "Save image" });
      } else {
        const a = document.createElement("a"); a.href = png; a.download = "mahi-man-code.png"; a.click();
      }
    } catch { /* closed the share sheet */ }
  };

  return (
    <div className="screen mc mc-c" role="dialog" aria-label="Your code">
      <div className="mc-c-card">
        <div className="mc-top"><button className="back" onClick={back} aria-label="Back">{Icon.back("#fff")}</button></div>
        <div className="mc-c-id">
          <Tile name={name} photo={profile.photo_path} size={76} />
          <span><b>{name}</b><span>{profile.id_status === "verified" ? "ID verified" : worker ? "Mahi Man worker" : "On Mahi Man"}</span>{stats && <span>{stats}</span>}</span>
        </div>
        <img className="mc-c-mascot" src="/mascot.png" alt="" />
      </div>
      <div className="mc-c-code">
        <div className="mc-qr" style={{ width: 250, height: 250 }}>
          <span dangerouslySetInnerHTML={{ __html: svg }} />
          <img className="mc-head" src="/mahi-head.png" alt="" style={{ width: 55, height: 55 }} />
        </div>
        <b>{say}</b>
        <span>{sub}</span>
      </div>
      <div className="mc-btns">
        <button className="btn primary" onClick={share}>Share</button>
        <button className="btn stone" onClick={save}>Save image</button>
      </div>
    </div>
  );
}

// The same card as a picture, for a ute sticker, a print or a message.
async function cardImage({ name, verified, stats, say, url }: { name: string; verified: boolean; stats: string; say: string; url: string }) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, W, 420); g.addColorStop(0, "#17926b"); g.addColorStop(1, "#0a4a37");
  x.fillStyle = g; x.fillRect(0, 0, W, 420);
  x.fillStyle = "#fff"; x.fillRect(0, 420, W, H - 420);
  const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const mascot = await load("/mascot.png").catch(() => null);
  if (mascot) { const h = 400, w = (mascot.width / mascot.height) * h; x.drawImage(mascot, W - w + 60, 420 - h, w, h); }
  x.fillStyle = "#fff"; x.font = "600 64px Inter, system-ui, sans-serif"; x.fillText(name, 72, 200);
  x.font = "300 38px Inter, system-ui, sans-serif"; x.globalAlpha = 0.9;
  x.fillText(verified ? "ID verified" : "On Mahi Man", 72, 262); if (stats) x.fillText(stats, 72, 316); x.globalAlpha = 1;
  const q = document.createElement("canvas");
  await QRCode.toCanvas(q, url, { margin: 0, width: 600, errorCorrectionLevel: "H", color: { dark: "#13241d", light: "#ffffff" } });
  x.drawImage(q, (W - 600) / 2, 520);
  const head = await load("/mahi-head.png").catch(() => null);
  if (head) { const s = 132; x.fillStyle = "#fff"; x.fillRect((W - s) / 2 - 10, 820 - s / 2 - 10, s + 20, s + 20); x.drawImage(head, (W - s) / 2, 820 - s / 2, s, s); }
  x.fillStyle = "#2a2d32"; x.textAlign = "center"; x.font = "600 56px Inter, system-ui, sans-serif"; x.fillText(say, W / 2, 1220);
  return c.toDataURL("image/png");
}
