"use client";

import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { Segmented, cn } from "@/components/ui";
import { useT } from "@/lib/i18n";

type Sound = "rain" | "waves" | "wind" | "fire" | "stream" | "brown";
const SOUNDS: Array<{ key: Sound; emoji: string; tint: [string, string] }> = [
  { key: "rain", emoji: "🌧️", tint: ["#a4aeff", "#7b80f0"] },
  { key: "waves", emoji: "🌊", tint: ["#8ee6c4", "#4fc3b0"] },
  { key: "wind", emoji: "🍃", tint: ["#d3d5ee", "#a3add9"] },
  { key: "fire", emoji: "🔥", tint: ["#ffd76a", "#ff9f5a"] },
  { key: "stream", emoji: "💧", tint: ["#9fd8f5", "#6aa8e8"] },
  { key: "brown", emoji: "🌙", tint: ["#9d8aec", "#dd8fc2"] },
];
const TIMERS = [10, 20, 45] as const;

/** Sparse, decaying noise clicks that sound like a crackling fire. */
function crackleBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 5;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let n = 0; n < 40; n++) {
    const start = Math.floor(Math.random() * (length - 2000));
    const amp = 0.2 + Math.random() * 0.6;
    const len = 200 + Math.floor(Math.random() * 1200);
    for (let i = 0; i < len; i++) data[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (len / 5));
  }
  return buffer;
}

function noiseBuffer(ctx: AudioContext, brown: boolean): AudioBuffer {
  const length = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else data[i] = white;
    }
  }
  return buffer;
}

/** Builds a sound graph ending in `out`. Everything is synthesised, so no audio files are downloaded. */
function build(ctx: AudioContext, sound: Sound, out: AudioNode): () => void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, sound === "waves" || sound === "brown" || sound === "fire");
  src.loop = true;
  const stops: Array<() => void> = [() => src.stop()];

  if (sound === "rain") {
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 500 });
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 7000 });
    const g = new GainNode(ctx, { gain: 0.18 });
    src.connect(hp).connect(lp).connect(g).connect(out);
  } else if (sound === "waves") {
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 700 });
    const swell = new GainNode(ctx, { gain: 0.55 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.09 });
    const depth = new GainNode(ctx, { gain: 0.45 });
    lfo.connect(depth).connect(swell.gain);
    lfo.start();
    stops.push(() => lfo.stop());
    src.connect(lp).connect(swell).connect(out);
  } else if (sound === "wind") {
    const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 500, Q: 0.8 });
    const sweep = new OscillatorNode(ctx, { frequency: 0.07 });
    const sweepDepth = new GainNode(ctx, { gain: 280 });
    sweep.connect(sweepDepth).connect(bp.frequency);
    const swell = new GainNode(ctx, { gain: 0.35 });
    const gust = new OscillatorNode(ctx, { frequency: 0.13 });
    const gustDepth = new GainNode(ctx, { gain: 0.2 });
    gust.connect(gustDepth).connect(swell.gain);
    sweep.start();
    gust.start();
    stops.push(() => sweep.stop(), () => gust.stop());
    src.connect(bp).connect(swell).connect(out);
  } else if (sound === "fire") {
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 500 });
    src.connect(lp).connect(new GainNode(ctx, { gain: 0.5 })).connect(out);
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer(ctx);
    crackle.loop = true;
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 1500 });
    crackle.connect(hp).connect(new GainNode(ctx, { gain: 0.5 })).connect(out);
    crackle.start();
    stops.push(() => crackle.stop());
  } else if (sound === "stream") {
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 300 });
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2600 });
    const ripple = new GainNode(ctx, { gain: 0.14 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.45 });
    const depth = new GainNode(ctx, { gain: 0.04 });
    lfo.connect(depth).connect(ripple.gain);
    lfo.start();
    stops.push(() => lfo.stop());
    src.connect(hp).connect(lp).connect(ripple).connect(out);
  } else {
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 400 });
    src.connect(lp).connect(new GainNode(ctx, { gain: 0.8 })).connect(out);
  }
  src.start();
  return () => stops.forEach((s) => s());
}

export function Sounds({ onPlay }: { onPlay?: () => void }) {
  const t = useT();
  const [playing, setPlaying] = useState<Sound | null>(null);
  const [volume, setVolume] = useState(0.6);
  const [minutes, setMinutes] = useState<(typeof TIMERS)[number]>(20);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setPlaying(null);
  }

  function play(sound: Sound) {
    if (playing === sound) return stop();
    stopRef.current?.();
    const ctx = (ctxRef.current ??= new AudioContext());
    void ctx.resume();
    if (!masterRef.current) {
      masterRef.current = new GainNode(ctx, { gain: 0 });
      masterRef.current.connect(ctx.destination);
    }
    const master = masterRef.current;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.5); // fade in, never a jolt
    stopRef.current = build(ctx, sound, master);
    setPlaying(sound);
    onPlay?.();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(stop, minutes * 60_000);
  }

  function chooseTimer(m: (typeof TIMERS)[number]) {
    setMinutes(m);
    if (playing) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(stop, m * 60_000);
    }
  }

  useEffect(() => {
    const master = masterRef.current;
    const ctx = ctxRef.current;
    if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
  }, [volume]);

  useEffect(
    () => () => {
      stopRef.current?.();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void ctxRef.current?.close();
    },
    [],
  );

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {SOUNDS.map(({ key, emoji, tint }) => {
          const on = playing === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => play(key)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-[1.25rem] border transition-[border-color,transform] duration-200 active:scale-95",
                on ? "border-ink" : "border-line bg-raised hover:border-ink/30",
              )}
            >
              <span
                aria-hidden
                className={cn("absolute inset-0 transition-opacity duration-500", on ? "opacity-90" : "opacity-0")}
                style={{ background: `linear-gradient(135deg, ${tint[0]}, ${tint[1]})` }}
              />
              {on && <span aria-hidden className="animate-ripple absolute inset-5 rounded-full bg-white/40" />}
              <span className="relative text-3xl" aria-hidden>
                {emoji}
              </span>
              <span className={cn("relative flex items-center gap-1 text-[13px] font-semibold", on ? "text-[#1e1a26]" : "text-ink")}>
                {on ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
                {t(`calm.sounds.${key}`)}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-6 block">
        <span className="text-sm font-medium text-ink">{t("calm.sounds.volume")}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--ink)]"
        />
      </label>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{t("calm.sounds.timerLabel")}</span>
        <Segmented
          label={t("calm.sounds.timerLabel")}
          value={minutes}
          onChange={chooseTimer}
          options={TIMERS.map((m) => ({ value: m, label: t("library.minutes", { minutes: m }) }))}
        />
      </div>
    </div>
  );
}
