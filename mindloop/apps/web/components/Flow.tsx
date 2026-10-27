"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "@/components/icons";
import { MoodFace } from "@/components/MoodFace";
import { useT } from "@/lib/i18n";

const iconButton = "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-2";

/**
 * Top bar for full-screen, one-question-per-screen flows (check-in, reframe): back or close on the
 * left, a segmented progress bar, and close on the right once you're past the first step.
 */
export function FlowHeader({
  step,
  total,
  onBack,
  closeHref,
}: {
  step: number;
  total: number;
  onBack: () => void;
  closeHref: string;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 py-2">
      {step > 0 ? (
        <button type="button" onClick={onBack} aria-label={t("onboarding.back")} className={`${iconButton} text-ink`}>
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      ) : (
        <Link href={closeHref} aria-label={t("checkin.close")} className={`${iconButton} text-ink`}>
          <XIcon className="h-5 w-5" />
        </Link>
      )}
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full bg-accent transition-transform duration-500 ease-[var(--ease-out-soft)]"
              style={{ transform: `scaleX(${i <= step ? 1 : 0})`, transformOrigin: "left" }}
            />
          </span>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {t("onboarding.step", { current: step + 1, total })}
      </span>
      {step > 0 ? (
        <Link href={closeHref} aria-label={t("checkin.close")} className={`${iconButton} text-ink-faint hover:text-ink`}>
          <XIcon className="h-5 w-5" />
        </Link>
      ) : (
        <span className="w-10" />
      )}
    </div>
  );
}

export function StepTitle({ eyebrow, face, children }: { eyebrow?: string; face?: number; children: ReactNode }) {
  return (
    <div className="animate-rise px-1">
      {eyebrow && (
        <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-faint">
          {face && <MoodFace mood={face} className="h-6 w-6" />}
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink text-balance">
        {children}
      </h1>
    </div>
  );
}

export function StepActions({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 mt-auto space-y-2 bg-gradient-to-t from-bg via-bg/90 to-transparent pb-2 pt-8">{children}</div>;
}
