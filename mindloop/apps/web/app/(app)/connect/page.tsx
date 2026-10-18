"use client";

import { PageHeader } from "@/components/ui";
import { Connect } from "@/features/connect/Connect";
import { useT } from "@/lib/i18n";

export default function ConnectPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("connect.title")} intro={t("connect.intro")} />
      <Connect />
    </>
  );
}
