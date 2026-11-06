import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb, type Profile } from "./supabase";

interface Ctx { session: Session | null; profile: Profile | null; ready: boolean; reload: () => Promise<void> }
const SessionCtx = createContext<Ctx>({ session: null, profile: null, ready: false, reload: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    const { data } = await sb.from("profiles").select("*").eq("id", s.user.id).single();
    setProfile(data as Profile | null);
  }, []);

  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => { setSession(data.session); await load(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); load(s); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  return (
    <SessionCtx.Provider value={{ session, profile, ready, reload: () => load(session) }}>
      {children}
    </SessionCtx.Provider>
  );
}
export const useSession = () => useContext(SessionCtx);
