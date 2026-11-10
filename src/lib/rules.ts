import { useEffect, useState } from "react";
import { sb } from "./supabase";

/* Cancellation amounts and windows. They live in admin settings, so they can change without a new build. */
export interface Rules { fee: number; workerSoonFee: number; late: number; wait: number; window: number }
const DEFAULTS: Rules = { fee: 2000, workerSoonFee: 1000, late: 15, wait: 15, window: 120 };
let cache: Rules | null = null;

export function useRules(): Rules {
  const [r, setR] = useState<Rules>(cache ?? DEFAULTS);
  useEffect(() => {
    if (cache) return;
    sb.from("settings").select("key,value").in("key", ["cancel_fee_cents", "worker_late_cancel_cents", "late_minutes", "noshow_wait_minutes", "worker_cancel_window_minutes"])
      .then(({ data }) => {
        const m = Object.fromEntries((data ?? []).map((x) => [x.key, Number(x.value)]));
        cache = { fee: m.cancel_fee_cents || DEFAULTS.fee, workerSoonFee: m.worker_late_cancel_cents || DEFAULTS.workerSoonFee, late: m.late_minutes || DEFAULTS.late,
          wait: m.noshow_wait_minutes || DEFAULTS.wait, window: m.worker_cancel_window_minutes || DEFAULTS.window };
        setR(cache);
      });
  }, []);
  return r;
}
