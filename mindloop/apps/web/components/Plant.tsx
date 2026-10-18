import type { ReactNode } from "react";
import { MOOD_SOLID } from "@/lib/mood";

const STEM = "#5c9a6a";
const LEAF = "#77b47f";

/** One plant per check-in day; the species reflects that day's mood. Hard days grow things too. */
export function Plant({ mood, className }: { mood: number; className?: string }) {
  const c = MOOD_SOLID[mood];
  return (
    <svg viewBox="0 0 40 56" aria-hidden className={className}>
      {SPECIES[mood](c)}
    </svg>
  );
}

const stem = (d: string) => <path d={d} stroke={STEM} strokeWidth="2.2" strokeLinecap="round" fill="none" />;
const leaf = (d: string) => <path d={d} fill={LEAF} />;

const SPECIES: Record<number, (c: string) => ReactNode> = {
  // Sunflower
  5: (c) => (
    <>
      {stem("M20 56V22")}
      {leaf("M20 42c-7-1-10-6-10-9 5 0 9 3 10 9Z")}
      {leaf("M20 36c6-1 9-5 9-8-4 0-8 3-9 8Z")}
      <g transform="translate(20 16)">
        {Array.from({ length: 10 }, (_, i) => (
          <ellipse key={i} rx="3.2" ry="7" cy="-7" fill={c} transform={`rotate(${i * 36})`} />
        ))}
        <circle r="5" fill="#8a5a2b" />
        <circle r="2.4" fill="#6b4320" />
      </g>
    </>
  ),
  // Tulip
  4: (c) => (
    <>
      {stem("M20 56V24")}
      {leaf("M20 50c-8-3-10-12-8-18 5 4 8 10 8 18Z")}
      {leaf("M20 46c7-3 9-10 7-15-4 3-7 8-7 15Z")}
      <path d="M12 14c0 8 3.5 12 8 12s8-4 8-12l-4 3-4-6-4 6-4-3Z" fill={c} />
      <path d="M20 11l-3 5 3 10 3-10-3-5Z" fill="#fff" opacity="0.25" />
    </>
  ),
  // Daisy
  3: (c) => (
    <>
      {stem("M20 56c0-10-2-18 0-30")}
      {leaf("M19 44c-6 0-9-4-9-7 4 0 8 2 9 7Z")}
      <g transform="translate(20 20)">
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse key={i} rx="2.6" ry="5.5" cy="-5.5" fill={c} transform={`rotate(${i * 45})`} />
        ))}
        <circle r="3.4" fill="#f2c94c" />
      </g>
    </>
  ),
  // Bluebells: bowed, but still blooming
  2: (c) => (
    <>
      {stem("M20 56V28c0-8 4-12 9-12")}
      {leaf("M20 48c-7-2-9-9-7-14 4 3 7 8 7 14Z")}
      {stem("M23 21q2 3 1 6")}
      {stem("M27 17q3 2 3 6")}
      <path d="M20 26a4 4 0 0 0 8 0l-1-5h-6l-1 5Z" fill={c} />
      <path d="M26 30a3.5 3.5 0 0 0 7 0l-1-4.5h-5L26 30Z" fill={c} opacity="0.85" />
      <path d="M29 18a3 3 0 0 0 6 0l-1-4h-4l-1 4Z" fill={c} opacity="0.7" />
    </>
  ),
  // Seedling with a raindrop, because rainy days grow things too
  1: (c) => (
    <>
      {stem("M20 56V34")}
      <path d="M20 36c0-7-5-11-11-11 0 7 5 11 11 11Z" fill={LEAF} />
      <path d="M20 40c0-6 4-9 9-9 0 6-4 9-9 9Z" fill={LEAF} opacity="0.85" />
      <circle cx="20" cy="31" r="3.2" fill={c} />
      <path d="M30 10c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6Z" fill="#8fc7ff" />
    </>
  ),
};
