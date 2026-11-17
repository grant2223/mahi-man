import { useEffect, useState } from "react";
import { avatarUrl, rpc } from "../lib/supabase";
import { go } from "../lib/router";
import { Loading, Logo } from "./kit";
import { GoldTick } from "../customer/Offers";
import { cardName, type PublicWorker } from "./ProfileHome";

/* A worker's page in the app, opened from their card or link: who they are, and Book, which starts a job sent to them first.
   Without the app the link goes to the App Store or Google Play instead (Mahi Man is app only). */
export function WorkerPage({ id }: { id: string }) {
  const [w, setW] = useState<PublicWorker | null | undefined>(undefined);
  useEffect(() => { rpc<PublicWorker | null>("worker_public", { p_key: id }).then(setW).catch(() => setW(null)); }, [id]);
  if (w === undefined) return <div className="wp"><Loading /></div>;
  const pic = avatarUrl(w?.photo);
  const rec = w && w.reviewed ? Math.round((w.recommended / w.reviewed) * 100) : null;
  return (
    <div className="wp">
      <header className="wp-top"><a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><Logo /> Mahi Man</a></header>
      {!w ? (
        <div className="wp-none"><b>This link isn't working</b><span>The worker may have closed their account.</span><button className="btn primary" onClick={() => go("/")}>Post a job</button></div>
      ) : (<>
        <section className="wp-hero" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>
          <div className="w"><div className="n">{cardName(w.name)}{w.verified && <GoldTick s={26} />}</div><div className="s">{[w.suburb, w.area].filter(Boolean).join(", ")}</div></div>
        </section>
        <section className="wp-st">
          <div><b>{w.jobs}</b><small>jobs done</small></div>
          <div><b>{rec == null ? "New" : `${rec}%`}</b><small>{rec == null ? "no reviews yet" : "recommend"}</small></div>
          <div><b>{w.turns_up == null ? "New" : `${w.turns_up}%`}</b><small>turn up</small></div>
        </section>
        {w.does.length > 0 && <section className="wp-does"><h2>Does</h2><div>{w.does.map((c) => <span key={c.name}>{c.name}</span>)}</div></section>}
        <div className="wp-book"><button className="btn primary" onClick={() => go(`/w/${id}/book`)}>Book {w.first}</button></div>
      </>)}
    </div>
  );
}
