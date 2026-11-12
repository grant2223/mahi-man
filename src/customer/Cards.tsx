import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { api } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Icon, Screen, useToast } from "../ui/kit";

/* Saved card for the booking fee. Card details go straight to Stripe; Mahi Man only keeps the brand and last 4 digits. */

const stripeCache: Record<string, Promise<Stripe | null>> = {};
export const stripeFor = (pk: string) => (stripeCache[pk] ??= loadStripe(pk));

export function CardMark({ brand }: { brand: string | null | undefined }) {
  const b = (brand ?? "card").toLowerCase();
  const label = b === "visa" ? "VISA" : b === "mastercard" ? "MC" : b === "amex" ? "AMEX" : "CARD";
  const bg = b === "visa" ? "#1a1f71" : b === "mastercard" ? "#252525" : b === "amex" ? "#2e77bb" : "#5c6360";
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="34" height="22" rx="3" fill={bg} />
      <text x="17" y="15" textAnchor="middle" fontSize={label.length > 3 ? 8 : 10} fontWeight="700" fill="#fff" fontFamily="Arial">{label}</text>
    </svg>
  );
}
export const brandName = (b: string | null | undefined) => ({ visa: "Visa", mastercard: "Mastercard", amex: "Amex" } as Record<string, string>)[(b ?? "").toLowerCase()] ?? "Card";
export const cardLabel = (p: { card_brand?: string | null; card_last4?: string | null } | null | undefined) =>
  p?.card_last4 ? `${brandName(p.card_brand)} ending ${p.card_last4}` : "";

export function AddCardScreen({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pk, setPk] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ client_secret: string; publishable_key: string }>("card_setup")
      .then((r) => { if (!r.publishable_key) throw new Error("Card payments are being switched on. Try again soon."); setPk(r.publishable_key); setSecret(r.client_secret); })
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <Screen title="Add a card" onBack={onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        {err && <p className="err">{err}</p>}
        {pk && secret && (
          <Elements stripe={stripeFor(pk)} options={{
            clientSecret: secret,
            appearance: { theme: "flat", variables: { colorPrimary: "#0b6b4f", colorBackground: "#efece6", borderRadius: "6px", fontSizeBase: "17px" } },
          }}>
            <CardForm onSaved={onSaved} />
          </Elements>
        )}
        {!secret && !err && <p className="muted">Loading secure card form…</p>}
      </div>
    </Screen>
  );
}

function CardForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { reload } = useSession();
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!stripe || !elements) return;
    setBusy(true); setErr("");
    const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: location.href } });
    if (error || !setupIntent) { setErr(error?.message ?? "That card didn't work. Try another."); setBusy(false); return; }
    try { await api("card_saved", { setup_intent_id: setupIntent.id, keep }); await reload(); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="stack" style={{ gap: 0 }}>
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      <button className="row" onClick={() => setKeep(!keep)} aria-pressed={keep}
        style={{ gap: 12, width: "100%", padding: "18px 2px", border: 0, background: "none", textAlign: "left", alignItems: "flex-start", cursor: "pointer" }}>
        <span style={{ width: 24, height: 24, borderRadius: 4, background: keep ? "var(--emerald)" : "var(--stone-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{keep && Icon.tick("#fff", 18)}</span>
        <span className="stack" style={{ gap: 2 }}><span className="t17">Save this card for next time</span><span className="small light muted">Remove it any time in Settings.</span></span>
      </button>
      <p className="small light muted" style={{ lineHeight: 1.5, margin: "0 0 16px" }}>
        By adding this card you allow Mahi Man to charge the top-ups you ask for, including automatic top-ups if you turn them on. Cards are handled by Stripe. Mahi Man never sees your full card number.
      </p>
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="row small muted" style={{ gap: 6 }}>{Icon.lockLine("var(--muted)")}Secured by Stripe</span>
        <button className="btn primary" disabled={!stripe || busy} onClick={save}>{busy ? "Saving…" : "Add card"}</button>
      </div>
    </div>
  );
}

export function PaymentMethods({ onBack }: { onBack: () => void }) {
  const { profile, reload } = useSession();
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = profile as (typeof profile & { card_brand?: string | null; card_last4?: string | null; card_exp?: string | null }) | null;
  return (
    <Screen title="Payment methods" onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)" }}>
        {p?.card_last4 ? (
          <div className="opt">
            <span className="row" style={{ gap: 12 }}><CardMark brand={p.card_brand} />
              <span className="stack" style={{ gap: 2 }}><b>{cardLabel(p)}</b><span className="small muted light">Expires {p.card_exp}. Used for top-ups</span></span></span>
            <button className="link quiet" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await api("card_remove"); await reload(); toast("Card removed"); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
            }}>Remove</button>
          </div>
        ) : <p className="t17 light" style={{ padding: "20px 16px 0", margin: 0 }}>No card saved.</p>}
        <div style={{ padding: 16 }}><button className="btn stone" onClick={() => setAdd(true)}>{Icon.plus("var(--ink)")} {p?.card_last4 ? "Use a different card" : "Add a card"}</button></div>
        <p className="t15 light muted" style={{ padding: "0 16px", margin: 0, lineHeight: 1.45 }}>Cards are stored by Stripe, not on Mahi Man.</p>
      </div>
      {add && <AddCardScreen onBack={() => setAdd(false)} onSaved={() => { setAdd(false); toast("Card saved"); }} />}
    </Screen>
  );
}
