"use client";

import { Plant } from "@/components/Plant";
import { cn, stagger } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { parseDay } from "@/lib/mood";
import type { Bloom } from "@/lib/progress";

const PER_ROW = 7;

/** Every day you check in plants something. Nothing wilts, nothing is lost when you're away. */
export function Garden({ blooms, max = 35, compact = false }: { blooms: Bloom[]; max?: number; compact?: boolean }) {
  const { t, language } = useI18n();
  const shown = blooms.slice(-max);
  // Pad the first row so the newest plant always sits at the end of the bottom row.
  const pad = (PER_ROW - (shown.length % PER_ROW)) % PER_ROW;
  const cells: Array<Bloom | null> = [...Array<null>(pad).fill(null), ...shown];
  if (cells.length === 0) cells.push(...Array<null>(PER_ROW).fill(null));

  return (
    <div>
      <ul
        aria-label={t("journey.gardenLabel", { count: blooms.length })}
        className={cn("grid grid-cols-7 gap-x-1", compact ? "gap-y-1" : "gap-y-2")}
      >
        {cells.map((b, i) => (
          <li key={b ? b.day : `pad-${i}`} className="relative flex flex-col items-center" style={stagger(i)}>
            {b ? (
              <Plant mood={b.mood} className={cn("animate-sprout", compact ? "h-10 w-8" : "h-14 w-10")} />
            ) : (
              <span className={cn("block", compact ? "h-10" : "h-14")} />
            )}
            {b && (
              <span className="sr-only">
                {parseDay(b.day).toLocaleDateString(language, { day: "numeric", month: "long" })}: {t(`mood.${b.mood}`)}
              </span>
            )}
            {/* soil */}
            <span aria-hidden className="mt-0.5 h-1.5 w-9 rounded-full bg-[color-mix(in_oklab,#8a6a4a_45%,var(--surface-2))]" />
          </li>
        ))}
      </ul>
      {blooms.length > max && (
        <p className="mt-3 text-xs text-ink-faint">{t("journey.gardenMore", { count: blooms.length - max })}</p>
      )}
    </div>
  );
}
