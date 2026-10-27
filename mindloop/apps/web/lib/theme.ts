/**
 * Appearance choices that live only on this device: light/dark and the accent colour.
 * They're stored in localStorage and applied to <html> before first paint (see app/layout.tsx).
 */
export type Theme = "system" | "light" | "dark";
export type Accent = "iris" | "lime" | "mint" | "sunset" | "ocean" | "rose";

/** Swatch colours for the picker (the light-theme accent values from globals.css). */
export const ACCENTS: Record<Accent, string> = {
  iris: "#6553e6",
  lime: "#c6ec4f",
  mint: "#3fd3a4",
  sunset: "#ff8f5e",
  ocean: "#4aa8ff",
  rose: "#f27aa6",
};

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice applies for this visit only */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  store("ml_theme", theme === "system" ? null : theme);
}

export function readTheme(): Theme {
  const saved = read("ml_theme");
  return saved === "light" || saved === "dark" ? saved : "system";
}

/** The theme actually showing right now (resolves "system"). */
export function effectiveTheme(): "light" | "dark" {
  const t = readTheme();
  if (t !== "system") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAccent(accent: Accent) {
  const root = document.documentElement;
  if (accent === "iris") delete root.dataset.accent;
  else root.dataset.accent = accent;
  store("ml_accent", accent === "iris" ? null : accent);
}

export function readAccent(): Accent {
  const saved = read("ml_accent");
  return saved && saved in ACCENTS ? (saved as Accent) : "iris";
}
