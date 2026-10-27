import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.core.vocab import Distortion
from app.safety.service import SupportResponse

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Line = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


def _drop_blank(items: list[str]) -> list[str]:
    return [x for x in items if x]


# ---------- Reflections ----------
class ReframeCreate(BaseModel):
    """A CBT-style thought record: what happened, the thought, the evidence, and a kinder way to see it."""

    kind: Literal["reframe"]
    situation: ShortText = ""
    thought: ShortText = Field(min_length=1)
    belief_before: int | None = Field(default=None, ge=0, le=100, description="How true the thought felt, 0-100")
    distortions: list[Distortion] = Field(default_factory=list, max_length=4)
    evidence_for: ShortText = ""
    evidence_against: ShortText = ""
    balanced: ShortText = ""
    belief_after: int | None = Field(default=None, ge=0, le=100)

    @field_validator("distortions")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class GratitudeCreate(BaseModel):
    """Three good things: up to three small things that went well, and optionally why."""

    kind: Literal["gratitude"]
    items: list[Line] = Field(min_length=1, max_length=3)
    why: ShortText = ""

    @field_validator("items")
    @classmethod
    def _non_blank(cls, v: list[str]) -> list[str]:
        v = _drop_blank(v)
        if not v:
            raise ValueError("at least one item is required")
        return v


ReflectionCreate = Annotated[ReframeCreate | GratitudeCreate, Field(discriminator="kind")]


class ReflectionOut(BaseModel):
    id: uuid.UUID
    kind: Literal["reframe", "gratitude"]
    created_at: datetime
    # Reframe
    situation: str | None = None
    thought: str | None = None
    belief_before: int | None = None
    distortions: list[str] = Field(default_factory=list)
    evidence_for: str | None = None
    evidence_against: str | None = None
    balanced: str | None = None
    belief_after: int | None = None
    # Gratitude
    items: list[str] = Field(default_factory=list)
    why: str | None = None


class ReflectionResult(BaseModel):
    reflection: ReflectionOut
    support: SupportResponse | None = Field(
        default=None, description="Reviewed support text, present when what was written suggests risk"
    )


class ReflectionStats(BaseModel):
    reframes: int
    gratitude: int
    gratitude_items: int
    avg_belief_shift: float | None = Field(description="Mean drop in belief (0-100) across completed reframes")
    top_distortions: list[str]


# ---------- Safety plan ----------
class Contact(BaseModel):
    name: Line = Field(min_length=1)
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] = ""


class SafetyPlanBody(BaseModel):
    """The six Stanley-Brown steps, plus the reasons that keep someone going."""

    warning_signs: list[Line] = Field(default_factory=list, max_length=10)
    coping: list[Line] = Field(default_factory=list, max_length=10)
    distractions: list[Line] = Field(default_factory=list, max_length=10)
    people: list[Contact] = Field(default_factory=list, max_length=10)
    professionals: list[Contact] = Field(default_factory=list, max_length=10)
    safe_environment: list[Line] = Field(default_factory=list, max_length=10)
    reasons: list[Line] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _clean(self) -> "SafetyPlanBody":
        for name in ("warning_signs", "coping", "distractions", "safe_environment", "reasons"):
            setattr(self, name, _drop_blank(getattr(self, name)))
        return self


class SafetyPlanOut(SafetyPlanBody):
    updated_at: datetime | None = None
