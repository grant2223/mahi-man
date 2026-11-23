// A short-lived Apple Maps token for the address lookup and maps, for anyone, signed in or not:
// someone posting their first job reaches the address step before they sign in.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

let cache: { t: string; exp: number } | null = null;
async function mapToken(): Promise<string | null> {
  const pem = Deno.env.get("MAPKIT_KEY_P8"), kid = Deno.env.get("MAPKIT_KEY_ID");
  if (!pem || !kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cache && cache.exp - 300 > now) return cache.t;
  const b64url = (b: ArrayBuffer | string) => {
    const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
    let s = ""; for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const exp = now + 3600;
  const input = `${b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }))}.${b64url(JSON.stringify({ iss: Deno.env.get("APNS_TEAM_ID") ?? "3N7J224W53", iat: now, exp }))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  cache = { t: `${input}.${b64url(sig)}`, exp };
  return cache.t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try { return new Response(JSON.stringify({ token: await mapToken() }), { headers: cors }); }
  catch { return new Response(JSON.stringify({ token: null }), { headers: cors }); }
});
