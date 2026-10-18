"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import en from "./messages/en.json";

/**
 * Minimal i18n: nested JSON catalogues, `{param}` interpolation, English fallback.
 * Add a language by adding `messages/<code>.json` and registering it in CATALOGS.
 */
type Catalog = Record<string, unknown>;
const CATALOGS: Record<string, Catalog> = { en };
export const SUPPORTED_LANGUAGES = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn"] as const;

function lookup(catalog: Catalog, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined),
    catalog,
  );
}

export function translate(language: string, key: string, params?: Record<string, string | number>): string {
  const base = language.split("-")[0];
  const value = lookup(CATALOGS[base] ?? en, key) ?? lookup(en, key);
  if (typeof value !== "string") return key;
  return params ? value.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : value;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;
type I18nValue = { language: string; setLanguage: (lang: string) => void; t: TFn };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initialLanguage = "en" }: { children: ReactNode; initialLanguage?: string }) {
  const [language, setLanguage] = useState(initialLanguage);
  const t = useCallback<TFn>((key, params) => translate(language, key, params), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return { language: "en", setLanguage: () => {}, t: (k, p) => translate("en", k, p) };
  }
  return ctx;
}

export function useT(): TFn {
  return useI18n().t;
}
