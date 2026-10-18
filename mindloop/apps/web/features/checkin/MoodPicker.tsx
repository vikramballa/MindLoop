"use client";

import { MoodFace } from "@/components/MoodFace";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { MOOD_VALUES } from "@/lib/mood";

export function MoodPicker({
  value,
  onChange,
  size = "lg",
}: {
  value: number | null;
  onChange: (mood: number) => void;
  size?: "md" | "lg";
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("mood.question")} className="grid grid-cols-5 gap-1 sm:gap-2">
      {MOOD_VALUES.map((m) => {
        const selected = value === m;
        const dimmed = value !== null && !selected;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m)}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-[1.25rem] px-0.5 py-2.5 transition-[background-color,opacity,transform] duration-300 active:scale-95",
              selected ? "bg-raised shadow-[0_6px_18px_-8px_rgb(var(--shadow)/0.35)] ring-1 ring-line" : "hover:bg-raised/60",
              dimmed && "opacity-45 hover:opacity-100",
            )}
          >
            <MoodFace
              mood={m}
              className={cn(
                "transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-1 group-hover:rotate-[-4deg]",
                size === "lg" ? "h-14 w-14 sm:h-16 sm:w-16" : "h-11 w-11 sm:h-12 sm:w-12",
                selected && "animate-pop",
              )}
            />
            <span className={cn("text-[12px] font-medium leading-tight sm:text-[13px]", selected ? "text-ink" : "text-ink-soft")}>
              {t(`mood.${m}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
