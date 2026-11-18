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
import { BankPay, PaidThanks, dayLong, usePayments, type PayDetails } from "./Payments";

/* Mahi Man gift cards: buy help for someone else. The gift lands in their wallet and pays the worker and the fee. */

const AMOUNTS = [5000, 10000, 20000];
const ROW_IC = {
  gift: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b6b4f" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="1" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z" /></svg>,
  day: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b6b4f" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  card: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b6b4f" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="1" /><path d="M3 10h18M7 15h4" /></svg>,
};
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
      <span className="gf-brand"><b>Mahi Man</b><small>Gift card</small></span>
      <span className="gf-amt">{money(amount)}</span>
      {msg && <span className="gf-msg">{msg}</span>}
      <span className="gf-names">
        <span><small>To</small><b className={to ? "" : "ph"}>{to || "Their name"}</b></span>
        <span><small>From</small><b className={from ? "" : "ph"}>{from || "Your name"}</b></span>
      </span>
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
const GIFT_DRAFT = "mm-gift-draft";
type GiftDraft = { amount: number; occasion: string; to: string; from: string; sendBy: "text" | "email"; dest: string; msg: string; sendOn: string };

export function GiveHelpPage() {
  const { session, profile } = useSession();
  const toast = useToast();
  const { p } = usePayments(!!session);
  const today = todayIso();
  const xmas = `${today.slice(0, 4)}-12-25`;
  // What they've typed is kept for this visit, so leaving the page (or Android's back button) doesn't lose it.
  const draft = (() => { try { return JSON.parse(sessionStorage.getItem(GIFT_DRAFT) ?? "null") as Partial<GiftDraft> | null; } catch { return null; } })();
  const [amount, setAmount] = useState(draft?.amount ?? 10000);
  const [occasion, setOccasion] = useState(draft?.occasion ?? (today.slice(5, 7) === "11" || today.slice(5, 7) === "12" ? "Christmas" : "Just because"));
  const [to, setTo] = useState(draft?.to ?? "");
  const [from, setFrom] = useState(draft?.from ?? "");
  const [sendBy, setSendBy] = useState<"text" | "email">(draft?.sendBy ?? "text");
  const [dest, setDest] = useState(draft?.dest ?? "");
  const [msg, setMsg] = useState(draft?.msg ?? "");
  const [sendOn, setSendOn] = useState(draft?.sendOn && draft.sendOn >= today ? draft.sendOn : today);
  useEffect(() => {
    try { sessionStorage.setItem(GIFT_DRAFT, JSON.stringify({ amount, occasion, to, from, sendBy, dest, msg, sendOn } satisfies GiftDraft)); } catch { /* private mode */ }
  }, [amount, occasion, to, from, sendBy, dest, msg, sendOn]);
  const [via, setVia] = useState<"card" | "bank" | null>(null);
  const [pick, setPick] = useState<"amount" | "occasion" | "by" | "on" | "via" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (profile?.full_name && !from) setFrom(profile.full_name.split(" ")[0]); }, [profile?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 240);
    window.addEventListener("scroll", on, { passive: true }); on();
    return () => window.removeEventListener("scroll", on);
  }, []);

  if (!session) return <div className="app"><AuthScreen title="Buy a gift card" reason="Sign in to buy a Mahi Man gift card." onBack={back("/")} onDone={() => {}} /></div>;

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
        p_send_by: sendBy, p_send_to: sendBy === "text" ? `+61${dest.replace(/\D/g, "").replace(/^0/, "")}` : dest, p_send_on: sendOn, p_via: how });
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
      try { sessionStorage.removeItem(GIFT_DRAFT); } catch { /* private mode */ }
      go(`/gifts/${r.id}`, true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const ai = Math.max(0, AMOUNTS.indexOf(amount));
  const pct = AMOUNTS.length > 1 ? (ai / (AMOUNTS.length - 1)) * 100 : 0;
  const chev = Icon.chevron("var(--faint)");

  return (
    <div className="app gf2">
      {/* Once the hero scrolls away, a plain bar keeps the way back and the title clear of the status bar. */}
      <div className={scrolled ? "gf2-top on" : "gf2-top"} aria-hidden={!scrolled}>
        <button className="back" onClick={back("/settings")} aria-label="Back">{Icon.back("var(--ink)")}</button><b>Buy a gift card</b>
      </div>
      <section className="gf2-hero">
        <button className="back gf2-back" onClick={back("/settings")} aria-label="Back">{Icon.back("#fff")}</button>
        <h1>Buy a gift card</h1>
        <div className="gf2-card"><GiftCard amount={amount} to={to} msg={msg} from={from} /></div>
      </section>

      <div className="gf2-body">
        <section>
          <p className="gf2-h">How much</p>
          <div className="gf2-rng">
            <i className="gf2-track" /><i className="gf2-fill" style={{ width: `${pct}%` }} /><i className="gf2-knob" style={{ left: `${pct}%` }} />
            <input type="range" min={0} max={AMOUNTS.length - 1} step={1} value={ai} aria-label="How much" onChange={(e) => setAmount(AMOUNTS[Number(e.target.value)])} />
          </div>
          <div className="gf2-stops">{AMOUNTS.map((a) => <button key={a} className={a === amount ? "on" : ""} onClick={() => setAmount(a)}>{money(a)}</button>)}</div>
        </section>

        <section>
          <p className="gf2-h">The note</p>
          <div className="gf2-note">
            <label className="gf2-tf"><span>To</span><input value={to} maxLength={40} placeholder="Their name" onChange={(e) => setTo(e.target.value)} /></label>
            <label className="gf2-tf"><span>From</span><input value={from} maxLength={40} placeholder="Your name" onChange={(e) => setFrom(e.target.value)} /></label>
            <textarea className="gf2-msg" value={msg} maxLength={200} rows={2} placeholder="Merry Christmas. Get those gutters done!" onChange={(e) => setMsg(e.target.value)} />
          </div>
        </section>

        <section>
          <p className="gf2-h">{sendBy === "text" ? "Their mobile" : "Their email"}</p>
          {sendBy === "text" ? (
            <label className="gf2-ph"><span className="cc">🇦🇺 +61</span>
              <input value={dest} inputMode="tel" type="tel" autoComplete="off" placeholder="412 345 678" onChange={(e) => setDest(e.target.value)} /></label>
          ) : (
            <label className="gf2-ph"><input value={dest} inputMode="email" type="email" autoComplete="off" placeholder="name@example.com" onChange={(e) => setDest(e.target.value)} /></label>
          )}
          <button className="gf2-alt" onClick={() => { setSendBy(sendBy === "text" ? "email" : "text"); setDest(""); }}>{sendBy === "text" ? "Email it instead" : "Text it instead"}</button>
        </section>

        <section className="gf2-rows">
          <button onClick={() => setPick("occasion")}>{ROW_IC.gift}<span className="k">Occasion</span><span className="v">{occasion}</span>{chev}</button>
          <button onClick={() => setPick("on")}>{ROW_IC.day}<span className="k">Send on</span><span className="v">{onLabel}</span>{chev}</button>
          <button onClick={() => setPick("via")}>{ROW_IC.card}<span className="k">Pay with</span><span className="v">{how === "card" ? p?.card : "Bank transfer"}</span>{chev}</button>
        </section>
        <p className="gf2-fine">Pays for any job on Mahi Man. Lasts 3 years.</p>
        {err && <p className="err" style={{ margin: "-18px 0 0" }}>{err}</p>}
      </div>

      <div className="gf2-bar"><button className="gf2-pay" disabled={busy} onClick={buy}>{busy ? "Working…" : `Pay ${money(amount)}`}</button></div>
      {pick === "amount" && <SearchPicker title="Amount" options={AMOUNTS.map((a) => ({ id: a, label: money(a) }))} value={[amount]} onClose={() => setPick(null)} onChange={(v) => setAmount(Number(v[0]))} />}
      {pick === "occasion" && <SearchPicker title="Occasion" options={OCCASIONS.map((o) => ({ id: o, label: o }))} value={[occasion]} onClose={() => setPick(null)} onChange={(v) => setOccasion(String(v[0]))} />}
      {pick === "on" && <SearchPicker title="Send on" options={dates} value={[sendOn]} onClose={() => setPick(null)} onChange={(v) => setSendOn(String(v[0]))} />}
      {pick === "via" && <SearchPicker title="Pay with" options={[...(p?.card_live ? [{ id: "card", label: p.card ?? "Add a card first", disabled: !p.card }] : []),
        { id: "bank", label: "Bank transfer", hint: "It sends once your payment is confirmed" }]} value={[how]} onClose={() => setPick(null)} onChange={(v) => setVia(v[0] as "card" | "bank")} />}
    </div>
  );
}

/* ---------- One gift you've bought ---------- */
interface GiftDetail { id: number; reference: string; code: string; link: string; amount: number; occasion: string; to: string; from: string; message: string;
  send_by: "text" | "email"; send_to: string; send_on: string; via: string; status: string; paid_at: string | null; sent_at: string | null;
  expires_at: string | null; redeemed: boolean; redeemed_at: string | null; pay: PayDetails }

export function GiftPage({ id }: { id: number }) {
  const toast = useToast();
  const { profile } = useSession();
  const [thanks, setThanks] = useState(false);
  const [g, setG] = useState<GiftDetail | null>(null);
  const load = useCallback(() => rpc<GiftDetail | null>("gift_detail", { p_id: id }).then(setG).catch(() => {}), [id]);
  useEffect(() => { load(); }, [load]);
  if (!g) return <Page title="Gift card" onBack={back("/payments")}><Loading /></Page>;
  if (thanks) return (
    <div className="app pq">
      <button className="back pq-back" onClick={() => setThanks(false)} aria-label="Back">{Icon.back("#fff")}</button>
      <PaidThanks first={profile?.full_name?.split(" ")[0]} amount={g.amount} reference={g.reference} what={`Gift card for ${g.to}`} last={g.send_by === "text" ? `Ready for you to text to ${g.to}` : `Emailed to ${g.to} ${g.send_on <= todayIso() ? "straight away" : `on ${dayLong(g.send_on + "T12:00:00")}`}`} />
      <div className="pq-foot"><button className="pq-gold" onClick={() => setThanks(false)}><span>Done</span></button></div>
    </div>
  );
  // Paying for it: the same trusted bank transfer screen as everything else.
  if (g.status === "requested") return (
    <div className="app pq">
      <button className="back pq-back" onClick={back("/payments")} aria-label="Back">{Icon.back("#fff")}</button>
      <BankPay title="Mahi Man gift card" sub={`For ${g.to}, ${g.reference}`} amount={g.amount} pay={g.pay} reference={g.reference}
        note="It sends once your payment is confirmed, within 24 hours and usually faster."
        onConfirm={async (proof) => { await rpc("gift_claim_paid", { p_id: g.id, p_proof: proof }); setThanks(true); await load(); }}
        onCancel={async () => { try { await rpc("gift_cancel", { p_id: g.id }); toast("Gift card cancelled"); go("/payments", true); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } }} />
    </div>
  );
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

  let status: ReactNode;
  if (g.status === "claimed") status = <><span className="cp-title" style={{ margin: 0 }}>We're checking for your transfer</span><span className="t15 light">{`It sends once the money arrives, usually within a day. Reference ${g.reference}.`}</span></>;
  else if (g.redeemed) status = <><span className="cp-title" style={{ margin: 0 }}>{`${g.to} has it`}</span><span className="t15 light">{`Added to their Mahi Man wallet${g.redeemed_at ? ` on ${dayLong(g.redeemed_at)}` : ""}.`}</span></>;
  else if (g.send_by === "email") status = <><span className="cp-title" style={{ margin: 0 }}>{g.sent_at ? "Emailed" : `Sends ${dayLong(noon(g.send_on))}`}</span>
    <span className="t15 light">{g.sent_at ? `We emailed it to ${g.send_to} on ${dayLong(g.sent_at)}. It goes into their wallet when they sign up with that email.` : `We email it to ${g.send_to} that morning.`}</span></>;
  else status = <><span className="cp-title" style={{ margin: 0 }}>{due ? `Text it to ${g.to}` : `Text it on ${dayLong(noon(g.send_on))}`}</span>
    <span className="t15 light">{due ? `Send it from your phone to ${showMobile(g.send_to)}. They tap the link to add it to their wallet.` : `We'll remind you that morning. You can send it early too.`}</span></>;

  return (
    <Page title="Gift card" onBack={back("/payments")}>
      <div style={{ padding: "16px 16px 4px" }}><GiftCard amount={g.amount} to={g.to} msg={g.message} from={g.from} /></div>
      <div className="iv-pay">{status}</div>
      {g.status === "paid" && <div className="cp-sec"><span className="t14 light muted">{`Gift code ${g.code}${g.expires_at ? ` – lasts until ${new Date(g.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })}` : ""}`}</span></div>}
      <div style={{ flex: 1 }} />
      {g.status === "paid" && !g.redeemed && g.send_by === "text" && (
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={async () => { const r = await shareLink(text, g.link); if (r === "copied") toast("Link copied"); }}>Share another way</button>
          <button className="btn primary" style={{ flex: 1 }} onClick={sendText}>Text it to {g.to}</button>
        </ActionBar>
      )}
    </Page>
  );
}

/* ---------- The gift link: mahiman.app/g/MAHI-XXXX-XXXX ---------- */
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
      <div className="cp-sec"><span className="cp-title">We can't find that gift card</span><span className="t15 light">Check the link, or add the code in You, Payments.</span></div>
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
          <span className="t15 light">{g.state === "added" ? "If that's you, it's in You, Payments." : g.state === "expired" ? "Gift cards last 3 years." : `Once ${g.from} has paid, this link will work.`}</span></div>
      )}
      <div className="cp-sec"><span className="t14 light muted">{`Gift code ${code.toUpperCase()}${g.expires_at ? ` – lasts until ${new Date(g.expires_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })}` : ""}`}</span></div>
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
    <Page title="Redeem a gift card" onBack={back("/payments")}>
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
