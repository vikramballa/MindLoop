"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Burst } from "@/components/Burst";
import { ConnectIcon, TalkIcon } from "@/components/icons";
import { FlowHeader, StepActions, StepTitle } from "@/components/Flow";
import { MoodFace } from "@/components/MoodFace";
import { Plant } from "@/components/Plant";
import { Button, ButtonLink, Card, Chip, Notice, Segmented, TextArea, cn, stagger } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { FEELINGS_FOR_MOOD, LONELY_FEELINGS, dayOfYear, localDate, setAura, type Feeling } from "@/lib/mood";
import type { CheckInResult, Topic } from "@/lib/types";
import { ActionCard } from "./ActionCard";
import { FeelingPicker, MAX_FEELINGS } from "./FeelingPicker";
import { MoodPicker } from "./MoodPicker";
import { SupportCard } from "./SupportCard";

export const TOPICS: Topic[] = [
  "study_work",
  "relationships",
  "family",
  "money",
  "sleep",
  "loneliness",
  "health",
  "social_media",
  "other",
];

const PROMPT_COUNT = 30;
/** Index of today's reflection prompt. Everyone gets the same one on a given day. */
export const todaysPrompt = () => dayOfYear() % PROMPT_COUNT;

const STEPS = 4;

/**
 * Full-screen check-in: mood, then feeling words, then what it's about, then an optional note.
 * One question per screen with big tap targets. Picking a mood moves on by itself, so the
 * whole thing takes about ten seconds.
 */
export function CheckInFlow({
  initialMood = null,
  usePrompt = false,
  onDone,
}: {
  initialMood?: number | null;
  usePrompt?: boolean;
  onDone?: (r: CheckInResult) => void;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(initialMood ? 1 : 0);
  const [mood, setMood] = useState<number | null>(initialMood);
  const [feelings, setFeelings] = useState<Feeling[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [note, setNote] = useState("");
  const [details, setDetails] = useState(false);
  const [stress, setStress] = useState<number | null>(null);
  const [sleep, setSleep] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const advance = useRef<number | undefined>(undefined);
  const prompt = t(`prompts.${todaysPrompt()}`);

  useEffect(() => {
    if (initialMood) setAura(initialMood);
    return () => window.clearTimeout(advance.current);
  }, [initialMood]);

  usePoll<CheckInResult>({
    key: pendingId,
    fetcher: (signal) => api.checkIn(pendingId as string, signal),
    isDone: (r) => r.status !== "processing",
    onResult: (r) => {
      setPendingId(null);
      setResult(r);
      onDone?.(r);
    },
    onTimeout: () => {
      setPendingId(null);
      setError(t("app.error"));
    },
  });

  function chooseMood(m: number) {
    if (mood === null) void api.track("checkin_started");
    setMood(m);
    setAura(m);
    setFeelings((cur) => cur.filter((f) => FEELINGS_FOR_MOOD[m].includes(f)).slice(0, MAX_FEELINGS));
    if ("vibrate" in navigator) navigator.vibrate(12);
    window.clearTimeout(advance.current);
    advance.current = window.setTimeout(() => setStep(1), 420);
  }

  function toggle(topic: Topic) {
    setTopics((cur) => (cur.includes(topic) ? cur.filter((x) => x !== topic) : [...cur, topic]));
  }

  async function submit(goTalk = false) {
    if (mood === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const sleepHours = sleep.trim() === "" ? null : Number(sleep);
      const text = note.trim();
      const r = await api.createCheckIn({
        mood,
        feelings,
        topics,
        stress,
        sleep_hours: sleepHours !== null && !Number.isNaN(sleepHours) ? sleepHours : null,
        note: text || null,
        source: text ? "text" : "tap",
        local_date: localDate(),
      });
      if (goTalk) {
        router.push("/talk");
        return;
      }
      if (r.status === "processing") setPendingId(r.id);
      else {
        setResult(r);
        onDone?.(r);
      }
    } catch {
      setError(t("app.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingId) return <Processing mood={mood ?? 3} />;
  if (result) return <CheckInComplete result={result} />;

  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col">
      <FlowHeader step={step} total={STEPS} onBack={back} closeHref="/home" />

      <div key={step} className="flex flex-1 flex-col pt-6">
        {step === 0 && (
          <>
            <StepTitle eyebrow={new Date().toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long" })}>
              {t("mood.question")}
            </StepTitle>
            <div className="animate-rise my-auto flex justify-center py-8" style={stagger(1)}>
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 scale-125 rounded-full opacity-60 blur-3xl"
                  style={{ background: "linear-gradient(135deg, var(--aura-a), var(--aura-b))" }}
                />
                <MoodFace mood={mood ?? 3} className={cn("h-40 w-40", mood ? "animate-pop" : "animate-orb")} key={mood ?? 0} />
              </div>
            </div>
            <div className="animate-rise" style={stagger(2)}>
              <MoodPicker value={mood} onChange={chooseMood} />
              <p className="mt-6 text-center text-sm text-ink-faint">{t("checkin.moodHint")}</p>
            </div>
          </>
        )}

        {step === 1 && mood !== null && (
          <>
            <StepTitle eyebrow={t(`mood.${mood}`)} face={mood}>
              {t("feelings.question")}
            </StepTitle>
            <p className="animate-rise mt-2 px-1 text-[15px] text-ink-soft" style={stagger(1)}>
              {t("feelings.hint")}
            </p>
            <div className="animate-rise mt-6" style={stagger(2)}>
              <FeelingPicker mood={mood} value={feelings} onChange={setFeelings} />
            </div>
            <StepActions>
              <Button size="lg" block onClick={() => setStep(2)}>
                {feelings.length ? t("checkin.next") : t("checkin.skipStep")}
              </Button>
            </StepActions>
          </>
        )}

        {step === 2 && (
          <>
            <StepTitle eyebrow={t("checkin.stepContext")}>{t("topics.question")}</StepTitle>
            <p className="animate-rise mt-2 px-1 text-[15px] text-ink-soft" style={stagger(1)}>
              {t("topics.hint")}
            </p>
            <div className="animate-rise mt-6 flex flex-wrap gap-2" style={stagger(2)}>
              {TOPICS.map((topic) => (
                <Chip key={topic} selected={topics.includes(topic)} onClick={() => toggle(topic)}>
                  {t(`topics.${topic}`)}
                </Chip>
              ))}
            </div>
            {!details ? (
              <button
                type="button"
                className="mt-6 self-start px-1 text-sm font-medium text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
                onClick={() => setDetails(true)}
              >
                {t("checkin.moreDetails")}
              </button>
            ) : (
              <div className="animate-rise mt-7 space-y-5 rounded-[var(--radius-card)] bg-surface-2/70 p-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">{t("checkin.stress")}</p>
                  <Segmented
                    block
                    label={t("checkin.stress")}
                    value={stress}
                    onChange={setStress}
                    options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))}
                  />
                  <p className="mt-1.5 flex justify-between px-1 text-xs text-ink-faint">
                    <span>{t("checkin.stressLow")}</span>
                    <span>{t("checkin.stressHigh")}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="sleep" className="text-sm font-medium text-ink">
                    {t("checkin.sleep")}
                  </label>
                  <input
                    id="sleep"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={16}
                    step={0.5}
                    value={sleep}
                    placeholder="7"
                    onChange={(e) => setSleep(e.target.value)}
                    className="h-11 w-24 rounded-2xl border border-line bg-raised px-4 text-center text-ink tabular-nums focus:border-ink/40 focus:outline-none"
                  />
                </div>
              </div>
            )}
            <StepActions>
              <Button size="lg" block onClick={() => setStep(3)}>
                {topics.length ? t("checkin.next") : t("checkin.skipStep")}
              </Button>
            </StepActions>
          </>
        )}

        {step === 3 && (
          <>
            <StepTitle eyebrow={usePrompt ? t("checkin.promptEyebrow") : t("checkin.optional")}>
              {usePrompt ? prompt : t("checkin.tellMe")}
            </StepTitle>
            <div className="animate-rise mt-6" style={stagger(1)}>
              <TextArea
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
                placeholder={usePrompt ? t("checkin.notePlaceholder") : prompt}
                aria-label={usePrompt ? prompt : t("checkin.tellMe")}
                className="min-h-40 text-base"
              />
              <p className="mt-2 px-1 text-xs text-ink-faint">{t("checkin.privacyNote")}</p>
            </div>
            {error && <Notice tone="care" className="mt-4">{error}</Notice>}
            <StepActions>
              <Button size="lg" variant="accent" block onClick={() => submit()} loading={submitting}>
                {t("checkin.submit")}
              </Button>
              <Button variant="ghost" block onClick={() => submit(true)} disabled={submitting}>
                <TalkIcon className="h-4 w-4" />
                {t("checkin.talk")}
              </Button>
            </StepActions>
          </>
        )}
      </div>
    </div>
  );
}

function Processing({ mood }: { mood: number }) {
  const t = useT();
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center text-center" role="status">
      <div className="relative">
        <span aria-hidden className="animate-ripple absolute inset-0 rounded-full bg-[var(--aura-a)]" />
        <MoodFace mood={mood} className="relative h-28 w-28 animate-orb" />
      </div>
      <p className="mt-8 font-display text-3xl text-ink">{t("checkin.processing")}</p>
    </div>
  );
}

/** The reward moment: a burst, a new plant, then the reflection and one small action. */
function CheckInComplete({ result }: { result: CheckInResult }) {
  const t = useT();
  const high = result.risk_level === "high";
  return (
    <div className="space-y-5 pb-6 pt-4">
      {!high && (
        <div className="animate-rise flex flex-col items-center pt-6 text-center">
          <div className="relative flex h-36 w-36 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-2 rounded-full opacity-70 blur-2xl"
              style={{ background: "linear-gradient(135deg, var(--aura-a), var(--aura-b))" }}
            />
            <Plant mood={result.mood} className="animate-sprout relative h-28 w-20" />
            <Burst />
          </div>
          <p className="mt-4 text-[13px] font-medium text-ink-faint">{t("checkin.doneEyebrow")}</p>
          <h1 className="mt-1 font-display text-[2.4rem] leading-none tracking-[-0.035em] text-ink">{t("checkin.doneTitle")}</h1>
          <p className="mt-3 max-w-xs text-[15px] text-ink-soft">
            {result.mood <= 2 ? t("checkin.doneLow") : t("checkin.doneBody")}
          </p>
        </div>
      )}
      <CheckInResultView result={result} />
      <ButtonLink href="/home" variant="secondary" block size="lg">
        {t("checkin.backHome")}
      </ButtonLink>
    </div>
  );
}

export function CheckInResultView({ result }: { result: CheckInResult }) {
  const high = result.risk_level === "high";
  useEffect(() => {
    if (!high) setAura(result.mood);
  }, [high, result.mood]);
  const lonely =
    !high &&
    (result.topics.includes("loneliness") || result.feelings.some((f) => LONELY_FEELINGS.includes(f as Feeling)));
  return (
    <div className="space-y-4">
      {result.support && <SupportCard support={result.support} />}
      {result.reflection && !high && (
        <p className="animate-rise px-1 font-quote text-[1.8rem] leading-[1.2] text-ink text-balance" style={stagger(2)}>
          {result.reflection}
        </p>
      )}
      {result.action && result.support?.allow_continue !== false && (
        <ActionCard action={result.action} lead={result.action_lead} />
      )}
      {lonely && <LonelyNudge />}
    </div>
  );
}

function LonelyNudge() {
  const t = useT();
  return (
    <Card className="animate-rise flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg">
        <ConnectIcon className="h-6 w-6" />
      </span>
      <div>
        <p className="text-[15px] leading-relaxed text-ink">{t("home.lonelyNudge")}</p>
        <ButtonLink href="/connect" size="sm" className="mt-3">
          {t("home.lonelyCta")}
        </ButtonLink>
      </div>
    </Card>
  );
}
