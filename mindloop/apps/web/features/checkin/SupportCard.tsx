"use client";

import Link from "next/link";
import { HeartIcon, PhoneIcon } from "@/components/icons";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { ResourceOut, SupportResponse } from "@/lib/types";

/** Renders reviewed, deterministic support content from the safety layer. Never model-generated. */
export function SupportCard({ support, className }: { support: SupportResponse; className?: string }) {
  const t = useT();
  const high = support.level === "high";
  return (
    <section
      aria-labelledby="support-title"
      role={high ? "alert" : "region"}
      className={cn(
        "animate-rise rounded-[var(--radius-card)] border border-care-border bg-care-soft p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-care">
        <HeartIcon className="h-5 w-5" />
        <h2 id="support-title" className="text-lg font-semibold tracking-[-0.01em]">
          {support.title}
        </h2>
      </div>
      <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink">
        {support.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {support.resources.length > 0 && (
        <ul className="mt-4 space-y-2">
          {support.resources.map((r) => (
            <ResourceRow key={`${r.organization}-${r.phone}`} resource={r} />
          ))}
        </ul>
      )}
      {support.ai_notice && <p className="mt-4 text-sm text-ink-soft">{support.ai_notice}</p>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/safety-plan" className="text-sm font-semibold text-care underline underline-offset-4">
          {t("safetyPlan.cardTitle")}
        </Link>
        <Link href="/support" className="text-sm font-medium text-care underline underline-offset-4">
          {t("nav.support")}
        </Link>
      </div>
    </section>
  );
}

export function ResourceRow({ resource: r }: { resource: ResourceOut }) {
  const t = useT();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-raised px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-ink">{r.organization}</p>
        <p className="text-sm text-ink-faint">{[r.hours, r.description].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {r.phone && (
          <a
            href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-care px-4 text-sm font-semibold text-care-soft"
            aria-label={t("support.callLabel", { phone: r.phone })}
          >
            <PhoneIcon className="h-4 w-4" />
            {r.phone}
          </a>
        )}
        {r.website && (
          <a
            href={r.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-full border border-care-border px-4 text-sm text-care"
          >
            {t("support.website")}
          </a>
        )}
      </div>
    </li>
  );
}
