// Types generated from the API's OpenAPI document (npm run gen:types). Do not hand-edit api-schema.d.ts.
import type { components } from "./api-schema";

type S = components["schemas"];

export type CheckInCreate = S["CheckInCreate"];
export type CheckInResult = S["CheckInResult"];
export type CheckInSummary = S["CheckInSummary"];
export type HomeResponse = S["HomeResponse"];
export type DayMood = S["DayMood"];
export type CommunityPulse = S["CommunityPulse"];
export type ActionOut = S["ActionOut"];
export type SupportResponse = S["SupportResponse"];
export type ResourceOut = S["ResourceOut"];
export type PatternsResponse = S["PatternsResponse"];
export type PatternOut = S["PatternOut"];
export type ProfileResponse = S["ProfileResponse"];
export type ContextProfile = S["ContextProfile"];
export type ContextProfileUpdate = S["ContextProfileUpdate"];
export type Preferences = S["Preferences"];
export type PreferencesUpdate = S["PreferencesUpdate"];
export type OnboardingRequest = S["OnboardingRequest"];
export type TokenResponse = S["TokenResponse"];
export type MeResponse = S["MeResponse"];
export type SessionOut = S["SessionOut"];
export type MessageOut = S["MessageOut"];
export type VoiceStatus = S["VoiceStatus"];
export type LibraryItem = S["LibraryItem"];
export type ResourcesResponse = S["ResourcesResponse"];
export type FeedbackRating = S["FeedbackRequest"]["rating"];
export type ReframeCreate = S["ReframeCreate"];
export type GratitudeCreate = S["GratitudeCreate"];
// Responses always include defaulted fields, so the generated `?` markers are dropped here.
export type ReflectionOut = Required<S["ReflectionOut"]>;
export type ReflectionResult = Omit<S["ReflectionResult"], "reflection"> & { reflection: ReflectionOut };
export type ReflectionStats = S["ReflectionStats"];
export type Distortion = NonNullable<ReframeCreate["distortions"]>[number];
export type SafetyPlanBody = Required<S["SafetyPlanBody"]>;
export type SafetyPlanOut = Required<S["SafetyPlanOut"]>;
export type Contact = S["Contact"];
export type Topic = NonNullable<CheckInCreate["topics"]>[number];

export type MemoryItem = { id: string; kind: string; content: string; created_at: string };

/** Server-sent events from POST /conversations/{id}/messages */
export type TalkEvent =
  | { type: "support"; support: SupportResponse }
  | { type: "action"; action: ActionOut }
  | { type: "token"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; message_id: string; risk_level: string; action: ActionOut | null }
  | { type: "error"; code: string };
