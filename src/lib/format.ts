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

export const hours = (h: number) => (Number(h) < 1 ? `${Math.round(Number(h) * 60)} min` : Number(h) === 1 ? "1 hr" : `${Number(h)} hrs`);

export function elapsed(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `0:${String(m).padStart(2, "0")}`;
}

// Shrinks a phone photo before upload so it is quick on mobile data.
export async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}

export function validAbn(abn: string): boolean {
  const d = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const n = d.split("").map(Number);
  n[0] -= 1;
  return n.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}
