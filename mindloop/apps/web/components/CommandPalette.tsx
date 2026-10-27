"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type SVGProps,
} from "react";
import { useT } from "@/lib/i18n";
import { applyTheme, effectiveTheme } from "@/lib/theme";
import {
  BulbIcon,
  CalmIcon,
  ConnectIcon,
  HandIcon,
  HeartIcon,
  HomeIcon,
  JourneyIcon,
  LifebuoyIcon,
  MoonIcon,
  MoonSunIcon,
  PlusIcon,
  ProfileIcon,
  ReportIcon,
  SearchIcon,
  ShieldIcon,
  SoundIcon,
  SunIcon,
  TalkIcon,
  WindIcon,
  BookIcon,
} from "./icons";
import { cn } from "./ui";

type Group = "go" | "do" | "settings";
export type Command = {
  id: string;
  group: Group;
  label: string;
  /** Extra words people might type (English; labels are matched in the user's language). */
  keywords: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  href?: string;
  run?: () => void;
};

const OPEN_EVENT = "ml:open-palette";

/** Opens the palette from anywhere (header buttons, the sidebar). */
export function openPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function useCommands(): Command[] {
  const t = useT();
  return useMemo(
    () => [
      { id: "checkin", group: "do", label: t("palette.items.checkin"), keywords: "mood log feeling today new", Icon: PlusIcon, href: "/check-in" },
      { id: "reframe", group: "do", label: t("palette.items.reframe"), keywords: "cbt thought record negative journal reflect worry", Icon: BulbIcon, href: "/reflect/reframe" },
      { id: "gratitude", group: "do", label: t("palette.items.gratitude"), keywords: "gratitude thankful journal reflect good", Icon: SunIcon, href: "/reflect/gratitude" },
      { id: "sigh", group: "do", label: t("palette.items.breatheSigh"), keywords: "breathe breathing calm anxious panic", Icon: WindIcon, href: "/calm?tool=breathe&rhythm=sigh" },
      { id: "478", group: "do", label: t("palette.items.breathe478"), keywords: "breathe sleep night insomnia", Icon: MoonIcon, href: "/calm?tool=breathe&rhythm=478" },
      { id: "box", group: "do", label: t("palette.items.breatheBox"), keywords: "breathe focus square", Icon: WindIcon, href: "/calm?tool=breathe&rhythm=box" },
      { id: "ground", group: "do", label: t("palette.items.ground"), keywords: "grounding senses panic present 54321", Icon: HandIcon, href: "/calm?tool=ground" },
      { id: "sounds", group: "do", label: t("palette.items.sounds"), keywords: "rain waves noise music ambient", Icon: SoundIcon, href: "/calm?tool=sounds" },
      { id: "reach", group: "do", label: t("palette.items.reach"), keywords: "friend message lonely whatsapp connect", Icon: ConnectIcon, href: "/connect" },
      { id: "home", group: "go", label: t("nav.home"), keywords: "today home dashboard", Icon: HomeIcon, href: "/home" },
      { id: "journey", group: "go", label: t("nav.journey"), keywords: "history patterns garden calendar trends insights", Icon: JourneyIcon, href: "/journey" },
      { id: "reflect", group: "go", label: t("nav.reflect"), keywords: "journal reflect entries diary", Icon: BookIcon, href: "/reflect" },
      { id: "calm", group: "go", label: t("nav.calm"), keywords: "calm relax tools", Icon: CalmIcon, href: "/calm" },
      { id: "talk", group: "go", label: t("nav.talk"), keywords: "chat talk companion voice ai", Icon: TalkIcon, href: "/talk" },
      { id: "plan", group: "go", label: t("nav.safetyPlan"), keywords: "safety plan crisis coping contacts", Icon: LifebuoyIcon, href: "/safety-plan" },
      { id: "report", group: "go", label: t("nav.report"), keywords: "report summary print pdf counsellor therapist doctor", Icon: ReportIcon, href: "/journey/report" },
      { id: "support", group: "go", label: t("nav.support"), keywords: "help crisis helpline emergency call", Icon: HeartIcon, href: "/support" },
      { id: "profile", group: "settings", label: t("nav.profile"), keywords: "profile settings account accent colour color", Icon: ProfileIcon, href: "/profile" },
      { id: "privacy", group: "settings", label: t("profile.privacyLink"), keywords: "privacy data delete export consent", Icon: ShieldIcon, href: "/privacy" },
      {
        id: "theme",
        group: "settings",
        label: t("palette.items.theme"),
        keywords: "dark light mode theme appearance",
        Icon: MoonSunIcon,
        run: () => applyTheme(effectiveTheme() === "dark" ? "light" : "dark"),
      },
    ],
    [t],
  );
}

/** Every word typed must appear in the label or keywords. Label-prefix matches sort first. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  const hits = commands.filter((c) => {
    const hay = `${c.label} ${c.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const q = words.join(" ");
  return hits.sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)));
}

const GROUP_ORDER: Group[] = ["do", "go", "settings"];

export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const commands = useCommands();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) close();
        else show();
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [open, show, close]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const hits = filterCommands(commands, query);
    // Keep groups together when browsing; trust the ranking once someone is typing.
    return query.trim() ? hits : GROUP_ORDER.flatMap((g) => hits.filter((c) => c.group === g));
  }, [commands, query]);

  if (!open) return null;

  const select = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    if (c.run) c.run();
    else if (c.href) router.push(c.href);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center px-3 pt-[max(1rem,12vh)]">
      <div aria-hidden className="animate-fade absolute inset-0 bg-[rgb(10_10_16/0.45)] backdrop-blur-sm" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.label")}
        className="glass animate-sheet relative flex max-h-[min(34rem,80dvh)] w-full max-w-xl flex-col overflow-hidden rounded-[1.6rem]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon className="h-5 w-5 shrink-0 text-ink-faint" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label={t("palette.label")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={t("palette.placeholder")}
            className="h-14 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
          />
          <button type="button" onClick={close} className="kbd hover:text-ink" aria-label={t("palette.close")}>
            Esc
          </button>
        </div>
        <ul id={listId} role="listbox" aria-label={t("palette.label")} className="flex-1 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-faint">{t("palette.empty")}</li>}
          {results.map((c, i) => {
            const header = !query.trim() && (i === 0 || results[i - 1].group !== c.group);
            return (
              <li key={c.id} role="presentation">
                {header && (
                  <p role="presentation" className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    {t(`palette.groups.${c.group}`)}
                  </p>
                )}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => select(c)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                    i === active ? "bg-accent-soft text-ink" : "text-ink-soft",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      i === active ? "bg-accent text-on-accent" : "bg-surface-2 text-ink-soft",
                    )}
                  >
                    <c.Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 font-medium">{c.label}</span>
                  {i === active && <span className="kbd">↵</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-ink-faint sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            {t("palette.navigate")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="kbd">↵</span>
            {t("palette.select")}
          </span>
        </div>
      </div>
    </div>
  );
}
