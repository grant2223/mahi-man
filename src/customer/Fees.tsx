import { useCallback, useEffect, useState } from "react";
import { rpc } from "../lib/supabase";
import { money } from "../lib/format";
import { Icon, Screen, useToast } from "../ui/kit";
import { ActionBar, Note, showPayid } from "../ui/Completion";

/* Cancellation fees a customer owes a worker. While payments are in the pilot, they're paid straight to the worker,
   the same way as the job. A new job can't be posted until it's paid, so the way to pay is always on the home screen. */

export interface OwedFee {
  id: number; job_id: string | null; job: string; amount_cents: number; kind: string; to: string;
  payid: string | null; bsb: string | null; account_number: string | null; account_name: string | null; created_at: string;
}

export function useOwed(enabled = true) {
  const [owed, setOwed] = useState<OwedFee[]>([]);
  const [credit, setCredit] = useState(0);
  const load = useCallback(() => {
    if (!enabled) return;
    rpc<{ owed: OwedFee[]; credit_cents: number }>("my_fees").then((r) => {
      setOwed((r?.owed ?? []).filter((f) => f.to !== "Mahi Man"));
      setCredit(Number(r?.credit_cents ?? 0));
    }).catch(() => {});
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  return { owed, credit, reload: load };
}

// The banner on the home screen: one line per fee, tap to pay.
export function OwedBanner({ owed, onPay }: { owed: OwedFee[]; onPay: (f: OwedFee) => void }) {
  if (!owed.length) return null;
  return (
    <>
      {owed.map((f) => (
        <button key={f.id} className="poster" style={{ background: "#fbf3e4" }} onClick={() => onPay(f)}>
          {Icon.card("#8a5a10")}
          <span className="t">
            <span className="t17 w5">Pay {f.to} {money(f.amount_cents)}</span>
            <span className="small light muted">{f.kind === "customer_no_show" ? `${f.to} couldn't get in` : "Late cancellation"}, {f.job}. Needed before your next job.</span>
          </span>
          {Icon.chevron("var(--faint)")}
        </button>
      ))}
    </>
  );
}

// Pay the worker directly, then say so.
export function FeePayScreen({ fee, onBack, onPaid }: { fee: OwedFee; onBack: () => void; onPaid: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const bank = fee.bsb && fee.account_number ? `BSB ${fee.bsb.slice(0, 3)}-${fee.bsb.slice(3)}, Acc ${fee.account_number}` : null;
  return (
    <Screen title={`Pay ${fee.to}`} onBack={onBack}>
      <div className="screen-body" style={{ background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div className="cp-sec">
          <span className="cp-title">{money(fee.amount_cents)} cancellation fee</span>
          <span className="t16 light" style={{ lineHeight: 1.5 }}>
            {fee.kind === "customer_no_show" ? `${fee.to} waited at the door and couldn't get in.` : `You cancelled after ${fee.to} had set off.`} It goes to {fee.to} for their time.
          </span>
        </div>
        <div className="cp-payid">
          {Icon.card("var(--emerald)")}
          <span className="stack" style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <span className="k">{fee.payid ? "PayID" : bank ? "Bank account" : "How to pay"}{fee.account_name ? `, ${fee.account_name}` : ""}</span>
            <span className="v">{fee.payid ? showPayid(fee.payid) : bank ?? `Message ${fee.to} for their details, or pay cash.`}</span>
          </span>
        </div>
        <Note icon="lock">{fee.to} is told when you mark it paid. If it doesn't arrive, they can ask us to step in.</Note>
        <div style={{ flex: 1 }} />
        <ActionBar>
          <button className="btn stone" style={{ flex: 1 }} onClick={onBack}>Later</button>
          <button className="btn primary" style={{ flex: 2 }} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await rpc("mark_fee_paid", { p_id: fee.id }); toast(`Done. ${fee.to} has been told.`); onPaid(); }
            catch (e) { toast(e instanceof Error ? e.message : String(e)); setBusy(false); }
          }}>{busy ? "Saving…" : "I've paid it"}</button>
        </ActionBar>
      </div>
    </Screen>
  );
}
