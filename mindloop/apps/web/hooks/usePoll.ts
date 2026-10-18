"use client";

import { useEffect, useRef } from "react";

/**
 * Polls `fetcher` every `intervalMs` until `isDone(result)` or `timeoutMs`, with cancellation
 * on unmount or when `key` changes. Used for async jobs (check-in processing, voice).
 */
export function usePoll<T>({
  key,
  fetcher,
  isDone,
  onResult,
  onTimeout,
  intervalMs = 1000,
  timeoutMs = 90_000,
}: {
  key: string | null;
  fetcher: (signal: AbortSignal) => Promise<T>;
  isDone: (value: T) => boolean;
  onResult: (value: T) => void;
  onTimeout?: () => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  const handlers = useRef({ fetcher, isDone, onResult, onTimeout });
  useEffect(() => {
    handlers.current = { fetcher, isDone, onResult, onTimeout };
  });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: number | undefined;

    const tick = async () => {
      try {
        const value = await handlers.current.fetcher(controller.signal);
        if (controller.signal.aborted) return;
        if (handlers.current.isDone(value)) {
          handlers.current.onResult(value);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (Date.now() - started > timeoutMs) {
        handlers.current.onTimeout?.();
        return;
      }
      timer = window.setTimeout(tick, intervalMs);
    };
    timer = window.setTimeout(tick, intervalMs);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, intervalMs, timeoutMs]);
}
