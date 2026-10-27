"use client";

import { useEffect, useState } from "react";
import { Burst } from "@/components/Burst";
import { SparkIcon } from "@/components/icons";
import { Button, Card, cn } from "@/components/ui";
import { Breathing } from "@/features/calm/Breathing";
import { Grounding } from "@/features/calm/Grounding";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { bump } from "@/lib/progress";
import type { ActionOut, FeedbackRating } from "@/lib/types";

const RATINGS: Array<{ r: FeedbackRating; emoji: string }> = [
  { r: "a_lot", emoji: "🌟" },
  { r: "a_little", emoji: "🙂" },
  { r: "not_really", emoji: "😐" },
  { r: "worse", emoji: "🌧️" },
];

function formatTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** One suggested action. The user starts it, optionally runs a timer, marks it done and says whether it helped. */
export function ActionCard({
  action: initial,
  lead,
  compact = false,
}: {
  action: ActionOut;
  lead?: string | null;
  compact?: boolean;
}) {
  const t = useT();
  const [action, setAction] = useState(initial);
  const [phase, setPhase] = useState<"idle" | "running" | "feedback" | "done">(
    initial.feedback ? "done" : initial.status === "completed" ? "feedback" : "idle",
  );
  const [remaining, setRemaining] = useState(initial.duration_minutes * 60);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (phase !== "running" || paused || remaining <= 0) return;
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [phase, paused, remaining]);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(false);
    try {
      return await fn();
    } catch {
      setError(true);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setPhase("running"); // optimistic: the timer starts immediately
    setRemaining(action.duration_minutes * 60);
    await run(() => api.startAction(action.assignment_id));
  }

  async function finish() {
    const updated = await run(() => api.completeAction(action.assignment_id));
    if (updated) setAction(updated);
    setPhase("feedback");
  }

  async function rate(rating: FeedbackRating) {
    const updated = await run(() => api.feedback(action.assignment_id, rating));
    if (updated) {
      setAction(updated);
      setPhase("done");
      bump("action");
    }
  }

  async function somethingElse() {
    const next = await run(() => api.alternative(action.assignment_id));
    if (next) {
      setAction(next);
      setPhase("idle");
      setRemaining(next.duration_minutes * 60);
    }
  }

  // Some actions have an interactive version instead of a list of steps and a timer.
  const guided = action.category === "breathing" ? "breathing" : action.slug.startsWith("grounding_") ? "grounding" : null;
  const reasons = action.reasons.map((r) => t(`action.reasons.${r}`)).filter((r) => r && !r.startsWith("action."));

  return (
    <Card className={cn("animate-rise relative overflow-hidden", compact && "p-4 sm:p-5")}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-fg">
          <SparkIcon className="h-4 w-4" />
          {(lead ?? t("action.lead")).replace(/:$/, "")}
        </p>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium tabular-nums text-ink-soft">
          {t("library.minutes", { minutes: action.duration_minutes })}
        </span>
      </div>
      <h3 className="mt-3 text-[1.35rem] font-semibold leading-snug tracking-[-0.02em] text-ink">{action.content.title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft text-pretty">{action.content.summary}</p>

      {phase === "running" && guided && (
        <div className="mt-6 space-y-5">
          {guided === "breathing" ? <Breathing initial="slow" compact /> : <Grounding />}
          <Button block onClick={finish} loading={busy}>
            {t("action.done")}
          </Button>
        </div>
      )}

      {phase === "running" && !guided && (
        <div className="mt-4 space-y-4">
          <ol className="space-y-2 text-[15px] text-ink">
            {action.content.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-bg">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <TimerRing fraction={remaining / Math.max(1, action.duration_minutes * 60)} />
            <p className="flex-1 font-display text-2xl tabular-nums text-ink" aria-live="polite">
              {remaining > 0 ? t("action.remaining", { time: formatTime(remaining) }) : t("action.timeUp")}
            </p>
            <div className="flex gap-2">
              {remaining > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
                  {paused ? t("action.resume") : t("action.pause")}
                </Button>
              )}
              <Button size="sm" onClick={finish} loading={busy}>
                {t("action.done")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "idle" && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button onClick={start}>{t("action.start", { minutes: action.duration_minutes })}</Button>
          <Button variant="ghost" size="sm" onClick={somethingElse} disabled={busy}>
            {t("action.somethingElse")}
          </Button>
        </div>
      )}

      {phase === "feedback" && (
        <fieldset className="mt-5">
          <legend className="text-[15px] font-medium text-ink">{t("action.feedbackQuestion")}</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map(({ r, emoji }) => (
              <button
                key={r}
                type="button"
                onClick={() => rate(r)}
                disabled={busy}
                className="flex items-center gap-2 rounded-2xl border border-line bg-raised px-3 py-3 text-left text-sm font-medium text-ink transition-[transform,border-color] hover:border-ink/30 active:scale-[0.97] disabled:opacity-50"
              >
                <span aria-hidden className="text-lg">
                  {emoji}
                </span>
                {t(`action.feedback.${r}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {phase === "done" && (
        <>
          {action.feedback !== "worse" && <Burst count={14} distance={70} />}
          <p className="mt-4 rounded-2xl bg-green-soft px-4 py-3 text-sm leading-relaxed text-ink" role="status">
            {action.feedback === "worse" ? t("action.worseNote") : t("action.thanks")}
          </p>
        </>
      )}

      {phase !== "feedback" && phase !== "done" && (
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="mt-4 text-sm text-ink-faint underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t("action.why")}
        </button>
      )}
      {showWhy && (
        <div className="mt-2 space-y-1 text-sm text-ink-soft">
          <p>{action.content.why}</p>
          {reasons.map((r) => (
            <p key={r}>• {r}</p>
          ))}
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-care" role="alert">
          {t("app.error")}
        </p>
      )}
    </Card>
  );
}

function TimerRing({ fraction }: { fraction: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" aria-hidden className="h-9 w-9 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}
