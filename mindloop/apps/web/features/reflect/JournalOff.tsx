"use client";

import Link from "next/link";
import { Notice } from "@/components/ui";
import { useT } from "@/lib/i18n";

/** Shown when the user has turned off keeping journal text: reflections can't be saved. */
export function JournalOff({ className }: { className?: string }) {
  const t = useT();
  return (
    <Notice tone="care" className={className}>
      {t("reflect.journalOff")}{" "}
      <Link href="/privacy" className="font-semibold underline underline-offset-4">
        {t("reflect.journalOffCta")}
      </Link>
    </Notice>
  );
}
