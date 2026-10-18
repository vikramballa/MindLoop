"""Deterministic signal extraction. Used when there is no free text, when the LLM is
disabled, or as a fail-safe when model output is unavailable/invalid."""

import re

from app.ai.schemas import ExtractionResult
from app.core.vocab import SCORE_TO_MOOD, TOPIC_DEFAULT_TARGETS

_TOPIC_KEYWORDS: dict[str, str] = {
    "study_work": r"exam|test|assignment|deadline|interview|placement|job|boss|manager|office|work|study|"
    r"college|class|semester|project|career|internship|thesis|marks|grades",
    "relationships": r"boyfriend|girlfriend|partner|breakup|break up|friend|crush|relationship|dating",
    "family": r"parent|mother|father|mom|mum|dad|family|brother|sister|relatives|home",
    "money": r"money|rent|loan|debt|salary|fees|emi|broke|afford|expenses",
    "sleep": r"sleep|insomnia|awake at night|tired|can'?t sleep|nightmare",
    "loneliness": r"lonely|alone|no friends|isolated|nobody|left out",
    "health": r"sick|ill|pain|headache|health|doctor|injury|period cramps|fever",
    "social_media": r"instagram|reels|scrolling|social media|phone|youtube|twitter|snapchat|screen",
}
_TARGET_KEYWORDS: dict[str, str] = {
    "procrastination": r"procrastinat|putting (?:it )?off|keep delaying|haven'?t started",
    "avoidance": r"avoid|can'?t (?:start|face)|ignoring",
    "overwhelm": r"overwhelm|too much|so much to do|drowning|can'?t keep up|piling up",
    "worry": r"worr|what if|scared|afraid|fear",
    "rumination": r"overthink|can'?t stop thinking|replaying|keep thinking",
    "anxiety_arousal": r"anxious|anxiety|panic|nervous|heart racing|restless|on edge",
    "low_mood": r"\bsad\b|\bdown\b|\blow\b|empty|miserable|unhappy|crying",
    "low_energy": r"exhausted|no energy|drained|fatigue|tired all",
    "loneliness": r"lonely|alone|isolated",
    "conflict": r"fight|argument|argue|conflict|shouted|yelled",
    "uncertainty": r"don'?t know what to do|confused|uncertain|not sure (?:what|about)|lost",
    "self_criticism": r"useless|stupid|failure|hate myself|not good enough|worthless",
    "poor_sleep": r"can'?t sleep|insomnia|slept badly|no sleep|up all night",
    "screen_overuse": r"scrolling|reels|on my phone|screen time",
    "decision_paralysis": r"can'?t decide|can'?t choose|stuck between",
    "anger": r"angry|furious|frustrated|irritated",
    "pressure": r"pressure|expectations|compare|comparison",
    "money_stress": r"money|debt|loan|rent|afford",
    "physical_tension": r"tense|tight chest|headache|shoulders|jaw",
}
_COMPILED_TOPICS = {k: re.compile(rf"\b(?:{v})", re.I) for k, v in _TOPIC_KEYWORDS.items()}
_COMPILED_TARGETS = {k: re.compile(rf"(?:{v})", re.I) for k, v in _TARGET_KEYWORDS.items()}


def extract_rules(
    *,
    text: str | None,
    mood: int | None,
    topics: list[str],
    stress: int | None = None,
) -> ExtractionResult:
    found_topics = list(topics)
    targets: list[str] = []
    if text:
        for topic, pattern in _COMPILED_TOPICS.items():
            if topic not in found_topics and pattern.search(text):
                found_topics.append(topic)
        targets = [t for t, p in _COMPILED_TARGETS.items() if p.search(text)]
    for topic in found_topics:
        for target in TOPIC_DEFAULT_TARGETS.get(topic, []):
            if target not in targets:
                targets.append(target)
    if mood is not None and mood <= 2 and "low_mood" not in targets:
        targets.insert(0, "low_mood")
    if stress is not None and stress >= 4 and "anxiety_arousal" not in targets:
        targets.append("anxiety_arousal")
    return ExtractionResult.model_validate(
        {
            "mood": SCORE_TO_MOOD.get(mood) if mood else None,
            "stress_level": stress * 2 if stress else None,
            "topics": found_topics,
            "targets": targets,
            "support_needed": "practical" if {"overwhelm", "procrastination"} & set(targets) else "none",
        }
    )
