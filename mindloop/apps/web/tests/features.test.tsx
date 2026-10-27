import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, filterCommands, type Command } from "@/components/CommandPalette";
import { GratitudeForm } from "@/features/reflect/GratitudeForm";
import { MAX_TRAPS, ReframeFlow } from "@/features/reflect/ReframeFlow";
import { EMPTY_PLAN, PlanEditor } from "@/features/safety-plan/SafetyPlan";
import { api } from "@/lib/api";
import { summarize } from "@/lib/report";
import { applyAccent, readAccent } from "@/lib/theme";
import type { CheckInSummary, ReflectionOut, ReflectionResult, SafetyPlanBody, SupportResponse } from "@/lib/types";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => "/home",
}));

vi.mock("@/lib/api", () => ({
  api: { createReflection: vi.fn(), track: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const reflection = (over: Partial<ReflectionOut> = {}): ReflectionOut => ({
  id: "r1",
  kind: "reframe",
  created_at: "2026-10-20T10:00:00Z",
  situation: null,
  thought: null,
  belief_before: null,
  distortions: [],
  evidence_for: null,
  evidence_against: null,
  balanced: null,
  belief_after: null,
  items: [],
  why: null,
  ...over,
});

const highSupport: SupportResponse = {
  level: "high",
  title: "You deserve support right now",
  paragraphs: ["Please reach out now."],
  resources: [{ organization: "Tele-MANAS", type: "mental_health_helpline", phone: "14416", website: null, hours: "24x7", description: null }],
  ai_notice: null,
  allow_continue: false,
};

const next = () => fireEvent.click(screen.getByRole("button", { name: /^(Next|Skip)$/ }));

describe("ReframeFlow", () => {
  beforeEach(() => {
    vi.mocked(api.createReflection).mockReset();
  });

  it("walks the thought record and shows how much the belief shifted", async () => {
    vi.mocked(api.createReflection).mockImplementation(async (body) => ({
      reflection: reflection({ ...(body as object), id: "r9" } as Partial<ReflectionOut>),
      support: null,
    }));
    render(<ReframeFlow />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Missed the bus  " } });
    next();
    // The thought itself is required.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "I ruin everything" } });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "90" } });
    next();

    expect(screen.getByText("“I ruin everything”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /All-or-nothing/ }));
    fireEvent.click(screen.getByRole("button", { name: /Labelling/ }));
    next();
    fireEvent.change(screen.getByLabelText("What doesn't fit with it?"), { target: { value: "I caught the next one" } });
    next();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "It was one bus." } });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reframe" }));

    await screen.findByText("Nicely done.");
    expect(api.createReflection).toHaveBeenCalledWith({
      kind: "reframe",
      situation: "Missed the bus",
      thought: "I ruin everything",
      belief_before: 90,
      distortions: ["all_or_nothing", "labeling"],
      evidence_for: "",
      evidence_against: "I caught the next one",
      balanced: "It was one bus.",
      belief_after: 40,
    });
    expect(screen.getByText("It went from 90% to 40% believable.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "90% → 40% believable" })).toBeInTheDocument();
  });

  it(`allows at most ${MAX_TRAPS} thinking traps`, () => {
    render(<ReframeFlow />);
    next();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    next();
    const traps = screen.getAllByRole("button", { pressed: false });
    traps.slice(0, MAX_TRAPS + 1).forEach((b) => fireEvent.click(b));
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(MAX_TRAPS);
    expect(traps[MAX_TRAPS]).toBeDisabled();
  });

  it("shows reviewed crisis support instead of a celebration for a high-risk entry", async () => {
    vi.mocked(api.createReflection).mockResolvedValue({
      reflection: reflection({ belief_before: 70, belief_after: 70 }),
      support: highSupport,
    } as ReflectionResult);
    render(<ReframeFlow />);
    next();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "I want to die" } });
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save reframe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("14416");
    expect(screen.queryByText("Nicely done.")).not.toBeInTheDocument();
    expect(screen.queryByText("Reframe another thought")).not.toBeInTheDocument();
  });

  it("explains when journal storage is switched off", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.mocked(api.createReflection).mockImplementation(async () => {
      throw new ApiError(403, "journal_off", "off");
    });
    render(<ReframeFlow />);
    next();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save reframe" }));
    expect(await screen.findByText(/turned off in your privacy settings/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy settings" })).toHaveAttribute("href", "/privacy");
  });
});

describe("GratitudeForm", () => {
  it("needs at least one thing, and sends only the filled-in ones", async () => {
    vi.mocked(api.createReflection).mockResolvedValue({
      reflection: reflection({ kind: "gratitude", items: ["Sunshine", "Dal"] }),
      support: null,
    });
    render(<GratitudeForm />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Good thing 1"), { target: { value: " Sunshine " } });
    fireEvent.change(screen.getByLabelText("Good thing 3"), { target: { value: "Dal" } });
    fireEvent.click(save);
    await screen.findByText("Noted.");
    expect(api.createReflection).toHaveBeenLastCalledWith({ kind: "gratitude", items: ["Sunshine", "Dal"], why: "" });
    expect(screen.getByText("Dal")).toBeInTheDocument();
  });
});

describe("Safety plan editor", () => {
  function Harness({ onSave }: { onSave: (p: SafetyPlanBody) => void }) {
    const [draft, setDraft] = useState<SafetyPlanBody>({ ...EMPTY_PLAN, coping: ["Walk"] });
    return (
      <PlanEditor draft={draft} onChange={setDraft} onSave={() => onSave(draft)} onCancel={() => {}} saving={false} error={false} />
    );
  }

  it("adds, edits and removes lines and contacts", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    const addLine = screen.getByPlaceholderText("e.g. Cold shower, then a walk");
    fireEvent.change(addLine, { target: { value: "  Music  " } });
    fireEvent.submit(addLine.closest("form") as HTMLFormElement);
    fireEvent.click(screen.getByRole("button", { name: "Remove Walk" }));

    const name = screen.getByLabelText("People I can ask for help: Name");
    fireEvent.change(name, { target: { value: "Riya" } });
    fireEvent.change(screen.getByLabelText("People I can ask for help: Phone (optional)"), { target: { value: "+91 98" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);

    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ coping: ["Music"], people: [{ name: "Riya", phone: "+91 98" }], reasons: [] }),
    );
  });

  it("won't add a contact without a name", () => {
    render(<Harness onSave={vi.fn()} />);
    const adds = screen.getAllByRole("button", { name: "Add" });
    // Every add button starts disabled until something is typed.
    adds.forEach((b) => expect(b).toBeDisabled());
  });
});

describe("CommandPalette", () => {
  beforeEach(() => {
    nav.push.mockReset();
  });

  it("opens with Ctrl+K, filters by keyword and navigates with the keyboard", async () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    const box = await screen.findByRole("combobox");
    await waitFor(() => expect(box).toHaveFocus());

    fireEvent.change(box, { target: { value: "breathe" } });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(box).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/calm\?tool=breathe/));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a friendly empty state and closes on Escape", async () => {
    render(<CommandPalette />);
    act(() => {
      fireEvent.keyDown(window, { key: "/" });
    });
    const box = await screen.findByRole("combobox");
    fireEvent.change(box, { target: { value: "zzzz" } });
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("matches every typed word and ranks label prefixes first", () => {
    const cmd = (id: string, label: string, keywords = ""): Command => ({ id, group: "go", label, keywords, Icon: () => null });
    const list = [cmd("a", "Safety plan", "crisis"), cmd("b", "Plan ahead"), cmd("c", "Journey", "patterns plan")];
    expect(filterCommands(list, "plan").map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(filterCommands(list, "safety crisis").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(list, "  ")).toHaveLength(3);
  });
});

describe("report summary", () => {
  const c = (local_date: string, mood: number, over: Partial<CheckInSummary> = {}): CheckInSummary => ({
    id: `${local_date}-${mood}`,
    local_date,
    mood,
    stress: null,
    sleep_hours: null,
    topics: [],
    feelings: [],
    has_note: false,
    ...over,
  });

  it("only counts the chosen period and reports plain averages", () => {
    const today = new Date(2026, 9, 27);
    const history = [
      c("2026-10-27", 4, { stress: 2, sleep_hours: 7, feelings: ["calm"], topics: ["sleep"] }),
      c("2026-10-27", 2, { stress: 4, feelings: ["anxious", "calm"] }), // same day, older
      c("2026-10-20", 3, { sleep_hours: 6, topics: ["sleep", "money"] }),
      c("2026-09-01", 1), // outside 14 days
    ];
    const reflections = [
      reflection({ belief_before: 80, belief_after: 30, created_at: "2026-10-26T09:00:00" }),
      reflection({ belief_before: 50, belief_after: 40, created_at: "2026-10-25T09:00:00" }),
      reflection({ kind: "gratitude", items: ["a", "b"], created_at: "2026-10-24T09:00:00" }),
      reflection({ belief_before: 90, belief_after: 10, created_at: "2026-08-01T09:00:00" }), // outside
    ];
    const s = summarize(history, reflections, 14, today);
    expect(s.from).toBe("2026-10-14");
    expect(s.to).toBe("2026-10-27");
    expect(s.checkins).toBe(3);
    expect(s.days).toBe(2);
    expect(s.avgMood).toBe(3);
    expect(s.avgStress).toBe(3);
    expect(s.avgSleep).toBe(6.5);
    expect(s.moodCounts).toEqual([0, 1, 1, 1, 0]);
    expect(s.moodByDay).toEqual([
      { day: "2026-10-20", value: 3 },
      { day: "2026-10-27", value: 4 }, // the day's latest check-in
    ]);
    expect(s.feelings[0]).toEqual({ key: "calm", count: 2 });
    expect(s.topics[0]).toEqual({ key: "sleep", count: 2 });
    expect(s.reframes).toBe(2);
    expect(s.gratitudeItems).toBe(2);
    expect(s.avgBeliefShift).toBe(30);
  });

  it("handles an empty period", () => {
    const s = summarize([], [], 30, new Date(2026, 9, 27));
    expect(s).toMatchObject({ checkins: 0, days: 0, avgMood: null, avgSleep: null, avgBeliefShift: null });
  });
});

describe("accent colour", () => {
  it("applies to <html> and persists, with iris as the default", () => {
    applyAccent("sunset");
    expect(document.documentElement.dataset.accent).toBe("sunset");
    expect(readAccent()).toBe("sunset");
    applyAccent("iris");
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(readAccent()).toBe("iris");
    localStorage.setItem("ml_accent", "not-a-colour");
    expect(readAccent()).toBe("iris");
  });
});
