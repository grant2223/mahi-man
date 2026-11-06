import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { api } from "../lib/supabase";
import { Icon, Screen } from "../ui/kit";

const stripeCache: Record<string, Promise<Stripe | null>> = {};

// Full-bleed card screen. Holds the money on the card; nothing is charged until the job is confirmed.
export function PayScreen(props: { jobId?: string; requestId?: string; amountLabel: string; title?: string; onBack: () => void; onPaid: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pk, setPk] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const action = props.requestId ? "pay_extra" : "pay_job";
    api<{ client_secret: string; publishable_key: string }>(action, props.requestId ? { request_id: props.requestId } : { job_id: props.jobId })
      .then((r) => {
        if (!r.publishable_key) throw new Error("Payments are being switched on. Try again in a few minutes.");
        setPk(r.publishable_key); setSecret(r.client_secret);
      })
      .catch((e) => setErr(e.message));
  }, [props.jobId, props.requestId]);

  if (pk && !stripeCache[pk]) stripeCache[pk] = loadStripe(pk);

  return (
    <Screen title={props.title ?? "Hold payment"} onBack={props.onBack}>
      <div className="screen-body" style={{ padding: 16 }}>
        <div className="row" style={{ gap: 14, alignItems: "flex-start", margin: "4px 4px 18px" }}>
          {Icon.lock("var(--ink)")}
          <span className="stack" style={{ gap: 3 }}>
            <span className="t17 w5">{props.amountLabel} held, not paid</span>
            <span className="small light muted" style={{ lineHeight: 1.45 }}>The worker is paid only after you confirm the job is done.</span>
          </span>
        </div>
        {err && <p className="err">{err}</p>}
        {secret && pk && (
          <Elements stripe={stripeCache[pk]} options={{
            clientSecret: secret,
            appearance: {
              theme: "flat",
              variables: { colorPrimary: "#0b6b4f", colorBackground: "#efede6", colorText: "#2a2d32", borderRadius: "4px", fontFamily: "Bricolage Grotesque, system-ui, sans-serif", fontSizeBase: "16px" },
            },
            fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500&display=swap" }],
          }}>
            <PayForm {...props} />
          </Elements>
        )}
        {!secret && !err && <p className="muted">Loading secure card form…</p>}
      </div>
    </Screen>
  );
}

function PayForm({ jobId, requestId, onPaid }: { jobId?: string; requestId?: string; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true); setErr("");
    const { error } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: location.href } });
    if (error) { setErr(error.message ?? "Card not approved. Try another card."); setBusy(false); return; }
    try {
      if (requestId) await api("extra_done", { request_id: requestId });
      else await api("payment_done", { job_id: jobId });
      onPaid();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ background: "var(--card)", padding: 16, borderRadius: 6 }}><PaymentElement options={{ layout: "tabs" }} /></div>
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={!stripe || busy} onClick={pay}>{busy ? "Holding…" : "Hold and book"} {Icon.arrow("#fff")}</button>
      </div>
    </div>
  );
}
