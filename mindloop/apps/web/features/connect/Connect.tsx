"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, HeartIcon, ShareIcon, TalkIcon } from "@/components/icons";
import { Card, Chip, TextArea, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { localDate } from "@/lib/mood";
import { bump } from "@/lib/progress";

const CATEGORIES = ["reconnect", "hangout", "share", "checkon"] as const;
type Category = (typeof CATEGORIES)[number];
const TEMPLATES_PER_CATEGORY = 3;
const MISSIONS = ["reply", "voice", "eat", "hi", "group", "outside", "compliment", "family"] as const;
const MISSIONS_KEY = "ml_missions";

function loadMissions(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MISSIONS_KEY) ?? "null") as { day: string; done: string[] } | null;
    return raw?.day === localDate() ? raw.done : [];
  } catch {
    return [];
  }
}

function saveMissions(done: string[]) {
  try {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify({ day: localDate(), done }));
  } catch {
    /* private mode: missions just won't persist */
  }
}

export function Connect() {
  const t = useT();
  const [category, setCategory] = useState<Category>("reconnect");
  const [text, setText] = useState(() => t("connect.templates.reconnect.0"));
  const [picked, setPicked] = useState(0);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser-only capabilities, read once after hydration */
    setCanShare(typeof navigator.share === "function");
    setDone(loadMissions());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function pick(cat: Category, i: number) {
    setCategory(cat);
    setPicked(i);
    setText(t(`connect.templates.${cat}.${i}`));
    setSent(false);
  }

  function shared() {
    if (!sent) bump("reach");
    setSent(true);
    void api.track("reach_out_shared", { category });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      shared();
    } catch {
      /* clipboard blocked: the text is still selectable in the box */
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ text });
      shared();
    } catch {
      /* user cancelled */
    }
  }

  function toggleMission(m: string) {
    const next = done.includes(m) ? done.filter((x) => x !== m) : [...done, m];
    setDone(next);
    saveMissions(next);
  }

  const encoded = encodeURIComponent(text);
  const actionClass =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-transform active:scale-[0.97]";

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("connect.pickCategory")}</h2>
        <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => pick(c, 0)} className="shrink-0">
              {t(`connect.categories.${c}`)}
            </Chip>
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {Array.from({ length: TEMPLATES_PER_CATEGORY }, (_, i) => (
            <li key={`${category}-${i}`}>
              <button
                type="button"
                onClick={() => pick(category, i)}
                aria-pressed={picked === i}
                className={cn(
                  "w-full rounded-[1.3rem] rounded-bl-md border px-4 py-3 text-left text-[15px] leading-relaxed transition-[background-color,border-color,color] duration-200",
                  picked === i ? "border-transparent bg-accent text-on-accent" : "border-line bg-raised text-ink-soft hover:border-ink/30",
                )}
              >
                {t(`connect.templates.${category}.${i}`)}
              </button>
            </li>
          ))}
        </ul>

        <label htmlFor="reach-text" className="mt-5 block text-sm font-semibold text-ink">
          {t("connect.edit")}
        </label>
        <TextArea id="reach-text" className="mt-2 min-h-24" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a
            href={`https://wa.me/?text=${encoded}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={shared}
            className={cn(actionClass, "bg-[#1f7a4d] text-white")}
          >
            <TalkIcon className="h-4 w-4" />
            {t("connect.whatsapp")}
          </a>
          <a href={`sms:?&body=${encoded}`} onClick={shared} className={cn(actionClass, "bg-ink text-bg")}>
            <TalkIcon className="h-4 w-4" />
            {t("connect.sms")}
          </a>
          {canShare && (
            <button type="button" onClick={nativeShare} className={cn(actionClass, "border border-line bg-raised text-ink")}>
              <ShareIcon className="h-4 w-4" />
              {t("connect.share")}
            </button>
          )}
          <button type="button" onClick={copy} className={cn(actionClass, "border border-line bg-raised text-ink")}>
            {copied ? <CheckIcon className="h-4 w-4 text-green" /> : <CopyIcon className="h-4 w-4" />}
            {copied ? t("connect.copied") : t("connect.copy")}
          </button>
        </div>

        {sent && (
          <p role="status" className="animate-rise mt-4 rounded-2xl bg-green-soft px-4 py-3 text-sm leading-relaxed text-ink">
            {t("connect.sentNote")}
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("connect.missionsTitle")}</h2>
          {done.length > 0 && (
            <span className="shrink-0 rounded-full bg-green-soft px-3 py-1 text-xs font-semibold text-green">
              {t("connect.missionsDone", { count: done.length })}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-faint">{t("connect.missionsIntro")}</p>
        <ul className="mt-4 space-y-2">
          {MISSIONS.map((m) => {
            const on = done.includes(m);
            return (
              <li key={m}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleMission(m)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors",
                    on ? "border-transparent bg-accent-soft text-ink" : "border-line bg-raised text-ink-soft hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      on ? "border-ink bg-ink text-bg" : "border-line",
                    )}
                  >
                    {on && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className={cn(on && "line-through decoration-ink-faint/60")}>{t(`connect.missions.${m}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-care-soft text-care">
          <HeartIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{t("connect.noOneTitle")}</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{t("connect.noOne")}</p>
          <Link href="/support" className="mt-3 inline-block text-sm font-semibold text-care underline underline-offset-4">
            {t("connect.noOneCta")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
