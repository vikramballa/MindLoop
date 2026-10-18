/**
 * Progress that only ever grows. Nothing here decays, resets or counts consecutive days:
 * there are no streaks, so nobody gets made to feel bad for taking a break.
 *
 * Most of it comes from the check-in history on the server. A few tool-use counters live in
 * localStorage, because those tools work offline and never send anything to the server.
 */
import type { CheckInSummary } from "./types";

type ToolCounter = "breathe" | "ground" | "sounds" | "reach" | "talk" | "action";
const KEY = "ml_progress";

export function readCounters(): Partial<Record<ToolCounter, number>> {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<ToolCounter, number>>) ?? {};
  } catch {
    return {};
  }
}

export function bump(counter: ToolCounter) {
  try {
    const cur = readCounters();
    localStorage.setItem(KEY, JSON.stringify({ ...cur, [counter]: (cur[counter] ?? 0) + 1 }));
  } catch {
    /* private mode: progress just won't persist */
  }
}

/** One entry per day checked in (latest check-in that day wins). Oldest first. */
export type Bloom = { day: string; mood: number };

export function blooms(history: CheckInSummary[]): Bloom[] {
  const seen = new Map<string, number>();
  // History is newest first, so the first one seen for a day is that day's latest.
  for (const c of history) if (!seen.has(c.local_date)) seen.set(c.local_date, c.mood);
  return [...seen.entries()].map(([day, mood]) => ({ day, mood })).sort((a, b) => a.day.localeCompare(b.day));
}

export type MomentKey =
  | "first"
  | "five"
  | "ten_days"
  | "thirty_days"
  | "every_mood"
  | "named"
  | "opened_up"
  | "breathe"
  | "ground"
  | "reach"
  | "talk"
  | "action";

export type Moment = { key: MomentKey; got: boolean; progress: number; goal: number };

/** Milestones that add up over time. Each one marks something kind you did for yourself, not a target to keep up. */
export function moments(history: CheckInSummary[], counters: Partial<Record<ToolCounter, number>>): Moment[] {
  const days = new Set(history.map((c) => c.local_date)).size;
  const moods = new Set(history.map((c) => c.mood)).size;
  const named = history.reduce((n, c) => n + c.feelings.length, 0);
  const notes = history.filter((c) => c.has_note).length;
  const m = (key: MomentKey, progress: number, goal: number): Moment => ({
    key,
    progress: Math.min(progress, goal),
    goal,
    got: progress >= goal,
  });
  return [
    m("first", history.length, 1),
    m("five", history.length, 5),
    m("ten_days", days, 10),
    m("every_mood", moods, 5),
    m("named", named, 10),
    m("opened_up", notes, 1),
    m("breathe", counters.breathe ?? 0, 3),
    m("ground", counters.ground ?? 0, 1),
    m("reach", counters.reach ?? 0, 1),
    m("talk", counters.talk ?? 0, 1),
    m("action", counters.action ?? 0, 3),
    m("thirty_days", days, 30),
  ];
}
