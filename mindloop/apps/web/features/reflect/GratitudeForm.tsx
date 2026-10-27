"use client";

import Link from "next/link";
import { useState } from "react";
import { Burst } from "@/components/Burst";
import { StepActions, StepTitle } from "@/components/Flow";
import { SunIcon, XIcon } from "@/components/icons";
import { Button, ButtonLink, Input, Notice, TextArea, stagger } from "@/components/ui";
import { SupportCard } from "@/features/checkin/SupportCard";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ReflectionResult } from "@/lib/types";
import { JournalOff } from "./JournalOff";

const SLOTS = 3;

/** Three good things: up to three small things that went well, and optionally why. One screen. */
export function GratitudeForm() {
  const { t } = useI18n();
  const [items, setItems] = useState<string[]>(Array(SLOTS).fill(""));
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"journal_off" | "error" | null>(null);
  const [result, setResult] = useState<ReflectionResult | null>(null);
  const filled = items.map((x) => x.trim()).filter(Boolean);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      setResult(await api.createReflection({ kind: "gratitude", items: filled, why: why.trim() }));
    } catch (e) {
      setError(e instanceof ApiError && e.code === "journal_off" ? "journal_off" : "error");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const high = result.support?.level === "high";
    return (
      <div className="space-y-5 pb-6 pt-4">
        {result.support && <SupportCard support={result.support} />}
        {!high && (
          <div className="animate-rise flex flex-col items-center pt-8 text-center">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <span aria-hidden className="absolute inset-0 rounded-full bg-[#ffd76a] opacity-40 blur-2xl" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-[#ffd76a] text-[#3a2a00]">
                <SunIcon className="h-10 w-10" />
              </span>
              <Burst />
            </div>
            <p className="mt-4 text-[13px] font-medium text-ink-faint">{t("gratitude.doneEyebrow")}</p>
            <h1 className="mt-1 font-display text-[2.2rem] font-semibold leading-none tracking-[-0.035em] text-ink">
              {t("gratitude.doneTitle")}
            </h1>
            <p className="mt-3 max-w-xs text-[15px] text-ink-soft">{t("gratitude.doneBody")}</p>
            <ul className="mt-6 w-full space-y-2 text-left">
              {result.reflection.items.map((x, i) => (
                <li key={i} className="card animate-rise flex items-center gap-3 px-4 py-3 text-[15px] text-ink" style={stagger(i + 1)}>
                  <span aria-hidden className="text-lg">
                    ✦
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ButtonLink href="/reflect" variant="secondary" block size="lg">
          {t("reframe.back")}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col">
      <div className="flex items-center py-2">
        <Link
          href="/reflect"
          aria-label={t("checkin.close")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2"
        >
          <XIcon className="h-5 w-5" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col pt-6">
        <StepTitle eyebrow={t("gratitude.eyebrow")}>{t("gratitude.title")}</StepTitle>
        <p className="animate-rise mt-2 px-1 text-[15px] leading-relaxed text-ink-soft" style={stagger(1)}>
          {t("gratitude.hint")}
        </p>
        <ol className="animate-rise mt-6 space-y-3" style={stagger(2)}>
          {items.map((value, i) => (
            <li key={i} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-semibold text-accent-fg"
              >
                {i + 1}
              </span>
              <Input
                value={value}
                maxLength={300}
                aria-label={t("gratitude.label", { n: i + 1 })}
                placeholder={t(`gratitude.placeholder${i + 1}`)}
                onChange={(e) => setItems((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </li>
          ))}
        </ol>
        <label className="animate-rise mt-6 block" style={stagger(3)}>
          <span className="mb-2 block px-1 text-sm font-medium text-ink">{t("gratitude.whyLabel")}</span>
          <TextArea
            value={why}
            maxLength={1000}
            onChange={(e) => setWhy(e.target.value)}
            placeholder={t("gratitude.whyPlaceholder")}
            className="min-h-24 text-base"
          />
        </label>
        {error === "journal_off" && <JournalOff className="mt-4" />}
        {error === "error" && (
          <Notice tone="care" className="mt-4">
            {t("app.error")}
          </Notice>
        )}
        <StepActions>
          <Button size="lg" variant="accent" block disabled={filled.length === 0} loading={saving} onClick={save}>
            {t("gratitude.save")}
          </Button>
        </StepActions>
      </div>
    </div>
  );
}
