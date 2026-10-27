"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { MOOD_COLORS } from "@/lib/mood";
import { CommandPalette, openPalette } from "./CommandPalette";
import {
  BookIcon,
  CalmIcon,
  ConnectIcon,
  HeartIcon,
  HomeIcon,
  JourneyIcon,
  LifebuoyIcon,
  LogoMark,
  PlusIcon,
  ProfileIcon,
  SearchIcon,
  TalkIcon,
} from "./icons";
import { PageSkeleton, cn } from "./ui";

type NavItem = { href: string; key: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const TABS: NavItem[] = [
  { href: "/home", key: "nav.home", Icon: HomeIcon },
  { href: "/journey", key: "nav.journey", Icon: JourneyIcon },
  { href: "/calm", key: "nav.calm", Icon: CalmIcon },
  { href: "/talk", key: "nav.talk", Icon: TalkIcon },
];

const DESKTOP_NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: "nav.groupDaily", items: [TABS[0], TABS[1]] },
  {
    group: "nav.groupTools",
    items: [
      { href: "/reflect", key: "nav.reflect", Icon: BookIcon },
      TABS[2],
      TABS[3],
      { href: "/connect", key: "nav.connect", Icon: ConnectIcon },
    ],
  },
  {
    group: "nav.groupYou",
    items: [
      { href: "/safety-plan", key: "nav.safetyPlan", Icon: LifebuoyIcon },
      { href: "/profile", key: "nav.profile", Icon: ProfileIcon },
    ],
  },
];

/** Routes that take over the whole screen (no tab bar, no header). `/reflect/` covers the exercises, not the hub. */
const IMMERSIVE = ["/check-in", "/reflect/"];

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

  // A tab is active on its own page and its sub-pages (e.g. the report under Journey).
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh md:flex">
      <CommandPalette />
      <aside className="no-print sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r border-line/70 bg-surface/40 px-4 py-6 backdrop-blur-xl md:flex">
        <Link href="/home" className="mb-6 px-2">
          <Brand />
        </Link>
        <button
          type="button"
          onClick={openPalette}
          className="mb-3 flex h-10 items-center gap-2.5 rounded-xl border border-line bg-raised px-3 text-sm text-ink-faint transition-colors hover:border-ink/20 hover:text-ink-soft"
        >
          <SearchIcon className="h-4 w-4" />
          <span className="flex-1 text-left">{t("nav.search")}</span>
          <span className="kbd">⌘K</span>
        </button>
        <Link
          href="/check-in"
          className="mb-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-on-accent shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--accent)_80%,transparent)] transition-transform active:scale-[0.97]"
        >
          <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
          {t("nav.checkin")}
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-4 overflow-y-auto">
          {DESKTOP_NAV.map(({ group, items }) => (
            <div key={group}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{t(group)}</p>
              <div className="flex flex-col gap-0.5">
                {items.map(({ href, key, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active(href) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors",
                      active(href) ? "bg-accent-soft font-semibold text-ink" : "text-ink-soft hover:bg-surface-2/70 hover:text-ink",
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active(href) && "text-accent-fg")} />
                    {t(key)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-4">
          <Link
            href="/support"
            className="flex items-center gap-2 rounded-xl border border-care-border bg-care-soft px-3 py-2.5 text-sm font-medium text-care transition-colors hover:brightness-[0.98]"
          >
            <HeartIcon className="h-4 w-4" />
            {t("app.crisisLink")}
          </Link>
          <Link href="/profile" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2/70">
            <Avatar name={user.display_name} className="h-9 w-9 text-sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{user.display_name ?? t("nav.profile")}</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="no-print flex items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:hidden">
          <Link href="/home" aria-label={t("nav.home")}>
            <LogoMark className="h-8 w-8" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPalette}
              aria-label={t("nav.search")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-raised/80 text-ink-soft backdrop-blur"
            >
              <SearchIcon className="h-[18px] w-[18px]" />
            </button>
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
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-36 pt-5 md:pb-14 md:pt-12 lg:max-w-3xl">
          {children}
        </main>
      </div>

      <nav aria-label={t("nav.main")} className="no-print fixed inset-x-4 bottom-[max(0.9rem,env(safe-area-inset-bottom))] z-20 md:hidden">
        <ul className="glass mx-auto grid max-w-md grid-cols-5 items-center rounded-[1.6rem] p-1.5">
          {[TABS[0], TABS[1], null, TABS[2], TABS[3]].map((item) =>
            item === null ? (
              <li key="checkin" className="flex justify-center">
                <Link
                  href="/check-in"
                  aria-label={t("nav.checkin")}
                  className="-my-3 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-accent text-on-accent shadow-[0_14px_28px_-10px_color-mix(in_oklab,var(--accent)_75%,transparent)] transition-transform duration-200 active:scale-90"
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
                    active(item.href) ? "bg-accent-soft text-ink" : "text-ink-faint",
                  )}
                >
                  <item.Icon className={cn("h-[22px] w-[22px]", active(item.href) && "text-accent-fg")} strokeWidth={active(item.href) ? 2.1 : 1.8} />
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
