"use client";

import { Chip } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { FEELING_EMOJI, FEELINGS_FOR_MOOD, type Feeling } from "@/lib/mood";

export const MAX_FEELINGS = 3;

/** Optional feeling words for the chosen mood (emotion labelling). Up to three. */
export function FeelingPicker({
  mood,
  value,
  onChange,
}: {
  mood: number;
  value: Feeling[];
  onChange: (feelings: Feeling[]) => void;
}) {
  const t = useT();
  const full = value.length >= MAX_FEELINGS;

  function toggle(f: Feeling) {
    if (value.includes(f)) onChange(value.filter((x) => x !== f));
    else if (!full) onChange([...value, f]);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FEELINGS_FOR_MOOD[mood].map((f) => {
          const selected = value.includes(f);
          return (
            <Chip key={f} selected={selected} onClick={() => toggle(f)} className={!selected && full ? "opacity-40" : undefined}>
              <span aria-hidden>{FEELING_EMOJI[f]}</span>
              {t(`feelings.${f}`)}
            </Chip>
          );
        })}
      </div>
      <p className="mt-4 px-1 text-xs tabular-nums text-ink-faint" aria-live="polite">
        {t("feelings.count", { count: value.length, max: MAX_FEELINGS })}
      </p>
    </div>
  );
}
