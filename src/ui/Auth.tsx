import { useState } from "react";
import { sb } from "../lib/supabase";
import { Screen } from "./kit";

// Full-bleed sign in / create account. Shown when an action needs an account,
// so nobody has to sign up before they have seen prices.
export function AuthScreen({ title, reason, onDone, onBack }: { title: string; reason: string; onDone: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<"in" | "up" | "reset">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function submit() {
    setErr(""); setNote(""); setBusy(true);
    try {
      if (mode === "up") {
        if (name.trim().split(/\s+/).length < 2) throw new Error("Add your first and last name");
        if (pw.length < 8) throw new Error("Use at least 8 characters for your password");
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name.trim() }, emailRedirectTo: location.href } });
        if (error) throw error;
        if (!data.session) { setNote("Check your email and tap the link to finish."); return; }
        onDone();
      } else if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Email or password is wrong" : error.message);
        onDone();
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + "/reset" });
        if (error) throw error;
        setNote("We've emailed you a link to set a new password.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <Screen title={title} onBack={onBack}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        <p className="t17 light" style={{ margin: "0 0 18px", lineHeight: 1.4 }}>{reason}</p>
        <div className="stack">
          {mode === "up" && (
            <label className="field"><span className="k">Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          )}
          <label className="field"><span className="k">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
          {mode !== "reset" && (
            <label className="field"><span className="k">Password</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"}
                onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          )}
        </div>
        {err && <p className="err">{err}</p>}
        {note && <p className="t15 em">{note}</p>}
        <div className="row between" style={{ marginTop: 20 }}>
          <span className="stack" style={{ gap: 0 }}>
            {mode !== "up" && <button className="link" onClick={() => { setMode("up"); setErr(""); }}>New here? Create an account</button>}
            {mode !== "in" && <button className="link" onClick={() => { setMode("in"); setErr(""); }}>I already have an account</button>}
            {mode === "in" && <button className="link quiet" onClick={() => { setMode("reset"); setErr(""); }}>Forgot password?</button>}
          </span>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {mode === "up" ? "Create account" : mode === "in" ? "Sign in" : "Send link"}
          </button>
        </div>
      </div>
    </Screen>
  );
}

export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <Screen title="New password" onBack={onDone}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        <label className="field"><span className="k">New password</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn primary" onClick={async () => {
            if (pw.length < 8) return setErr("Use at least 8 characters");
            const { error } = await sb.auth.updateUser({ password: pw });
            if (error) return setErr(error.message);
            onDone();
          }}>Save</button>
        </div>
      </div>
    </Screen>
  );
}
