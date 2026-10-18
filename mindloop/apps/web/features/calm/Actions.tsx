"use client";

import { useEffect, useState } from "react";
import { Button, Card, Chip, LoadingCard, Notice, cn, stagger } from "@/components/ui";
import { ActionCard } from "@/features/checkin/ActionCard";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ActionOut, LibraryItem } from "@/lib/types";

/** The library of small, structured actions, filterable by kind. Picking one starts it inline. */
export function Actions() {
  const t = useT();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [active, setActive] = useState<ActionOut | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .library(controller.signal)
      .then(setItems)
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);

  async function choose(slug: string) {
    setBusy(slug);
    try {
      setActive(await api.assign(slug));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!items) return <LoadingCard label={t("app.loading")} />;

  const categories = [...new Set(items.map((it) => it.category_label))];
  const shown = filter ? items.filter((it) => it.category_label === filter) : items;

  return (
    <div className="space-y-4">
      <p className="px-1 text-[15px] leading-relaxed text-ink-soft">{t("library.intro")}</p>
      {active && <ActionCard key={active.assignment_id} action={active} />}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip selected={filter === null} onClick={() => setFilter(null)} className="shrink-0">
          {t("library.all")}
        </Chip>
        {categories.map((c) => (
          <Chip key={c} selected={filter === c} onClick={() => setFilter(c)} className="shrink-0">
            {c}
          </Chip>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((it, i) => (
          <li key={it.slug}>
            <Card as="article" className={cn("animate-rise flex h-full flex-col")} style={stagger(Math.min(i, 8))}>
              <p className="text-[12px] font-medium text-ink-faint">
                {it.category_label} · {t("library.minutes", { minutes: it.duration_minutes })}
              </p>
              <h3 className="mt-1.5 font-semibold leading-snug tracking-[-0.01em] text-ink">{it.content.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{it.content.summary}</p>
              {it.evidence_reference.startsWith("UNVERIFIED") && (
                <p className="mt-2 text-[11px] text-ink-faint">{t("library.review")}</p>
              )}
              <Button variant="secondary" size="sm" className="mt-4 self-start" loading={busy === it.slug} onClick={() => choose(it.slug)}>
                {t("library.try")}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
