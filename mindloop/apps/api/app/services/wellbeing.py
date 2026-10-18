"""Per-user wellbeing summary and the patterns shown on the Journey page.

The maths is kept simple so every result can be explained: rolling averages, distance from
the user's own baseline, a least-squares trend, Pearson correlation and how often each kind
of action helped. Each statistic needs a minimum number of samples. Results describe links
in what the user reported, never causes or conditions.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from statistics import mean
from typing import Any


@dataclass(frozen=True)
class DayRecord:
    day: date
    mood: float
    stress: float | None
    sleep: float | None
    topics: frozenset[str]


@dataclass(frozen=True)
class CategoryFeedback:
    category: str
    n: int
    positive: int


@dataclass
class WellbeingModel:
    checkin_days: int = 0
    mood_7d: float | None = None
    mood_30d: float | None = None
    stress_7d: float | None = None
    stress_30d: float | None = None
    sleep_7d: float | None = None
    sleep_baseline: float | None = None
    sleep_deviation: float | None = None
    mood_trend_per_week: float | None = None
    common_topics: list[tuple[str, int]] = field(default_factory=list)
    category_success: dict[str, float] = field(default_factory=dict)
    successful_categories: list[str] = field(default_factory=list)
    unsuccessful_categories: list[str] = field(default_factory=list)
    significant_changes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Pattern:
    kind: str
    key: str
    statement_key: str
    params: dict[str, Any]
    evidence: dict[str, Any]
    strength: float


def aggregate_days(rows: list[tuple[date, int, int | None, float | None, list[str]]]) -> list[DayRecord]:
    """Collapse multiple check-ins per day into one daily record."""
    by_day: dict[date, list[tuple[int, int | None, float | None, list[str]]]] = defaultdict(list)
    for d, mood, stress, sleep, topics in rows:
        by_day[d].append((mood, stress, sleep, topics))
    out = []
    for d in sorted(by_day):
        items = by_day[d]
        stresses = [s for _, s, _, _ in items if s is not None]
        sleeps = [s for _, _, s, _ in items if s is not None]
        out.append(
            DayRecord(
                day=d,
                mood=mean(m for m, _, _, _ in items),
                stress=mean(stresses) if stresses else None,
                sleep=mean(sleeps) if sleeps else None,
                topics=frozenset(t for *_, ts in items for t in ts),
            )
        )
    return out


def _avg(values: list[float]) -> float | None:
    return round(mean(values), 2) if values else None


def pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / math.sqrt(sxx * syy)


def slope_per_week(days: list[DayRecord], today: date) -> float | None:
    if len(days) < 4:
        return None
    xs = [float((d.day - today).days) for d in days]
    ys = [d.mood for d in days]
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    return round(7 * sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / sxx, 2)


def compute_model(days: list[DayRecord], feedback: list[CategoryFeedback], today: date) -> WellbeingModel:
    last7 = [d for d in days if d.day > today - timedelta(days=7)]
    last30 = [d for d in days if d.day > today - timedelta(days=30)]
    last14 = [d for d in days if d.day > today - timedelta(days=14)]
    m = WellbeingModel(checkin_days=len(days))
    m.mood_7d = _avg([d.mood for d in last7])
    m.mood_30d = _avg([d.mood for d in last30])
    m.stress_7d = _avg([d.stress for d in last7 if d.stress is not None])
    m.stress_30d = _avg([d.stress for d in last30 if d.stress is not None])
    m.sleep_7d = _avg([d.sleep for d in last7 if d.sleep is not None])
    m.sleep_baseline = _avg([d.sleep for d in last30 if d.sleep is not None])
    if m.sleep_7d is not None and m.sleep_baseline is not None:
        m.sleep_deviation = round(m.sleep_7d - m.sleep_baseline, 2)
    m.mood_trend_per_week = slope_per_week(last14, today)
    m.common_topics = Counter(t for d in last30 for t in d.topics).most_common(3)
    for fb in feedback:
        if fb.n >= 2:
            rate = round(fb.positive / fb.n, 2)
            m.category_success[fb.category] = rate
            if rate >= 0.6:
                m.successful_categories.append(fb.category)
            elif rate <= 0.25:
                m.unsuccessful_categories.append(fb.category)
    if len(last7) >= 3 and len(last30) >= 7 and m.mood_7d is not None and m.mood_30d is not None:
        if m.mood_7d - m.mood_30d <= -0.75:
            m.significant_changes.append("mood_lower")
        elif m.mood_7d - m.mood_30d >= 0.75:
            m.significant_changes.append("mood_higher")
    if m.stress_7d is not None and m.stress_30d is not None and len(last7) >= 3 and m.stress_7d - m.stress_30d >= 0.75:
        m.significant_changes.append("stress_higher")
    return m


def _span(days: list[DayRecord]) -> dict[str, str]:
    return {"start": days[0].day.isoformat(), "end": days[-1].day.isoformat()}


def compute_patterns(days: list[DayRecord], model: WellbeingModel, feedback: list[CategoryFeedback]) -> list[Pattern]:
    patterns: list[Pattern] = []
    if not days:
        return patterns

    # How each topic relates to mood
    for topic in sorted({t for d in days for t in d.topics} - {"other"}):
        with_t = [d.mood for d in days if topic in d.topics]
        without = [d.mood for d in days if topic not in d.topics]
        if len(with_t) >= 3 and len(without) >= 3:
            diff = mean(with_t) - mean(without)
            if abs(diff) >= 0.5:
                patterns.append(
                    Pattern(
                        kind="topic_mood",
                        key=topic,
                        statement_key="patterns.topic_mood_lower" if diff < 0 else "patterns.topic_mood_higher",
                        params={"topic": topic},
                        evidence={
                            "n_with": len(with_t),
                            "n_without": len(without),
                            "avg_with": round(mean(with_t), 1),
                            "avg_without": round(mean(without), 1),
                            **_span(days),
                        },
                        strength=round(abs(diff), 2),
                    )
                )

    # How sleep relates to stress and mood
    sleep_stress = [(d.sleep, d.stress) for d in days if d.sleep is not None and d.stress is not None]
    if len(sleep_stress) >= 5:
        r = pearson([s for s, _ in sleep_stress], [st for _, st in sleep_stress])
        if r is not None and r <= -0.3:
            patterns.append(
                Pattern(
                    "sleep_stress",
                    "sleep_stress",
                    "patterns.sleep_stress",
                    {},
                    {"n": len(sleep_stress), "r": round(r, 2), **_span(days)},
                    round(abs(r), 2),
                )
            )
    sleep_mood = [(d.sleep, d.mood) for d in days if d.sleep is not None]
    if len(sleep_mood) >= 5:
        r = pearson([s for s, _ in sleep_mood], [m for _, m in sleep_mood])
        if r is not None and r >= 0.3:
            patterns.append(
                Pattern(
                    "sleep_mood",
                    "sleep_mood",
                    "patterns.sleep_mood",
                    {},
                    {"n": len(sleep_mood), "r": round(r, 2), **_span(days)},
                    round(r, 2),
                )
            )

    # What has helped, going by the user's own feedback
    for fb in feedback:
        if fb.n < 2:
            continue
        rate = fb.positive / fb.n
        if rate >= 0.6 or rate <= 0.25:
            patterns.append(
                Pattern(
                    "intervention",
                    fb.category,
                    "patterns.intervention_helpful" if rate >= 0.6 else "patterns.intervention_unhelpful",
                    {"category": fb.category},
                    {"n": fb.n, "positive": fb.positive},
                    round(abs(rate - 0.5) * 2, 2),
                )
            )

    # Recent change compared with the user's baseline
    trend_evidence = {"recent": model.mood_7d, "baseline": model.mood_30d}
    if "mood_lower" in model.significant_changes:
        patterns.append(Pattern("trend", "mood", "patterns.mood_trend_down", {}, trend_evidence, 1.0))
    if "mood_higher" in model.significant_changes:
        patterns.append(Pattern("trend", "mood", "patterns.mood_trend_up", {}, trend_evidence, 0.8))
    if "stress_higher" in model.significant_changes:
        patterns.append(
            Pattern(
                "trend",
                "stress",
                "patterns.stress_trend_up",
                {},
                {"recent": model.stress_7d, "baseline": model.stress_30d},
                0.9,
            )
        )

    return sorted(patterns, key=lambda p: -p.strength)[:8]


def wellbeing_note(model: WellbeingModel) -> str | None:
    """A compact, non-clinical summary for the response prompt (keeps context small)."""
    notes = []
    if "mood_lower" in model.significant_changes:
        notes.append("reported mood lower than their usual this week")
    if "stress_higher" in model.significant_changes:
        notes.append("reported stress higher than usual this week")
    if model.successful_categories:
        notes.append("has found these helpful before: " + ", ".join(model.successful_categories[:2]).replace("_", " "))
    return "; ".join(notes) or None
