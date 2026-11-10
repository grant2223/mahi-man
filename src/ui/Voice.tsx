import { useEffect, useRef, useState } from "react";
import { api } from "../lib/supabase";
import { Icon, Screen } from "./kit";

// Minimal typing for the browser speech API (Safari and Chrome call it webkitSpeechRecognition).
interface SpeechResultEvent { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
}
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupported = () => !!recognizerCtor();

// Full-bleed "Just say it" screen: the customer talks, we turn it into a written job description they can edit.
export function VoiceScreen({ jobName, onDone, onBack, raw = false }: { jobName: string; onDone: (text: string) => void; onBack: () => void; raw?: boolean }) {
  const [heard, setHeard] = useState("");
  const [live, setLive] = useState("");
  const [state, setState] = useState<"listening" | "writing" | "error">("listening");
  const [err, setErr] = useState("");
  const rec = useRef<Recognizer | null>(null);
  const finalText = useRef("");

  useEffect(() => {
    const Ctor = recognizerCtor();
    if (!Ctor) { setState("error"); setErr("Voice isn't available in this browser. Tap the box and use the microphone on your keyboard instead."); return; }
    const r = new Ctor();
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setHeard(finalText.current);
      setLive(interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setState("error");
        setErr("Allow the microphone for Mahi Man, or tap the box and use the microphone on your keyboard.");
      }
    };
    rec.current = r;
    try { r.start(); } catch { /* already started */ }
    return () => { r.onend = null; try { r.stop(); } catch { /* ignore */ } };
  }, []);

  async function finish() {
    const text = (finalText.current + live).trim();
    try { rec.current?.stop(); } catch { /* ignore */ }
    if (!text) { setErr("We didn't catch anything. Tap the microphone and try again."); return; }
    if (raw) { onDone(text); return; }
    setState("writing");
    try {
      const out = await api<{ text: string }>("tidy_text", { text, job_name: jobName });
      onDone(out.text);
    } catch {
      onDone(text);
    }
  }

  const shown = (heard + live).trim();
  return (
    <Screen title="Just say it" onBack={onBack}>
      <div className="listening">
        <p className="t15 muted light" style={{ margin: 0 }}>
          Say what needs doing, where the worst of it is, and anything they should know. We write it up for you to check.
        </p>
        <div className={shown ? "live" : "live ph"}>{shown || (state === "listening" ? "Listening…" : "")}</div>
        {err && <p className="err">{err}</p>}
        {state === "listening" && (
          <>
            <button className="pulse" onClick={finish} aria-label="Done talking">{Icon.mic("#fff", 40)}</button>
            <p className="t15 muted" style={{ textAlign: "center", margin: 0 }}>Tap when you're done</p>
          </>
        )}
        {state === "writing" && <p className="t17 em" style={{ textAlign: "center" }}>Writing it up…</p>}
        {state === "error" && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={onBack}>Type it instead</button>
          </div>
        )}
      </div>
    </Screen>
  );
}
