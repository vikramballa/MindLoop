"use client";

import Link from "next/link";
import { Brand } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { CalmHub } from "@/features/calm/CalmHub";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Public calm tools (works signed-out): the lowest-friction way in. */
export default function BreathePage() {
  const t = useT();
  const { user } = useAuth();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <Link href={user ? "/home" : "/"}>
          <Brand className="text-lg" />
        </Link>
        <Link href="/support" className="flex h-9 items-center rounded-full border border-care-border bg-care-soft px-3.5 text-[13px] font-medium text-care">
          {t("nav.support")}
        </Link>
      </div>
      <PageHeader title={t("calm.publicTitle")} intro={t("calm.publicIntro")} />
      <CalmHub signedIn={false} />
      {!user && (
        <Link href="/register" className="mt-8 block text-center text-[15px] font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          {t("calm.publicCta")}
        </Link>
      )}
    </main>
  );
}
