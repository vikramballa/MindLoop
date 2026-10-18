"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { MOOD_COLORS } from "@/lib/mood";
import { CalmIcon, ConnectIcon, HeartIcon, HomeIcon, JourneyIcon, LogoMark, PlusIcon, ProfileIcon, TalkIcon } from "./icons";
import { PageSkeleton, cn } from "./ui";

type NavItem = { href: string; key: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const TABS: NavItem[] = [
  { href: "/home", key: "nav.home", Icon: HomeIcon },
  { href: "/journey", key: "nav.journey", Icon: JourneyIcon },
  { href: "/calm", key: "nav.calm", Icon: CalmIcon },
  { href: "/talk", key: "nav.talk", Icon: TalkIcon },
];

const DESKTOP_NAV: NavItem[] = [
  ...TABS,
  { href: "/connect", key: "nav.connect", Icon: ConnectIcon },
  { href: "/profile", key: "nav.profile", Icon: ProfileIcon },
];

/** Routes that take over the whole screen (no tab bar, no header). */
const IMMERSIVE = ["/check-in"];

export function Brand({ className }: { className?: string }) {
  const t = useT();
  return (
    <span className={cn("flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]", className)}>
      <LogoMark className="h-7 w-7" />
      {t("app.name")}
    </span>
  );
}

/** Rounded-square avatar tinted with a mood gradient; shows the first letter of the nickname. */
export function Avatar({ name, mood = 4, className }: { name?: string | null; mood?: number; className?: string }) {
  const [a, b] = MOOD_COLORS[mood] ?? MOOD_COLORS[4];
  return (
    <span
      aria-hidden
      className={cn("flex items-center justify-center rounded-[38%] font-semibold text-[#1e1a26]", className)}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {(name?.trim()[0] ?? "✿").toUpperCase()}
    </span>
  );
}

/** Authenticated layout: guards the route, then renders a sidebar (desktop) or a floating tab bar (mobile). */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!user.onboarding_completed) router.replace("/onboarding");
  }, [loading, user, router]);

  if (loading || !user || !user.onboarding_completed) {
    return (
      <div className="mx-auto max-w-2xl px-5 pt-20">
        <PageSkeleton label={t("app.loading")} />
      </div>
    );
  }

  if (IMMERSIVE.some((p) => pathname.startsWith(p))) {
    return (
      <main id="main" className="mx-auto min-h-dvh w-full max-w-xl px-5 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        {children}
      </main>
    );
  }

  const active = (href: string) => pathname.startsWith(href);

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line/70 px-4 py-7 md:flex">
        <Link href="/home" className="mb-8 px-3">
          <Brand />
        </Link>
        <Link
          href="/check-in"
          className="mb-6 flex h-12 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-on-accent shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--accent)_80%,transparent)] transition-transform active:scale-[0.97]"
        >
          <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
          {t("nav.checkin")}
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-0.5">
          {DESKTOP_NAV.map(({ href, key, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] transition-colors",
                active(href) ? "bg-surface font-semibold text-ink ring-1 ring-line" : "text-ink-soft hover:bg-surface/70 hover:text-ink",
              )}
            >
              <Icon className="h-5 w-5" />
              {t(key)}
            </Link>
          ))}
        </nav>
        <Link
          href="/support"
          className="mt-auto flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-care hover:bg-care-soft"
        >
          <HeartIcon className="h-4 w-4" />
          {t("app.crisisLink")}
        </Link>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:hidden">
          <Link href="/home" aria-label={t("nav.home")}>
            <LogoMark className="h-8 w-8" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/support"
              className="flex h-9 items-center gap-1.5 rounded-full border border-care-border bg-care-soft px-3.5 text-[13px] font-medium text-care"
            >
              <HeartIcon className="h-4 w-4" />
              {t("nav.support")}
            </Link>
            <Link href="/profile" aria-label={t("nav.profile")} aria-current={active("/profile") ? "page" : undefined}>
              <Avatar
                name={user.display_name}
                className={cn("h-9 w-9 text-sm", active("/profile") && "ring-2 ring-ink ring-offset-2 ring-offset-[var(--bg)]")}
              />
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-36 pt-5 md:pb-14 md:pt-12">
          {children}
        </main>
      </div>

      <nav aria-label={t("nav.main")} className="fixed inset-x-4 bottom-[max(0.9rem,env(safe-area-inset-bottom))] z-20 md:hidden">
        <ul className="glass mx-auto grid max-w-md grid-cols-5 items-center rounded-[1.6rem] p-1.5">
          {[TABS[0], TABS[1], null, TABS[2], TABS[3]].map((item) =>
            item === null ? (
              <li key="checkin" className="flex justify-center">
                <Link
                  href="/check-in"
                  aria-label={t("nav.checkin")}
                  className="-my-3 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-ink text-bg shadow-[0_12px_24px_-10px_rgb(var(--shadow)/0.7)] transition-transform duration-200 active:scale-90"
                >
                  <PlusIcon className="h-6 w-6" strokeWidth={2.4} />
                </Link>
              </li>
            ) : (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active(item.href) ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[1.1rem] py-2 text-[11px] font-medium transition-colors duration-200",
                    active(item.href) ? "text-ink" : "text-ink-faint",
                  )}
                >
                  <span className="relative">
                    <item.Icon className="h-[22px] w-[22px]" strokeWidth={active(item.href) ? 2.1 : 1.8} />
                    {active(item.href) && (
                      <span aria-hidden className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink" />
                    )}
                  </span>
                  {t(item.key)}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </div>
  );
}
