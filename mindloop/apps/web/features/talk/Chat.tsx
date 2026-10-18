"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRightIcon, LogoMark, MicIcon, PlusIcon, StopIcon } from "@/components/icons";
import { Notice, Skeleton, Spinner, cn, stagger } from "@/components/ui";
import { ActionCard } from "@/features/checkin/ActionCard";
import { SupportCard } from "@/features/checkin/SupportCard";
import { usePoll } from "@/hooks/usePoll";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { bump } from "@/lib/progress";
import type { ActionOut, SupportResponse, VoiceStatus } from "@/lib/types";
import { useVoiceRecorder } from "./useVoiceRecorder";

type Item =
  | { kind: "message"; id: string; role: "user" | "assistant"; text: string; pending?: boolean }
  | { kind: "support"; id: string; support: SupportResponse }
  | { kind: "action"; id: string; action: ActionOut };

const SESSION_KEY = "ml_conversation";
const STARTERS = ["vent", "lonely", "sleep", "exam", "family", "stuck"] as const;
let seq = 0;
const nextId = () => `local-${++seq}`;

export function Chat() {
  const t = useT();
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Chat only renders client-side (behind the auth guard), so sessionStorage is available here.
  const [items, setItems] = useState<Item[] | null>(() =>
    typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) ? null : [],
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Resume the most recent conversation (per tab) or start lazily on first message.
  useEffect(() => {
    const controller = new AbortController();
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return;
    api
      .messages(stored, controller.signal)
      .then((msgs) => {
        setConversationId(stored);
        setItems(msgs.map((m) => ({ kind: "message", id: m.id, role: m.role, text: m.content })));
      })
      .catch(() => {
        sessionStorage.removeItem(SESSION_KEY);
        setItems([]);
      });
    return () => {
      controller.abort();
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const s = await api.newConversation();
    sessionStorage.setItem(SESSION_KEY, s.id);
    setConversationId(s.id);
    return s.id;
  }

  const update = (id: string, fn: (item: Item) => Item) =>
    setItems((cur) => (cur ?? []).map((it) => (it.id === id ? fn(it) : it)));

  async function send(e?: FormEvent, preset?: string) {
    e?.preventDefault();
    const message = (preset ?? text).trim();
    if (!message || sending) return;
    if (!preset) setText("");
    setSending(true);
    setNotice(null);
    const replyId = nextId();
    setItems((cur) => [
      ...(cur ?? []),
      { kind: "message", id: nextId(), role: "user", text: message },
      { kind: "message", id: replyId, role: "assistant", text: "", pending: true },
    ]);
    abort.current?.abort();
    abort.current = new AbortController();
    if (!items?.some((it) => it.kind === "message" && it.role === "user")) bump("talk");
    try {
      const id = await ensureConversation();
      for await (const ev of api.sendMessage(id, message, abort.current.signal)) {
        if (ev.type === "token") {
          update(replyId, (it) => (it.kind === "message" ? { ...it, text: it.text + ev.text, pending: false } : it));
        } else if (ev.type === "replace") {
          update(replyId, (it) => (it.kind === "message" ? { ...it, text: ev.text, pending: false } : it));
        } else if (ev.type === "support") {
          setItems((cur) => insertBefore(cur ?? [], replyId, { kind: "support", id: nextId(), support: ev.support }));
          if (ev.support.level === "high") setItems((cur) => (cur ?? []).filter((it) => it.id !== replyId));
        } else if (ev.type === "action") {
          setItems((cur) => [...(cur ?? []), { kind: "action", id: nextId(), action: ev.action }]);
        } else if (ev.type === "error") {
          setNotice(t("app.error"));
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setNotice(t("app.error"));
      setItems((cur) => (cur ?? []).filter((it) => !(it.id === replyId && it.kind === "message" && !it.text)));
    } finally {
      setSending(false);
    }
  }

  // Voice messages
  const recorder = useVoiceRecorder(async (blob) => {
    setNotice(null);
    try {
      const id = await ensureConversation();
      const status = await api.uploadVoice(blob, id);
      setVoiceId(status.id);
    } catch {
      setNotice(t("talk.voiceFailed"));
    }
  });

  usePoll<VoiceStatus>({
    key: voiceId,
    fetcher: (signal) => api.voice(voiceId as string, signal),
    isDone: (v) => v.status === "completed" || v.status === "failed",
    onResult: (v) => {
      setVoiceId(null);
      if (v.status === "failed") {
        setNotice(t("talk.voiceFailed"));
        return;
      }
      const added: Item[] = [];
      if (v.transcript) added.push({ kind: "message", id: nextId(), role: "user", text: v.transcript });
      if (v.support) added.push({ kind: "support", id: nextId(), support: v.support });
      if (v.reply && v.support?.level !== "high")
        added.push({ kind: "message", id: nextId(), role: "assistant", text: v.reply });
      if (v.action) added.push({ kind: "action", id: nextId(), action: v.action });
      setItems((cur) => [...(cur ?? []), ...added]);
    },
    onTimeout: () => {
      setVoiceId(null);
      setNotice(t("talk.voiceFailed"));
    },
    timeoutMs: 180_000,
  });

  function newChat() {
    abort.current?.abort();
    sessionStorage.removeItem(SESSION_KEY);
    setConversationId(null);
    setItems([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const recording = recorder.state === "recording";
  const voiceNotice =
    recorder.state === "unsupported" ? t("talk.voiceUnsupported") : recorder.state === "denied" ? t("talk.micDenied") : null;

  const empty = items !== null && items.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-4">
      <header className="animate-rise flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="font-serif text-[2.6rem] leading-none tracking-[-0.02em] text-ink">{t("talk.title")}</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-faint">{t("talk.intro")}</p>
        </div>
        {!empty && items !== null && (
          <button
            type="button"
            onClick={newChat}
            disabled={sending}
            className="mt-1 flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {t("talk.newChat")}
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3" aria-live="polite" aria-relevant="additions">
        {items === null ? (
          <Skeleton className="h-24" />
        ) : empty ? (
          <div className="pt-4">
            <div className="animate-rise flex flex-col items-center text-center" style={stagger(1)}>
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute inset-0 scale-150 rounded-full opacity-60 blur-2xl"
                  style={{ background: "linear-gradient(135deg, var(--aura-a), var(--aura-b))" }}
                />
                <LogoMark className="relative h-16 w-16 animate-orb" />
              </div>
              <p className="mt-5 font-serif text-3xl text-ink">{t("talk.emptyTitle")}</p>
              <p className="mt-1 text-sm text-ink-soft">{t("talk.empty")}</p>
            </div>
            <ul className="mt-7 grid gap-2 sm:grid-cols-2">
              {STARTERS.map((k, i) => (
                <li key={k} className="animate-rise" style={stagger(i + 2)}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void send(undefined, t(`talk.starters.${k}`))}
                    className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left text-[15px] text-ink transition-[border-color,transform] duration-200 hover:border-ink/30 active:scale-[0.98]"
                  >
                    {t(`talk.starters.${k}`)}
                    <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-center text-xs text-ink-faint">{t("talk.voiceNotStored")}</p>
          </div>
        ) : (
          items.map((it) =>
            it.kind === "support" ? (
              <SupportCard key={it.id} support={it.support} />
            ) : it.kind === "action" ? (
              <ActionCard key={it.id} action={it.action} lead={t("action.lead")} compact />
            ) : (
              <Bubble key={it.id} role={it.role} text={it.text} pending={it.pending} />
            ),
          )
        )}
        {voiceId && (
          <p className="flex items-center gap-2 px-1 text-sm text-ink-soft" role="status">
            <Spinner className="h-4 w-4" /> {t("talk.transcribing")}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {(notice || voiceNotice) && <Notice tone="care">{notice ?? voiceNotice}</Notice>}

      <div className="sticky bottom-28 md:bottom-6">
        <form onSubmit={send} className="glass flex items-end gap-2 rounded-[1.6rem] p-2">
          <label htmlFor="talk-input" className="sr-only">
            {t("talk.placeholder")}
          </label>
          <textarea
            id="talk-input"
            rows={1}
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={recording ? t("talk.recording", { seconds: recorder.seconds }) : t("talk.placeholder")}
            disabled={recording}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={recording ? recorder.stop : recorder.start}
            disabled={sending || !!voiceId}
            aria-label={recording ? t("talk.stop") : t("talk.record")}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
              recording ? "bg-care text-care-soft" : "bg-surface-2 text-ink-soft hover:text-ink",
            )}
          >
            {recording ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
          </button>
          <button
            type="submit"
            disabled={!text.trim() || sending || recording}
            aria-label={t("talk.send")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-[opacity,transform] active:scale-90 disabled:opacity-30"
          >
            {sending ? <Spinner className="h-5 w-5" /> : <ArrowRightIcon className="h-5 w-5 -rotate-90" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function insertBefore(items: Item[], id: string, item: Item): Item[] {
  const idx = items.findIndex((it) => it.id === id);
  return idx < 0 ? [...items, item] : [...items.slice(0, idx), item, ...items.slice(idx)];
}

function Bubble({ role, text, pending }: { role: "user" | "assistant"; text: string; pending?: boolean }) {
  const t = useT();
  const mine = role === "user";
  return (
    <div className={cn("flex animate-rise items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && <LogoMark className="mb-0.5 h-7 w-7 shrink-0" />}
      <div
        className={cn(
          "max-w-[82%] whitespace-pre-wrap rounded-[1.4rem] px-4 py-3 text-[15px] leading-relaxed",
          mine ? "rounded-br-md bg-ink text-bg" : "rounded-bl-md border border-line bg-surface text-ink",
        )}
      >
        <span className="sr-only">{mine ? t("talk.you") : t("talk.assistant")}: </span>
        {pending && !text ? (
          <span className="inline-flex items-center gap-1.5 py-1.5" aria-label={t("talk.thinking")}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 140}ms` }} />
            ))}
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}
