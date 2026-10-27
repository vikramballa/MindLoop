"use client";

import { useEffect, useReducer, useState } from "react";
import { Button, Toggle, cn } from "@/components/ui";
import { useT } from "@/lib/i18n";

type PhaseKind = "in" | "inTop" | "hold" | "out";
type Phase = { kind: PhaseKind; seconds: number };

export const RHYTHMS = {
  slow: { phases: [{ kind: "in", seconds: 4 }, { kind: "out", seconds: 6 }], rounds: 6 },
  box: {
    phases: [
      { kind: "in", seconds: 4 },
      { kind: "hold", seconds: 4 },
      { kind: "out", seconds: 4 },
      { kind: "hold", seconds: 4 },
    ],
    rounds: 4,
  },
  sigh: {
    phases: [
      { kind: "in", seconds: 2 },
      { kind: "inTop", seconds: 1 },
      { kind: "out", seconds: 6 },
    ],
    rounds: 6,
  },
  "478": {
    phases: [
      { kind: "in", seconds: 4 },
      { kind: "hold", seconds: 7 },
      { kind: "out", seconds: 8 },
    ],
    rounds: 4,
  },
} satisfies Record<string, { phases: Phase[]; rounds: number }>;
export type Rhythm = keyof typeof RHYTHMS;

const SCALE: Record<PhaseKind, number> = { in: 1, inTop: 1.12, hold: 1, out: 0.56 };

type State = { running: boolean; finished: boolean; index: number; round: number; left: number };
type Action = { type: "start"; phases: Phase[] } | { type: "stop" } | { type: "tick"; phases: Phase[]; rounds: number };
const IDLE: State = { running: false, finished: false, index: 0, round: 1, left: 0 };

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "start":
      return { running: true, finished: false, index: 0, round: 1, left: a.phases[0].seconds };
    case "stop":
      return { ...s, running: false };
    case "tick": {
      if (!s.running) return s;
      if (s.left > 1) return { ...s, left: s.left - 1 };
      const index = (s.index + 1) % a.phases.length;
      const round = index === 0 ? s.round + 1 : s.round;
      if (round > a.rounds) return { ...s, running: false, finished: true };
      return { ...s, index, round, left: a.phases[index].seconds };
    }
  }
}

/** Guided breathing orb. The orb grows on the in-breath and shrinks on the out-breath. */
export function Breathing({
  initial = "sigh",
  compact = false,
  onDone,
}: {
  initial?: Rhythm;
  compact?: boolean;
  onDone?: () => void;
}) {
  const t = useT();
  const [rhythm, setRhythm] = useState<Rhythm>(initial);
  const [haptics, setHaptics] = useState(true);
  const [{ running, finished, index, round, left }, dispatch] = useReducer(reduce, IDLE);

  const { phases, rounds } = RHYTHMS[rhythm] as { phases: Phase[]; rounds: number };
  const phase = phases[index];
  // Hold keeps the size of whatever came before it.
  const prevKind = phases[(index - 1 + phases.length) % phases.length].kind;
  const scale = !running ? 0.56 : phase.kind === "hold" ? SCALE[prevKind] : SCALE[phase.kind];

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => dispatch({ type: "tick", phases, rounds }), 1000);
    return () => window.clearInterval(id);
  }, [running, phases, rounds]);

  useEffect(() => {
    if (running && haptics && "vibrate" in navigator) navigator.vibrate(phase.kind === "hold" ? 15 : 35);
  }, [running, haptics, index, round, phase.kind]);

  useEffect(() => {
    if (finished) onDone?.();
    // Fire once per completed session, not when the parent re-renders with a new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const start = () => dispatch({ type: "start", phases });

  return (
    <div className="flex flex-col items-center">
      {!compact && (
        <div role="radiogroup" aria-label={t("calm.breathe.pick")} className="mb-6 grid w-full grid-cols-2 gap-2">
          {(["sigh", "box", "478", "slow"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rhythm === r}
              disabled={running}
              onClick={() => setRhythm(r)}
              className={cn(
                "rounded-2xl border px-3.5 py-3 text-left transition-[background-color,border-color] duration-200 disabled:opacity-60",
                rhythm === r ? "border-ink bg-ink text-bg" : "border-line bg-raised hover:border-ink/30",
              )}
            >
              <span className={cn("block text-sm font-semibold", rhythm === r ? "text-bg" : "text-ink")}>{t(`calm.breathe.${r}`)}</span>
              <span className={cn("block text-xs leading-snug", rhythm === r ? "text-bg/70" : "text-ink-faint")}>{t(`calm.breathe.${r}Sub`)}</span>
            </button>
          ))}
        </div>
      )}

      <div className={cn("relative flex items-center justify-center", compact ? "h-56 w-56" : "h-72 w-72")}>
        {running && (
          <span aria-hidden className="animate-ripple absolute inset-6 rounded-full border-2 border-[var(--aura-a)]" />
        )}
        <div
          aria-hidden
          className="absolute inset-4 rounded-full shadow-[0_24px_70px_-12px_var(--aura-a)]"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, #ffffffb0, transparent 42%), radial-gradient(circle at 70% 80%, var(--aura-b), transparent 60%), linear-gradient(135deg, var(--aura-a), var(--aura-b))",
            transform: `scale(${scale})`,
            transition: `transform ${running ? phase.seconds : 0.6}s cubic-bezier(0.45, 0, 0.55, 1)`,
          }}
        />
        <div className="relative text-center" aria-live="polite">
          {running ? (
            <>
              <p className="font-display text-3xl text-[#1e1a26]">{t(`calm.breathe.${phase.kind}`)}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-[#1e1a26]/70">{Math.max(left, 1)}</p>
            </>
          ) : finished ? (
            <p className="max-w-40 font-display text-2xl leading-tight text-[#1e1a26]">{t("calm.breathe.done")}</p>
          ) : null}
        </div>
      </div>

      {running && <p className="mt-2 text-sm font-medium text-ink-faint">{t("calm.breathe.round", { count: `${round}/${rounds}` })}</p>}

      <div className="mt-5 flex items-center gap-3">
        {running ? (
          <Button variant="secondary" onClick={() => dispatch({ type: "stop" })}>
            {t("calm.breathe.stop")}
          </Button>
        ) : (
          <Button size="lg" variant="accent" onClick={start} className="min-w-40">
            {finished ? t("app.retry") : t("calm.breathe.start")}
          </Button>
        )}
      </div>
      {!compact && (
        <div className="mt-6 w-full max-w-sm space-y-1">
          <Toggle checked={haptics} onChange={setHaptics} label={t("calm.breathe.haptics")} />
          <p className="text-center text-xs text-ink-faint">{t("calm.breathe.tip")}</p>
        </div>
      )}
    </div>
  );
}
