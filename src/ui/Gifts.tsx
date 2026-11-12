import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { api, rpc } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money } from "../lib/format";
import { shareLink } from "../lib/share";
import { Icon, Loading, SearchPicker, useToast } from "./kit";
import { ActionBar } from "./Completion";
import { AuthScreen } from "./Auth";
import { stripeFor } from "../customer/Cards";
import { BankDetails, dayLong, usePayments, type PayDetails } from "./Payments";

/* Mahi Man gift cards: buy help for someone else. The gift lands in their wallet and pays the worker and the fee. */

const AMOUNTS = [5000, 10000, 20000];
const OCCASIONS = ["Christmas", "Birthday", "Thank you", "Mother's Day", "Father's Day", "New home", "Get well", "Just because"];
const back = (to: string) => () => (history.length > 1 ? history.back() : go(to));
const TZ = "Australia/Brisbane";
const todayIso = () => new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const noon = (iso: string) => `${iso}T02:00:00Z`; // midday in Brisbane
const showMobile = (m: string) => m.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");

export function GiftCard({ amount, to, msg, from }: { amount: number; to: string; msg: string; from: string }) {
  return (
    <div className="gf-card">
      <span className="gf-brand"><img src="/mahi-head.png" alt="" />Mahi Man</span>
      <span className="gf-amt">{money(amount)}</span>
      <span className="gf-to">For {to || "…"}</span>
      {msg && <span className="gf-msg">{msg}</span>}
      <span className="gf-from">From {from || "…"}</span>
      <img className="gf-mascot" src="/mascot.png" alt="" />
    </div>
  );
}

function Page({ title, children, onBack }: { title: string; children: ReactNode; onBack: () => void }) {
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <div className="screen-head brand"><button className="back" onClick={onBack} aria-label="Back">{Icon.back("#fff")}</button><h3>{title}</h3></div>
      {children}
    </div>
  );
}

/* ---------- Give help: buy a gift card ---------- */
export function GiveHelpPage() {
  const { session, profile } = useSession();
  const toast = useToast();
  const { p } = usePayments(!!session);
  const today = todayIso();
  const xmas = `${today.slice(0, 4)}-12-25`;
  const [amount, setAmount] = useState(10000);
  const [occasion, setOccasion] = useState(today.slice(5, 7) === "11" || today.slice(5, 7) === "12" ? "Christmas" : "Just because");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [sendBy, setSendBy] = useState<"text" | "email">("text");
  const [dest, setDest] = useState("");
  const [msg, setMsg] = useState("");
  const [sendOn, setSendOn] = useState(today);
  const [via, setVia] = useState<"card" | "bank" | null>(null);
  const [pick, setPick] = useState<"amount" | "occasion" | "by" | "on" | "via" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (profile?.full_name && !from) setFrom(profile.full_name.split(" ")[0]); }, [profile?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return <div className="app"><AuthScreen title="Give help" reason="Sign in to buy a Mahi Man gift card." onBack={back("/")} onDone={() => {}} /></div>;

  const canCard = !!p?.card_live && !!p?.card;
  const how = via ?? (canCard ? "card" : "bank");
  // Send dates: as soon as it's paid, Christmas Eve and morning when they're coming up, then the next 60 days.
  const dates: { id: string; label: string }[] = [{ id: today, label: "As soon as it's paid" }];
  if (xmas > today) dates.push({ id: addDays(xmas, -1), label: `Christmas Eve, ${dayLong(noon(addDays(xmas, -1)))}` }, { id: xmas, label: `Christmas morning, ${dayLong(noon(xmas))}` });
  for (let i = 1; i <= 60; i++) { const d = addDays(today, i); if (!dates.some((x) => x.id === d)) dates.push({ id: d, label: dayLong(noon(d)) }); }
  const onLabel = dates.find((d) => d.id === sendOn)?.label ?? dayLong(noon(sendOn));

  const buy = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await rpc<{ id: number }>("gift_buy", { p_amount: amount, p_occasion: occasion, p_to: to, p_from: from, p_message: msg,
        p_send_by: sendBy, p_send_to: dest, p_send_on: sendOn, p_via: how });
      if (how === "card") {
        const c = await api<{ done?: boolean; action?: string; client_secret?: string; publishable_key?: string }>("gift_card", { gift_id: r.id });
        if (c.action === "authenticate" && c.client_secret && c.publishable_key) {
          const stripe = await stripeFor(c.publishable_key);
          const res = await stripe?.confirmCardPayment(c.client_secret);
          if (!res || res.error || !res.paymentIntent) throw new Error(res?.error?.message ?? "Your bank didn't approve it. Try again.");
          await api("gift_card_done", { gift_id: r.id, payment_intent_id: res.paymentIntent.id });
        }
        toast("Paid. Thank you!");
      }
      go(`/gifts/${r.id}`, true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <Page title="Give help" onBack={back("/settings")}>
      <div style={{ padding: "16px 16px 4px" }}><GiftCard amount={amount} to={to} msg={msg} from={from} /></div>
      <div className="gf-grid">
        <button className="field gf-f" onClick={() => setPick("amount")}><span className="k">Amount</span><span className="row between gf-v"><span className="v">{money(amount)}</span>{Icon.chevron("var(--muted)")}</span></button>
        <button className="field gf-f" onClick={() => setPick("occasion")}><span className="k">Occasion</span><span className="row between gf-v"><span className="v">{occasion}</span>{Icon.chevron("var(--muted)")}</span></button>
        <label className="field gf-f"><span className="k">To</span><input value={to} maxLength={40} placeholder="Their name" onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field gf-f"><span className="k">From</span><input value={from} maxLength={40} placeholder="Your name" onChange={(e) => setFrom(e.target.value)} /></label>
        <button className="field gf-f" onClick={() => setPick("by")}><span className="k">Send by</span><span className="row between gf-v"><span className="v">{sendBy === "text" ? "Text" : "Email"}</span>{Icon.chevron("var(--muted)")}</span></button>
        <label className="field gf-f"><span className="k">{sendBy === "text" ? "Their mobile" : "Their email"}</span>
          <input value={dest} inputMode={sendBy === "text" ? "tel" : "email"} type={sendBy === "text" ? "tel" : "email"} autoComplete="off"
            placeholder={sendBy === "text" ? "04…" : "name@…"} onChange={(e) => setDest(e.target.value)} /></label>
        <label className="field gf-f" style={{ gridColumn: "1 / -1" }}><span className="k">Message</span>
          <textarea value={msg} maxLength={200} rows={2} placeholder="Merry Christmas. Get those gutters done!" onChange={(e) => setMsg(e.target.value)} /></label>
        <button className="field gf-f" style={{ gridColumn: "1 / -1" }} onClick={() => setPick("on")}><span className="k">Send on</span><span className="row between gf-v"><span className="v">{onLabel}</span>{Icon.chevron("var(--muted)")}</span></button>
        <button className="field gf-f" style={{ gridColumn: "1 / -1" }} onClick={() => setPick("via")}><span className="k">Pay with</span><span className="row between gf-v"><span className="v">{how === "card" ? p?.card : "Bank transfer"}</span>{Icon.chevron("var(--muted)")}</span></button>
      </div>
      <div className="cp-sec" style={{ paddingTop: 4 }}>
        <span className="t14 light muted">{sendBy === "text" ? "You text it from your own phone, and we remind you on the day. " : "We email it on the day. "}Pays for any job on Mahi Man, the worker and the fee. Lasts 3 years.</span>
        {err && <p className="err" style={{ margin: "8px 0 0" }}>{err}</p>}
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar><button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={buy}>{busy ? "Working…" : `Pay ${money(amount)}`}</button></ActionBar>
      {pick === "amount" && <SearchPicker title="Amount" options={AMOUNTS.map((a) => ({ id: a, label: money(a) }))} value={[amount]} onClose={() => setPick(null)} onChange={(v) => setAmount(Number(v[0]))} />}
      {pick === "occasion" && <SearchPicker title="Occasion" options={OCCASIONS.map((o) => ({ id: o, label: o }))} value={[occasion]} onClose={() => setPick(null)} onChange={(v) => setOccasion(String(v[0]))} />}
      {pick === "by" && <SearchPicker title="Send by" options={[{ id: "text", label: "Text", hint: "From your own phone, with a reminder on the day" }, { id: "email", label: "Email", hint: "We email it on the day" }]}
        value={[sendBy]} onClose={() => setPick(null)} onChange={(v) => { setSendBy(v[0] as "text" | "email"); setDest(""); }} />}
      {pick === "on" && <SearchPicker title="Send on" options={dates} value={[sendOn]} onClose={() => setPick(null)} onChange={(v) => setSendOn(String(v[0]))} />}
      {pick === "via" && <SearchPicker title="Pay with" options={[...(p?.card_live ? [{ id: "card", label: p.card ?? "Add a card first", disabled: !p.card }] : []),
        { id: "bank", label: "Bank transfer", hint: "PayID or BSB and account. It sends once the money arrives." }]} value={[how]} onClose={() => setPick(null)} onChange={(v) => setVia(v[0] as "card" | "bank")} />}
    </Page>
  );
}

/* ---------- One gift you've bought ---------- */
interface GiftDetail { id: number; reference: string; code: string; link: string; amount: number; occasion: string; to: string; from: string; message: string;
  send_by: "text" | "email"; send_to: string; send_on: string; via: string; status: string; paid_at: string | null; sent_at: string | null;
  expires_at: string | null; redeemed: boolean; redeemed_at: string | null; pay: PayDetails }

export function GiftPage({ id }: { id: number }) {
  const toast = useToast();
  const [g, setG] = useState<GiftDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => rpc<GiftDetail | null>("gift_detail", { p_id: id }).then(setG).catch(() => {}), [id]);
  useEffect(() => { load(); }, [load]);
  if (!g) return <Page title="Gift card" onBack={back("/payments")}><Loading /></Page>;
  const due = g.send_on <= todayIso();
  const text = `${g.message ? `${g.message} ` : ""}I've sent you ${money(g.amount)} of help on Mahi Man for any job around the house. Open this to add it to your wallet:`;
  const sendText = async () => {
    if (Capacitor.isNativePlatform() || /iPhone|Android/i.test(navigator.userAgent)) {
      // Opens Messages with their number, the message and the link filled in.
      location.href = `sms:${g.send_to}${/iPhone|iPad/i.test(navigator.userAgent) || Capacitor.getPlatform() === "ios" ? "&" : "?"}body=${encodeURIComponent(`${text} ${g.link}`)}`;
    } else {
      const r = await shareLink(text, g.link); if (r === "copied") toast("Copied. Paste it into a text to them.");
    }
    rpc("gift_mark_sent", { p_id: g.id }).then(load).catch(() => {});
  };
  const act = (fn: () => Promise<unknown>, ok: string) => async () => {
    setBusy(true); try { await fn(); toast(ok); await load(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  let status: ReactNode;
  if (g.status === "requested") status = <><span className="cp-title" style={{ margin: 0 }}>Pay {money(g.amount)} by bank transfer</span><BankDetails pay={g.pay} reference={g.reference} />
    <span className="t14 light muted">It sends once the money arrives, usually within a day.</span></>;
  else if (g.status === "claimed") status = <><span className="cp-title" style={{ margin: 0 }}>We're checking for your transfer</span><span className="t15 light">{`It sends once the money arrives, usually within a day. Reference ${g.reference}.`}</span></>;
  else if (g.redeemed) status = <><span className="cp-title" style={{ margin: 0 }}>{`${g.to} has it`}</span><span className="t15 light">{`Added to their Mahi Man wallet${g.redeemed_at ? ` on ${dayLong(g.redeemed_at)}` : ""}.`}</span></>;
  else if (g.send_by === "email") status = <><span className="cp-title" style={{ margin: 0 }}>{g.sent_at ? "Emailed" : `Sends ${dayLong(noon(g.send_on))}`}</span>
    <span className="t15 light">{g.sent_at ? `We emailed it to ${g.send_to} on ${dayLong(g.sent_at)}. It goes into their wallet when they sign up with that email.` : `We email it to ${g.send_to} that morning.`}</span></>;
  else status = <><span className="cp-title" style={{ margin: 0 }}>{due ? `Text it to ${g.to}` : `Text it on ${dayLong(noon(g.send_on))}`}</span>
    <span className="t15 light">{due ? `Send it from your phone to ${showMobile(g.send_to)}. They tap the link to add it to their wallet.` : `We'll remind you that morning. You can send it early too.`}</span></>;

  return (
    <Page title="Gift card" onBack={back("/payments")}>
      <div style={{ padding: "16px 16px 4px" }}><GiftCard amount={g.amount} to={g.to} msg={g.message} from={g.from} /></div>
      <div className="iv-pay">{status}</div>
      {g.status === "paid" && <div className="cp-sec"><span className="t14 light muted">{`Gift code ${g.code}${g.expires_at ? ` · lasts until ${new Date(g.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })}` : ""}`}</span></div>}
      <div style={{ flex: 1 }} />
      {g.status === "requested" && (
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} disabled={busy} onClick={act(() => rpc("gift_cancel", { p_id: g.id }), "Gift card cancelled")}>Cancel it</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={act(() => rpc("gift_claim_paid", { p_id: g.id }), "Thanks. It sends once it arrives.")}>I've paid</button>
        </ActionBar>
      )}
      {g.status === "paid" && !g.redeemed && g.send_by === "text" && (
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={async () => { const r = await shareLink(text, g.link); if (r === "copied") toast("Link copied"); }}>Share another way</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={sendText}>Text it to {g.to}</button>
        </ActionBar>
      )}
    </Page>
  );
}

/* ---------- The gift link: mahiman.vercel.app/g/MAHI-XXXX-XXXX ---------- */
interface GiftPublic { to: string; from: string; amount: number; message: string; occasion: string; expires_at: string | null; state: "ready" | "added" | "expired" | "unpaid" }

export function ClaimPage({ code }: { code: string }) {
  const { session } = useSession();
  const toast = useToast();
  const [g, setG] = useState<GiftPublic | null | undefined>(undefined);
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc<GiftPublic | null>("gift_public", { p_code: code }).then(setG).catch(() => setG(null)); }, [code]);
  const native = Capacitor.isNativePlatform();
  const redeem = async () => {
    setBusy(true);
    try { const r = await rpc<{ amount: number }>("gift_redeem", { p_code: code }); toast(`${money(r.amount)} added to your wallet`); go("/payments", true); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  if (g === undefined) return <div className="app"><Loading /></div>;
  if (g === null) return (
    <Page title="Gift card" onBack={() => go("/", true)}>
      <div className="cp-sec"><span className="cp-title">We can't find that gift card</span><span className="t15 light">Check the link, or add the code in Settings, Payments.</span></div>
      <div style={{ flex: 1 }} /><ActionBar><button className="btn primary" style={{ flex: 1 }} onClick={() => go("/gift-code", true)}>Enter a gift code</button></ActionBar>
    </Page>
  );
  const ready = g.state === "ready";
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <section className="hero gf-hero">
        <span className="gf-hero-k">{g.from} sent you</span>
        <span className="big lime" style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2, lineHeight: 1 }}>{money(g.amount)}</span>
        <span className="gf-hero-t">of help, for any job around the house.</span>
        {g.message && <span className="gf-quote">"{g.message}"</span>}
        <img className="gf-hero-mascot" src="/mascot.png" alt="" />
      </section>
      {ready ? (
        <div className="cp-sec" style={{ gap: 0 }}>
          <span className="cp-title">Use it in 3 steps</span>
          {[["Get Mahi Man", "Free on iPhone and Android."],
            [session ? "Add it to your wallet" : "Sign up, then tap this link again", `The ${money(g.amount)} goes straight into your wallet.`],
            ["Post a job", "Gutters, lawns, moving, anything. Your gift pays the worker when it's done."]].map(([b, t], i) => (
            <div key={b} className="gf-step"><span className="gf-n">{i + 1}</span><span className="stack" style={{ gap: 2 }}><span className="w5 t17">{b}</span><span className="t15 light muted">{t}</span></span></div>
          ))}
        </div>
      ) : (
        <div className="cp-sec"><span className="cp-title">{g.state === "added" ? "This gift is in a Mahi Man wallet" : g.state === "expired" ? "This gift card has expired" : "This gift card isn't paid for yet"}</span>
          <span className="t15 light">{g.state === "added" ? "If that's you, it's in Settings, Payments." : g.state === "expired" ? "Gift cards last 3 years." : `Once ${g.from} has paid, this link will work.`}</span></div>
      )}
      <div className="cp-sec"><span className="t14 light muted">{`Gift code ${code.toUpperCase()}${g.expires_at ? ` · lasts until ${new Date(g.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })}` : ""}`}</span></div>
      <div style={{ flex: 1 }} />
      {ready && (
        <ActionBar>
          {session ? <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={redeem}>{busy ? "Adding…" : "Add to my wallet"}</button>
            : native ? <button className="btn primary" style={{ flex: 1 }} onClick={() => setAuth(true)}>Sign up to use it</button>
            : <button className="btn primary" style={{ flex: 1 }} onClick={() => go("/get")}>Get Mahi Man</button>}
        </ActionBar>
      )}
      {auth && <AuthScreen title="Your gift" reason={`Sign up or sign in to add ${money(g.amount)} to your wallet.`} onBack={() => setAuth(false)} onDone={() => { setAuth(false); redeem(); }} />}
    </div>
  );
}

/* ---------- Add a gift code ---------- */
export function AddCodePage() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async () => {
    setBusy(true); setErr("");
    try { const r = await rpc<{ amount: number; from: string }>("gift_redeem", { p_code: code }); toast(`${money(r.amount)} from ${r.from} added`); go("/payments", true); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <Page title="Add a gift code" onBack={back("/payments")}>
      <div className="cp-sec" style={{ gap: 10 }}>
        <label className="field"><span className="k">Gift code</span>
          <input value={code} autoCapitalize="characters" autoComplete="off" placeholder="MAHI-XXXX-XXXX" onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <span className="t14 light muted">It's in the text or email the gift came in.</span>
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      <div style={{ flex: 1 }} />
      <ActionBar><button className="btn primary" style={{ flex: 1 }} disabled={busy || code.replace(/[^A-Z0-9]/g, "").length < 12} onClick={add}>{busy ? "Adding…" : "Add to my wallet"}</button></ActionBar>
    </Page>
  );
}
