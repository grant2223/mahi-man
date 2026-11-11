// Switches the App Store and TestFlight links from mahiman.vercel.app to mahiman.app.
// Run once mahiman.app is live:  node store/apple-go-live.mjs
// It checks the new pages load first, so the listing never points at a dead link.
// Uses the App Store Connect API key in ~/FFP Apple Keys (never commit the key).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createPrivateKey, sign } from "node:crypto";

const SITE = process.argv[2] ?? "https://mahiman.app";
const APP = "6832797588";
const VERSION_LOC = "dc584a8b-e723-493b-a015-a348da40953d"; // App Store 1.0, en-AU
const INFO_LOC = "2b70fd5a-7daa-434b-afc3-112cb26cfe74"; // app name, subtitle, privacy link

const KEY = readFileSync(`${homedir()}/FFP Apple Keys/AuthKey_NTYUL3P32J.p8`, "utf8");
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: "NTYUL3P32J", typ: "JWT" });
  const body = b64({ iss: "5cf1405d-613c-4c10-8ff1-f86871bbb06b", iat: now, exp: now + 1100, aud: "appstoreconnect-v1" });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: createPrivateKey(KEY), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}
async function asc(method, path, data) {
  const res = await fetch("https://api.appstoreconnect.apple.com" + path, {
    method, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: data && JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

for (const page of ["/", "/privacy", "/support", "/terms"]) {
  const r = await fetch(SITE + page).catch((e) => ({ ok: false, status: e.message }));
  if (!r.ok) { console.error(`${SITE}${page} isn't loading (${r.status}). Nothing changed.`); process.exit(1); }
}

await asc("PATCH", `/v1/appStoreVersionLocalizations/${VERSION_LOC}`, {
  data: { type: "appStoreVersionLocalizations", id: VERSION_LOC, attributes: { supportUrl: `${SITE}/support`, marketingUrl: SITE } },
});
await asc("PATCH", `/v1/appInfoLocalizations/${INFO_LOC}`, {
  data: { type: "appInfoLocalizations", id: INFO_LOC, attributes: { privacyPolicyUrl: `${SITE}/privacy` } },
});
const beta = await asc("GET", `/v1/apps/${APP}/betaAppLocalizations`);
for (const l of beta.data) {
  await asc("PATCH", `/v1/betaAppLocalizations/${l.id}`, {
    data: { type: "betaAppLocalizations", id: l.id, attributes: { privacyPolicyUrl: `${SITE}/privacy`, marketingUrl: SITE } },
  });
}
console.log(`App Store and TestFlight links now use ${SITE}.`);
