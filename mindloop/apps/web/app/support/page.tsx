"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/AppShell";
import { ChevronRightIcon, LifebuoyIcon } from "@/components/icons";
import { Card, Field, Notice, PageHeader, Select, Skeleton } from "@/components/ui";
import { COUNTRIES } from "@/features/auth/AuthForm";
import { ResourceRow } from "@/features/checkin/SupportCard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { ResourcesResponse } from "@/lib/types";

/** Public page (works signed-out). Resources come only from the verified database. */
export default function SupportPage() {
  const t = useT();
  const { user } = useAuth();
  const [country, setCountry] = useState<string | null>(null);
  const [data, setData] = useState<ResourcesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const selected = country ?? user?.country ?? "IN";

  useEffect(() => {
    const controller = new AbortController();
    api
      .resources(selected, controller.signal)
      .then((d) => {
        setFailed(false);
        setData(d);
        if (user) void api.track("support_resource_viewed", { country: selected });
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [selected, user]);

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <Link href={user ? "/home" : "/"} className="mb-8 inline-block">
        <Brand className="text-lg" />
      </Link>
      <PageHeader title={t("support.pageTitle")} intro={t("support.pageIntro")} />
      <Card className="space-y-5">
        <Field label={t("support.countryLabel")} htmlFor="s-country">
          <Select id="s-country" value={selected} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {t(`countries.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-2xl bg-care-soft px-4 py-3 text-[15px] font-medium text-care">
          {t("support.emergency", { number: data?.emergency_number ? ` (${data.emergency_number})` : "" })}
        </p>
        {failed && <Notice tone="care">{t("app.offline")}</Notice>}
        {!data && !failed ? (
          <Skeleton className="h-24" />
        ) : data && data.resources.length === 0 ? (
          <Notice tone="care">{t("support.noResources")}</Notice>
        ) : (
          <ul className="space-y-2">
            {data?.resources.map((r) => <ResourceRow key={`${r.organization}-${r.phone}`} resource={r} />)}
          </ul>
        )}
        {data?.support_pathway_note && <p className="text-[15px] text-ink-soft">{data.support_pathway_note}</p>}
        {user && (
          <Link href="/safety-plan" className="flex items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3 transition-colors hover:bg-surface-2">
            <LifebuoyIcon className="h-5 w-5 shrink-0 text-accent-fg" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">{t("safetyPlan.cardTitle")}</span>
              <span className="block text-sm text-ink-soft">{t("safetyPlan.cardSub")}</span>
            </span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-faint" />
          </Link>
        )}
        <p className="text-sm text-ink-faint">{t("support.notice")}</p>
        <p className="text-xs text-ink-faint">{t("support.verified")}</p>
      </Card>
    </main>
  );
}
