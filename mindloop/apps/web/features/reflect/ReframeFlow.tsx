"use client";

import { useState, type ReactNode } from "react";
import { Burst } from "@/components/Burst";
import { FlowHeader, StepActions, StepTitle } from "@/components/Flow";
import { BulbIcon } from "@/components/icons";
import { Button, ButtonLink, Card, Notice, TextArea, cn, stagger } from "@/components/ui";
import { SupportCard } from "@/features/checkin/SupportCard";
import { ApiError, api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Distortion, ReflectionResult } from "@/lib/types";
import { JournalOff } from "./JournalOff";

export const DISTORTIONS: Distortion[] = [
  "all_or_nothing",
  "catastrophizing",
  "mind_reading",
  "fortune_telling",
  "overgeneralizing",
  "labeling",
  "should_statements",
  "emotional_reasoning",
  "discounting_positive",
  "personalizing",
  "mental_filter",
  "comparing",
];
export const MAX_TRAPS = 4;
const STEPS = 5;

/**
 * A guided CBT thought record, one question per screen: what happened, the thought and how true it
 * feels, any thinking traps, the evidence both ways, and a more balanced view. Re-rating the original
 * thought at the end makes the shift visible.
 */
export function ReframeFlow() {
  const t = useT();
  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState("");
  const [thought, setThought] = useState("");
  const [before, setBefore] = useState(70);
  const [traps, setTraps] = useState<Distortion[]>([]);
  const [evidenceFor, setEvidenceFor] = useState("");
  const [evidenceAgainst, setEvidenceAgainst] = useState("");
  const [balanced, setBalanced] = useState("");
  const [after, setAfter] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"journal_off" | "error" | null>(null);
  const [result, setResult] = useState<ReflectionResult | null>(null);

  const toggleTrap = (d: Distortion) =>
    setTraps((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : cur.length < MAX_TRAPS ? [...cur, d] : cur));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.createReflection({
        kind: "reframe",
        situation: situation.trim(),
        thought: thought.trim(),
        belief_before: before,
        distortions: traps,
        evidence_for: evidenceFor.trim(),
        evidence_against: evidenceAgainst.trim(),
        balanced: balanced.trim(),
        belief_after: after ?? before,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "journal_off" ? "journal_off" : "error");
    } finally {
      setSaving(false);
    }
  }

  if (result) return <ReframeDone result={result} />;

  const eyebrow = t("reframe.eyebrow", { current: step + 1, total: STEPS });
  const next = (
    <Button size="lg" block onClick={() => setStep((s) => s + 1)}>
      {t("reframe.next")}
    </Button>
  );

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col">
      <FlowHeader step={step} total={STEPS} onBack={() => setStep((s) => Math.max(0, s - 1))} closeHref="/reflect" />

      <div key={step} className="flex flex-1 flex-col pt-6">
        {step === 0 && (
          <>
            <StepTitle eyebrow={eyebrow}>{t("reframe.situationTitle")}</StepTitle>
            <Hint>{t("reframe.situationHint")}</Hint>
            <Answer
              value={situation}
              onChange={setSituation}
              label={t("reframe.situationTitle")}
              placeholder={t("reframe.situationPlaceholder")}
            />
            <StepActions>
              <Button size="lg" block onClick={() => setStep(1)}>
                {situation.trim() ? t("reframe.next") : t("reframe.skip")}
              </Button>
            </StepActions>
          </>
        )}

        {step === 1 && (
          <>
            <StepTitle eyebrow={eyebrow}>{t("reframe.thoughtTitle")}</StepTitle>
            <Hint>{t("reframe.thoughtHint")}</Hint>
            <Answer
              value={thought}
              onChange={setThought}
              label={t("reframe.thoughtTitle")}
              placeholder={t("reframe.thoughtPlaceholder")}
            />
            <BeliefSlider label={t("reframe.beliefLabel")} value={before} onChange={setBefore} />
            <StepActions>
              <Button size="lg" block disabled={!thought.trim()} onClick={() => setStep(2)}>
                {t("reframe.next")}
              </Button>
            </StepActions>
          </>
        )}

        {step === 2 && (
          <>
            <StepTitle eyebrow={eyebrow}>{t("reframe.trapsTitle")}</StepTitle>
            <Hint>
              {t("reframe.trapsHint")} {t("reframe.trapsMax", { max: MAX_TRAPS })}
            </Hint>
            <ThoughtQuote>{thought}</ThoughtQuote>
            <ul className="animate-rise mt-5 grid gap-2 sm:grid-cols-2" style={stagger(2)}>
              {DISTORTIONS.map((d) => {
                const on = traps.includes(d);
                return (
                  <li key={d}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={!on && traps.length >= MAX_TRAPS}
                      onClick={() => toggleTrap(d)}
                      className={cn(
                        "flex h-full w-full flex-col rounded-2xl border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-200 active:scale-[0.98] disabled:opacity-45",
                        on ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-ink/25",
                      )}
                    >
                      <span className="text-[15px] font-semibold text-ink">{t(`distortions.${d}.label`)}</span>
                      <span className="mt-0.5 text-[13px] leading-snug text-ink-faint">{t(`distortions.${d}.desc`)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <StepActions>
              <Button size="lg" block onClick={() => setStep(3)}>
                {traps.length ? t("reframe.next") : t("reframe.skip")}
              </Button>
            </StepActions>
          </>
        )}

        {step === 3 && (
          <>
            <StepTitle eyebrow={eyebrow}>{t("reframe.evidenceTitle")}</StepTitle>
            <ThoughtQuote>{thought}</ThoughtQuote>
            <Answer
              value={evidenceFor}
              onChange={setEvidenceFor}
              label={t("reframe.forLabel")}
              placeholder={t("reframe.forPlaceholder")}
              visibleLabel
              small
            />
            <Answer
              value={evidenceAgainst}
              onChange={setEvidenceAgainst}
              label={t("reframe.againstLabel")}
              placeholder={t("reframe.againstPlaceholder")}
              visibleLabel
              small
            />
            <StepActions>{next}</StepActions>
          </>
        )}

        {step === 4 && (
          <>
            <StepTitle eyebrow={eyebrow}>{t("reframe.balancedTitle")}</StepTitle>
            <Hint>{t("reframe.balancedHint")}</Hint>
            <Answer
              value={balanced}
              onChange={setBalanced}
              label={t("reframe.balancedTitle")}
              placeholder={t("reframe.balancedPlaceholder")}
            />
            <BeliefSlider label={t("reframe.beliefAfterLabel")} value={after ?? before} onChange={setAfter} />
            {error === "journal_off" && <JournalOff className="mt-4" />}
            {error === "error" && (
              <Notice tone="care" className="mt-4">
                {t("app.error")}
              </Notice>
            )}
            <StepActions>
              <Button size="lg" variant="accent" block loading={saving} onClick={save}>
                {t("reframe.save")}
              </Button>
            </StepActions>
          </>
        )}
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="animate-rise mt-2 px-1 text-[15px] leading-relaxed text-ink-soft" style={stagger(1)}>
      {children}
    </p>
  );
}

function ThoughtQuote({ children }: { children: string }) {
  if (!children.trim()) return null;
  return (
    <blockquote
      className="animate-rise mt-5 rounded-2xl border-l-4 border-accent bg-surface-2/70 px-4 py-3 font-quote text-xl italic leading-snug text-ink"
      style={stagger(1)}
    >
      “{children.trim()}”
    </blockquote>
  );
}

function Answer({
  value,
  onChange,
  label,
  placeholder,
  visibleLabel,
  small,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  visibleLabel?: boolean;
  small?: boolean;
}) {
  return (
    <label className="animate-rise mt-5 block" style={stagger(2)}>
      <span className={visibleLabel ? "mb-2 block px-1 text-sm font-medium text-ink" : "sr-only"}>{label}</span>
      <TextArea
        value={value}
        maxLength={1000}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={small ? "min-h-24 text-base" : "min-h-36 text-base"}
      />
    </label>
  );
}

/** 0–100 "how true does it feel" rating. A native range input, so it works with keyboards and screen readers. */
export function BeliefSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="animate-rise mt-6 rounded-[var(--radius-card)] bg-surface-2/70 p-4" style={stagger(3)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="belief" className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="font-display text-2xl font-semibold tabular-nums text-ink" aria-hidden>
          {value}%
        </span>
      </div>
      <input
        id="belief"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value}%`}
        className="mt-3 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

function ReframeDone({ result }: { result: ReflectionResult }) {
  const t = useT();
  const r = result.reflection;
  const high = result.support?.level === "high";
  const before = r.belief_before ?? null;
  const afterV = r.belief_after ?? null;
  const shifted = before !== null && afterV !== null && afterV < before;
  return (
    <div className="space-y-5 pb-6 pt-4">
      {result.support && <SupportCard support={result.support} />}
      {!high && (
        <div className="animate-rise flex flex-col items-center pt-6 text-center">
          <div className="relative flex h-28 w-28 items-center justify-center">
            <span aria-hidden className="absolute inset-0 rounded-full bg-accent opacity-25 blur-2xl" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-accent text-on-accent">
              <BulbIcon className="h-10 w-10" />
            </span>
            <Burst />
          </div>
          <p className="mt-4 text-[13px] font-medium text-ink-faint">{t("reframe.doneEyebrow")}</p>
          <h1 className="mt-1 font-display text-[2.2rem] font-semibold leading-none tracking-[-0.035em] text-ink">
            {t("reframe.doneTitle")}
          </h1>
          <p className="mt-3 max-w-xs text-[15px] text-ink-soft">{t("reframe.doneBody")}</p>
        </div>
      )}
      {!high && before !== null && afterV !== null && (
        <Card className="animate-rise" style={stagger(1)}>
          <BeliefBars before={before} after={afterV} />
          <p className="mt-4 text-[15px] text-ink">
            {shifted ? t("reframe.shift", { before, after: afterV }) : t("reframe.shiftNone")}
          </p>
        </Card>
      )}
      {r.balanced && (
        <p className="animate-rise px-1 font-quote text-[1.6rem] italic leading-[1.2] text-ink text-balance" style={stagger(2)}>
          “{r.balanced}”
        </p>
      )}
      <div className="space-y-2">
        <ButtonLink href="/reflect" variant="secondary" block size="lg">
          {t("reframe.back")}
        </ButtonLink>
        {!high && (
          <ButtonLink href="/reflect/reframe" variant="ghost" block>
            {t("reframe.another")}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/** Two horizontal bars: how believable the thought was before and after. */
export function BeliefBars({ before, after }: { before: number; after: number }) {
  const t = useT();
  const rows: Array<[string, number, string]> = [
    [t("reflect.before"), before, "bg-ink/25"],
    [t("reflect.after"), after, "bg-accent"],
  ];
  return (
    <div className="space-y-2.5" role="img" aria-label={t("reflect.believed", { before, after })}>
      {rows.map(([label, v, color]) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-[13px] text-ink-faint">{label}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span className={cn("block h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${v}%` }} />
          </span>
          <span className="w-10 text-right text-sm font-semibold tabular-nums text-ink">{v}%</span>
        </div>
      ))}
    </div>
  );
}
