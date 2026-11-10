// Mahi Man: sends queued alerts (public.push_queue) to phones: Apple (APNs) for iPhones, Firebase (FCM) for Android.
// Runs when an alert is queued. Keys come from Edge Function secrets; a platform without keys is skipped.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const APNS_KEY = Deno.env.get("APNS_KEY_P8");
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "J53YNHAJ3B";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "3N7J224W53";
const APNS_TOPIC = Deno.env.get("APNS_BUNDLE_ID") ?? "com.moremahi.app";
const APNS_HOST = Deno.env.get("APNS_SANDBOX") === "true" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
const FCM_SA = Deno.env.get("FCM_SERVICE_ACCOUNT");

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pemBody = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));

async function jwt(alg: "ES256" | "RS256", header: Record<string, string>, claims: Record<string, unknown>, pem: string) {
  const key = await crypto.subtle.importKey("pkcs8", pemBody(pem), alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const input = `${b64url(JSON.stringify({ alg, typ: "JWT", ...header }))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

let apnsToken: { t: string; at: number } | null = null;
async function apnsAuth() {
  if (!apnsToken || Date.now() - apnsToken.at > 40 * 60 * 1000) {
    apnsToken = { t: await jwt("ES256", { kid: APNS_KEY_ID! }, { iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }, APNS_KEY!), at: Date.now() };
  }
  return apnsToken.t;
}

let fcm: { token: string; project: string; exp: number } | null = null;
async function fcmAuth() {
  if (fcm && fcm.exp > Date.now() + 60000) return fcm;
  const sa = JSON.parse(FCM_SA!);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await jwt("RS256", {}, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, sa.private_key);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}` });
  const j = await r.json();
  fcm = { token: j.access_token, project: sa.project_id, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return fcm;
}

type Msg = { title: string; body: string; url: string; category?: string | null; data?: Record<string, unknown> };

// Returns "ok", "gone" (token no longer valid: forget it) or an error text.
async function sendIos(token: string, m: Msg) {
  if (!APNS_KEY || !APNS_KEY_ID) return "no Apple key yet";
  const r = await fetch(`https://${APNS_HOST}/3/device/${token}`, {
    method: "POST",
    headers: { authorization: `bearer ${await apnsAuth()}`, "apns-topic": APNS_TOPIC, "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json" },
    body: JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: "default", ...(m.category ? { category: m.category } : {}) }, url: m.url, ...(m.data ?? {}) }),
  });
  if (r.ok) return "ok";
  const reason = (await r.json().catch(() => ({}))).reason ?? r.status;
  return reason === "BadDeviceToken" || reason === "Unregistered" ? "gone" : `apple: ${reason}`;
}

async function sendAndroid(token: string, m: Msg) {
  if (!FCM_SA) return "no Firebase key yet";
  const a = await fcmAuth();
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title: m.title, body: m.body }, data: { url: m.url, ...Object.fromEntries(Object.entries(m.data ?? {}).map(([k, v]) => [k, String(v)])) }, android: { priority: "high" } } }),
  });
  if (r.ok) return "ok";
  const j = await r.json().catch(() => ({}));
  const code = j?.error?.details?.[0]?.errorCode ?? j?.error?.status ?? r.status;
  return code === "UNREGISTERED" || code === "NOT_FOUND" ? "gone" : `google: ${code}`;
}

Deno.serve(async () => {
  const { data: queue } = await db.from("push_queue").select("*").is("sent_at", null).order("id").limit(200);
  for (const q of queue ?? []) {
    // Claim it first so a second run never sends it twice.
    const { data: claimed } = await db.from("push_queue").update({ sent_at: new Date().toISOString() }).eq("id", q.id).is("sent_at", null).select("id");
    if (!claimed?.length) continue;
    const { data: phones } = await db.from("push_tokens").select("*").eq("user_id", q.user_id);
    const results: string[] = [];
    for (const p of phones ?? []) {
      let res: string;
      try {
        res = p.platform === "ios" ? await sendIos(p.token, q) : await sendAndroid(p.token, q);
      } catch (e) {
        res = `error: ${(e as Error).message}`;
      }
      if (res === "gone") await db.from("push_tokens").delete().eq("token", p.token);
      results.push(`${p.platform}:${res}`);
    }
    await db.from("push_queue").update({ result: results.join(", ") || "no phone" }).eq("id", q.id);
  }
  return new Response(JSON.stringify({ sent: queue?.length ?? 0 }), { headers: { "content-type": "application/json" } });
});
