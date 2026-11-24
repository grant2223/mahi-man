import { useEffect } from "react";
import { rpc } from "../lib/supabase";
import { money } from "../lib/format";
import { Icon } from "./kit";

/* The two upsells, once a month each, from upsell_status() (every number is a setting Admin edits).
   Customers: on posting their 2nd job in a month, what they've paid in booking fees, and Plus.
   Workers and businesses: once this month's jobs pass the Premium line, what they've paid in fees, and Premium. */

export interface UpsellStatus {
  month: string; jobs_month: number; fees_month_cents: number; plus: boolean; plus_cents: number; plus_jobs: number;
  work_month_cents: number; work_fees_month_cents: number; premium: boolean; premium_cents: number; premium_after_cents: number;
  owing_cents: number; block_cents: number;
}
export const upsellStatus = () => rpc<UpsellStatus>("upsell_status");

const KEY = (k: "plus" | "premium") => `mm-upsell-${k}`;
const seen = (k: "plus" | "premium", month: string) => { try { return localStorage.getItem(KEY(k)) === month; } catch { return false; } };
export const markSeen = (k: "plus" | "premium", month: string) => { try { localStorage.setItem(KEY(k), month); } catch { /* private mode */ } };

// Customer: this post is their 2nd (or later) job this month, they've paid fees, and they're not on Plus.
export const wantsPlusUpsell = (s: UpsellStatus | null) =>
  !!s && !s.plus && s.jobs_month + 1 >= s.plus_jobs && s.fees_month_cents > 0 && !seen("plus", s.month);
// Worker: this month's jobs have passed the line and they're not on Premium.
export const wantsPremiumUpsell = (s: UpsellStatus | null) =>
  !!s && !s.premium && s.work_month_cents > s.premium_after_cents && s.work_fees_month_cents > 0 && !seen("premium", s.month);

export function UpsellScreen({ kind, s, onSelect, onLater }: { kind: "plus" | "premium"; s: UpsellStatus; onSelect: () => void; onLater: () => void }) {
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  const plus = kind === "plus";
  const paid = plus ? s.fees_month_cents : s.work_fees_month_cents;
  return (
    <div className="app pq up" role="dialog" aria-label={plus ? "Mahi Man Plus" : "Mahi Man Premium"}>
      <div className="pq-card up-card" style={{ marginTop: 24 }}>
        <img src="/mascot.png" alt="" /><i className="pq-sheen" />
        <span className="pq-brand">MAHI MAN</span><span className="pq-word">{plus ? "Plus" : "Premium"}</span>
        <span className="pq-since">{money(plus ? s.plus_cents : s.premium_cents)} a month</span>
      </div>
      <p className="up-line">
        {plus
          ? <>You've paid {money(paid)} in booking fees this month. Plus is {money(s.plus_cents)} a month with no fees.</>
          : <>You've paid {money(paid)} in fees this month. Premium is {money(s.premium_cents)} a month and you keep 100%.</>}
      </p>
      <div className="up-btns">
        <button className="btn stone" onClick={() => { markSeen(kind, s.month); onLater(); }}>{Icon.x("currentColor", 18)}Not now</button>
        <button className="pq-gold" onClick={() => { markSeen(kind, s.month); onSelect(); }}><span>{Icon.tick("#1c1400", 20)}Select</span></button>
      </div>
    </div>
  );
}
