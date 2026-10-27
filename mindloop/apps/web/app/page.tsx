"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Brand } from "@/components/AppShell";
import {
  ArrowRightIcon,
  BookIcon,
  BulbIcon,
  CalmIcon,
  ConnectIcon,
  JourneyIcon,
  LifebuoyIcon,
  ShieldIcon,
  TalkIcon,
  WindIcon,
} from "@/components/icons";
import { MoodFace } from "@/components/MoodFace";
import { Plant } from "@/components/Plant";
import { ButtonLink, stagger } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

const SAMPLE_GARDEN = [3, 2, 4, 1, 3, 5, 4];

export default function Landing() {
  const t = useT();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(user.onboarding_completed ? "/home" : "/onboarding");
  }, [loading, user, router]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
      <header className="flex items-center justify-between">
        <Brand />
        <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink">
          {t("landing.signIn")}
        </Link>
      </header>

      <section className="grid flex-1 items-center gap-12 py-12 md:grid-cols-[1.15fr_0.85fr] md:py-20">
        <div>
          <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft">
            <span className="h-2 w-2 rounded-full bg-accent ring-2 ring-ink/10" aria-hidden />
            {t("landing.eyebrow")}
          </p>
          <h1
            className="animate-rise mt-6 font-display text-[3.4rem] leading-[0.95] tracking-[-0.035em] text-ink text-balance sm:text-[5rem]"
            style={stagger(1)}
          >
            {t("landing.titleA")} <em className="font-quote font-normal tracking-normal text-accent-fg">{t("landing.titleB")}</em>
          </h1>
          <p className="animate-rise mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft text-pretty" style={stagger(2)}>
            {t("landing.heroSub")}
          </p>
          <div className="animate-rise mt-8 flex flex-col gap-3 sm:flex-row" style={stagger(3)}>
            <ButtonLink href="/register" size="lg">
              {t("landing.start")}
              <ArrowRightIcon className="h-5 w-5" />
            </ButtonLink>
            <ButtonLink href="/breathe" variant="secondary" size="lg">
              <WindIcon className="h-5 w-5" />
              {t("landing.tryNow")}
            </ButtonLink>
          </div>
          <p className="animate-rise mt-5 flex items-center gap-2 text-[13px] text-ink-faint" style={stagger(4)}>
            <ShieldIcon className="h-4 w-4" />
            {t("landing.privacy")}
          </p>
        </div>

        <HeroPreview />
      </section>

      <section aria-labelledby="how-title" className="py-10">
        <h2 id="how-title" className="max-w-2xl font-display text-[2.4rem] leading-[1.02] tracking-[-0.035em] text-ink text-balance sm:text-5xl">
          {t("landing.howTitle")}
        </h2>
        <ol className="mt-10 grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="card relative overflow-hidden p-6">
              <span className="font-display text-6xl leading-none text-ink-faint/40">0{n}</span>
              <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em] text-ink">{t(`landing.how${n}Title`)}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{t(`landing.how${n}`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="inside-title" className="py-10">
        <h2 id="inside-title" className="sr-only">
          {t("landing.insideTitle")}
        </h2>
        <ul className="grid gap-3 md:grid-cols-6">
          <Feature className="md:col-span-4" Icon={CalmIcon} title={t("landing.f1Title")} body={t("landing.f1")} dark />
          <Feature className="md:col-span-2" Icon={TalkIcon} title={t("landing.f2Title")} body={t("landing.f2")} />
          <Feature className="md:col-span-2" Icon={ConnectIcon} title={t("landing.f3Title")} body={t("landing.f3")} />
          <Feature className="md:col-span-2" Icon={JourneyIcon} title={t("landing.f4Title")} body={t("landing.f4")} />
          <Feature className="md:col-span-2" Icon={BookIcon} title={t("landing.f5Title")} body={t("landing.f5")} />
          <Feature className="md:col-span-3" Icon={BulbIcon} title={t("landing.f6Title")} body={t("landing.f6")} />
          <Feature className="md:col-span-3" Icon={LifebuoyIcon} title={t("landing.f7Title")} body={t("landing.f7")} />
        </ul>
      </section>

      <section className="py-14 text-center">
        <p className="mx-auto max-w-2xl font-display text-[2.2rem] leading-[1.1] tracking-[-0.035em] text-ink text-balance">{t("landing.notAlone")}</p>
        <ButtonLink href="/register" size="lg" variant="accent" className="mt-8">
          {t("landing.start")}
        </ButtonLink>
      </section>

      <footer className="mt-6 space-y-2 border-t border-line pt-6 text-center text-sm text-ink-faint">
        <p>{t("app.disclaimer")}</p>
        <Link href="/support" className="inline-block font-medium text-care underline underline-offset-4">
          {t("app.crisisLink")}
        </Link>
      </footer>
    </main>
  );
}

function Feature({
  Icon,
  title,
  body,
  className,
  dark,
}: {
  Icon: typeof CalmIcon;
  title: string;
  body: string;
  className?: string;
  dark?: boolean;
}) {
  return (
    <li className={`${dark ? "relative overflow-hidden rounded-[var(--radius-card)] bg-feature text-on-feature" : "card"} p-6 ${className ?? ""}`}>
      {dark && <span aria-hidden className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-accent opacity-20 blur-3xl" />}
      <span className={`relative flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? "bg-accent text-on-accent" : "bg-surface-2 text-ink"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="relative mt-8 text-lg font-semibold tracking-[-0.01em]">{title}</h3>
      <p className={`relative mt-1.5 max-w-[48ch] text-[15px] leading-relaxed ${dark ? "opacity-70" : "text-ink-soft"}`}>{body}</p>
    </li>
  );
}

/** A composed, non-interactive glimpse of the app: today's check-in, the prompt and the garden. */
function HeroPreview() {
  const t = useT();
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm">
      <span
        className="absolute inset-x-6 top-10 h-72 rounded-full opacity-70 blur-3xl"
        style={{ background: "linear-gradient(135deg, var(--aura-a), var(--aura-b))" }}
      />
      <div className="card animate-rise relative rotate-[-2deg] p-5" style={stagger(2)}>
        <p className="font-display text-2xl text-ink">{t("mood.question")}</p>
        <div className="mt-4 grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].map((m) => (
            <div key={m} className={`flex flex-col items-center gap-1 rounded-2xl py-2 ${m === 4 ? "bg-raised ring-1 ring-line" : "opacity-50"}`}>
              <MoodFace mood={m} className="h-10 w-10" />
              <span className="text-[10px] font-medium text-ink-soft">{t(`mood.${m}`)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="animate-rise relative z-10 -mt-3 ml-8 rotate-[2.5deg] rounded-[var(--radius-card)] bg-feature p-5 text-on-feature shadow-xl" style={stagger(4)}>
        <p className="text-[12px] font-medium opacity-60">{t("home.promptTitle")}</p>
        <p className="mt-2 font-quote text-2xl italic leading-snug">{t("prompts.0")}</p>
      </div>
      <div className="card animate-rise relative -mt-2 mr-6 rotate-[-1deg] p-5" style={stagger(6)}>
        <p className="text-[13px] font-semibold text-ink">{t("journey.gardenTitle")}</p>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {SAMPLE_GARDEN.map((m, i) => (
            <div key={i} className="flex flex-col items-center" style={stagger(i + 6)}>
              <Plant mood={m} className="animate-sprout h-12 w-9" />
              <span className="mt-0.5 h-1.5 w-7 rounded-full bg-[color-mix(in_oklab,#8a6a4a_45%,var(--surface-2))]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
