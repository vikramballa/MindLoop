"use client";

import { useEffect, useState } from "react";
import { ShareIcon } from "@/components/icons";
import { MoodFace } from "@/components/MoodFace";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { FEELING_EMOJI, MOOD_COLORS, localDate, type Feeling } from "@/lib/mood";
import type { CheckInSummary } from "@/lib/types";

type Day = { day: string; mood: number | null };
type Recap = { days: Day[]; checkedIn: number; top: Array<{ feeling: Feeling; count: number }> };

function buildRecap(history: CheckInSummary[]): Recap {
  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { day: localDate(d), mood: null };
  });
  const counts = new Map<Feeling, number>();
  // History is newest first: the first check-in seen for a day is that day's latest.
  for (const c of history) {
    const slot = days.find((d) => d.day === c.local_date);
    if (!slot) continue;
    slot.mood ??= c.mood;
    for (const f of c.feelings as Feeling[]) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([feeling, count]) => ({ feeling, count }));
  return { days, checkedIn: days.filter((d) => d.mood !== null).length, top };
}

/** A small "your week" card that can be saved as an image. It shows moods and feeling words only, never notes or topics. */
export function WeeklyRecap() {
  const { t, language } = useI18n();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .history(controller.signal)
      .then((h) => setRecap(buildRecap(h)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!recap || recap.checkedIn === 0) return null;

  const weekday = (day: string) => new Date(day + "T00:00:00").toLocaleDateString(language, { weekday: "narrow" });

  async function save() {
    const blob = await renderImage(recap!, {
      title: t("recap.title"),
      days: t("recap.days", { count: recap!.checkedIn }),
      topLabel: t("recap.topFeelings"),
      kind: t("recap.kind"),
      footer: t("recap.footer"),
      feeling: (f) => `${FEELING_EMOJI[f]} ${t(`feelings.${f}`)}`,
      weekday,
    });
    if (!blob) return;
    const file = new File([blob], "mindloop-week.png", { type: "image/png" });
    void api.track("recap_shared");
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        /* share cancelled, fall back to a download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-60 blur-2xl"
        style={{ background: "linear-gradient(135deg, var(--aura-a), var(--aura-b))" }}
      />
      <div className="relative">
        <h2 className="font-serif text-3xl leading-none text-ink">{t("recap.title")}</h2>
        <p className="mt-1 text-sm font-medium text-ink-soft">{t("recap.days", { count: recap.checkedIn })}</p>
        <ol className="mt-5 grid grid-cols-7 gap-1">
          {recap.days.map((d) => (
            <li key={d.day} className="flex flex-col items-center gap-1.5">
              <MoodFace mood={d.mood} className="h-10 w-10 sm:h-12 sm:w-12" />
              <span className="text-[11px] font-semibold text-ink-faint">{weekday(d.day)}</span>
            </li>
          ))}
        </ol>
        {recap.top.length > 0 ? (
          <>
            <p className="mt-5 text-[13px] font-medium text-ink-faint">{t("recap.topFeelings")}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {recap.top.map(({ feeling, count }) => (
                <li key={feeling} className="rounded-full bg-raised px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line">
                  <span aria-hidden>{FEELING_EMOJI[feeling]}</span> {t(`feelings.${feeling}`)} ×{count}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-5 text-sm text-ink-faint">{t("recap.noFeelings")}</p>
        )}
        <p className="mt-5 font-serif text-2xl leading-tight text-ink">{t("recap.kind")}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={save}>
          <ShareIcon className="h-4 w-4" />
          {saved ? t("recap.shared") : t("recap.share")}
        </Button>
      </div>
    </Card>
  );
}

type Labels = {
  title: string;
  days: string;
  topLabel: string;
  kind: string;
  footer: string;
  feeling: (f: Feeling) => string;
  weekday: (day: string) => string;
};

/** Story-sized (1080×1350) PNG of the recap, drawn on a canvas. */
function renderImage(recap: Recap, l: Labels): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  const font = (weight: number, size: number) =>
    `${weight} ${size}px ${getComputedStyle(document.body).getPropertyValue("--font-geist") || "system-ui"}, system-ui, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#f3f0ea");
  bg.addColorStop(0.6, "#f3f0ea");
  bg.addColorStop(1, "#e9f5c2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#16131b";
  ctx.font = font(700, 76);
  ctx.fillText(l.title, 90, 200);
  ctx.fillStyle = "#4b4653";
  ctx.font = font(500, 40);
  ctx.fillText(l.days, 90, 270);

  const gap = (W - 180) / 7;
  recap.days.forEach((d, i) => {
    const cx = 90 + gap * i + gap / 2;
    const cy = 440;
    const r = gap / 2 - 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (d.mood) {
      const [a, b] = MOOD_COLORS[d.mood];
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      ctx.setLineDash([10, 12]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#d9cfc6";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#69646f";
    ctx.font = font(600, 32);
    ctx.textAlign = "center";
    ctx.fillText(l.weekday(d.day), cx, cy + r + 56);
    ctx.textAlign = "start";
  });

  let y = 680;
  if (recap.top.length) {
    ctx.fillStyle = "#69646f";
    ctx.font = font(700, 30);
    ctx.fillText(l.topLabel.toUpperCase(), 90, y);
    y += 80;
    ctx.fillStyle = "#16131b";
    ctx.font = font(600, 56);
    for (const { feeling } of recap.top) {
      ctx.fillText(l.feeling(feeling), 90, y);
      y += 84;
    }
  }

  ctx.fillStyle = "#16131b";
  ctx.font = font(600, 46);
  wrap(ctx, l.kind, 90, Math.max(y + 60, 1060), W - 180, 60);

  ctx.fillStyle = "#4a6500";
  ctx.font = font(700, 32);
  ctx.fillText(l.footer, 90, H - 90);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}
