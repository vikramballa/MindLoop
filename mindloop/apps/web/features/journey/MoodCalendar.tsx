"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { cn } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { MOOD_SOLID, localDate } from "@/lib/mood";
import type { Bloom } from "@/lib/progress";

/** A month of mood colour. Swipe back through earlier months. Monday-first. */
export function MoodCalendar({ blooms }: { blooms: Bloom[] }) {
  const { t, language } = useI18n();
  const [offset, setOffset] = useState(0);
  const byDay = useMemo(() => new Map(blooms.map((b) => [b.day, b.mood])), [blooms]);
  const earliest = blooms[0]?.day;

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = localDate();
  const canGoBack = earliest ? localDate(first) > earliest : false;

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(language, { weekday: "narrow" }),
  );
  const cells = Array.from({ length: lead + daysInMonth }, (_, i) => {
    if (i < lead) return null;
    const d = new Date(first.getFullYear(), first.getMonth(), i - lead + 1);
    const key = localDate(d);
    return { key, n: d.getDate(), mood: byDay.get(key) ?? null, future: key > today, isToday: key === today };
  });
  const logged = cells.filter((c) => c?.mood).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-display text-2xl leading-none text-ink">
            {first.toLocaleDateString(language, { month: "long", year: first.getFullYear() !== now.getFullYear() ? "numeric" : undefined })}
          </p>
          <p className="mt-1 text-xs text-ink-faint">{t("journey.monthLogged", { count: logged })}</p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t("journey.prevMonth")}
            disabled={!canGoBack}
            onClick={() => setOffset((o) => o + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-surface-2 disabled:opacity-30"
          >
            <ChevronRightIcon className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            aria-label={t("journey.nextMonth")}
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-surface-2 disabled:opacity-30"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center" role="grid" aria-label={t("journey.calendar")}>
        {weekdays.map((w, i) => (
          <span key={i} aria-hidden className="pb-1 text-[11px] font-medium text-ink-faint">
            {w}
          </span>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <span key={`lead-${i}`} />
          ) : (
            <span
              key={c.key}
              role="gridcell"
              aria-label={`${c.n}: ${c.mood ? t(`mood.${c.mood}`) : "—"}`}
              className={cn(
                "flex aspect-square items-center justify-center rounded-[10px] text-[12px] font-medium tabular-nums transition-transform",
                c.mood ? "text-[#1e1a26]" : c.future ? "text-ink-faint/40" : "bg-surface-2 text-ink-faint",
                c.isToday && "ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface)]",
              )}
              style={c.mood ? { background: MOOD_SOLID[c.mood] } : undefined}
            >
              {c.n}
            </span>
          ),
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-faint" aria-hidden>
        {[5, 4, 3, 2, 1].map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: MOOD_SOLID[m] }} />
            {t(`mood.${m}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
