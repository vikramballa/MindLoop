"""Picks the intervention to suggest.

Candidates come pre-filtered from SQL; here we drop anything unsafe for the current risk
level, score the rest and take the best. Everything is a pure function so it's easy to test,
and each choice carries reason codes that explain why it was made.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.models import Intervention

PRACTICAL = {"task_breakdown", "problem_solving", "study_work_planning", "behavioral_activation"}
REFLECTIVE = {"reflection", "self_compassion", "values_clarification", "psychoeducation"}


@dataclass
class SelectionInput:
    targets: Sequence[str]
    topics: Sequence[str]
    mood: int | None = None
    risk_level: str = "low"
    safety_categories: list[str] = field(default_factory=list)
    support_style: str = "mixed"
    preferred_minutes: int = 10
    recent_ids: list[uuid.UUID] = field(default_factory=list)  # most recent first
    blocked_ids: set[uuid.UUID] = field(default_factory=set)  # e.g. rated "worse" recently
    exclude_ids: set[uuid.UUID] = field(default_factory=set)  # e.g. "try something else"
    # intervention_id -> (n, score_sum); category -> (n, score_sum)
    item_feedback: dict[uuid.UUID, tuple[int, int]] = field(default_factory=dict)
    category_feedback: dict[str, tuple[int, int]] = field(default_factory=dict)
    similarity: dict[uuid.UUID, float] = field(default_factory=dict)


@dataclass
class Scored:
    intervention: Intervention
    score: float
    reasons: list[str]


def _smoothed(n: int, total: int, prior_n: int = 2) -> float:
    """Bayesian-smoothed mean feedback score in roughly [-2, 2], pulled toward 0 for few ratings."""
    return total / (n + prior_n)


def eligible(item: Intervention, inp: SelectionInput) -> bool:
    if item.id in inp.blocked_ids or item.id in inp.exclude_ids:
        return False
    if set(item.contraindications or []) & set(inp.safety_categories):
        return False
    return not (inp.risk_level == "concerning" and item.intensity != "low")


def score(item: Intervention, inp: SelectionInput) -> Scored:
    reasons: list[str] = []
    s = 0.0

    matched = set(item.targets) & set(inp.targets)
    if matched:
        s += 3.0 * len(matched)
        reasons.append("target_match")

    if set(item.contexts) & set(inp.topics):
        s += 2.0
        reasons.append("context_match")
    elif "general" in item.contexts:
        s += 0.5

    if item.id in inp.item_feedback:
        n, total = inp.item_feedback[item.id]
        bonus = 2.0 * _smoothed(n, total)
        s += bonus
        reasons.append("helped_before" if bonus > 0 else "less_helpful_before")
    if item.category in inp.category_feedback:
        n, total = inp.category_feedback[item.category]
        s += 1.0 * _smoothed(n, total)

    s -= abs(item.duration_minutes - inp.preferred_minutes) / 10.0

    if item.id in inp.recent_ids[:3]:
        s -= 3.0
        reasons.append("recently_suggested")
    elif item.id in inp.recent_ids:
        s -= 1.5

    if inp.support_style == "practical" and item.category in PRACTICAL:
        s += 0.5
        reasons.append("style_practical")
    elif inp.support_style == "reflective" and item.category in REFLECTIVE:
        s += 0.5
        reasons.append("style_reflective")

    if inp.mood is not None and inp.mood <= 2 and item.intensity != "low":
        s -= 1.0

    if item.category == "professional_support":
        if inp.risk_level == "concerning":
            s += 4.0
            reasons.append("support_recommended")
        else:
            s -= 2.0  # only surfaces when nothing else fits or risk suggests it

    if sim := inp.similarity.get(item.id):
        s += 2.0 * max(0.0, sim - 0.3)
        reasons.append("semantic_match")

    return Scored(item, round(s, 3), reasons)


def select(candidates: list[Intervention], inp: SelectionInput) -> Scored | None:
    pool = [c for c in candidates if eligible(c, inp)]
    if not pool:
        return None
    ranked = sorted((score(c, inp) for c in pool), key=lambda r: (-r.score, r.intervention.slug))
    return ranked[0]
