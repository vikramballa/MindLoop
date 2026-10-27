"use client";

import { useEffect, useId, useState } from "react";
import { LifebuoyIcon, PencilIcon, PhoneIcon, PlusIcon, PrintIcon, XIcon } from "@/components/icons";
import { Button, Card, Input, Notice, PageHeader, PageSkeleton, stagger } from "@/components/ui";
import { ResourceRow } from "@/features/checkin/SupportCard";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, useT } from "@/lib/i18n";
import type { Contact, ResourcesResponse, SafetyPlanBody, SafetyPlanOut } from "@/lib/types";

type ListKey = "warning_signs" | "coping" | "distractions" | "safe_environment" | "reasons";
type ContactKey = "people" | "professionals";
type Step = { key: ListKey; kind: "list" } | { key: ContactKey; kind: "contacts" };

/** The Stanley-Brown order, with "what matters most" first so it's the first thing you see. */
export const STEPS: Step[] = [
  { key: "reasons", kind: "list" },
  { key: "warning_signs", kind: "list" },
  { key: "coping", kind: "list" },
  { key: "distractions", kind: "list" },
  { key: "people", kind: "contacts" },
  { key: "professionals", kind: "contacts" },
  { key: "safe_environment", kind: "list" },
];
const MAX_ITEMS = 10;

export const EMPTY_PLAN: SafetyPlanBody = {
  warning_signs: [],
  coping: [],
  distractions: [],
  people: [],
  professionals: [],
  safe_environment: [],
  reasons: [],
};

const toBody = (p: SafetyPlanOut): SafetyPlanBody => ({
  warning_signs: p.warning_signs ?? [],
  coping: p.coping ?? [],
  distractions: p.distractions ?? [],
  people: p.people ?? [],
  professionals: p.professionals ?? [],
  safe_environment: p.safe_environment ?? [],
  reasons: p.reasons ?? [],
});

const isEmpty = (p: SafetyPlanBody) => STEPS.every((s) => (p[s.key] as unknown[]).length === 0);

export function SafetyPlan() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [plan, setPlan] = useState<SafetyPlanOut | null>(null);
  const [draft, setDraft] = useState<SafetyPlanBody | null>(null);
  const [resources, setResources] = useState<ResourcesResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .safetyPlan(controller.signal)
      .then(setPlan)
      .catch(() => !controller.signal.aborted && setFailed(true));
    api
      .resources(user?.country ?? "IN", controller.signal)
      .then(setResources)
      .catch(() => undefined);
    return () => controller.abort();
  }, [user?.country]);

  if (failed) return <Notice tone="care">{t("app.offline")}</Notice>;
  if (!plan) return <PageSkeleton label={t("app.loading")} />;

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(false);
    try {
      const out = await api.saveSafetyPlan(draft);
      setPlan(out);
      setDraft(null);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("safetyPlan.deleteConfirm"))) return;
    try {
      await api.deleteSafetyPlan();
      setPlan({ ...EMPTY_PLAN, updated_at: null });
      setDraft(null);
      setSaved(false);
    } catch {
      setError(true);
    }
  }

  const body = toBody(plan);
  const empty = isEmpty(body);
  const updated = plan.updated_at
    ? new Date(plan.updated_at).toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("safetyPlan.eyebrow")} title={t("safetyPlan.title")} intro={t("safetyPlan.intro")}>
        {!draft && !empty && (
          <div className="no-print flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <PrintIcon className="h-4 w-4" />
              {t("safetyPlan.print")}
            </Button>
            <Button size="sm" onClick={() => setDraft(body)}>
              <PencilIcon className="h-4 w-4" />
              {t("safetyPlan.edit")}
            </Button>
          </div>
        )}
      </PageHeader>

      {saved && !draft && <Notice tone="success">{t("safetyPlan.saved")}</Notice>}

      {draft ? (
        <PlanEditor
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={plan.updated_at ? remove : undefined}
          saving={saving}
          error={error}
        />
      ) : empty ? (
        <Card className="accent-wash animate-rise flex flex-col items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent">
            <LifebuoyIcon className="h-6 w-6" />
          </span>
          <p className="text-[15px] leading-relaxed text-ink-soft">{t("safetyPlan.empty")}</p>
          <Button variant="accent" onClick={() => setDraft(EMPTY_PLAN)}>
            {t("safetyPlan.start")}
          </Button>
        </Card>
      ) : (
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <PlanStep key={s.key} index={i} step={s} plan={body} />
          ))}
        </ol>
      )}

      {updated && !draft && <p className="px-1 text-xs text-ink-faint">{t("safetyPlan.updated", { date: updated })}</p>}

      {resources && resources.resources.length > 0 && (
        <section aria-labelledby="helplines-title" className="space-y-3">
          <div className="px-1">
            <h2 id="helplines-title" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
              {t("safetyPlan.helplines")}
            </h2>
            <p className="text-sm text-care">{t("safetyPlan.helplinesHint")}</p>
          </div>
          <ul className="space-y-2 rounded-[var(--radius-card)] border border-care-border bg-care-soft p-3">
            {resources.resources.map((r) => (
              <ResourceRow key={`${r.organization}-${r.phone}`} resource={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanStep({ index, step, plan }: { index: number; step: Step; plan: SafetyPlanBody }) {
  const t = useT();
  const items = plan[step.key];
  return (
    <li>
      <Card className="animate-rise" style={stagger(index)}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-semibold text-accent-fg"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{t(`safetyPlan.steps.${step.key}.title`)}</h2>
            {items.length === 0 ? (
              <p className="mt-1 text-sm text-ink-faint">{t("safetyPlan.nothing")}</p>
            ) : step.kind === "contacts" ? (
              <ul className="mt-2 space-y-2">
                {(items as Contact[]).map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2/70 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{c.name}</span>
                      {c.phone && <span className="block text-sm tabular-nums text-ink-faint">{c.phone}</span>}
                    </span>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                        className="no-print inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-bg"
                      >
                        <PhoneIcon className="h-4 w-4" />
                        {t("safetyPlan.call")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {(items as string[]).map((x, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
                    <span aria-hidden className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {x}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

export function PlanEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saving,
  error,
}: {
  draft: SafetyPlanBody;
  onChange: (p: SafetyPlanBody) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  error: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      {STEPS.map((s, i) => (
        <Card key={s.key} className="animate-rise" style={stagger(i)}>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
            <span className="mr-2 text-accent-fg">{i + 1}.</span>
            {t(`safetyPlan.steps.${s.key}.title`)}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(`safetyPlan.steps.${s.key}.hint`)}</p>
          <div className="mt-4">
            {s.kind === "list" ? (
              <ListEditor
                label={t(`safetyPlan.steps.${s.key}.title`)}
                placeholder={t(`safetyPlan.steps.${s.key}.placeholder`)}
                items={draft[s.key]}
                onChange={(items) => onChange({ ...draft, [s.key]: items })}
              />
            ) : (
              <ContactEditor
                label={t(`safetyPlan.steps.${s.key}.title`)}
                items={draft[s.key]}
                onChange={(items) => onChange({ ...draft, [s.key]: items })}
              />
            )}
          </div>
        </Card>
      ))}
      {error && <Notice tone="care">{t("app.error")}</Notice>}
      <div className="sticky bottom-24 z-10 flex gap-2 md:bottom-4">
        <Button variant="secondary" onClick={onCancel} className="glass">
          {t("safetyPlan.cancel")}
        </Button>
        <Button variant="accent" block loading={saving} onClick={onSave}>
          {t("safetyPlan.save")}
        </Button>
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete} className="px-1 text-sm font-medium text-care hover:underline">
          {t("safetyPlan.delete")}
        </button>
      )}
    </div>
  );
}

/** A list of short lines: existing ones are editable and removable, and a new one can be added. */
export function ListEditor({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const t = useI18n().t;
  const id = useId();
  const [next, setNext] = useState("");
  const add = () => {
    const v = next.trim();
    if (!v || items.length >= MAX_ITEMS) return;
    onChange([...items, v]);
    setNext("");
  };
  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={x}
            maxLength={300}
            aria-label={`${label} ${i + 1}`}
            onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value : y)))}
          />
          <RemoveButton label={t("safetyPlan.remove", { item: x || String(i + 1) })} onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      {items.length < MAX_ITEMS && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <Input id={id} value={next} maxLength={300} placeholder={placeholder} onChange={(e) => setNext(e.target.value)} />
          <AddButton label={t("safetyPlan.add")} disabled={!next.trim()} />
        </form>
      )}
    </div>
  );
}

export function ContactEditor({ label, items, onChange }: { label: string; items: Contact[]; onChange: (items: Contact[]) => void }) {
  const t = useI18n().t;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const update = (i: number, patch: Partial<Contact>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <Input value={c.name} maxLength={300} aria-label={`${label} ${i + 1}: ${t("safetyPlan.namePlaceholder")}`} onChange={(e) => update(i, { name: e.target.value })} />
            <Input
              value={c.phone ?? ""}
              type="tel"
              maxLength={40}
              aria-label={`${label} ${i + 1}: ${t("safetyPlan.phonePlaceholder")}`}
              onChange={(e) => update(i, { phone: e.target.value })}
            />
          </div>
          <RemoveButton label={t("safetyPlan.remove", { item: c.name || String(i + 1) })} onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      {items.length < MAX_ITEMS && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onChange([...items, { name: name.trim(), phone: phone.trim() }]);
            setName("");
            setPhone("");
          }}
        >
          <div className="grid flex-1 grid-cols-2 gap-2">
            <Input value={name} maxLength={300} placeholder={t("safetyPlan.namePlaceholder")} aria-label={`${label}: ${t("safetyPlan.namePlaceholder")}`} onChange={(e) => setName(e.target.value)} />
            <Input
              value={phone}
              type="tel"
              maxLength={40}
              placeholder={t("safetyPlan.phonePlaceholder")}
              aria-label={`${label}: ${t("safetyPlan.phonePlaceholder")}`}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <AddButton label={t("safetyPlan.add")} disabled={!name.trim()} />
        </form>
      )}
    </div>
  );
}

function AddButton({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={disabled}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-bg transition-[opacity,transform] active:scale-95 disabled:opacity-30"
    >
      <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <XIcon className="h-5 w-5" />
    </button>
  );
}
