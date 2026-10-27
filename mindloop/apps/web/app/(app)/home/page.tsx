"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  ArrowRightIcon,
  BookIcon,
  BulbIcon,
  ChevronRightIcon,
  ConnectIcon,
  HandIcon,
  LifebuoyIcon,
  MoonIcon,
  SoundIcon,
  SparkIcon,
  SunIcon,
  WindIcon,
} from "@/components/icons";
import { MoodFace } from "@/components/MoodFace";
import { Plant } from "@/components/Plant";
import { Card, Notice, PageSkeleton, SectionTitle, cn, stagger } from "@/components/ui";
import { CheckInResultView, todaysPrompt } from "@/features/checkin/CheckInFlow";
import { MoodPicker } from "@/features/checkin/MoodPicker";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { FEELING_EMOJI, parseDay, partOfDay, setAura, type Feeling } from "@/lib/mood";
import { blooms as toBlooms } from "@/lib/progress";
import type { CommunityPulse, DayMood, HomeResponse, PatternOut } from "@/lib/types";

export default function HomePage() {
  const { t, language } = useI18n();
  const router = useRouter();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [insight, setInsight] = useState<PatternOut | null>(null);
  const [planted, setPlanted] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .home(controller.signal)
      .then((h) => {
        setHome(h);
        if (h.today && h.today.risk_level !== "high") setAura(h.today.mood);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    api
      .patterns(controller.signal)
      .then((p) => setInsight(p.ready ? (p.patterns[0] ?? null) : null))
      .catch(() => undefined);
    api
      .history(controller.signal, 100)
      .then((h) => setPlanted(toBlooms(h).length))
      .catch(() => undefined);
    void api.track("app_opened");
    return () => controller.abort();
  }, []);

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!home) return <PageSkeleton label={t("app.loading")} />;

  const part = partOfDay();
  const today = home.today;
  const date = new Date().toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-8">
      <header className="animate-rise px-1">
        <p className="text-[13px] font-medium text-ink-faint">{home.welcome_back ?? date}</p>
        <h1 className="mt-2 font-display text-[2.6rem] leading-[1.02] tracking-[-0.035em] text-ink sm:text-[3.1rem]">
          {t(`home.${part}`)}
          {home.display_name && (
            <>
              {/[?!]$/.test(t(`home.${part}`)) ? "" : ","}
              <br />
              <em className="font-quote font-normal tracking-normal text-accent-fg">{home.display_name}.</em>
            </>
          )}
        </h1>
        {part === "night" && <p className="mt-3 max-w-sm text-[15px] text-ink-soft">{t("home.nightSub")}</p>}
      </header>

      {today ? (
        <section aria-labelledby="today-title" className="space-y-4">
          <Card className="animate-rise flex items-center gap-4" style={stagger(1)}>
            <MoodFace mood={today.mood} className="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p id="today-title" className="text-[13px] font-medium text-ink-faint">
                {t("home.todayTitle")}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {[t(`mood.${today.mood}`), ...today.feelings.map((f) => t(`feelings.${f}`).toLowerCase())].join(" · ")}
              </p>
            </div>
            <Link
              href="/check-in"
              className="shrink-0 rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
            >
              {t("checkin.again")}
            </Link>
          </Card>
          <CheckInResultView result={today} />
        </section>
      ) : (
        <section aria-labelledby="checkin-title" className="card animate-rise relative overflow-hidden p-5 sm:p-7" style={stagger(1)}>
          <span
            aria-hidden
            className="absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-50 blur-3xl"
            style={{ background: "linear-gradient(135deg, var(--aura-a), var(--aura-b))" }}
          />
          <div className="relative">
            <h2 id="checkin-title" className="font-display text-[2rem] leading-[1.05] tracking-[-0.035em] text-ink">
              {t("mood.question")}
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">{t("home.checkinSub")}</p>
            <div className="mt-6">
              <MoodPicker value={null} size="md" onChange={(m) => router.push(`/check-in?mood=${m}`)} />
            </div>
          </div>
        </section>
      )}

      <PromptCard />

      <QuickTools part={part} />

      <WeekGarden week={home.week} days={home.days_checked_in_7d} planted={planted} />

      {home.community && <Pulse pulse={home.community} mine={(today?.feelings ?? []) as Feeling[]} />}

      <PlanLink />

      {insight && (
        <Link href="/journey" className="group block animate-rise" style={stagger(6)}>
          <Card className="flex items-start gap-4 transition-transform duration-200 group-active:scale-[0.99]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent">
              <SparkIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink-faint">{t("home.insightTitle")}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink text-pretty">{insight.statement}</p>
            </div>
            <ChevronRightIcon className="mt-3 h-5 w-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
          </Card>
        </Link>
      )}
    </div>
  );
}

function PromptCard() {
  const { t } = useI18n();
  return (
    <Link href="/check-in?prompt=1" className="group block animate-rise" style={stagger(2)}>
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-feature p-6 text-on-feature transition-transform duration-200 group-active:scale-[0.99]">
        <span aria-hidden className="absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-accent opacity-25 blur-2xl" />
        <p className="relative flex items-center gap-2 text-[13px] font-medium opacity-70">
          <BookIcon className="h-4 w-4" />
          {t("home.promptTitle")}
        </p>
        <p className="relative mt-3 font-quote text-[1.85rem] italic leading-[1.15] text-balance">{t(`prompts.${todaysPrompt()}`)}</p>
        <p className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[color-mix(in_oklab,var(--accent)_55%,#fff)]">
          {t("home.promptCta")}
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </p>
      </section>
    </Link>
  );
}

type Tool = { href: string; key: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; tint: [string, string] };

const TOOLS: Record<string, Tool> = {
  breathe: { href: "/calm?tool=breathe", key: "breathe", Icon: WindIcon, tint: ["#a4aeff", "#7b80f0"] },
  ground: { href: "/calm?tool=ground", key: "ground", Icon: HandIcon, tint: ["#8ee6c4", "#4fc3b0"] },
  sounds: { href: "/calm?tool=sounds", key: "sounds", Icon: SoundIcon, tint: ["#d3d5ee", "#a3add9"] },
  sleep: { href: "/calm?tool=breathe&rhythm=478", key: "sleep", Icon: MoonIcon, tint: ["#9d8aec", "#dd8fc2"] },
  connect: { href: "/connect", key: "connect", Icon: ConnectIcon, tint: ["#ffd76a", "#ff9f5a"] },
  actions: { href: "/calm?tool=actions", key: "actions", Icon: SparkIcon, tint: ["#e3f59a", "#b5e04a"] },
  reframe: { href: "/reflect/reframe", key: "reframe", Icon: BulbIcon, tint: ["#b7a9ff", "#6553e6"] },
  gratitude: { href: "/reflect/gratitude", key: "gratitude", Icon: SunIcon, tint: ["#ffe08a", "#ffb84d"] },
};

/** Ordered for the time of day: the first (wide) tile is the one most likely to help right now. */
const ORDER: Record<ReturnType<typeof partOfDay>, string[]> = {
  morning: ["breathe", "reframe", "actions", "connect", "gratitude"],
  afternoon: ["breathe", "reframe", "ground", "actions", "connect"],
  evening: ["gratitude", "reframe", "connect", "breathe", "sounds"],
  night: ["sleep", "gratitude", "sounds", "ground", "reframe"],
};

function QuickTools({ part }: { part: ReturnType<typeof partOfDay> }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="tools-title" className="animate-rise" style={stagger(3)}>
      <SectionTitle id="tools-title">{t("home.toolsTitle")}</SectionTitle>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ORDER[part].map((k, i) => {
          const { href, key, Icon, tint } = TOOLS[k];
          const wide = i === 0;
          return (
            <li key={key} className={cn(wide && "col-span-2")}>
              <Link
                href={href}
                className={cn(
                  "card lift group relative flex h-full overflow-hidden p-4",
                  wide ? "min-h-36 items-end justify-between gap-4" : "min-h-36 flex-col justify-between",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute rounded-full opacity-60 blur-2xl transition-transform duration-500 group-hover:scale-110",
                    wide ? "-right-10 -top-16 h-44 w-44" : "-right-8 -top-8 h-28 w-28",
                  )}
                  style={{ background: `linear-gradient(135deg, ${tint[0]}, ${tint[1]})` }}
                />
                <span className={cn("relative flex h-10 w-10 items-center justify-center rounded-xl bg-raised/85 text-ink shadow-sm", wide && "order-last h-12 w-12")}>
                  <Icon className={wide ? "h-6 w-6" : "h-5 w-5"} />
                </span>
                <span className="relative">
                  {wide && (
                    <span className="mb-2 inline-block rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-bg">
                      {t(`home.for.${part}`)}
                    </span>
                  )}
                  <span className={cn("block font-semibold tracking-[-0.01em] text-ink", wide && "font-display text-xl")}>
                    {t(`home.tools.${key}`)}
                  </span>
                  <span className="block text-xs text-ink-faint">{t(`home.tools.${key}Sub`)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A quiet link to the user's own safety plan, always one tap away on Today. */
function PlanLink() {
  const { t } = useI18n();
  return (
    <Link href="/safety-plan" className="card lift group animate-rise flex items-center gap-4 p-4" style={stagger(6)}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-care-soft text-care">
        <LifebuoyIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{t("safetyPlan.cardTitle")}</span>
        <span className="block text-sm text-ink-soft">{t("safetyPlan.cardSub")}</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function WeekGarden({ week, days, planted }: { week: DayMood[]; days: number; planted: number | null }) {
  const { t, language } = useI18n();
  return (
    <Link href="/journey" className="group block animate-rise" style={stagger(4)}>
      <Card className="transition-transform duration-200 group-active:scale-[0.99]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("home.weekTitle")}</h2>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft group-hover:text-ink">
            {t("home.seeAll")}
            <ChevronRightIcon className="h-4 w-4" />
          </span>
        </div>
        <ol className="mt-5 grid grid-cols-7 gap-1">
          {week.map((d, i) => {
            const date = parseDay(d.day);
            const isToday = i === week.length - 1;
            return (
              <li key={d.day} className="flex flex-col items-center">
                <span className="flex h-14 items-end">
                  {d.mood ? (
                    <Plant mood={d.mood} className="animate-sprout h-14 w-10" />
                  ) : (
                    <span aria-hidden className="mb-1 h-2 w-2 rounded-full bg-line" />
                  )}
                </span>
                <span aria-hidden className="mt-0.5 h-1.5 w-8 rounded-full bg-[color-mix(in_oklab,#8a6a4a_45%,var(--surface-2))]" />
                <span className={cn("mt-2 text-[11px] font-medium", isToday ? "text-ink" : "text-ink-faint")}>
                  {date.toLocaleDateString(language, { weekday: "narrow" })}
                </span>
                <span className="sr-only">
                  {date.toLocaleDateString(language, { weekday: "long" })}: {d.mood ? t(`mood.${d.mood}`) : "—"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-sm text-ink-soft">
          {days > 0 ? t("home.weekShowedUp", { count: days }) : planted ? t("home.weekNone") : t("home.weekStart")}
          {planted ? ` · ${t("home.planted", { count: planted })}` : ""}
        </p>
      </Card>
    </Link>
  );
}

function Pulse({ pulse, mine }: { pulse: CommunityPulse; mine: Feeling[] }) {
  const { t } = useI18n();
  const label = (kind: string, key: string) => t(kind === "feeling" ? `feelings.${key}` : `topics.${key}`);
  const shared = pulse.items.find((it) => it.kind === "feeling" && mine.includes(it.key as Feeling) && it.people > 1);
  return (
    <Card className="animate-rise overflow-hidden" style={stagger(5)}>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2.5" aria-hidden>
          {[5, 2, 4, 1].map((m) => (
            <MoodFace key={m} mood={m} className="h-8 w-8 rounded-full ring-2 ring-[var(--surface)]" />
          ))}
        </div>
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("home.pulseTitle")}</h2>
          <p className="text-sm text-ink-soft">{t("home.pulsePeople", { count: pulse.people })}</p>
        </div>
      </div>
      {shared && (
        <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-[15px] font-medium text-ink">
          {t("home.pulseSame", { count: shared.people - 1, feeling: label("feeling", shared.key).toLowerCase() })}
        </p>
      )}
      {pulse.items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pulse.items.slice(0, 4).map((it) => {
            const pct = Math.round((it.people / Math.max(1, pulse.people)) * 100);
            return (
              <li key={`${it.kind}-${it.key}`} className="relative overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span aria-hidden className="absolute inset-y-0 left-0 bg-ink/[0.07]" style={{ width: `${pct}%` }} />
                <span className="relative flex justify-between gap-3 text-ink">
                  <span>
                    {it.kind === "feeling" && (
                      <span aria-hidden className="mr-1.5">
                        {FEELING_EMOJI[it.key as Feeling]}
                      </span>
                    )}
                    {label(it.kind, it.key)}
                  </span>
                  <span className="tabular-nums text-ink-faint">{it.people}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-faint">{t("home.pulseNote")}</p>
    </Card>
  );
}
