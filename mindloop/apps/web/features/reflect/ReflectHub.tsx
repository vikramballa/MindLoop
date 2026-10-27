"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRightIcon, BulbIcon, SunIcon, TrashIcon } from "@/components/icons";
import { Card, Notice, PageHeader, PageSkeleton, SectionTitle, Segmented, cn, stagger } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ReflectionOut, ReflectionStats } from "@/lib/types";
import { BeliefBars } from "./ReframeFlow";

type Filter = "all" | "reframe" | "gratitude";

export function ReflectHub() {
  const { t } = useI18n();
  const [stats, setStats] = useState<ReflectionStats | null>(null);
  const [entries, setEntries] = useState<ReflectionOut[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.reflectionStats(controller.signal), api.reflections(controller.signal, undefined, 100)])
      .then(([s, e]) => {
        setStats(s);
        setEntries(e);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!stats || !entries) return <PageSkeleton label={t("app.loading")} />;

  async function remove(entry: ReflectionOut) {
    if (!window.confirm(t("reflect.deleteConfirm"))) return;
    try {
      await api.deleteReflection(entry.id);
      setEntries((cur) => cur?.filter((x) => x.id !== entry.id) ?? null);
      setStats(await api.reflectionStats());
    } catch {
      setFailed(true);
    }
  }

  const shown = filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t("reflect.eyebrow")} title={t("reflect.title")} intro={t("reflect.intro")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <ExerciseCard
          i={1}
          href="/reflect/reframe"
          title={t("reflect.reframeTitle")}
          body={t("reflect.reframeSub")}
          cta={t("reflect.reframeCta")}
          time={t("reflect.reframeTime")}
          icon={<BulbIcon className="h-6 w-6" />}
          iconClass="bg-accent text-on-accent"
          wash="var(--accent)"
        />
        <ExerciseCard
          i={2}
          href="/reflect/gratitude"
          title={t("reflect.gratitudeTitle")}
          body={t("reflect.gratitudeSub")}
          cta={t("reflect.gratitudeCta")}
          time={t("reflect.gratitudeTime")}
          icon={<SunIcon className="h-6 w-6" />}
          iconClass="bg-[#ffd76a] text-[#3a2a00]"
          wash="#ffc94d"
        />
      </div>

      {(stats.reframes > 0 || stats.gratitude > 0) && (
        <section aria-labelledby="practice-title" className="animate-rise" style={stagger(3)}>
          <SectionTitle id="practice-title">{t("reflect.statsLabel")}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <Stat value={String(stats.reframes)} label={t("reflect.statsReframes")} />
            <Stat
              value={stats.avg_belief_shift != null ? t("reflect.statsShiftValue", { value: Math.round(stats.avg_belief_shift) }) : "—"}
              label={t("reflect.statsShift")}
            />
            <Stat value={String(stats.gratitude_items)} label={t("reflect.statsGood")} />
          </div>
          {stats.top_distortions.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-2 px-1 text-sm text-ink-soft">
              {t("reflect.topTraps")}:
              {stats.top_distortions.map((d) => (
                <span key={d} className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent-fg">
                  {t(`distortions.${d}.label`)}
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="entries-title" className="space-y-3">
        <SectionTitle id="entries-title">{t("reflect.historyTitle")}</SectionTitle>
        {entries.length > 0 && (
          <Segmented
            block
            label={t("reflect.historyTitle")}
            value={filter}
            onChange={setFilter}
            options={(["all", "reframe", "gratitude"] as const).map((v) => ({ value: v, label: t(`reflect.filter.${v}`) }))}
          />
        )}
        {shown.length === 0 ? (
          <p className="px-1 py-4 text-sm text-ink-faint">{t("reflect.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((e) => (
              <Entry key={e.id} entry={e} onDelete={() => remove(e)} />
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-ink-faint">{t("reflect.notTherapy")}</p>
    </div>
  );
}

function ExerciseCard({
  i,
  href,
  title,
  body,
  cta,
  time,
  icon,
  iconClass,
  wash,
}: {
  i: number;
  href: string;
  title: string;
  body: string;
  cta: string;
  time: string;
  icon: ReactNode;
  iconClass: string;
  wash: string;
}) {
  return (
    <Link href={href} className="card lift group animate-rise relative flex flex-col overflow-hidden p-5" style={stagger(i)}>
      <span
        aria-hidden
        className="absolute -right-14 -top-14 h-44 w-44 rounded-full opacity-30 blur-2xl transition-transform duration-500 group-hover:scale-110"
        style={{ background: wash }}
      />
      <span className="relative flex items-center justify-between">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", iconClass)}>{icon}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-soft">{time}</span>
      </span>
      <span className="relative mt-5 font-display text-xl font-semibold tracking-[-0.035em] text-ink">{title}</span>
      <span className="relative mt-1 text-sm leading-relaxed text-ink-soft">{body}</span>
      <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg">
        {cta}
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card flex flex-col p-4">
      <p className="font-display text-[1.65rem] font-semibold leading-none tracking-[-0.035em] text-ink tabular-nums">{value}</p>
      <p className="mt-2 text-[12px] font-medium leading-tight text-ink-faint">{label}</p>
    </div>
  );
}

function Entry({ entry: e, onDelete }: { entry: ReflectionOut; onDelete: () => void }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const when = new Date(e.created_at).toLocaleDateString(language, { weekday: "short", day: "numeric", month: "short" });
  const reframe = e.kind === "reframe";
  const title = reframe ? e.thought : e.items.join(" · ");
  return (
    <li>
      <Card as="article" flush>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-4 p-4 text-left sm:p-5"
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              reframe ? "bg-accent-soft text-accent-fg" : "bg-[#fff1c7] text-[#6b4d00]",
            )}
          >
            {reframe ? <BulbIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-ink-faint">
              {reframe ? t("reflect.filter.reframe") : t("reflect.filter.gratitude")} · {when}
            </span>
            <span className={cn("mt-0.5 block text-[15px] font-medium leading-snug text-ink", !open && "line-clamp-2")}>{title}</span>
            {reframe && e.belief_before != null && e.belief_after != null && !open && (
              <span className="mt-1 block text-[13px] text-ink-faint">
                {t("reflect.believed", { before: e.belief_before, after: e.belief_after })}
              </span>
            )}
          </span>
        </button>
        {open && (
          <div className="animate-fade space-y-4 border-t border-line px-4 pb-4 pt-4 sm:px-5">
            {reframe ? (
              <>
                <Detail label={t("reflect.situation")} value={e.situation} />
                {e.distortions.length > 0 && (
                  <div>
                    <p className="text-[12px] font-medium text-ink-faint">{t("reflect.traps")}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {e.distortions.map((d) => (
                        <span key={d} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-soft">
                          {t(`distortions.${d}.label`)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <Detail label={t("reflect.evidenceFor")} value={e.evidence_for} />
                <Detail label={t("reflect.evidenceAgainst")} value={e.evidence_against} />
                <Detail label={t("reflect.balanced")} value={e.balanced} quote />
                {e.belief_before != null && e.belief_after != null && <BeliefBars before={e.belief_before} after={e.belief_after} />}
              </>
            ) : (
              <Detail label={t("reflect.why")} value={e.why} />
            )}
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-full px-1 text-sm font-medium text-care hover:underline"
            >
              <TrashIcon className="h-4 w-4" />
              {t("reflect.delete")}
            </button>
          </div>
        )}
      </Card>
    </li>
  );
}

function Detail({ label, value, quote }: { label: string; value?: string | null; quote?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[12px] font-medium text-ink-faint">{label}</p>
      <p className={cn("mt-0.5 text-[15px] leading-relaxed text-ink", quote && "font-quote text-xl italic leading-snug")}>{value}</p>
    </div>
  );
}
