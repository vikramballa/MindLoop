import type { CheckInCreate } from "./types";

export type Feeling = NonNullable<CheckInCreate["feelings"]>[number];

export const MOOD_VALUES = [5, 4, 3, 2, 1] as const;

/** Gradient stops for each mood face (light enough for dark ink features in both themes). */
export const MOOD_COLORS: Record<number, [string, string]> = {
  5: ["#ffd76a", "#ff9f5a"],
  4: ["#8ee6c4", "#4fc3b0"],
  3: ["#d3d5ee", "#a3add9"],
  2: ["#a4aeff", "#7b80f0"],
  1: ["#9d8aec", "#dd8fc2"],
};

/** One solid colour per mood (calendar cells, chart dots). Midpoint of the face gradient. */
export const MOOD_SOLID: Record<number, string> = {
  5: "#ffbc5e",
  4: "#63d3b9",
  3: "#b9c0e4",
  2: "#8f96f6",
  1: "#bb8cd8",
};

export const FEELING_EMOJI: Record<Feeling, string> = {
  calm: "🌿",
  grateful: "🙏",
  hopeful: "🌱",
  proud: "✨",
  excited: "⚡",
  loved: "💛",
  meh: "😶",
  tired: "🥱",
  bored: "🫠",
  restless: "🌀",
  distracted: "📱",
  unsure: "🤷",
  anxious: "😰",
  overwhelmed: "🌊",
  lonely: "🫥",
  left_out: "🚪",
  sad: "🌧️",
  drained: "🪫",
  numb: "🧊",
  irritated: "😤",
  stressed: "😵‍💫",
  self_doubt: "🫣",
};

/** Feeling words offered after each mood: mostly matching, with a few honest cross-overs. */
export const FEELINGS_FOR_MOOD: Record<number, Feeling[]> = {
  5: ["excited", "proud", "grateful", "loved", "calm", "hopeful"],
  4: ["calm", "grateful", "hopeful", "proud", "loved", "tired", "meh"],
  3: ["meh", "tired", "bored", "restless", "distracted", "unsure", "stressed", "lonely"],
  2: ["anxious", "overwhelmed", "stressed", "lonely", "left_out", "sad", "drained", "irritated", "self_doubt", "tired"],
  1: ["sad", "numb", "drained", "lonely", "left_out", "overwhelmed", "anxious", "self_doubt"],
};

export const LONELY_FEELINGS: Feeling[] = ["lonely", "left_out"];

/** Tints the page aura to match a mood (or resets it). */
export function setAura(mood: number | null) {
  if (typeof document === "undefined") return;
  if (mood === null) delete document.documentElement.dataset.mood;
  else document.documentElement.dataset.mood = String(mood);
}

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function partOfDay(d = new Date()): "morning" | "afternoon" | "evening" | "night" {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

export function dayOfYear(d = new Date()): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
}

/** Parses a YYYY-MM-DD local date without timezone drift. */
export function parseDay(day: string): Date {
  return new Date(day + "T00:00:00");
}
