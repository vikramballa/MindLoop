"""Pure unit tests: AI schemas, rules extraction, selector, wellbeing statistics, i18n, logging, memory validation."""

import json
import logging
import uuid
from datetime import date, timedelta

import pytest

from app.ai.rules_extractor import extract_rules
from app.ai.schemas import ExtractionResult, MemoryExtraction, MemoryFact
from app.core.logging import JsonFormatter, SensitiveDataFilter
from app.i18n import t, t_list
from app.interventions.selector import SelectionInput, select
from app.models import Intervention
from app.services.memory import validate_fact
from app.services.wellbeing import CategoryFeedback, DayRecord, compute_model, compute_patterns, pearson


# AI schema tests
def test_extraction_schema_accepts_valid_payload() -> None:
    r = ExtractionResult.model_validate_json(
        json.dumps(
            {
                "mood": "low",
                "stress_level": 7,
                "energy_level": 4,
                "topics": ["study_work"],
                "targets": ["avoidance"],
                "triggers": ["Uncertainty!"],
                "behaviors": ["avoidance"],
                "support_needed": "practical",
                "risk_level": "low",
            }
        )
    )
    assert r.triggers == ["uncertainty"]


def test_extraction_schema_drops_unknown_vocab_and_trims() -> None:
    r = ExtractionResult.model_validate(
        {"topics": ["study_work", "aliens", "money", "sleep", "family", "health"], "targets": ["made_up", "worry"]}
    )
    assert r.topics == ["study_work", "money", "sleep", "family"]
    assert r.targets == ["worry"]


def test_extraction_schema_rejects_out_of_range() -> None:
    with pytest.raises(ValueError):
        ExtractionResult.model_validate({"stress_level": 42})


def test_reflection_is_cleaned() -> None:
    r = ExtractionResult.model_validate({"reflection": "It sounds like a lot (24 words)"})
    assert r.reflection == "It sounds like a lot."


def test_json_schema_is_strict_enough_for_structured_output() -> None:
    schema = ExtractionResult.model_json_schema()
    assert "risk_level" in schema["properties"]
    assert set(schema["properties"]["risk_level"]["enum"]) == {"low", "concerning", "high"}


def test_memory_schema() -> None:
    m = MemoryExtraction.model_validate({"facts": [{"kind": "coping", "content": "Walks help them reset"}]})
    assert m.facts[0].kind == "coping"


# Rules extraction
def test_rules_extraction_uses_chips_and_text() -> None:
    r = extract_rules(text="I keep putting off my assignment, it's too much", mood=2, topics=["study_work"])
    assert "study_work" in r.topics
    assert {"procrastination", "overwhelm"} & set(r.targets)
    assert r.mood == "low"


def test_rules_extraction_without_text() -> None:
    r = extract_rules(text=None, mood=4, topics=["sleep"])
    assert r.targets == ["poor_sleep"]


# Selector
def _item(
    slug: str, category: str, targets: list[str], contexts: list[str], minutes: int = 10, intensity: str = "low"
) -> Intervention:
    return Intervention(
        id=uuid.uuid4(),
        slug=slug,
        category=category,
        targets=targets,
        contexts=contexts,
        duration_minutes=minutes,
        intensity=intensity,
        contraindications=[],
        version=1,
    )


def test_selector_prefers_target_and_context_match() -> None:
    a = _item("a", "task_breakdown", ["procrastination"], ["study_work"])
    b = _item("b", "breathing", ["anxiety_arousal"], ["general"], minutes=3)
    best = select([a, b], SelectionInput(targets=["procrastination"], topics=["study_work"]))
    assert best and best.intervention.slug == "a"
    assert "target_match" in best.reasons


def test_selector_learns_from_feedback() -> None:
    a = _item("a", "task_breakdown", ["worry"], ["general"])
    b = _item("b", "reflection", ["worry"], ["general"])
    inp = SelectionInput(targets=["worry"], topics=[], item_feedback={a.id: (3, -4), b.id: (3, 6)})
    assert select([a, b], inp).intervention.slug == "b"  # type: ignore[union-attr]


def test_selector_excludes_blocked_and_avoids_repeats() -> None:
    a = _item("a", "task_breakdown", ["worry"], ["general"])
    b = _item("b", "reflection", ["worry"], ["general"])
    assert select([a, b], SelectionInput(targets=["worry"], topics=[], blocked_ids={a.id})).intervention.slug == "b"
    assert select([a, b], SelectionInput(targets=["worry"], topics=[], recent_ids=[a.id])).intervention.slug == "b"


def test_selector_concerning_prefers_low_intensity_and_professional_support() -> None:
    medium = _item("m", "problem_solving", ["low_mood"], ["general"], intensity="medium")
    prof = _item("p", "professional_support", ["low_mood"], ["general"])
    best = select([medium, prof], SelectionInput(targets=["low_mood"], topics=[], risk_level="concerning"))
    assert best and best.intervention.slug == "p"


# Wellbeing model
def _days(n: int, today: date) -> list[DayRecord]:
    out = []
    for i in range(n):
        study = i % 2 == 0
        out.append(
            DayRecord(
                day=today - timedelta(days=n - i),
                mood=2 if study else 4,
                stress=5 if study else 2,
                sleep=5.5 if study else 7.5,
                topics=frozenset({"study_work"} if study else set()),
            )
        )
    return out


def test_pearson() -> None:
    assert pearson([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)
    assert pearson([1, 1, 1], [1, 2, 3]) is None


def test_model_and_patterns_use_association_language() -> None:
    today = date(2026, 10, 1)
    days = _days(14, today)
    fb = [CategoryFeedback("task_breakdown", 4, 4)]
    model = compute_model(days, fb, today)
    assert model.mood_7d is not None and model.sleep_baseline is not None
    assert model.successful_categories == ["task_breakdown"]
    patterns = compute_patterns(days, model, fb)
    kinds = {p.kind for p in patterns}
    assert {"topic_mood", "sleep_stress", "sleep_mood", "intervention"} <= kinds
    for p in patterns:
        statement = t(p.statement_key, "en", **{k: "x" for k in p.params})
        assert "cause" not in statement.lower()
        assert "depress" not in statement.lower()


def test_patterns_require_minimum_data() -> None:
    today = date(2026, 10, 1)
    days = _days(3, today)
    assert [p for p in compute_patterns(days, compute_model(days, [], today), []) if p.kind != "intervention"] == []


# Memory validation
@pytest.mark.parametrize(
    "content,ok",
    [
        ("Preparing for placement interviews", True),
        ("Finds short walks helpful", True),
        ("Has been diagnosed with depression", False),
        ("Is Hindu", False),
        ("Indian parents pressure their children", False),
        ("Wants to kill himself", False),
    ],
)
def test_memory_validator(content: str, ok: bool) -> None:
    assert validate_fact(MemoryFact(kind="context", content=content)) is ok


# i18n
def test_i18n_fallback_to_english() -> None:
    assert t("home.welcome_back", "te") == "Welcome back."
    assert t_list("safety.high.suicide", "hi")


def test_ui_copy_avoids_diagnostic_language() -> None:
    from app.i18n import _catalog

    blob = json.dumps(_catalog("en")).lower()
    for banned in ("you are depressed", "disorder", "your diagnosis", "you have been diagnosed", "streak", "cure"):
        assert banned not in blob


# Privacy-safe logging
def test_logging_redacts_sensitive_fields() -> None:
    record = logging.LogRecord("t", logging.INFO, "", 0, "evt", (), None)
    record.text = "my secret journal"
    record.password = "hunter2"
    record.latency_ms = 12
    SensitiveDataFilter().filter(record)
    out = JsonFormatter().format(record)
    assert "my secret journal" not in out and "hunter2" not in out
    assert '"latency_ms": 12' in out
