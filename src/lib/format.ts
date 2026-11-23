// How a job's price reads: "$105" for a fixed price, "$50 an hour" (or a day, a visit) otherwise.
export const UNIT_WORDS = { hour: "an hour", day: "a day", visit: "a visit" } as const;
export const UNIT_COUNT = { hour: ["hour", "hours"], day: ["day", "days"], visit: ["visit", "visits"] } as const;
export type PriceUnit = "fixed" | keyof typeof UNIT_WORDS;
export function priceWords(j: { price_cents: number; price_unit?: string | null; unit_price_cents?: number | null }) {
  const u = j.price_unit as PriceUnit | null | undefined;
  if (!u || u === "fixed" || j.unit_price_cents == null) return money(j.price_cents);
  return `${money(j.unit_price_cents)} ${UNIT_WORDS[u]}`;
}
// The rate on its own and the words after it, so a screen can set "$80" big and "an hour" small under it.
export function pricePair(j: { price_cents: number; price_unit?: string | null; unit_price_cents?: number | null }): [string, string] {
  const u = j.price_unit as PriceUnit | null | undefined;
  if (!u || u === "fixed" || j.unit_price_cents == null) return [money(j.price_cents), ""];
  return [money(j.unit_price_cents), UNIT_WORDS[u]];
}
// "About 3 hours, $150 in all" for an hourly, daily or per-visit job; nothing for a fixed price.
export function priceAbout(j: { price_cents: number; price_unit?: string | null; unit_price_cents?: number | null; unit_qty?: number | null }) {
  const u = j.price_unit as PriceUnit | null | undefined;
  if (!u || u === "fixed" || j.unit_price_cents == null) return "";
  const q = Number(j.unit_qty ?? 1);
  return `About ${q} ${UNIT_COUNT[u][q === 1 ? 0 : 1]}, ${money(j.price_cents)} in all`;
}

export const money = (cents: number, decimals = true) =>
  "$" + (cents / 100).toLocaleString("en-AU", { minimumFractionDigits: decimals && cents % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 });

export const money2 = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Your worker";

export const whenLabel = (asap: boolean, iso: string) => {
  if (asap) return "Today, ASAP";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

// "today, 3 pm", "tomorrow, 9 am", or "Thu 12 Nov, 9 am".
export const dayTime = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const t = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
  if (d.toDateString() === now.toDateString()) return `today, ${t}`;
  if (d.toDateString() === new Date(now.getTime() + 864e5).toDateString()) return `tomorrow, ${t}`;
  return `${d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}, ${t}`;
};

export const hours = (h: number) => (Number(h) < 1 ? `${Math.round(Number(h) * 60)} min` : Number(h) === 1 ? "1 hr" : `${Number(h)} hrs`);

export function elapsed(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `0:${String(m).padStart(2, "0")}`;
}

// Shrinks a phone photo before upload so it is quick on mobile data.
export async function shrinkImage(file: Blob, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}

// A photo as base64 (no "data:" prefix), small enough to send to Claude to read.
export async function photoForReading(file: Blob, max = 1280): Promise<string> {
  const small = await shrinkImage(file, max).catch(() => file);
  return blobBase64(small);
}
export function blobBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(b); });
}

export function validAbn(abn: string): boolean {
  const d = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const n = d.split("").map(Number);
  n[0] -= 1;
  return n.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

// A worker's name as shown to others: first name and initial, no full stop or comma ("Grant G").
export const cardName = (n: string) => n.replace(/[.,\s]+$/, "").replace(/\.(?=\s|$)/g, "");
