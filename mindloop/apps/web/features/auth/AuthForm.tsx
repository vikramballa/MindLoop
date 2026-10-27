"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Brand } from "@/components/AppShell";
import { MoodFace } from "@/components/MoodFace";
import { Button, Card, Field, Input, Notice, Select, stagger } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export const COUNTRIES = ["IN", "GB", "US", "DE", "FR", "PT", "JP"];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useT();
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("IN");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = register ? await signUp(email, password, country) : await signIn(email, password);
      router.replace(me.onboarding_completed ? "/home" : "/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_credentials") setError(t("auth.invalid"));
      else if (err instanceof ApiError && err.code === "email_taken") setError(t("auth.emailTaken"));
      else setError(t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-10 inline-block self-start">
        <Brand />
      </Link>
      <div className="animate-rise mb-6 flex -space-x-2" aria-hidden>
        {[5, 4, 3, 2, 1].map((m, i) => (
          <MoodFace key={m} mood={m} className="h-10 w-10 animate-float" style={{ animationDelay: `${-i * 0.7}s` }} />
        ))}
      </div>
      <h1 className="animate-rise font-display text-[2.8rem] leading-none tracking-[-0.035em] text-ink" style={stagger(1)}>
        {register ? t("auth.registerTitle") : t("auth.signInTitle")}
      </h1>
      <p className="animate-rise mt-3 text-[15px] text-ink-soft" style={stagger(2)}>
        {register ? t("auth.registerSub") : t("auth.signInSub")}
      </p>
      <Card className="animate-rise mt-7" style={stagger(3)}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
          <Field label={t("auth.email")} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t("auth.password")} htmlFor="password" hint={register ? t("auth.passwordHint") : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 10 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {register && (
            <>
              <Field label={t("auth.country")} htmlFor="country">
                <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`countries.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
                <input
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--ink)]"
                />
                {t("auth.terms")}
              </label>
            </>
          )}
          {error && <Notice tone="care">{error}</Notice>}
          <Button type="submit" size="lg" block loading={busy} disabled={register && !accepted}>
            {register ? t("auth.register") : t("auth.signIn")}
          </Button>
        </form>
      </Card>
      <Link href={register ? "/login" : "/register"} className="mt-6 text-center text-sm text-ink-soft hover:text-ink">
        {register ? t("auth.haveAccount") : t("auth.noAccount")}
      </Link>
      <p className="mt-8 text-center text-xs text-ink-faint">{t("app.disclaimer")}</p>
    </main>
  );
}
