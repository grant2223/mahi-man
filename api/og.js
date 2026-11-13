// The share-card picture for mahiman.app links. Two designs take turns: each request gets one at random,
// and nothing is cached so the next share can get the other one.
export const config = { runtime: "edge" };

export default function handler(req) {
  const pick = Math.random() < 0.5 ? "/og-a.jpg" : "/og-b.jpg";
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(pick, req.url).toString(), "Cache-Control": "no-store, max-age=0" },
  });
}
