import { useEffect, useState } from "react";
import { api, rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { Icon, Screen, StepHero, Tile, useToast } from "./kit";
import { VerifyFlow } from "./Verify";
import { AbnStep } from "../worker/Signup";
import { alertsState, pushSupported, signOut, turnOnAlerts } from "../lib/push";

// Account settings: ID check, blocked people, legal pages and in-app account deletion (Apple 5.1.1(v)).
export function Settings() {
  const { session, profile, reload, ready } = useSession();
  const toast = useToast();
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  const [alerts, setAlerts] = useState<"granted" | "prompt" | "denied" | "unsupported">("unsupported");
  useEffect(() => { alertsState().then(setAlerts).catch(() => {}); }, []);
  const [screen, setScreen] = useState<null | "verify" | "delete" | "payid">(null);

  useEffect(() => {
    if (!session) return;
    rpc<{ id: string; name: string }[]>("my_blocks").then((r) => setBlocked(r ?? [])).catch(() => {});
  }, [session]);

  if (ready && !session) { go("/", true); return null; }
  if (!session || !profile) return <div className="app"><StepHero title="Settings" onBack={() => (history.length > 1 ? history.back() : go("/"))} /></div>;
  const idLabel = { none: "Not verified", pending: "Being checked", verified: "ID verified", retake: "Retake needed", rejected: "Not approved" }[profile.id_status];

  return (
    <div className="app">
      <StepHero title="Settings" sub={session.user.email ?? ""} onBack={() => (history.length > 1 ? history.back() : go("/"))} />
      <div className="step-body" style={{ padding: 0, gap: 0 }}>
        <div className="poster">
          <Tile name={profile.full_name || "?"} photo={profile.photo_path} />
          <span className="t">
            <span className="t17 w5">{profile.full_name || "Your account"}</span>
            {profile.id_status === "verified" ? <span className="badge-ver">{Icon.shieldTick("var(--emerald)")}ID verified</span> : <span className="badge-unver">{idLabel}</span>}
          </span>
        </div>
        {profile.id_status !== "verified" && (
          <button className="choice" onClick={() => setScreen("verify")}>
            <span className="t"><b>Verify your ID</b><span>{profile.id_status === "pending" ? "We're checking it now" : "Passport or national ID, plus a selfie"}</span></span>
            {Icon.chevron("var(--faint)")}
          </button>
        )}
        <button className="choice" onClick={() => go("/jobs")}><span className="t"><b>My jobs</b><span>Jobs you've posted</span></span>{Icon.chevron("var(--faint)")}</button>
        {profile.is_worker && <button className="choice" onClick={() => go("/work")}><span className="t"><b>Work</b><span>Your worker account</span></span>{Icon.chevron("var(--faint)")}</button>}
        {profile.is_worker && <button className="choice" onClick={() => setScreen("payid")}><span className="t"><b>ABN and PayID</b><span>Where customers pay you</span></span>{Icon.chevron("var(--faint)")}</button>}
        {blocked.length > 0 && (
          <div style={{ padding: "18px 20px 8px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>Blocked</h2>
            {blocked.map((b) => (
              <div key={b.id} className="row between" style={{ padding: "8px 0" }}>
                <span className="t15">{b.name}</span>
                <button className="link" onClick={async () => {
                  await sb.from("blocks").delete().eq("blocker_id", session.user.id).eq("blocked_id", b.id);
                  setBlocked((x) => x.filter((y) => y.id !== b.id)); toast("Unblocked");
                }}>Unblock</button>
              </div>
            ))}
          </div>
        )}
        {pushSupported() && (
          <button className="choice" onClick={async () => { if (alerts === "prompt") setAlerts(await turnOnAlerts()); }}>
            <span className="t"><b>Alerts</b><span>{alerts === "granted" ? "On. New jobs, offers, messages and payments" : alerts === "denied" ? "Off. Turn them on in iPhone Settings, More Mahi, Notifications" : "Off. Tap to turn on"}</span></span>
            {alerts === "prompt" && Icon.chevron("var(--faint)")}
          </button>
        )}
        <button className="choice" onClick={() => go("/support")}><span className="t"><b>Help and support</b><span>Contact the More Mahi team</span></span>{Icon.chevron("var(--faint)")}</button>
        <button className="choice" onClick={() => go("/privacy")}><span className="t"><b>Privacy policy</b></span>{Icon.chevron("var(--faint)")}</button>
        <button className="choice" onClick={() => go("/terms")}><span className="t"><b>Terms of use</b></span>{Icon.chevron("var(--faint)")}</button>
        <button className="choice" onClick={() => signOut().then(() => go("/"))}><span className="t"><b>Sign out</b></span></button>
        <button className="choice" onClick={() => setScreen("delete")}><span className="t"><b style={{ color: "var(--danger)" }}>Delete account</b><span>Removes your account, photos and messages for good</span></span></button>
      </div>
      {screen === "payid" && <AbnStep onBack={() => setScreen(null)} onSaved={() => { setScreen(null); toast("Saved"); }} />}
      {screen === "verify" && <VerifyFlow onClose={() => { setScreen(null); reload(); }} />}
      {screen === "delete" && <DeleteAccount onBack={() => setScreen(null)} />}
    </div>
  );
}

function DeleteAccount({ onBack }: { onBack: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Screen title="Delete account" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <p className="t17" style={{ marginTop: 0, lineHeight: 1.45 }}>This deletes your account straight away and can't be undone.</p>
        <ul className="t15 light" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Your profile, photos, ID check, messages and reviews are deleted.</li>
          <li>Open bookings are cancelled. Jobs you finished stay in the other person's history without your name.</li>
          <li>You can make a new account later with the same email.</li>
        </ul>
        <label className="field"><span className="k">Type DELETE to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" /></label>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button className="btn stone" onClick={onBack}>Keep my account</button>
          <button className="btn danger" disabled={busy || typed.trim().toUpperCase() !== "DELETE"} onClick={async () => {
            setBusy(true); setErr("");
            try {
              await api("delete_account", { confirm: "DELETE" });
              await signOut();
              sessionStorage.clear();
              go("/", true);
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? "Deleting…" : "Delete account"}</button>
        </div>
      </div>
    </Screen>
  );
}
