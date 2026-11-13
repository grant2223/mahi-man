/* Reviews rate people on what matters, not one overall star. Workers are rated on five things, customers on four.
   Each is picked with five faces, very unhappy to very happy. */

export type Scores = { reviewed: number; recommended: number; avg: Record<string, number> };

export const WORKER_KEYS = [
  { k: "on_time", label: "On time", short: "On time", q: "Were they on time?" },
  { k: "prepared", label: "Prepared", short: "Prepared", q: "Did they come prepared for the job?" },
  { k: "quality", label: "Quality", short: "Quality", q: "How well did they do the job?" },
  { k: "communication", label: "Communication", short: "Comms", q: "Did they keep you informed?" },
  { k: "friendliness", label: "Friendliness", short: "Friendly", q: "Were they friendly?" },
];
export const CUSTOMER_KEYS = [
  { k: "description", label: "Job description", short: "As described", q: "Did it match?" },
  { k: "prepared", label: "Prepared", short: "Prepared", q: "Were they ready for you to do the job?" },
  { k: "paid", label: "Paid on completion", short: "Paid", q: "Was payment made on time?" },
  { k: "respect", label: "Respect", short: "Respect", q: "Were they respectful towards you?" },
];

const TONE = ["#c0392b", "#e07b2a", "#d9a514", "#7cab3a", "#0b6b4f"];
const WORDS = ["Very unhappy", "Unhappy", "OK", "Happy", "Very happy"];

// One face. i is 0 (very unhappy) to 4 (very happy); each has its own expression.
export function Face({ i, on, size = 36 }: { i: number; on: boolean; size?: number }) {
  const f = on ? "#fff" : "#7d7a70";
  const st = { fill: "none", stroke: f, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const eyes = i === 4
    ? <><path d="M6.8 10.2q1.9-2 3.8 0" {...st} /><path d="M13.4 10.2q1.9-2 3.8 0" {...st} /></>
    : <><circle cx="8.7" cy="10" r="1.3" fill={f} /><circle cx="15.3" cy="10" r="1.3" fill={f} /></>;
  const brows = i === 0 ? <><path d="M6.6 6.6l3.6 1.6" {...st} /><path d="M17.4 6.6l-3.6 1.6" {...st} /></> : null;
  const mouth = [
    <path key="m" d="M7.6 17.6q4.4-4.6 8.8 0" {...st} />,
    <path key="m" d="M8.4 16.6q3.6-2.4 7.2 0" {...st} />,
    <path key="m" d="M8.4 15.6h7.2" {...st} />,
    <path key="m" d="M8.2 14.2q3.8 3 7.6 0" {...st} />,
    <path key="m" d="M7.2 13.2h9.6q-.4 5.2-4.8 5.2t-4.8-5.2z" fill={f} />,
  ][i];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={on ? TONE[i] : "#e3eae6"} />{brows}{eyes}{mouth}
    </svg>
  );
}

// A line to rate: its name and question on the left, the five faces on the right.
export function FaceRow({ label, q, value, onChange }: { label: string; q: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="face-row">
      <span className="t"><b>{label}</b><span>{q}</span></span>
      <span className="faces" role="radiogroup" aria-label={label}>
        {[0, 1, 2, 3, 4].map((i) => (
          <button key={i} role="radio" aria-checked={value === i + 1} aria-label={`${label}: ${WORDS[i]}`} onClick={() => onChange(i + 1)}>
            <Face i={i} on={value === i + 1} />
          </button>
        ))}
      </span>
    </div>
  );
}

// The scores someone has, each centred over its word. Shown once they have a review.
export function ScoreStrip({ scores, worker }: { scores: Scores | null | undefined; worker: boolean }) {
  if (!scores || !scores.reviewed) return null;
  const keys = worker ? WORKER_KEYS : CUSTOMER_KEYS;
  return (
    <div className="score-strip">
      {keys.map((x) => (
        <span key={x.k}><b>{scores.avg[x.k] != null ? Number(scores.avg[x.k]).toFixed(1) : "–"}</b><span>{x.short}</span></span>
      ))}
    </div>
  );
}

export const recLine = (s: Scores | null | undefined, who: "customers" | "workers") =>
  s && s.reviewed ? `Recommended by ${s.recommended} of ${s.reviewed} ${who}` : "";
