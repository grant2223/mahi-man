import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { sb } from "../lib/supabase";
import { Screen } from "./kit";

// Full-bleed sign in. Shown only when an action needs an account (so nobody signs up
// before they've seen prices), and the action carries on as soon as they're in.
// Apple on iPhone, or a 6-digit code by email. No passwords to make up.
const appleReady = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function nameIfBlank(full: string) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user || !full.trim()) return;
  const { data: p } = await sb.from("profiles").select("full_name").eq("id", u.user.id).single();
  if (!p?.full_name?.trim()) await sb.from("profiles").update({ full_name: full.trim() }).eq("id", u.user.id);
}

async function hasName() {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { data: p } = await sb.from("profiles").select("full_name").eq("id", u.user.id).single();
  return !!p?.full_name?.trim() && p.full_name.trim().split(/\s+/).length >= 2;
}

export function AuthScreen({ title, reason, onDone, onBack }: { title: string; reason: string; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<"start" | "code" | "name" | "pw">("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  const run = async (f: () => Promise<void>) => {
    setErr(""); setNote(""); setBusy(true);
    try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const finish = async () => { if (await hasName()) onDone(); else setStep("name"); };

  const apple = () => run(async () => {
    const raw = crypto.randomUUID();
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    let r;
    try {
      r = await SignInWithApple.authorize({ clientId: "com.moremahi.app", redirectURI: "https://srcbzszaiorjztprleux.supabase.co/auth/v1/callback", scopes: "email name", nonce: await sha256(raw) });
    } catch { return; } // they closed the Apple sheet
    const { error } = await sb.auth.signInWithIdToken({ provider: "apple", token: r.response.identityToken, nonce: raw });
    if (error) throw error;
    const full = [r.response.givenName, r.response.familyName].filter(Boolean).join(" ");
    if (full) { await nameIfBlank(full); await sb.auth.updateUser({ data: { full_name: full } }); }
    await finish();
  });

  const sendCode = () => run(async () => {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Check your email address");
    const { error } = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    if (error) throw new Error(/rate|seconds/i.test(error.message) ? "Wait a minute, then send it again" : error.message);
    setCode(""); setStep("code");
    window.setTimeout(() => codeRef.current?.focus(), 200);
  });

  const verify = (c: string) => run(async () => {
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: c, type: "email" });
    if (error) { setCode(""); throw new Error("That code didn't work. Check it, or send a new one."); }
    await finish();
  });

  const saveName = () => run(async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (n.split(" ").length < 2) throw new Error("Add your first and last name");
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("profiles").update({ full_name: n }).eq("id", u.user!.id);
    if (error) throw error;
    await sb.auth.updateUser({ data: { full_name: n } });
    onDone();
  });

  const password = () => run(async () => {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "Email or password is wrong" : error.message);
    await finish();
  });

  const back = step === "start" ? onBack : step === "name" ? onBack : () => { setStep("start"); setErr(""); setNote(""); };

  return (
    <Screen title={step === "code" ? "Enter the code" : step === "name" ? "Your name" : title} onBack={back}>
      <div className="screen-body" style={{ padding: "20px 16px" }}>
        {step === "start" && <>
          <p className="t17 light" style={{ margin: "0 0 20px", lineHeight: 1.4 }}>{reason}</p>
          {appleReady() && <>
            <button className="btn apple block" disabled={busy} onClick={apple}>{appleMark} Continue with Apple</button>
            <div className="or-line"><span>or</span></div>
          </>}
          <label className="field"><span className="k">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email"
              onKeyDown={(e) => e.key === "Enter" && sendCode()} /></label>
          {err && <p className="err">{err}</p>}
          <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy || !email.trim()} onClick={sendCode}>
            {busy ? "One sec…" : "Email me a code"}
          </button>
          <p className="t14 muted" style={{ margin: "14px 0 0", lineHeight: 1.4 }}>No password needed. New here? This makes your account.</p>
          <div className="auth-switch">Have a password? <button className="link" onClick={() => { setStep("pw"); setErr(""); }}>Sign in with it</button></div>
        </>}

        {step === "code" && <>
          <p className="t17 light" style={{ margin: "0 0 20px", lineHeight: 1.4 }}>We sent a 6-digit code to <b>{email.trim()}</b>.</p>
          <label className="field"><span className="k">Code</span>
            <input ref={codeRef} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-in"
              onChange={(e) => { const c = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(c); if (c.length === 6) verify(c); }} /></label>
          {err && <p className="err">{err}</p>}
          {busy && <p className="t15 muted">Checking…</p>}
          <div className="auth-switch">No email? Check junk, or <button className="link" disabled={busy} onClick={sendCode}>send a new code</button></div>
        </>}

        {step === "name" && <>
          <p className="t17 light" style={{ margin: "0 0 20px", lineHeight: 1.4 }}>So people know who they're dealing with.</p>
          <label className="field"><span className="k">First and last name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoCapitalize="words"
              onKeyDown={(e) => e.key === "Enter" && saveName()} /></label>
          {err && <p className="err">{err}</p>}
          <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy || !name.trim()} onClick={saveName}>{busy ? "One sec…" : "Continue"}</button>
        </>}

        {step === "pw" && <>
          <div className="stack">
            <label className="field"><span className="k">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
            <label className="field"><span className="k">Password</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && password()} /></label>
          </div>
          {err && <p className="err">{err}</p>}
          {note && <p className="t15 em">{note}</p>}
          <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy} onClick={password}>{busy ? "One sec…" : "Sign in"}</button>
          <div className="auth-switch">Forgot it? <button className="link" onClick={() => { setStep("start"); setErr(""); }}>Get a code instead</button></div>
        </>}
      </div>
    </Screen>
  );
}

const appleMark = (
  <svg width="18" height="20" viewBox="0 0 17 20" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.6 4.8 2 5.8 1 7.4c-1.9 3.3-.5 8.1 1.4 10.8.9 1.3 2 2.8 3.4 2.7 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.8c1.5 0 2.4-1.3 3.3-2.6 1-1.5 1.5-3 1.5-3-.1-.1-2.6-1-2.5-4.6zM11.5 3c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.2 1.2.1 2.3-.6 3-1.5z"/></svg>
);

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
