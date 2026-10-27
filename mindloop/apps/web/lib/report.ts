/**
 * Numbers for the printable wellbeing report. Pure functions over what the user logged, so the
 * summary is reproducible and easy to test. Nothing here interprets or scores the person.
 */
import { localDate, parseDay } from "./mood";
import { blooms } from "./progress";
import type { CheckInSummary, ReflectionOut } from "./types";

export type Count = { key: string; count: number };

export type ReportSummary = {
  from: string;
  to: string;
  checkins: number;
  days: number;
  avgMood: number | null;
  avgStress: number | null;
  avgSleep: number | null;
  /** Index 0 = mood 1 … index 4 = mood 5. */
  moodCounts: [number, number, number, number, number];
  /** One point per day logged (the latest check-in that day), oldest first. */
  moodByDay: Array<{ day: string; value: number }>;
  feelings: Count[];
  topics: Count[];
  reframes: number;
  gratitudeItems: number;
  avgBeliefShift: number | null;
};

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function top(values: string[], n: number): Count[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);
}

export function summarize(
  history: CheckInSummary[],
  reflections: ReflectionOut[],
  days: number,
  today: Date = new Date(),
): ReportSummary {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  const from = localDate(start);
  const to = localDate(today);
  const inRange = history.filter((c) => c.local_date >= from && c.local_date <= to);
  const refl = reflections.filter((r) => {
    const d = localDate(new Date(r.created_at));
    return d >= from && d <= to;
  });
  const moodCounts: ReportSummary["moodCounts"] = [0, 0, 0, 0, 0];
  for (const c of inRange) moodCounts[c.mood - 1] += 1;
  const reframes = refl.filter((r) => r.kind === "reframe");
  const shifts = reframes
    .filter((r) => r.belief_before != null && r.belief_after != null)
    .map((r) => (r.belief_before as number) - (r.belief_after as number));

  return {
    from,
    to,
    checkins: inRange.length,
    days: new Set(inRange.map((c) => c.local_date)).size,
    avgMood: mean(inRange.map((c) => c.mood)),
    avgStress: mean(inRange.flatMap((c) => (c.stress != null ? [c.stress] : []))),
    avgSleep: mean(inRange.flatMap((c) => (c.sleep_hours != null ? [c.sleep_hours] : []))),
    moodCounts,
    moodByDay: blooms(inRange).map((b) => ({ day: b.day, value: b.mood })),
    feelings: top(
      inRange.flatMap((c) => c.feelings),
      6,
    ),
    topics: top(
      inRange.flatMap((c) => c.topics),
      5,
    ),
    reframes: reframes.length,
    gratitudeItems: refl.filter((r) => r.kind === "gratitude").reduce((n, r) => n + r.items.length, 0),
    avgBeliefShift: mean(shifts),
  };
}

/** "12 Oct – 10 Nov 2026" in the user's language. */
export function formatRange(from: string, to: string, locale: string): string {
  const a = parseDay(from).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const b = parseDay(to).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}
