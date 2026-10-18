"""Structured-output schemas. Model output is always validated with Pydantic before use."""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.vocab import TARGETS, TOPICS, MoodLabel, SupportNeeded, Target, Topic

_SLUG = re.compile(r"[^a-z0-9_ ]")


def _clean_tags(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values[:5]:
        tag = _SLUG.sub("", v.lower()).strip().replace(" ", "_")[:40]
        if tag and tag not in out:
            out.append(tag)
    return out


class ExtractionResult(BaseModel):
    mood: MoodLabel | None = None
    stress_level: int | None = Field(default=None, ge=0, le=10)
    energy_level: int | None = Field(default=None, ge=0, le=10)
    topics: list[Topic] = Field(default_factory=list, max_length=4)
    targets: list[Target] = Field(default_factory=list, max_length=4)
    triggers: list[str] = Field(default_factory=list, max_length=5)
    behaviors: list[str] = Field(default_factory=list, max_length=5)
    support_needed: SupportNeeded = "none"
    risk_level: Literal["low", "concerning", "high"] = "low"
    reflection: str | None = Field(default=None, max_length=220)

    @field_validator("topics", mode="before")
    @classmethod
    def _topics(cls, v: object) -> object:
        return list(dict.fromkeys(t for t in v if t in TOPICS))[:4] if isinstance(v, list) else v

    @field_validator("targets", mode="before")
    @classmethod
    def _targets(cls, v: object) -> object:
        return list(dict.fromkeys(t for t in v if t in TARGETS))[:4] if isinstance(v, list) else v

    @field_validator("triggers", "behaviors", mode="before")
    @classmethod
    def _tags(cls, v: object) -> object:
        return _clean_tags([str(x) for x in v]) if isinstance(v, list) else v

    @field_validator("reflection", mode="before")
    @classmethod
    def _reflection(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        text = " ".join(v.split())
        text = re.sub(r"\s*\((?:\d+\s*words?|word count[^)]*)\)\.?", "", text, flags=re.I).strip()
        if text and text[-1] not in ".!?":
            text += "."
        return text[:220].rsplit(" ", 1)[0] if len(text) > 220 else (text or None)


class MemoryFact(BaseModel):
    kind: Literal["preference", "coping", "goal", "context", "support"]
    content: str = Field(min_length=3, max_length=200)


class MemoryExtraction(BaseModel):
    facts: list[MemoryFact] = Field(default_factory=list, max_length=5)
