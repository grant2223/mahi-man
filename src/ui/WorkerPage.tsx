import { useEffect, useState } from "react";
import { avatarUrl, rpc } from "../lib/supabase";
import { go } from "../lib/router";
import { Loading, Logo } from "./kit";
import { GoldTick } from "../customer/Offers";
import type { PublicWorker } from "./ProfileHome";

/* What someone sees on the web when they scan a worker's card or open their link: who they are, and Book.
   On a phone with the app, the link opens the app instead and starts a job sent to this worker first. */
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
        <div className="wp-none"><b>This link isn't working</b><span>The worker may have closed their account.</span><a className="btn primary" href="/get">Get Mahi Man</a></div>
      ) : (<>
        <section className="wp-hero" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>
          <div className="w"><div className="n">{w.name}{w.age != null && <>, <i>{w.age}</i></>}{w.verified && <GoldTick s={26} />}</div><div className="s">{[w.suburb, w.area].filter(Boolean).join(", ")}</div></div>
        </section>
        <section className="wp-st">
          <div><b>{w.jobs}</b><small>jobs done</small></div>
          <div><b>{rec == null ? "New" : `${rec}%`}</b><small>{rec == null ? "no reviews yet" : "recommend"}</small></div>
          <div><b>{w.turns_up == null ? "New" : `${w.turns_up}%`}</b><small>turn up</small></div>
        </section>
        {w.does.length > 0 && <section className="wp-does"><h2>Does</h2><div>{w.does.map((c) => <span key={c.name}>{c.name}</span>)}</div></section>}
        <div className="wp-book"><a className="btn primary" href="/get">Book {w.first}</a></div>
      </>)}
    </div>
  );
}
