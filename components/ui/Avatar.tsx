import type { Difficulty } from "@/lib/uno";

const HUES = ["#f97316", "#8b5cf6", "#06b6d4", "#ec4899"];

/** Friendly robot faces whose expression hints at their difficulty. */
export function Avatar({ difficulty, seat, human, size = 44 }: { difficulty?: Difficulty; seat: number; human?: boolean; size?: number }) {
  const hue = HUES[seat % HUES.length];
  if (human) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <circle cx="24" cy="24" r="23" fill="#facc15" />
        <circle cx="24" cy="19" r="8" fill="#713f12" opacity="0.85" />
        <path d="M9 40c3-8 9-11 15-11s12 3 15 11" fill="#713f12" opacity="0.85" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`av${seat}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hue} />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill={`url(#av${seat})`} />
      <line x1="24" y1="6" x2="24" y2="11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="5" r="2.4" fill={difficulty === "grandmaster" ? "#facc15" : "#fff"} />
      <rect x="10" y="12" width="28" height="24" rx="8" fill="#0f172a" opacity="0.88" />
      {difficulty === "rookie" && (
        <>
          <circle cx="18" cy="22" r="3.4" fill="#a7f3d0" />
          <circle cx="30" cy="22" r="3.4" fill="#a7f3d0" />
          <path d="M18 29q6 5 12 0" stroke="#a7f3d0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )}
      {difficulty === "casual" && (
        <>
          <rect x="15" y="20" width="7" height="4" rx="2" fill="#bae6fd" />
          <rect x="26" y="20" width="7" height="4" rx="2" fill="#bae6fd" />
          <path d="M19 30h10" stroke="#bae6fd" strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      {difficulty === "shark" && (
        <>
          <path d="M14 19l8 3-8 2z" fill="#fda4af" />
          <path d="M34 19l-8 3 8 2z" fill="#fda4af" />
          <path d="M17 30l3-2 2 2 2-2 2 2 2-2 3 2" stroke="#fda4af" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        </>
      )}
      {(difficulty === "grandmaster" || !difficulty) && (
        <>
          <circle cx="18" cy="22" r="3" fill="#fde68a" />
          <circle cx="30" cy="22" r="4.2" fill="none" stroke="#fde68a" strokeWidth="1.8" />
          <circle cx="30" cy="22" r="1.8" fill="#fde68a" />
          <path d="M34 25l2 8" stroke="#fde68a" strokeWidth="1.4" />
          <path d="M19 30q5 2 10 0" stroke="#fde68a" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
