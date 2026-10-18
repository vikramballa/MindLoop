import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.vocab import FeedbackRating, Feeling, Topic
from app.interventions.service import ActionOut
from app.safety.service import SupportResponse


class CheckInCreate(BaseModel):
    mood: int = Field(ge=1, le=5, description="1 very low … 5 great")
    topics: list[Topic] = Field(default_factory=list, max_length=9)
    feelings: list[Feeling] = Field(default_factory=list, max_length=5)
    stress: int | None = Field(default=None, ge=1, le=5)
    sleep_hours: float | None = Field(default=None, ge=0, le=16)
    note: str | None = Field(default=None, max_length=4000)
    local_date: date | None = None
    source: Literal["tap", "text", "voice"] = "tap"

    @field_validator("note")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None

    @field_validator("topics", "feelings")
    @classmethod
    def _dedupe(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class CheckInResult(BaseModel):
    id: uuid.UUID
    status: Literal["processing", "completed", "failed"]
    created_at: datetime
    local_date: date
    mood: int
    topics: list[str]
    feelings: list[str]
    risk_level: str
    reflection: str | None
    action_lead: str | None
    action: ActionOut | None
    support: SupportResponse | None
    feedback_question: str | None


class CheckInSummary(BaseModel):
    id: uuid.UUID
    local_date: date
    mood: int
    stress: int | None
    sleep_hours: float | None
    topics: list[str]
    feelings: list[str]
    has_note: bool


class DayMood(BaseModel):
    day: date
    mood: int | None = Field(description="Latest mood that day, or null if no check-in")


class PulseItem(BaseModel):
    kind: Literal["topic", "feeling"]
    key: str
    people: int


class CommunityPulse(BaseModel):
    """Anonymous counts of people who checked in recently. Every number is >= the k-anonymity floor."""

    window_hours: int
    people: int
    items: list[PulseItem]


class HomeResponse(BaseModel):
    display_name: str | None
    welcome_back: str | None
    checkin_count: int
    today: CheckInResult | None
    week: list[DayMood]
    days_checked_in_7d: int
    community: CommunityPulse | None


class FeedbackRequest(BaseModel):
    rating: FeedbackRating
