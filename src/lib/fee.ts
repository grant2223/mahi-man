// The Mahi Man connection fee: a share of the job price with a minimum and a cap. Plus is half, with a lower minimum and cap.
// The database works out the real fee (fee_quote) with the rule the job was posted with; this mirrors it for showing prices.
export const connFee = (price: number, pct: number, min: number, max?: number | null) =>
  price > 0 ? Math.min(Math.max(Math.round((price * pct) / 100), min), max ?? Infinity) : 0;
export const pctLabel = (pct: number) => `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
