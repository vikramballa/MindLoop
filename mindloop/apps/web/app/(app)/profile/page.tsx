"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/AppShell";
import { BookIcon, CheckIcon, ChevronRightIcon, ConnectIcon, HeartIcon, JourneyIcon, LifebuoyIcon, ReportIcon, ShieldIcon } from "@/components/icons";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  Button,
  Card,
  Field,
  Input,
  Notice,
  PageSkeleton,
  SectionTitle,
  Segmented,
  Select,
  TextArea,
  Toggle,
  cn,
  stagger,
} from "@/components/ui";
import { COUNTRIES } from "@/features/auth/AuthForm";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_LANGUAGES, useI18n } from "@/lib/i18n";
import { blooms, moments, readCounters } from "@/lib/progress";
import { ACCENTS, applyAccent, applyTheme, readAccent, readTheme, type Accent, type Theme } from "@/lib/theme";
import type { ContextProfile, Preferences, ProfileResponse } from "@/lib/types";

const LINKS = [
  { href: "/journey", key: "profile.patternsLink", Icon: JourneyIcon },
  { href: "/reflect", key: "profile.reflectLink", Icon: BookIcon },
  { href: "/safety-plan", key: "profile.safetyPlanLink", Icon: LifebuoyIcon },
  { href: "/journey/report", key: "profile.reportLink", Icon: ReportIcon },
  { href: "/connect", key: "profile.connectLink", Icon: ConnectIcon },
  { href: "/privacy", key: "profile.privacyLink", Icon: ShieldIcon },
  { href: "/support", key: "profile.supportLink", Icon: HeartIcon },
];

export default function ProfilePage() {
  const { t, setLanguage } = useI18n();
  const { signOut, reload } = useAuth();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [profile, setProfile] = useState<ContextProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState<{ days: number; checkins: number; moments: number } | null>(null);
  const [theme, setTheme] = useState<Theme>("system");
  const [accent, setAccent] = useState<Accent>("iris");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .profile(controller.signal)
      .then((d) => {
        setData(d);
        setProfile(d.profile);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    api
      .history(controller.signal, 100)
      .then((h) =>
        setStats({ days: blooms(h).length, checkins: h.length, moments: moments(h, readCounters()).filter((m) => m.got).length }),
      )
      .catch(() => undefined);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of device settings after hydration */
    setTheme(readTheme());
    setAccent(readAccent());
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => controller.abort();
  }, []);

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!data || !profile) return <PageSkeleton label={t("app.loading")} />;

  const set = <K extends keyof ContextProfile>(k: K, v: ContextProfile[K]) => {
    setSaved(false);
    setProfile((p) => (p ? { ...p, [k]: v } : p));
  };

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.updateProfile({ ...profile, display_name: profile.display_name?.trim() || null });
      setData(updated);
      setLanguage(updated.profile.preferred_language);
      await reload();
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function setPref<K extends keyof Preferences>(k: K, v: Preferences[K]) {
    setData((d) => (d ? { ...d, preferences: { ...d.preferences, [k]: v } } : d)); // optimistic
    try {
      setData(await api.updatePreferences({ [k]: v }));
    } catch {
      setFailed(true);
    }
  }

  const comm = profile.communication_preferences ?? { tone: "gentle", length: "short" };

  return (
    <div className="space-y-8">
      <header className="animate-rise flex flex-col items-center px-1 pt-2 text-center">
        <Avatar
          name={profile.display_name}
          mood={5}
          className="h-24 w-24 text-4xl shadow-[0_18px_40px_-16px_rgb(var(--shadow)/0.5)]"
        />
        <h1 className="mt-5 font-display text-[2.6rem] leading-none tracking-[-0.035em] text-ink">
          {profile.display_name || t("profile.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-faint">{t(`countries.${profile.country}`)}</p>
      </header>

      <section aria-label={t("journey.statsLabel")} className="grid grid-cols-3 gap-2.5">
        {[
          { v: stats?.days, k: "journey.daysShowedUp" },
          { v: stats?.checkins, k: "journey.checkins" },
          { v: stats?.moments, k: "journey.momentsCount" },
        ].map(({ v, k }, i) => (
          <Link
            key={k}
            href="/journey"
            className="card animate-rise flex flex-col p-3.5 transition-transform active:scale-[0.97]"
            style={stagger(i + 1)}
          >
            <span className="font-display text-[2rem] leading-none tabular-nums text-ink">{v ?? "–"}</span>
            <span className="mt-1.5 text-[12px] leading-tight text-ink-faint">{t(k)}</span>
          </Link>
        ))}
      </section>

      <Card className="flex flex-col divide-y divide-line" flush>
        {LINKS.map(({ href, key, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 px-5 py-4 text-[15px] font-medium text-ink transition-colors hover:bg-surface-2/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1">{t(key)}</span>
            <ChevronRightIcon className="h-5 w-5 text-ink-faint transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </Card>

      <InstallPrompt />

      <section aria-labelledby="appearance-title">
        <SectionTitle id="appearance-title">{t("profile.appearance")}</SectionTitle>
        <Card>
          <Segmented
            block
            label={t("profile.appearance")}
            value={theme}
            onChange={(v) => {
              setTheme(v);
              applyTheme(v);
            }}
            options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: t(`profile.theme.${v}`) }))}
          />
          <AccentPicker
            value={accent}
            onChange={(a) => {
              setAccent(a);
              applyAccent(a);
            }}
          />
        </Card>
      </section>

      <section aria-labelledby="about-title">
        <SectionTitle id="about-title">{t("profile.contextTitle")}</SectionTitle>
        <Card className="space-y-5">
          <button
            type="button"
            aria-expanded={aboutOpen}
            onClick={() => setAboutOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-sm leading-relaxed text-ink-soft">{t("profile.contextHint")}</span>
            <ChevronRightIcon
              className={cn("h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300", aboutOpen && "rotate-90")}
            />
          </button>
          {aboutOpen && (
            <div className="animate-rise space-y-5">
              <Field label={t("onboarding.nameLabel")} htmlFor="p-name">
                <Input
                  id="p-name"
                  maxLength={80}
                  value={profile.display_name ?? ""}
                  onChange={(e) => set("display_name", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("auth.country")} htmlFor="p-country">
                  <Select id="p-country" value={profile.country} onChange={(e) => set("country", e.target.value)}>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`countries.${c}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("onboarding.languageLabel")} htmlFor="p-lang">
                  <Select
                    id="p-lang"
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
                <Field label={t("onboarding.ageLabel")} htmlFor="p-age">
                  <Select
                    id="p-age"
                    value={profile.age_range ?? ""}
                    onChange={(e) => set("age_range", (e.target.value || null) as ContextProfile["age_range"])}
                  >
                    <option value="">—</option>
                    {(["18-21", "22-25", "26-30", "31+"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`options.age.${v}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("onboarding.occupationLabel")} htmlFor="p-occ">
                  <Select
                    id="p-occ"
                    value={profile.occupation ?? ""}
                    onChange={(e) => set("occupation", (e.target.value || null) as ContextProfile["occupation"])}
                  >
                    <option value="">—</option>
                    {(["student", "working", "both", "other"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`options.occupation.${v}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("profile.livingLabel")} htmlFor="p-living">
                  <Select
                    id="p-living"
                    value={profile.living_situation ?? ""}
                    onChange={(e) => set("living_situation", (e.target.value || null) as ContextProfile["living_situation"])}
                  >
                    <option value="">—</option>
                    {(["with_family", "hostel_or_pg", "shared", "alone", "partner", "other"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`options.living.${v}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("onboarding.styleLabel")}</p>
                <Segmented
                  label={t("onboarding.styleLabel")}
                  value={profile.preferred_support_style}
                  onChange={(v) => set("preferred_support_style", v)}
                  options={(["practical", "reflective", "mixed"] as const).map((v) => ({
                    value: v,
                    label: t(`options.style.${v}`),
                  }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("profile.toneLabel")}</p>
                  <Segmented
                    label={t("profile.toneLabel")}
                    value={comm.tone}
                    onChange={(v) => set("communication_preferences", { ...comm, tone: v })}
                    options={(["gentle", "direct"] as const).map((v) => ({ value: v, label: t(`options.tone.${v}`) }))}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("profile.lengthLabel")}</p>
                  <Segmented
                    label={t("profile.lengthLabel")}
                    value={comm.length}
                    onChange={(v) => set("communication_preferences", { ...comm, length: v })}
                    options={(["short", "medium"] as const).map((v) => ({ value: v, label: t(`options.length.${v}`) }))}
                  />
                </div>
              </div>
              <Field label={t("profile.notesLabel")} htmlFor="p-notes">
                <TextArea
                  id="p-notes"
                  maxLength={500}
                  value={profile.cultural_context_notes ?? ""}
                  onChange={(e) => set("cultural_context_notes", e.target.value || null)}
                />
              </Field>
              <div className="flex items-center gap-3">
                <Button onClick={save} loading={saving}>
                  {t("profile.save")}
                </Button>
                {saved && (
                  <span className="text-sm text-green" role="status">
                    {t("profile.saved")}
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="prefs-title">
        <SectionTitle id="prefs-title">{t("profile.preferencesTitle")}</SectionTitle>
        <Card>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("onboarding.notificationsLabel")}</p>
            <Segmented
              label={t("onboarding.notificationsLabel")}
              value={data.preferences.notification_frequency}
              onChange={(v) => setPref("notification_frequency", v)}
              options={(["off", "occasional", "daily"] as const).map((v) => ({
                value: v,
                label: t(`options.notifications.${v}`),
              }))}
            />
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">{t("profile.minutesLabel")}</p>
            <Segmented
              label={t("profile.minutesLabel")}
              value={data.preferences.preferred_intervention_minutes}
              onChange={(v) => setPref("preferred_intervention_minutes", v)}
              options={[5, 10, 15, 20].map((v) => ({ value: v, label: String(v) }))}
            />
          </div>
          <div className="mt-2 divide-y divide-line">
            <Toggle
              label={t("profile.voiceLabel")}
              checked={data.preferences.voice_enabled}
              onChange={(v) => setPref("voice_enabled", v)}
            />
            <Toggle
              label={t("profile.showPatternsLabel")}
              checked={data.preferences.show_patterns}
              onChange={(v) => setPref("show_patterns", v)}
            />
          </div>
        </Card>
      </section>

      <Button variant="secondary" block onClick={signOut}>
        {t("auth.signOut")}
      </Button>
      <p className="pb-2 text-center text-xs text-ink-faint">{t("app.disclaimer")}</p>
    </div>
  );
}

export function AccentPicker({ value, onChange }: { value: Accent; onChange: (a: Accent) => void }) {
  const t = useI18n().t;
  return (
    <div className="mt-5">
      <p id="accent-label" className="mb-3 text-sm font-medium text-ink">
        {t("profile.accent")}
      </p>
      <div role="radiogroup" aria-labelledby="accent-label" className="flex flex-wrap gap-3">
        {(Object.keys(ACCENTS) as Accent[]).map((a) => {
          const on = a === value;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t(`profile.accents.${a}`)}
              title={t(`profile.accents.${a}`)}
              onClick={() => onChange(a)}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-200 active:scale-90",
                on ? "ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface)]" : "hover:scale-105",
              )}
              style={{ background: ACCENTS[a] }}
            >
              {on && <CheckIcon className={cn("h-5 w-5", a === "iris" ? "text-white" : "text-[#121217]")} strokeWidth={2.6} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
