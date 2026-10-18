import { MOOD_SOLID } from "@/lib/mood";
import type { CSSProperties } from "react";

const COLORS = [...Object.values(MOOD_SOLID), "var(--accent)"];

/** A one-shot confetti-like burst. Re-mount (change `key`) to play again. Decorative only. */
export function Burst({ count = 18, distance = 90 }: { count?: number; distance?: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, i) => {
        const size = 5 + ((i * 7) % 6);
        return (
          <span
            key={i}
            className="burst-dot rounded-full"
            style={
              {
                width: size,
                height: i % 3 === 0 ? size * 1.8 : size,
                background: COLORS[i % COLORS.length],
                "--a": `${(360 / count) * i + ((i * 13) % 20)}deg`,
                "--d": `${distance * (0.6 + ((i * 17) % 10) / 20)}px`,
                animationDelay: `${(i % 4) * 25}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </span>
  );
}
