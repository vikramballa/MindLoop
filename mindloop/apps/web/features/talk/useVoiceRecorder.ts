"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_RECORDING_SECONDS = 120;

type State = "idle" | "recording" | "unsupported" | "denied";

/** MediaRecorder wrapper with a hard duration cap. Audio stays in memory until upload. */
export function useVoiceRecorder(onRecorded: (blob: Blob) => void) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const callback = useRef(onRecorded);
  useEffect(() => {
    callback.current = onRecorded;
  });

  const stop = useCallback(() => {
    window.clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("denied");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      setState("idle");
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      chunks.current = [];
      if (blob.size > 0) callback.current(blob);
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
    const startedAt = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { state, seconds, start, stop };
}
