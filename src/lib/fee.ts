// The Mahi Man connection fee: a share of the job price with a minimum. Plus is half, with a lower minimum.
// The database works out the real fee (fee_quote) with the rule the job was posted with; this mirrors it for showing prices.
export const connFee = (price: number, pct: number, min: number) => (price > 0 ? Math.max(Math.round((price * pct) / 100), min) : 0);
export const pctLabel = (pct: number) => `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
