import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionCard } from "@/features/checkin/ActionCard";
import { CheckInFlow } from "@/features/checkin/CheckInFlow";
import { MoodPicker } from "@/features/checkin/MoodPicker";
import { SupportCard } from "@/features/checkin/SupportCard";
import { Grounding } from "@/features/calm/Grounding";
import { Connect } from "@/features/connect/Connect";
import { Garden } from "@/features/journey/Garden";
import { api } from "@/lib/api";
import { translate } from "@/lib/i18n";
import en from "@/lib/i18n/messages/en.json";
import { blooms, bump, moments, readCounters } from "@/lib/progress";
import type { ActionOut, CheckInResult, CheckInSummary, SupportResponse } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    startAction: vi.fn(),
    completeAction: vi.fn(),
    feedback: vi.fn(),
    alternative: vi.fn(),
    createCheckIn: vi.fn(),
    checkIn: vi.fn(),
    track: vi.fn(),
  },
  ApiError: class extends Error {},
}));

const action: ActionOut = {
  assignment_id: "a1",
  slug: "task_breakdown_001",
  category: "task_breakdown",
  category_label: "Breaking tasks down",
  duration_minutes: 10,
  requires_professional: false,
  content: { title: "Work on it for 10 minutes", summary: "Just start.", steps: ["Open the doc."], why: "Small starts help." },
  start_label: "Start 10-minute action",
  status: "suggested",
  feedback: null,
  reasons: ["target_match"],
};

describe("i18n", () => {
  it("interpolates and falls back to English", () => {
    expect(translate("en", "action.start", { minutes: 10 })).toBe("Let's try it · 10 min");
    expect(translate("te", "mood.question")).toBe("How are you, really?");
    expect(translate("en", "missing.key")).toBe("missing.key");
  });

  it("has a reflection prompt for every day of the cycle", () => {
    expect(en.prompts).toHaveLength(30);
    expect(new Set(en.prompts).size).toBe(30);
  });

  it("never uses guilt or diagnostic language", () => {
    const text = JSON.stringify(en).toLowerCase();
    for (const banned of ["streak", "you are depressed", "disorder", "don't break", "cure"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("MoodPicker", () => {
  it("exposes five moods as an accessible radio group", () => {
    const onChange = vi.fn();
    render(<MoodPicker value={null} onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: /Really low/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});

describe("SupportCard", () => {
  it("renders verified resources as call links", () => {
    const support: SupportResponse = {
      level: "high",
      title: "Let's get you support right now",
      paragraphs: ["You deserve support from a real person right now."],
      resources: [{ organization: "Tele-MANAS", type: "mental_health_helpline", phone: "14416", website: null, hours: "24x7", description: null }],
      ai_notice: "I'm an AI wellbeing companion.",
      allow_continue: false,
    };
    render(<SupportCard support={support} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call 14416" })).toHaveAttribute("href", "tel:14416");
  });
});

describe("ActionCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs start → done → feedback", async () => {
    vi.mocked(api.startAction).mockResolvedValue({ ...action, status: "started" });
    vi.mocked(api.completeAction).mockResolvedValue({ ...action, status: "completed" });
    vi.mocked(api.feedback).mockResolvedValue({ ...action, status: "completed", feedback: "a_lot" });
    render(<ActionCard action={action} lead="Try this:" />);

    fireEvent.click(screen.getByRole("button", { name: "Let's try it · 10 min" }));
    expect(await screen.findByText("Open the doc.")).toBeInTheDocument();
    expect(screen.getByText(/10:00 left|9:5\d left/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(await screen.findByText("How was that?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Helped a lot" }));
    await waitFor(() => expect(api.feedback).toHaveBeenCalledWith("a1", "a_lot"));
    expect(await screen.findByText(/learns what works for you/)).toBeInTheDocument();
  });

  it("explains why an action was chosen", () => {
    render(<ActionCard action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Why this?" }));
    expect(screen.getByText("Small starts help.")).toBeInTheDocument();
    expect(screen.getByText(/It fits what you described/)).toBeInTheDocument();
  });
});

const baseResult: CheckInResult = {
  id: "c1",
  status: "completed",
  created_at: "2026-10-04T10:00:00Z",
  local_date: "2026-10-04",
  mood: 2,
  topics: ["study_work"],
  feelings: [],
  risk_level: "low",
  reflection: "It sounds like study or work is taking up a lot of space today.",
  action_lead: "Try this:",
  action,
  support: null,
  feedback_question: "How was that?",
};

describe("CheckInFlow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("walks mood → feelings → topics → note and shows exactly one action", async () => {
    vi.mocked(api.createCheckIn).mockResolvedValue(baseResult);
    render(<CheckInFlow />);
    fireEvent.click(screen.getByRole("radio", { name: /^Low/ }));
    // Picking a mood advances on its own.
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Study / Work" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish check-in" }));
    expect(await screen.findByText(baseResult.reflection as string)).toBeInTheDocument();
    expect(screen.getByText("Planted.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Let's try it/ })).toHaveLength(1);
    expect(api.createCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ mood: 2, topics: ["study_work"], note: null, source: "tap" }),
    );
  });

  it("starts on feelings when a mood is passed in, caps feeling words at three and nudges lonely users", async () => {
    vi.mocked(api.createCheckIn).mockResolvedValue({ ...baseResult, feelings: ["lonely"] });
    render(<CheckInFlow initialMood={2} />);
    for (const name of [/Lonely/, /Sad/, /Drained/, /Anxious/]) fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: /Anxious/ })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish check-in" }));
    expect(await screen.findByRole("link", { name: "Help me reach out" })).toHaveAttribute("href", "/connect");
    expect(api.createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ feelings: ["lonely", "sad", "drained"] }));
  });

  it("sends a typed note as a text check-in", async () => {
    vi.mocked(api.createCheckIn).mockResolvedValue(baseResult);
    render(<CheckInFlow initialMood={3} usePrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  long day, but ok  " } });
    fireEvent.click(screen.getByRole("button", { name: "Finish check-in" }));
    await waitFor(() =>
      expect(api.createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ note: "long day, but ok", source: "text" })),
    );
  });
});

describe("progress", () => {
  const day = (local_date: string, mood: number, extra: Partial<CheckInSummary> = {}): CheckInSummary => ({
    id: local_date + mood,
    local_date,
    mood,
    stress: null,
    sleep_hours: null,
    topics: [],
    feelings: [],
    has_note: false,
    ...extra,
  });

  it("plants one bloom per day, using that day's latest mood", () => {
    // Newest first, as the API returns it.
    const history = [day("2026-10-03", 4), day("2026-10-03", 2), day("2026-10-01", 1)];
    expect(blooms(history)).toEqual([
      { day: "2026-10-01", mood: 1 },
      { day: "2026-10-03", mood: 4 },
    ]);
  });

  it("counts days in total, not in a row — gaps never take anything away", () => {
    const spaced = [day("2026-10-20", 3), day("2026-09-01", 3), day("2026-06-15", 3), day("2026-01-02", 3), day("2025-12-25", 3)];
    const got = moments(spaced, {}).filter((m) => m.got).map((m) => m.key);
    expect(got).toEqual(expect.arrayContaining(["first", "five"]));
  });

  it("celebrates low moods too", () => {
    const all = [1, 2, 3, 4, 5].map((m, i) => day(`2026-10-0${i + 1}`, m));
    expect(moments(all, {}).find((m) => m.key === "every_mood")?.got).toBe(true);
  });

  it("tracks tool use locally and caps progress at the goal", () => {
    localStorage.clear();
    bump("breathe");
    bump("breathe");
    bump("breathe");
    bump("breathe");
    const breathe = moments([], readCounters()).find((m) => m.key === "breathe");
    expect(breathe).toMatchObject({ got: true, progress: 3, goal: 3 });
  });
});

describe("Grounding", () => {
  it("walks through 5-4-3-2-1 one tap at a time", () => {
    const onDone = vi.fn();
    render(<Grounding onDone={onDone} />);
    expect(screen.getByText(/5 things you can see/)).toBeInTheDocument();
    const tap = () => fireEvent.click(screen.getByRole("button", { name: "Tap when you notice one" }));
    for (let i = 0; i < 5; i++) tap();
    expect(screen.getByText(/4 things you can feel/)).toBeInTheDocument();
    for (let i = 0; i < 4 + 3 + 2 + 1; i++) tap();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/You're here, right now/)).toBeInTheDocument();
  });
});

describe("Connect", () => {
  it("prefills an editable message and links it to WhatsApp and SMS", () => {
    render(<Connect />);
    fireEvent.click(screen.getByRole("button", { name: "Open up" }));
    const box = screen.getByLabelText("Make it yours");
    expect(box).toHaveValue("Hey, it's been a rough few days. Can I vent to you for a bit?");
    fireEvent.change(box, { target: { value: "miss you, chai soon?" } });
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/?text=miss%20you%2C%20chai%20soon%3F",
    );
    expect(screen.getByRole("link", { name: "Text" })).toHaveAttribute("href", "sms:?&body=miss%20you%2C%20chai%20soon%3F");
  });
});

describe("Garden", () => {
  it("labels every plant with its date and mood for screen readers", () => {
    render(<Garden blooms={[{ day: "2026-10-01", mood: 5 }, { day: "2026-10-02", mood: 1 }]} />);
    expect(screen.getByRole("list", { name: "Your garden: 2 plants" })).toBeInTheDocument();
    expect(screen.getByText(/October 1: Great/)).toBeInTheDocument();
    expect(screen.getByText(/October 2: Really low/)).toBeInTheDocument();
  });
});
