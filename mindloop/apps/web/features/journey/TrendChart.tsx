"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";

type Point = { day: string; value: number };

/**
 * Line chart for a single measure. Comparing two measures means two charts, never a second axis.
 * Shows a crosshair and tooltip on hover or keyboard focus.
 */
export function TrendChart({
  title,
  points,
  min,
  max,
  format = (v) => String(v),
  locale,
  dotColor,
}: {
  title: string;
  points: Point[];
  min: number;
  max: number;
  format?: (v: number) => string;
  locale: string;
  /** Optional per-point marker colour (e.g. mood colours). */
  dotColor?: (v: number) => string;
}) {
  // Render at the container's real width so axis text stays at its true size on any screen.
  const wrap = useRef<HTMLElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 160;
  const pad = { top: 16, right: 16, bottom: 28, left: 32 };
  const id = `tc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const t0 = new Date(points[0].day).getTime();
    const t1 = new Date(points[points.length - 1].day).getTime();
    const span = Math.max(t1 - t0, 86_400_000);
    const x = (d: string) => pad.left + ((new Date(d).getTime() - t0) / span) * (W - pad.left - pad.right);
    const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * (H - pad.top - pad.bottom);
    const xy = points.map((p) => ({ ...p, x: x(p.day), y: y(p.value) }));
    const path = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const ticks = [min, (min + max) / 2, max].map((v) => ({ v, y: y(v) }));
    const area = `${path} L${xy[xy.length - 1].x.toFixed(1)},${H - pad.bottom} L${xy[0].x.toFixed(1)},${H - pad.bottom} Z`;
    return { xy, path, ticks, area };
  }, [points, min, max, W, pad.left, pad.right, pad.top, pad.bottom]);

  if (!geo) return null;
  const dateFmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    geo!.xy.forEach((p, i) => {
      if (Math.abs(p.x - px) < Math.abs(geo!.xy[best].x - px)) best = i;
    });
    setHover(best);
  }

  const active = hover !== null ? geo.xy[hover] : null;
  return (
    <figure ref={wrap} className="relative">
      <figcaption id={id} className="mb-3 text-sm font-medium text-ink-soft">
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={id}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min((h ?? -1) + 1, geo.xy.length - 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max((h ?? geo.xy.length) - 1, 0));
        }}
        onBlur={() => setHover(null)}
      >
        {geo.ticks.map((tk) => (
          <g key={tk.v}>
            <line x1={pad.left} x2={W - pad.right} y1={tk.y} y2={tk.y} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={pad.left - 8} y={tk.y + 4} textAnchor="end" fontSize={11} fill="var(--ink-faint)">
              {format(tk.v)}
            </text>
          </g>
        ))}
        <text x={pad.left} y={H - 6} fontSize={11} fill="var(--ink-faint)">
          {dateFmt(geo.xy[0].day)}
        </text>
        <text x={W - pad.right} y={H - 6} fontSize={11} textAnchor="end" fill="var(--ink-faint)">
          {dateFmt(geo.xy[geo.xy.length - 1].day)}
        </text>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart-line)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geo.area} fill={`url(#${id}-fill)`} />
        <path d={geo.path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active && (
          <line x1={active.x} x2={active.x} y1={pad.top} y2={H - pad.bottom} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {geo.xy.map((p, i) => (
          <circle
            key={p.day}
            cx={p.x}
            cy={p.y}
            r={i === hover ? 6 : 4.5}
            fill={dotColor ? dotColor(p.value) : "var(--chart-line)"}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
      </svg>
      {active && (
        <div
          role="status"
          className="pointer-events-none absolute top-6 rounded-xl bg-ink px-3 py-1.5 text-xs text-bg shadow-md"
          style={{ left: `clamp(0px, calc(${(active.x / W) * 100}% - 48px), calc(100% - 110px))` }}
        >
          <span className="opacity-70">{dateFmt(active.day)}</span> <span className="font-semibold">{format(active.value)}</span>
        </div>
      )}
    </figure>
  );
}
