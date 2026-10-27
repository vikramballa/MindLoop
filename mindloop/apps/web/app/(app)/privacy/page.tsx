"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Field, Input, LoadingCard, Notice, PageHeader, Toggle } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { MemoryItem } from "@/lib/types";

const CONSENTS = ["data_processing", "store_journal", "store_transcripts", "memory", "analytics"];
const SCOPES = ["conversations", "journal", "reflections", "transcripts", "memory", "checkins", "safety_plan"];

export default function PrivacyPage() {
  const t = useT();
  const { signOut } = useAuth();
  const [consents, setConsents] = useState<Record<string, boolean> | null>(null);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.consents(), api.memory()])
      .then(([c, m]) => {
        setConsents(c);
        setMemory(m);
      })
      .catch(() => setError(t("app.offline")));
  }, [t]);

  async function toggle(type: string, granted: boolean) {
    if (!granted && !window.confirm(t("privacy.withdrawNote"))) return;
    try {
      setConsents(await api.setConsent(type, granted));
      if (type === "memory" && !granted) setMemory([]);
    } catch {
      setError(t("app.error"));
    }
  }

  async function forget(id: string) {
    await api.forget(id).catch(() => undefined);
    setMemory((m) => m.filter((x) => x.id !== id));
  }

  async function exportData() {
    const blob = await api.exportData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindloop-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteScope(scope: string) {
    if (!window.confirm(t("privacy.confirm"))) return;
    try {
      await api.deleteScope(scope);
      if (scope === "memory") setMemory([]);
      setMessage(t("privacy.deleted"));
    } catch {
      setError(t("app.error"));
    }
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm(t("privacy.confirm"))) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      await signOut();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t("auth.invalid") : t("app.error"));
      setDeleting(false);
    }
  }

  if (!consents && !error) return <LoadingCard label={t("app.loading")} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("privacy.title")} intro={t("privacy.intro")} />
      {message && <Notice tone="success">{message}</Notice>}
      {error && <Notice tone="care">{error}</Notice>}

      {consents && (
        <Card>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("privacy.consentsTitle")}</h2>
          <p className="mt-1 text-sm text-ink-faint">{t("privacy.withdrawNote")}</p>
          <div className="mt-2 divide-y divide-line">
            {CONSENTS.map((c) => (
              <Toggle
                key={c}
                label={t(`privacy.consent.${c}`)}
                checked={consents[c] ?? false}
                disabled={c === "data_processing"}
                onChange={(v) => toggle(c, v)}
              />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("privacy.memoryTitle")}</h2>
        {memory.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">{t("privacy.memoryEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {memory.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[15px] text-ink">{m.content}</span>
                <Button variant="ghost" size="sm" onClick={() => forget(m.id)}>
                  {t("privacy.forget")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("privacy.exportTitle")}</h2>
        <Button variant="secondary" className="mt-3" onClick={exportData}>
          {t("privacy.exportButton")}
        </Button>
      </Card>

      <Card>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("privacy.deleteTitle")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {SCOPES.map((s) => (
            <Button key={s} variant="quiet-danger" onClick={() => deleteScope(s)} className="justify-start">
              {t(`privacy.deleteScope.${s}`)}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t("privacy.accountTitle")}</h2>
        <p className="mt-1 text-sm text-ink-faint">{t("privacy.accountHint")}</p>
        <form onSubmit={deleteAccount} className="mt-4 space-y-3">
          <Field label={t("privacy.accountPassword")} htmlFor="del-pw">
            <Input id="del-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="quiet-danger" loading={deleting} disabled={!password}>
            {t("privacy.accountButton")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
