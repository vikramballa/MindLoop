"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon, ConnectIcon, HandIcon, SoundIcon, SparkIcon, WindIcon } from "@/components/icons";
import { Card, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { bump } from "@/lib/progress";
import { Actions } from "./Actions";
import { Breathing, RHYTHMS, type Rhythm } from "./Breathing";
import { Grounding } from "./Grounding";
import { Sounds } from "./Sounds";

const TOOLS = [
  { key: "breathe", Icon: WindIcon },
  { key: "ground", Icon: HandIcon },
  { key: "sounds", Icon: SoundIcon },
  { key: "actions", Icon: SparkIcon },
] as const;
type Tool = (typeof TOOLS)[number]["key"];

/**
 * Breathe / Ground / Sounds / Actions. `?tool=` picks the starting tab, `?rhythm=` the breathing pattern.
 * `signedIn` is off on the public page: no tracking and no Actions tab (it needs an account).
 */
export function CalmHub({ signedIn = true }: { signedIn?: boolean }) {
  const t = useT();
  const [tool, setTool] = useState<Tool>("breathe");
  const [rhythm, setRhythm] = useState<Rhythm>("sigh");
  const tools = signedIn ? TOOLS : TOOLS.filter((x) => x.key !== "actions");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const wanted = q.get("tool");
    const r = q.get("rhythm");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL after hydration */
    if (wanted && tools.some((x) => x.key === wanted)) setTool(wanted as Tool);
    if (r && r in RHYTHMS) setRhythm(r as Rhythm);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const used = (category: "breathe" | "ground" | "sounds") => {
    bump(category);
    if (signedIn) void api.track("calm_tool_used", { category });
  };

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={t("calm.title")}
        className={cn("animate-rise grid gap-1 rounded-[1.2rem] bg-surface-2 p-1", signedIn ? "grid-cols-4" : "grid-cols-3")}
      >
        {tools.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tool === key}
            onClick={() => setTool(key)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-[0.95rem] py-2.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200 sm:flex-row sm:gap-2 sm:text-sm",
              tool === key ? "bg-raised text-ink shadow-[0_1px_3px_rgb(var(--shadow)/0.14)]" : "text-ink-soft hover:text-ink",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {t(`calm.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tool === "actions" ? (
        <Actions />
      ) : (
        <Card className="animate-rise relative overflow-hidden py-8" as="div">
          {tool === "breathe" && <Breathing key={rhythm} initial={rhythm} onDone={() => used("breathe")} />}
          {tool === "ground" && (
            <>
              <p className="mx-auto mb-6 max-w-sm text-center text-sm leading-relaxed text-ink-soft">{t("calm.ground.intro")}</p>
              <Grounding onDone={() => used("ground")} />
            </>
          )}
          {tool === "sounds" && (
            <>
              <h2 className="mb-1 font-serif text-3xl text-ink">{t("calm.sounds.title")}</h2>
              <p className="mb-5 text-sm text-ink-soft">{t("calm.sounds.intro")}</p>
              <Sounds onPlay={() => used("sounds")} />
            </>
          )}
        </Card>
      )}

      {signedIn && (
        <Link href="/connect" className="group block">
          <Card className="flex items-center gap-4 transition-transform duration-200 group-active:scale-[0.99]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent">
              <ConnectIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{t("calm.reachTitle")}</p>
              <p className="text-sm text-ink-soft">{t("calm.reachSub")}</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-ink-faint transition-transform group-hover:translate-x-0.5" />
          </Card>
        </Link>
      )}
    </div>
  );
}
