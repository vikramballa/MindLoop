"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/AppShell";
import { Button, Card, Chip, Field, Input, Notice, Segmented, Select, Toggle, stagger } from "@/components/ui";
import { COUNTRIES } from "@/features/auth/AuthForm";
import { TOPICS } from "@/features/checkin/CheckInFlow";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_LANGUAGES, useI18n } from "@/lib/i18n";
import type { ContextProfile, OnboardingRequest, Topic } from "@/lib/types";

const TOTAL = 4;
type Consents = { store_journal: boolean; store_transcripts: boolean; memory: boolean };

/** Four short steps. Only country and language are required, and it should take under two minutes. */
export default function OnboardingPage() {
  const { t, setLanguage } = useI18n();
  const { user, loading, reload } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [profile, setProfile] = useState<Partial<ContextProfile>>({
    preferred_language: "en",
    preferred_support_style: "mixed",
    selected_stressors: [],
  });
  const [notifications, setNotifications] = useState<"off" | "occasional" | "daily">("occasional");
  const [consents, setConsents] = useState<Consents>({ store_journal: true, store_transcripts: false, memory: true });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const country = profile.country ?? user?.country ?? "IN";
  const set = <K extends keyof ContextProfile>(key: K, value: ContextProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  function toggleStressor(topic: Topic) {
    const cur = (profile.selected_stressors ?? []) as string[];
    set("selected_stressors", cur.includes(topic) ? cur.filter((x) => x !== topic) : [...cur, topic]);
  }

  async function finish() {
    setBusy(true);
    setError(false);
    try {
      await api.completeOnboarding({
        ...profile,
        country,
        display_name: profile.display_name?.trim() || null,
        preferences: { notification_frequency: notifications },
      } as OnboardingRequest);
      await Promise.all(
        Object.entries(consents).map(([type, granted]) => api.setConsent(type, granted)),
      );
      setLanguage(profile.preferred_language ?? "en");
      await reload();
      router.replace("/home");
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <Brand />
        <p className="text-sm font-medium tabular-nums text-ink-faint" aria-live="polite">
          {t("onboarding.step", { current: step, total: TOTAL })}
        </p>
      </div>
      <div className="mt-6 flex gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i < step ? "bg-ink" : "bg-surface-2"}`} />
        ))}
      </div>

      <div key={step} className="mt-10">
        <p className="animate-rise text-[13px] font-medium text-ink-faint">{step === 1 ? t("onboarding.subtitle") : t("onboarding.title")}</p>
        <h1 className="animate-rise mt-2 font-display text-[2.6rem] leading-[1.02] tracking-[-0.035em] text-ink text-balance" style={stagger(1)}>
          {t(`onboarding.stepTitle${step}`)}
        </h1>
      </div>

      <Card className="animate-rise mt-7 space-y-6" style={stagger(2)} key={`card-${step}`}>
        {step === 1 && (
          <>
            <Field label={t("onboarding.nameLabel")} htmlFor="name">
              <Input
                id="name"
                maxLength={80}
                autoComplete="given-name"
                value={profile.display_name ?? ""}
                onChange={(e) => set("display_name", e.target.value)}
              />
            </Field>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("onboarding.ageLabel")}</p>
              <Segmented
                label={t("onboarding.ageLabel")}
                value={profile.age_range ?? null}
                onChange={(v) => set("age_range", v)}
                options={(["18-21", "22-25", "26-30", "31+"] as const).map((v) => ({ value: v, label: t(`options.age.${v}`) }))}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("onboarding.occupationLabel")}</p>
              <Segmented
                label={t("onboarding.occupationLabel")}
                value={profile.occupation ?? null}
                onChange={(v) => set("occupation", v)}
                options={(["student", "working", "both", "other"] as const).map((v) => ({
                  value: v,
                  label: t(`options.occupation.${v}`),
                }))}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label={t("onboarding.countryLabel")} hint={t("onboarding.countryHint")} htmlFor="country">
              <Select id="country" value={country} onChange={(e) => set("country", e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`countries.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("onboarding.languageLabel")} hint={t("onboarding.languageHint")} htmlFor="lang">
              <Select
                id="lang"
                value={profile.preferred_language}
                onChange={(e) => set("preferred_language", e.target.value)}
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {t(`languages.${l}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("onboarding.stressorsLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {TOPICS.filter((x) => x !== "other").map((topic) => (
                  <Chip
                    key={topic}
                    selected={((profile.selected_stressors ?? []) as string[]).includes(topic)}
                    onClick={() => toggleStressor(topic)}
                  >
                    {t(`topics.${topic}`)}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("onboarding.styleLabel")}</p>
              <Segmented
                label={t("onboarding.styleLabel")}
                value={profile.preferred_support_style ?? "mixed"}
                onChange={(v) => set("preferred_support_style", v)}
                options={(["practical", "reflective", "mixed"] as const).map((v) => ({
                  value: v,
                  label: t(`options.style.${v}`),
                }))}
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <p className="text-sm text-ink-faint">{t("onboarding.privacyHint")}</p>
              <div className="mt-2 divide-y divide-line">
                {(Object.keys(consents) as Array<keyof Consents>).map((k) => (
                  <Toggle
                    key={k}
                    label={t(`privacy.consent.${k}`)}
                    checked={consents[k]}
                    onChange={(v) => setConsents((c) => ({ ...c, [k]: v }))}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("onboarding.notificationsLabel")}</p>
              <Segmented
                label={t("onboarding.notificationsLabel")}
                value={notifications}
                onChange={setNotifications}
                options={(["off", "occasional", "daily"] as const).map((v) => ({
                  value: v,
                  label: t(`options.notifications.${v}`),
                }))}
              />
            </div>
            <Notice>{t("app.disclaimer")}</Notice>
          </>
        )}

        {error && <Notice tone="care">{t("app.error")}</Notice>}
        <div className="flex justify-between gap-3 pt-2">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 1 || busy}>
            {t("onboarding.back")}
          </Button>
          {step < TOTAL ? (
            <Button onClick={() => setStep((s) => s + 1)}>{t("onboarding.next")}</Button>
          ) : (
            <Button variant="accent" onClick={finish} loading={busy}>
              {t("onboarding.finish")}
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
