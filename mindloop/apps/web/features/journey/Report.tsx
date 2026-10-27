"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeftIcon, PrintIcon } from "@/components/icons";
import { MoodFace } from "@/components/MoodFace";
import { Button, Card, Notice, PageSkeleton, Segmented, stagger } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { FEELING_EMOJI, MOOD_SOLID, localDate, type Feeling } from "@/lib/mood";
import { formatRange, summarize, type Count } from "@/lib/report";
import type { CheckInSummary, PatternOut, ReflectionOut } from "@/lib/types";
import { TrendChart } from "./TrendChart";

const RANGES = [14, 30, 90] as const;
type Range = (typeof RANGES)[number];

/**
 * A one-page, printable summary of what the user logged. Meant to be kept or, if they choose,
 * shown to a counsellor. It reports; it never assesses.
 */
export function Report() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [days, setDays] = useState<Range>(30);
  const [history, setHistory] = useState<CheckInSummary[] | null>(null);
  const [reflections, setReflections] = useState<ReflectionOut[]>([]);
  const [patterns, setPatterns] = useState<PatternOut[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const from = new Date();
    from.setDate(from.getDate() - 89);
    api
      .historySince(localDate(from), controller.signal)
      .then(setHistory)
      .catch(() => !controller.signal.aborted && setFailed(true));
    api
      .reflections(controller.signal, undefined, 100)
      .then(setReflections)
      .catch(() => undefined);
    api
      .patterns(controller.signal)
      .then((p) => setPatterns(p.ready ? p.patterns : []))
      .catch(() => undefined);
    void api.track("report_viewed");
    return () => controller.abort();
  }, []);

  const s = useMemo(() => (history ? summarize(history, reflections, days) : null), [history, reflections, days]);

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!s) return <PageSkeleton label={t("app.loading")} />;

  const made = new Date().toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric" });
  const maxMood = Math.max(1, ...s.moodCounts);
  const fmt1 = (v: number | null, suffix = "") => (v === null ? "—" : `${v.toFixed(1)}${suffix}`);

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between gap-3">
        <Link href="/journey" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
          <ArrowLeftIcon className="h-4 w-4" />
          {t("report.back")}
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <PrintIcon className="h-4 w-4" />
          {t("report.print")}
        </Button>
      </div>

      <header className="animate-rise px-1">
        <p className="text-[13px] font-medium text-ink-faint">
          {t("report.eyebrow")}
          {user?.display_name ? ` · ${user.display_name}` : ""}
        </p>
        <h1 className="mt-2 font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.04em] text-ink">
          {t("report.title", { days })}
        </h1>
        <p className="mt-1 text-[15px] font-medium text-ink-soft">{formatRange(s.from, s.to, language)}</p>
        <p className="no-print mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">{t("report.intro")}</p>
      </header>

      <div className="no-print">
        <Segmented
          block
          label={t("report.rangeLabel")}
          value={days}
          onChange={setDays}
          options={RANGES.map((r) => ({ value: r, label: t(`report.range.${r}`) }))}
        />
      </div>

      {s.checkins === 0 ? (
        <Card>
          <p className="py-6 text-center text-[15px] text-ink-soft">{t("report.noData")}</p>
        </Card>
      ) : (
        <>
          <section aria-label={t("report.eyebrow")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Figure i={0} label={t("report.checkins")} value={String(s.checkins)} />
            <Figure i={1} label={t("report.days")} value={`${s.days}/${days}`} />
            <Figure
              i={2}
              label={t("report.avgMood")}
              value={fmt1(s.avgMood)}
              adornment={s.avgMood !== null ? <MoodFace mood={Math.round(s.avgMood)} className="h-7 w-7" /> : null}
            />
            <Figure i={3} label={t("report.avgStress")} value={fmt1(s.avgStress)} />
            <Figure i={4} label={t("report.avgSleep")} value={fmt1(s.avgSleep, " h")} />
            <Figure i={5} label={t("report.reframes")} value={String(s.reframes)} />
          </section>

          {s.moodByDay.length >= 2 && (
            <Card className="animate-rise" style={stagger(2)}>
              <TrendChart
                title={t("report.moodLine")}
                points={s.moodByDay}
                min={1}
                max={5}
                locale={language}
                dotColor={(v) => MOOD_SOLID[Math.round(v)]}
              />
            </Card>
          )}

          <Card className="animate-rise" style={stagger(3)}>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{t("report.moodDist")}</h2>
            <ul className="mt-4 space-y-2.5">
              {[5, 4, 3, 2, 1].map((m) => {
                const n = s.moodCounts[m - 1];
                return (
                  <li key={m} className="flex items-center gap-3">
                    <MoodFace mood={m} className="h-7 w-7 shrink-0" />
                    <span className="w-24 shrink-0 text-sm text-ink-soft">{t(`mood.${m}`)}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${(n / maxMood) * 100}%`, background: MOOD_SOLID[m] }} />
                    </span>
                    <span className="w-8 text-right text-sm font-semibold tabular-nums text-ink">{n}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <CountList
              title={t("report.feelings")}
              items={s.feelings}
              render={(k) => `${FEELING_EMOJI[k as Feeling] ?? ""} ${t(`feelings.${k}`)}`}
            />
            <CountList title={t("report.topics")} items={s.topics} render={(k) => t(`topics.${k}`)} />
          </div>

          {patterns.length > 0 && (
            <Card>
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{t("report.patterns")}</h2>
              <ul className="mt-3 space-y-2">
                {patterns.map((p) => (
                  <li key={p.statement} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
                    <span aria-hidden className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {p.statement}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(s.reframes > 0 || s.gratitudeItems > 0) && (
            <Card>
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{t("report.practice")}</h2>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <Def label={t("report.reframes")} value={String(s.reframes)} />
                <Def label={t("report.gratitude")} value={String(s.gratitudeItems)} />
                <Def
                  label={t("report.shift")}
                  value={s.avgBeliefShift !== null ? t("reflect.statsShiftValue", { value: Math.round(s.avgBeliefShift) }) : "—"}
                />
              </dl>
            </Card>
          )}
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-faint">
        {t("report.scale")} {t("report.generated", { date: made })}
      </p>
    </div>
  );
}

function Figure({ label, value, adornment, i }: { label: string; value: string; adornment?: ReactNode; i: number }) {
  return (
    <div className="card animate-rise flex flex-col p-4" style={stagger(i)}>
      <p className="text-[12px] font-medium text-ink-faint">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <p className="font-display text-[1.9rem] font-semibold leading-none tracking-[-0.035em] text-ink tabular-nums">{value}</p>
        {adornment}
      </div>
    </div>
  );
}

function CountList({ title, items, render }: { title: string; items: Count[]; render: (key: string) => string }) {
  if (items.length === 0) return null;
  const max = items[0].count;
  return (
    <Card>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((x) => (
          <li key={x.key} className="relative overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 bg-accent/20" style={{ width: `${(x.count / max) * 100}%` }} />
            <span className="relative flex justify-between gap-3 text-ink">
              <span>{render(x.key)}</span>
              <span className="tabular-nums text-ink-faint">{x.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
