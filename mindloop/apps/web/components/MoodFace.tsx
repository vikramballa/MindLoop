import { useId, type CSSProperties, type ReactNode } from "react";
import { MOOD_COLORS } from "@/lib/mood";

const INK = "#2a1f45";

/** Soft blob character for moods 1 to 5. Purely decorative, so callers provide the accessible label. */
export function MoodFace({ mood, className, style }: { mood: number | null; className?: string; style?: CSSProperties }) {
  const id = `mf${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (mood === null) {
    return (
      <svg viewBox="0 0 64 64" aria-hidden className={className} style={style}>
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="3" strokeDasharray="4 6" />
      </svg>
    );
  }
  const [a, b] = MOOD_COLORS[mood];
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className} style={style}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <path d="M32 4c15 0 28 10 28 27S48 60 32 60 4 49 4 31 17 4 32 4Z" fill={`url(#${id})`} />
      <ellipse cx="22" cy="17" rx="7" ry="4" fill="#fff" opacity="0.35" transform="rotate(-25 22 17)" />
      <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">{FEATURES[mood]}</g>
    </svg>
  );
}

const FEATURES: Record<number, ReactNode> = {
  5: (
    <>
      <path d="M19 29q4-5 8 0M37 29q4-5 8 0" />
      <path d="M21 38q11 11 22 0" />
      <circle cx="16" cy="37" r="2.5" fill="#ff7a8a" stroke="none" opacity="0.6" />
      <circle cx="48" cy="37" r="2.5" fill="#ff7a8a" stroke="none" opacity="0.6" />
    </>
  ),
  4: (
    <>
      <circle cx="23" cy="28" r="1.2" fill={INK} />
      <circle cx="41" cy="28" r="1.2" fill={INK} />
      <path d="M24 39q8 6 16 0" />
    </>
  ),
  3: (
    <>
      <circle cx="23" cy="29" r="1.2" fill={INK} />
      <circle cx="41" cy="29" r="1.2" fill={INK} />
      <path d="M25 41h14" />
    </>
  ),
  2: (
    <>
      <circle cx="23" cy="30" r="1.2" fill={INK} />
      <circle cx="41" cy="30" r="1.2" fill={INK} />
      <path d="M19 25l7-2.5M45 25l-7-2.5" strokeWidth="2.5" />
      <path d="M25 43q7-5 14 0" />
    </>
  ),
  1: (
    <>
      <path d="M19 30q4 3 8 0M37 30q4 3 8 0" />
      <path d="M25 44q7-6 14 0" />
      <path d="M45 35q2 4 0 6q-2-2 0-6Z" fill="#8fc7ff" stroke="none" />
    </>
  ),
};
