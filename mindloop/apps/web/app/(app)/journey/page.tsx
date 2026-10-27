"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon, LockIcon, ReportIcon, SparkIcon } from "@/components/icons";
import { MoodFace } from "@/components/MoodFace";
import { Card, Notice, PageHeader, PageSkeleton, SectionTitle, Segmented, cn, stagger } from "@/components/ui";
import { Garden } from "@/features/journey/Garden";
import { MoodCalendar } from "@/features/journey/MoodCalendar";
import { TrendChart } from "@/features/journey/TrendChart";
import { WeeklyRecap } from "@/features/journey/WeeklyRecap";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { FEELING_EMOJI, MOOD_SOLID, parseDay, type Feeling } from "@/lib/mood";
import { blooms as toBlooms, moments as toMoments, readCounters, type Moment } from "@/lib/progress";
import type { CheckInSummary, PatternOut, PatternsResponse } from "@/lib/types";

type Topic = { topic: string; label: string; count: number };

export default function JourneyPage() {
  const { t } = useI18n();
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [history, setHistory] = useState<CheckInSummary[] | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.patterns(controller.signal), api.history(controller.signal, 100)])
      .then(([p, h]) => {
        setData(p);
        setHistory(h);
        setMoments(toMoments(h, readCounters()));
        void api.track("pattern_viewed");
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);

  const blooms = useMemo(() => toBlooms(history ?? []), [history]);

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!data || !history) return <PageSkeleton label={t("app.loading")} />;

  const s = data.summary as Record<string, number | null | Topic[]>;
  const mood30 = typeof s.mood_30d === "number" ? s.mood_30d : null;
  const sleep = typeof s.sleep_baseline === "number" ? s.sleep_baseline : null;
  const topics = (s.common_topics as Topic[] | undefined) ?? [];
  const got = moments.filter((m) => m.got).length;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t("journey.eyebrow")} title={t("journey.title")} intro={t("patterns.intro")} />

      <section aria-label={t("journey.statsLabel")} className="grid grid-cols-2 gap-3">
        <Stat i={1} big value={String(blooms.length)} label={t("journey.daysShowedUp")} className="row-span-2">
          <p className="mt-auto pt-6 text-sm leading-snug opacity-70">{t("journey.daysNote")}</p>
        </Stat>
        <Stat i={2} value={String(history.length >= 100 ? "100+" : data.checkin_count)} label={t("journey.checkins")} />
        <Stat
          i={3}
          value={mood30 !== null ? mood30.toFixed(1) : "—"}
          label={t("journey.avgMood")}
          adornment={mood30 !== null ? <MoodFace mood={Math.round(mood30)} className="h-7 w-7" /> : null}
        />
        <Stat i={4} value={sleep !== null ? t("patterns.hours", { value: sleep.toFixed(1) }) : "—"} label={t("patterns.sleep")} />
        <Stat i={5} value={`${got}/${moments.length}`} label={t("journey.momentsCount")} />
      </section>

      <section aria-labelledby="garden-title" className="animate-rise" style={stagger(2)}>
        <SectionTitle id="garden-title">{t("journey.gardenTitle")}</SectionTitle>
        <Card>
          {blooms.length > 0 ? (
            <Garden blooms={blooms} />
          ) : (
            <p className="py-6 text-center text-[15px] text-ink-soft">{t("journey.gardenEmpty")}</p>
          )}
          <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">{t("journey.gardenNote")}</p>
        </Card>
      </section>

      <section aria-label={t("journey.calendar")} className="animate-rise" style={stagger(3)}>
        <Card>
          <MoodCalendar blooms={blooms} />
        </Card>
      </section>

      <section aria-labelledby="insights-title" className="space-y-3">
        <SectionTitle id="insights-title">{t("journey.insightsTitle")}</SectionTitle>
        {!data.ready ? (
          <Card className="relative overflow-hidden">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink-soft">
                <LockIcon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-medium text-ink">
                  {t("journey.unlockIn", { count: Math.max(0, data.min_checkins - data.checkin_count) })}
                </p>
                <p className="mt-1 text-sm text-ink-soft">{data.message}</p>
              </div>
            </div>
            <div className="mt-5 flex gap-1.5" aria-hidden>
              {Array.from({ length: data.min_checkins }, (_, i) => (
                <span key={i} className={cn("h-2 flex-1 rounded-full", i < data.checkin_count ? "bg-ink" : "bg-surface-2")} />
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-faint">{t("patterns.progress", { count: data.checkin_count, min: data.min_checkins })}</p>
          </Card>
        ) : data.patterns.length === 0 ? (
          <p className="px-1 text-sm text-ink-faint">{t("patterns.noPatterns")}</p>
        ) : (
          <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {data.patterns.map((p, i) => (
              <PatternCard key={p.statement} pattern={p} i={i} />
            ))}
          </ul>
        )}
      </section>

      {data.series.length >= 2 && <Trends series={data.series} />}

      {topics.length > 0 && (
        <section aria-labelledby="topics-title">
          <SectionTitle id="topics-title">{t("patterns.topics")}</SectionTitle>
          <Card>
            <ul className="space-y-3">
              {topics.map((x) => (
                <li key={x.topic}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-ink">{t(`topics.${x.topic}`)}</span>
                    <span className="tabular-nums text-ink-faint">{x.count}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full rounded-full bg-ink" style={{ width: `${(x.count / topics[0].count) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section aria-labelledby="moments-title">
        <SectionTitle id="moments-title" action={<span className="text-sm tabular-nums text-ink-faint">{got}/{moments.length}</span>}>
          {t("journey.momentsTitle")}
        </SectionTitle>
        <ul className="grid grid-cols-3 gap-2.5">
          {moments.map((m, i) => (
            <MomentTile key={m.key} moment={m} i={i} />
          ))}
        </ul>
        <p className="mt-3 px-1 text-xs text-ink-faint">{t("journey.momentsNote")}</p>
      </section>

      <WeeklyRecap />

      <Link href="/journey/report" className="card lift group flex items-center gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <ReportIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{t("journey.reportCta")}</span>
          <span className="block text-sm text-ink-soft">{t("journey.reportSub")}</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
      </Link>

      <RecentList history={history} />
    </div>
  );
}

function Stat({
  value,
  label,
  big,
  adornment,
  className,
  children,
  i,
}: {
  value: string;
  label: string;
  big?: boolean;
  adornment?: ReactNode;
  className?: string;
  children?: ReactNode;
  i: number;
}) {
  return (
    <div className={cn("card animate-rise flex flex-col p-4", big && "bg-feature text-on-feature", className)} style={stagger(i)}>
      <p className={cn("text-[13px] font-medium", big ? "opacity-70" : "text-ink-faint")}>{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className={cn("font-display leading-none tabular-nums", big ? "text-[4.5rem]" : "text-[2rem]")}>{value}</p>
        {adornment}
      </div>
      {children}
    </div>
  );
}

function PatternCard({ pattern, i }: { pattern: PatternOut; i: number }) {
  const t = useI18n().t;
  const [open, setOpen] = useState(false);
  return (
    <li className="snap-start">
      <article className="card animate-rise flex h-full w-[17rem] flex-col p-5" style={stagger(i)}>
        <SparkIcon className="h-5 w-5 text-accent-fg" />
        <p className="mt-3 text-[16px] font-medium leading-snug text-ink text-pretty">{pattern.statement}</p>
        {open && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{pattern.explanation}</p>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-auto self-start pt-4 text-sm font-medium text-ink-soft underline decoration-line underline-offset-4 hover:text-ink"
        >
          {open ? t("journey.hideWhy") : t("patterns.why")}
        </button>
      </article>
    </li>
  );
}

const MOMENT_EMOJI: Record<string, string> = {
  first: "🌱",
  five: "🔍",
  ten_days: "🌿",
  thirty_days: "🌳",
  every_mood: "🌈",
  named: "🏷️",
  opened_up: "💬",
  breathe: "🫧",
  ground: "🪨",
  reach: "💌",
  talk: "🗣️",
  action: "✅",
};

function MomentTile({ moment: m, i }: { moment: Moment; i: number }) {
  const t = useI18n().t;
  return (
    <li
      className={cn(
        "animate-rise flex flex-col items-center rounded-[1.25rem] border p-3 text-center",
        m.got ? "border-line bg-surface" : "border-dashed border-line bg-transparent",
      )}
      style={stagger(i)}
    >
      <span
        aria-hidden
        className={cn("flex h-12 w-12 items-center justify-center rounded-2xl text-2xl", m.got ? "bg-accent-soft" : "bg-surface-2 grayscale opacity-50")}
      >
        {MOMENT_EMOJI[m.key]}
      </span>
      <p className={cn("mt-2 text-[12px] font-semibold leading-tight", m.got ? "text-ink" : "text-ink-faint")}>
        {t(`moments.${m.key}.title`)}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-ink-faint">
        {m.got ? t(`moments.${m.key}.got`) : `${m.progress}/${m.goal} · ${t(`moments.${m.key}.how`)}`}
      </p>
    </li>
  );
}

function Trends({ series }: { series: PatternsResponse["series"] }) {
  const { t, language } = useI18n();
  const [metric, setMetric] = useState<"mood" | "stress" | "sleep">("mood");
  const [table, setTable] = useState(false);
  const pick = (k: "mood" | "stress" | "sleep") =>
    series.filter((p) => p[k] != null).map((p) => ({ day: p.day, value: p[k] as number }));
  const options = (["mood", "stress", "sleep"] as const).filter((k) => pick(k).length >= 2);
  const points = pick(metric);
  const fmt = (v: number) => (metric === "sleep" ? `${v.toFixed(v % 1 ? 1 : 0)}h` : v.toFixed(v % 1 ? 1 : 0));

  return (
    <section aria-labelledby="trends-title">
      <SectionTitle id="trends-title">{t("journey.trendsTitle")}</SectionTitle>
      <Card className="space-y-5">
        {options.length > 1 && (
          <Segmented
            block
            label={t("journey.trendsTitle")}
            value={metric}
            onChange={setMetric}
            options={options.map((k) => ({ value: k, label: t(`journey.metric.${k}`) }))}
          />
        )}
        <TrendChart
          key={metric}
          title={t(metric === "mood" ? "patterns.chartTitle" : metric === "stress" ? "patterns.chartStress" : "patterns.chartSleep")}
          points={points}
          min={metric === "sleep" ? 0 : 1}
          max={metric === "sleep" ? 10 : 5}
          locale={language}
          format={fmt}
          dotColor={metric === "mood" ? (v) => MOOD_SOLID[Math.round(v)] : undefined}
        />
        <button
          type="button"
          className="text-sm text-ink-faint underline decoration-line underline-offset-4 hover:text-ink"
          aria-expanded={table}
          onClick={() => setTable((v) => !v)}
        >
          {table ? t("patterns.hideTable") : t("patterns.showTable")}
        </button>
        {table && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-2 pr-4 font-medium">{t("patterns.date")}</th>
                  <th className="py-2 pr-4 font-medium">{t("patterns.moodCol")}</th>
                  <th className="py-2 pr-4 font-medium">{t("patterns.stressCol")}</th>
                  <th className="py-2 font-medium">{t("patterns.sleepCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-ink">
                {series.map((p) => (
                  <tr key={p.day}>
                    <td className="py-2 pr-4">{p.day}</td>
                    <td className="py-2 pr-4 tabular-nums">{p.mood}</td>
                    <td className="py-2 pr-4 tabular-nums">{p.stress ?? "—"}</td>
                    <td className="py-2 tabular-nums">{p.sleep ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function RecentList({ history }: { history: CheckInSummary[] }) {
  const { t, language } = useI18n();
  const [all, setAll] = useState(false);
  if (history.length === 0) return null;
  const shown = all ? history : history.slice(0, 6);
  return (
    <section aria-labelledby="history-title">
      <SectionTitle id="history-title">{t("checkin.historyTitle")}</SectionTitle>
      <Card className="divide-y divide-line" flush>
        {shown.map((c) => (
          <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
            <MoodFace mood={c.mood} className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ink">
                {parseDay(c.local_date).toLocaleDateString(language, { weekday: "short", day: "numeric", month: "short" })}
                <span className="sr-only">: {t(`mood.${c.mood}`)}</span>
              </p>
              <p className="truncate text-sm text-ink-faint">
                {[
                  ...c.feelings.map((x) => `${FEELING_EMOJI[x as Feeling] ?? ""} ${t(`feelings.${x}`)}`),
                  ...c.topics.map((x) => t(`topics.${x}`)),
                  c.has_note ? t("checkin.hasNote") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || t(`mood.${c.mood}`)}
              </p>
            </div>
          </div>
        ))}
        {history.length > 6 && (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="w-full px-5 py-3.5 text-center text-sm font-medium text-ink-soft hover:text-ink"
          >
            {all ? t("journey.showLess") : t("journey.showAll", { count: history.length })}
          </button>
        )}
      </Card>
    </section>
  );
}
