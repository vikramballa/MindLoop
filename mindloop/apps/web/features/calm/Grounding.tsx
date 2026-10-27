"use client";

import { useState } from "react";
import { Button, cn } from "@/components/ui";
import { useT } from "@/lib/i18n";

const STEPS = [
  { count: 5, key: "see", emoji: "👀" },
  { count: 4, key: "touch", emoji: "✋" },
  { count: 3, key: "hear", emoji: "👂" },
  { count: 2, key: "smell", emoji: "👃" },
  { count: 1, key: "taste", emoji: "👅" },
] as const;

/** 5-4-3-2-1 grounding as a tap-through: one tap per thing noticed. */
export function Grounding({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [taps, setTaps] = useState(0);
  const done = step >= STEPS.length;
  const current = STEPS[Math.min(step, STEPS.length - 1)];

  function tap() {
    if ("vibrate" in navigator) navigator.vibrate(20);
    const next = taps + 1;
    if (next < current.count) {
      setTaps(next);
      return;
    }
    setTaps(0);
    setStep((s) => s + 1);
    if (step + 1 >= STEPS.length) onDone?.();
  }

  return (
    <div className="flex flex-col items-center text-center">
      <ol className="mb-6 flex gap-2" aria-label={t("calm.ground.title")}>
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
              i < step ? "bg-ink text-bg" : i === step ? "bg-accent text-on-accent ring-2 ring-ink" : "bg-surface-2 text-ink-faint",
            )}
          >
            {s.count}
          </li>
        ))}
      </ol>

      {done ? (
        <div className="animate-rise space-y-5 py-6">
          <p className="text-5xl" aria-hidden>
            🌿
          </p>
          <p className="mx-auto max-w-xs font-display text-3xl leading-tight text-ink">{t("calm.ground.done")}</p>
          <Button variant="secondary" onClick={() => setStep(0)}>
            {t("calm.ground.restart")}
          </Button>
        </div>
      ) : (
        <>
          <p key={step} className="animate-rise font-display text-3xl leading-tight text-ink" aria-live="polite">
            {current.count} {t(`calm.ground.${current.key}`)}
          </p>
          <button
            type="button"
            onClick={tap}
            className="group relative mt-6 flex h-48 w-48 items-center justify-center rounded-full bg-gradient-to-br from-[var(--aura-a)] to-[var(--aura-b)] shadow-[0_20px_50px_-15px_var(--aura-a)] transition-transform active:scale-95"
          >
            <span className="text-6xl transition-transform group-active:scale-110" aria-hidden>
              {current.emoji}
            </span>
            <span className="sr-only">{t("calm.ground.tap")}</span>
          </button>
          <div className="mt-6 flex gap-2" aria-hidden>
            {Array.from({ length: current.count }, (_, i) => (
              <span
                key={i}
                className={cn("h-3 w-3 rounded-full transition-[background-color,transform] duration-300", i < taps ? "scale-110 bg-ink" : "bg-line")}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-ink-faint">{t("calm.ground.tap")}</p>
        </>
      )}
    </div>
  );
}
