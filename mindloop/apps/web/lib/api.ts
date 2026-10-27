/**
 * API client for the browser. Every call goes to same-origin `/api/v1/*`, which Next proxies to FastAPI.
 * The access token only lives in memory and the refresh token is an httpOnly cookie. On a 401 we
 * refresh once (concurrent callers share that refresh) and retry.
 */
import type {
  ActionOut,
  CheckInCreate,
  CheckInResult,
  CheckInSummary,
  ContextProfileUpdate,
  FeedbackRating,
  GratitudeCreate,
  HomeResponse,
  LibraryItem,
  MeResponse,
  MemoryItem,
  MessageOut,
  OnboardingRequest,
  PatternsResponse,
  PreferencesUpdate,
  ProfileResponse,
  ReflectionOut,
  ReflectionResult,
  ReflectionStats,
  ReframeCreate,
  ResourcesResponse,
  SafetyPlanBody,
  SafetyPlanOut,
  SessionOut,
  TalkEvent,
  TokenResponse,
  VoiceStatus,
} from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<TokenResponse | null> | null = null;
let onAuthLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function setOnAuthLost(fn: (() => void) | null) {
  onAuthLost = fn;
}

export function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) return null;
        const data = (await r.json()) as TokenResponse;
        accessToken = data.access_token;
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal; form?: FormData };

async function raw(path: string, opts: Options, retry = true): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
    credentials: "same-origin",
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) return raw(path, opts, false);
    onAuthLost?.();
  }
  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const data = await res.json();
      code = data?.error?.code ?? code;
      message = data?.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, message);
  }
  return res;
}

async function json<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await raw(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Streams Server-Sent Events from a POST endpoint. */
async function* sse(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<TalkEvent> {
  const res = await raw(path, { method: "POST", body, signal });
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) yield JSON.parse(line.slice(6)) as TalkEvent;
      }
    }
  }
}

const PAGE = 100;

/**
 * Every check-in on or after `from` (YYYY-MM-DD), newest first. The history endpoint pages by an
 * exclusive `before` date, so each page re-asks from the day after its oldest entry (to pick up the
 * rest of a day cut off mid-page) and duplicates are dropped by id.
 */
async function historySince(from: string, signal?: AbortSignal): Promise<CheckInSummary[]> {
  const seen = new Map<string, CheckInSummary>();
  let before: string | null = null;
  for (let i = 0; i < 20; i++) {
    const page: CheckInSummary[] = await json<CheckInSummary[]>(`/checkins?limit=${PAGE}${before ? `&before=${before}` : ""}`, { signal });
    let added = 0;
    for (const c of page) {
      if (!seen.has(c.id)) {
        seen.set(c.id, c);
        added++;
      }
    }
    const oldest: string | undefined = page.at(-1)?.local_date;
    if (page.length < PAGE || !oldest || oldest < from) break;
    const d: Date = new Date(`${oldest}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const dayAfter: string = d.toISOString().slice(0, 10);
    // No progress means a single day holds a full page; step past it rather than loop.
    before = added === 0 || before === dayAfter ? oldest : dayAfter;
  }
  return [...seen.values()].filter((c) => c.local_date >= from);
}

export const api = {
  // auth
  register: (body: { email: string; password: string; country: string; language: string; accept_terms: boolean }) =>
    json<TokenResponse>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) => json<TokenResponse>("/auth/login", { method: "POST", body }),
  logout: () => json<void>("/auth/logout", { method: "POST" }),
  me: (signal?: AbortSignal) => json<MeResponse>("/auth/me", { signal }),

  // profile
  profile: (signal?: AbortSignal) => json<ProfileResponse>("/profile", { signal }),
  updateProfile: (body: ContextProfileUpdate) => json<ProfileResponse>("/profile", { method: "PATCH", body }),
  updatePreferences: (body: PreferencesUpdate) =>
    json<ProfileResponse>("/profile/preferences", { method: "PATCH", body }),
  completeOnboarding: (body: OnboardingRequest) =>
    json<ProfileResponse>("/profile/onboarding", { method: "POST", body }),

  // check-ins
  home: (signal?: AbortSignal) => json<HomeResponse>("/checkins/home", { signal }),
  createCheckIn: (body: CheckInCreate) => json<CheckInResult>("/checkins", { method: "POST", body }),
  checkIn: (id: string, signal?: AbortSignal) => json<CheckInResult>(`/checkins/${id}`, { signal }),
  history: (signal?: AbortSignal, limit = 14) => json<CheckInSummary[]>(`/checkins?limit=${limit}`, { signal }),
  historySince,

  // interventions
  library: (signal?: AbortSignal) => json<LibraryItem[]>("/interventions", { signal }),
  assign: (slug: string) => json<ActionOut>("/interventions/assignments", { method: "POST", body: { slug } }),
  startAction: (id: string) => json<ActionOut>(`/interventions/assignments/${id}/start`, { method: "POST" }),
  completeAction: (id: string) => json<ActionOut>(`/interventions/assignments/${id}/complete`, { method: "POST" }),
  feedback: (id: string, rating: FeedbackRating) =>
    json<ActionOut>(`/interventions/assignments/${id}/feedback`, { method: "POST", body: { rating } }),
  alternative: (id: string) =>
    json<ActionOut>(`/interventions/assignments/${id}/alternative`, { method: "POST" }),

  // talk
  newConversation: () => json<SessionOut>("/conversations", { method: "POST" }),
  conversations: (signal?: AbortSignal) => json<SessionOut[]>("/conversations?limit=1", { signal }),
  messages: (id: string, signal?: AbortSignal) => json<MessageOut[]>(`/conversations/${id}/messages`, { signal }),
  sendMessage: (id: string, text: string, signal?: AbortSignal) =>
    sse(`/conversations/${id}/messages`, { text }, signal),
  uploadVoice: (audio: Blob, conversationId: string | null) => {
    const form = new FormData();
    form.append("audio", audio, "voice.webm");
    if (conversationId) form.append("conversation_id", conversationId);
    return json<VoiceStatus>("/voice", { method: "POST", form });
  },
  voice: (id: string, signal?: AbortSignal) => json<VoiceStatus>(`/voice/${id}`, { signal }),

  // reflect & safety plan
  reflections: (signal?: AbortSignal, kind?: "reframe" | "gratitude", limit = 30) =>
    json<ReflectionOut[]>(`/reflections?limit=${limit}${kind ? `&kind=${kind}` : ""}`, { signal }),
  reflectionStats: (signal?: AbortSignal) => json<ReflectionStats>("/reflections/stats", { signal }),
  createReflection: (body: ReframeCreate | GratitudeCreate) =>
    json<ReflectionResult>("/reflections", { method: "POST", body }),
  deleteReflection: (id: string) => json<void>(`/reflections/${id}`, { method: "DELETE" }),
  safetyPlan: (signal?: AbortSignal) => json<SafetyPlanOut>("/safety-plan", { signal }),
  saveSafetyPlan: (body: SafetyPlanBody) => json<SafetyPlanOut>("/safety-plan", { method: "PUT", body }),
  deleteSafetyPlan: () => json<void>("/safety-plan", { method: "DELETE" }),

  // patterns & support
  patterns: (signal?: AbortSignal) => json<PatternsResponse>("/patterns", { signal }),
  resources: (country: string, signal?: AbortSignal) =>
    json<ResourcesResponse>(`/resources?country=${encodeURIComponent(country)}`, { signal }),

  // privacy
  consents: () => json<Record<string, boolean>>("/privacy/consents"),
  setConsent: (type: string, granted: boolean) =>
    json<Record<string, boolean>>(`/privacy/consents/${type}`, { method: "PUT", body: { granted } }),
  memory: () => json<MemoryItem[]>("/privacy/memory"),
  forget: (id: string) => json<void>(`/privacy/memory/${id}`, { method: "DELETE" }),
  deleteScope: (scope: string) => json<{ deleted: number }>(`/privacy/data/${scope}`, { method: "DELETE" }),
  deleteAccount: (password: string) => json<void>("/privacy/delete-account", { method: "POST", body: { password } }),
  exportData: async () => (await raw("/privacy/export", {})).blob(),

  // analytics (no content, ever)
  track: (name: string, properties: Record<string, string | number | boolean> = {}) =>
    json<void>("/analytics/events", { method: "POST", body: { name, properties } }).catch(() => undefined),
  metrics: () => json<Record<string, unknown>>("/admin/metrics"),
};
