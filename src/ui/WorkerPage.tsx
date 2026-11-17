import { useEffect, useState } from "react";
import { rpc } from "../lib/supabase";
import { go } from "../lib/router";
import { WorkerProfile } from "./WorkerProfile";
import { Loading } from "./kit";

/* A worker's card link or QR code, opened in the app: their standard profile, the same one customers see on their offers,
   with Save and Book (a job sent to them first). Without the app the link goes to the App Store or Google Play (Mahi Man is app only). */
export function WorkerPage({ id }: { id: string }) {
  const [wid, setWid] = useState<string | null | undefined>(/^[0-9a-f-]{36}$/.test(id) ? id : undefined);
  useEffect(() => { if (wid === undefined) rpc<{ id: string } | null>("worker_public", { p_key: id }).then((w) => setWid(w?.id ?? null)).catch(() => setWid(null)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = () => (history.length > 1 ? history.back() : go("/"));
  if (wid === undefined) return <div className="app"><Loading /></div>;
  return <WorkerProfile workerId={wid ?? id} onBack={back} onBook={() => go(`/w/${id}/book`)} />;
}
