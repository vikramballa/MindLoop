"use client";

import { PageHeader } from "@/components/ui";
import { CalmHub } from "@/features/calm/CalmHub";
import { useT } from "@/lib/i18n";

export default function CalmPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("calm.title")} intro={t("calm.intro")} />
      <CalmHub />
    </>
  );
}
