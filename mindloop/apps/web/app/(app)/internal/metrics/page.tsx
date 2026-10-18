"use client";

import { useEffect, useState } from "react";
import { Card, LoadingCard, Notice, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

/** Development dashboard (admin only). Aggregate counts, no individual data. */
export default function MetricsPage() {
  const t = useT();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.metrics().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <Notice tone="care">{t("app.error")}</Notice>;
  if (!data) return <LoadingCard label={t("app.loading")} />;

  const tiles = Object.entries(data).filter(([, v]) => typeof v === "number" || v === null);
  const nested = Object.entries(data).filter(([, v]) => v !== null && typeof v === "object");
  return (
    <div className="space-y-6">
      <PageHeader title={t("metrics.title")} intro={t("metrics.intro")} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-faint">{k.replaceAll("_", " ")}</p>
            <p className="mt-1 font-serif text-3xl tabular-nums">{v === null ? "—" : String(v)}</p>
          </div>
        ))}
      </div>
      {nested.map(([k, v]) => (
        <Card key={k}>
          <h2 className="text-sm font-semibold text-ink">{k.replaceAll("_", " ")}</h2>
          <pre className="mt-2 overflow-x-auto text-xs text-ink-soft">{JSON.stringify(v, null, 2)}</pre>
        </Card>
      ))}
    </div>
  );
}
