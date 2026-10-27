"""Controlled vocabularies shared by check-ins, extraction, interventions and patterns."""

from typing import Literal, get_args

Topic = Literal[
    "study_work", "relationships", "family", "money", "sleep", "loneliness", "health", "social_media", "other"
]
TOPICS: tuple[str, ...] = get_args(Topic)

Target = Literal[
    "overwhelm",
    "avoidance",
    "procrastination",
    "worry",
    "rumination",
    "anxiety_arousal",
    "low_mood",
    "low_energy",
    "loneliness",
    "conflict",
    "uncertainty",
    "self_criticism",
    "poor_sleep",
    "screen_overuse",
    "decision_paralysis",
    "anger",
    "pressure",
    "money_stress",
    "physical_tension",
    "functioning",
]
TARGETS: tuple[str, ...] = get_args(Target)

# Optional, finer-grained feeling words picked after the mood (emotion labelling).
Feeling = Literal[
    "calm",
    "grateful",
    "hopeful",
    "proud",
    "excited",
    "loved",
    "meh",
    "tired",
    "bored",
    "restless",
    "distracted",
    "unsure",
    "anxious",
    "overwhelmed",
    "lonely",
    "left_out",
    "sad",
    "drained",
    "numb",
    "irritated",
    "stressed",
    "self_doubt",
]

# Intervention targets for each feeling word. These come before targets derived from topics or text.
FEELING_TARGETS: dict[str, list[str]] = {
    "tired": ["low_energy"],
    "bored": ["low_energy"],
    "restless": ["anxiety_arousal"],
    "distracted": ["procrastination"],
    "unsure": ["uncertainty"],
    "anxious": ["anxiety_arousal", "worry"],
    "overwhelmed": ["overwhelm"],
    "lonely": ["loneliness"],
    "left_out": ["loneliness"],
    "sad": ["low_mood"],
    "drained": ["low_energy"],
    "numb": ["low_mood"],
    "irritated": ["anger"],
    "stressed": ["pressure"],
    "self_doubt": ["self_criticism"],
}

MoodLabel = Literal["great", "good", "okay", "low", "very_low"]
MOOD_TO_SCORE: dict[str, int] = {"very_low": 1, "low": 2, "okay": 3, "good": 4, "great": 5}
SCORE_TO_MOOD: dict[int, str] = {v: k for k, v in MOOD_TO_SCORE.items()}

SupportNeeded = Literal["practical", "emotional", "information", "connection", "none"]

FeedbackRating = Literal["a_lot", "a_little", "not_really", "worse"]
FEEDBACK_SCORE: dict[str, int] = {"a_lot": 2, "a_little": 1, "not_really": 0, "worse": -2}

# Common thinking traps from CBT, offered as optional labels in a thought reframe.
Distortion = Literal[
    "all_or_nothing",
    "catastrophizing",
    "mind_reading",
    "fortune_telling",
    "overgeneralizing",
    "labeling",
    "should_statements",
    "emotional_reasoning",
    "discounting_positive",
    "personalizing",
    "mental_filter",
    "comparing",
]
DISTORTIONS: tuple[str, ...] = get_args(Distortion)

AgeRange = Literal["18-21", "22-25", "26-30", "31+"]
Occupation = Literal["student", "working", "both", "other"]
SupportStyle = Literal["practical", "reflective", "mixed"]
NotificationFrequency = Literal["off", "occasional", "daily"]

CONSENT_TYPES: tuple[str, ...] = (
    "data_processing",  # required to use the service
    "store_journal",  # keep typed notes
    "store_transcripts",  # keep voice transcripts (audio is never kept)
    "memory",  # remember durable facts across conversations
    "analytics",  # privacy-preserving product analytics
)
DEFAULT_CONSENTS: dict[str, bool] = {
    "data_processing": True,
    "store_journal": True,
    "store_transcripts": False,
    "memory": True,
    "analytics": True,
}

# Intervention targets for each topic, used when the user doesn't write anything.
TOPIC_DEFAULT_TARGETS: dict[str, list[str]] = {
    "study_work": ["overwhelm", "pressure", "procrastination"],
    "relationships": ["conflict", "loneliness"],
    "family": ["pressure", "conflict", "worry"],
    "money": ["money_stress", "worry"],
    "sleep": ["poor_sleep"],
    "loneliness": ["loneliness", "low_mood"],
    "health": ["worry", "physical_tension"],
    "social_media": ["screen_overuse"],
    "other": ["worry"],
}
