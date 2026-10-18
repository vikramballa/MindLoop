from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.vocab import TOPICS, AgeRange, NotificationFrequency, Occupation, SupportStyle
from app.i18n import SUPPORTED_LANGUAGES

LivingSituation = Literal["with_family", "hostel_or_pg", "shared", "alone", "partner", "other"]
SupportNetwork = Literal["friends", "family", "partner", "mentor", "mixed", "prefer_not_say"]
HealthcareAccess = Literal["college_counsellor", "workplace_program", "private", "public", "none_yet", "prefer_not_say"]


def _check_language(v: str | None) -> str | None:
    if v is not None and v.split("-")[0] not in SUPPORTED_LANGUAGES:
        raise ValueError("unsupported language")
    return v


class CommunicationPreferences(BaseModel):
    tone: Literal["gentle", "direct"] = "gentle"
    length: Literal["short", "medium"] = "short"


class ContextProfile(BaseModel):
    """The user-editable cultural/context profile. Every field is optional and correctable."""

    display_name: str | None = Field(default=None, max_length=80)
    country: str = Field(default="IN", pattern=r"^[A-Z]{2}$")
    region: str | None = Field(default=None, max_length=80)
    preferred_language: str = "en"
    secondary_language: str | None = None
    age_range: AgeRange | None = None
    occupation: Occupation | None = None
    living_situation: LivingSituation | None = None
    preferred_support_style: SupportStyle = "mixed"
    selected_stressors: list[str] = Field(default_factory=list, max_length=9)
    communication_preferences: CommunicationPreferences = Field(default_factory=CommunicationPreferences)
    support_network_preference: SupportNetwork | None = None
    healthcare_access_preference: HealthcareAccess | None = None
    cultural_context_notes: str | None = Field(default=None, max_length=500)

    @field_validator("country", mode="before")
    @classmethod
    def _upper(cls, v: object) -> object:
        return v.upper() if isinstance(v, str) else v

    @field_validator("preferred_language", "secondary_language")
    @classmethod
    def _lang(cls, v: str | None) -> str | None:
        return _check_language(v)

    @field_validator("selected_stressors")
    @classmethod
    def _stressors(cls, v: list[str]) -> list[str]:
        return [s for s in dict.fromkeys(v) if s in TOPICS]


class ContextProfileUpdate(BaseModel):
    """PATCH semantics: only provided fields are changed."""

    display_name: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, pattern=r"^[A-Za-z]{2}$")
    region: str | None = Field(default=None, max_length=80)
    preferred_language: str | None = None
    secondary_language: str | None = None
    age_range: AgeRange | None = None
    occupation: Occupation | None = None
    living_situation: LivingSituation | None = None
    preferred_support_style: SupportStyle | None = None
    selected_stressors: list[str] | None = Field(default=None, max_length=9)
    communication_preferences: CommunicationPreferences | None = None
    support_network_preference: SupportNetwork | None = None
    healthcare_access_preference: HealthcareAccess | None = None
    cultural_context_notes: str | None = Field(default=None, max_length=500)

    @field_validator("preferred_language", "secondary_language")
    @classmethod
    def _lang(cls, v: str | None) -> str | None:
        return _check_language(v)


class Preferences(BaseModel):
    notification_frequency: NotificationFrequency = "occasional"
    preferred_intervention_minutes: int = Field(default=10, ge=2, le=30)
    voice_enabled: bool = True
    show_patterns: bool = True


class PreferencesUpdate(BaseModel):
    notification_frequency: NotificationFrequency | None = None
    preferred_intervention_minutes: int | None = Field(default=None, ge=2, le=30)
    voice_enabled: bool | None = None
    show_patterns: bool | None = None


class ProfileResponse(BaseModel):
    profile: ContextProfile
    preferences: Preferences
    consents: dict[str, bool]
    onboarding_completed_at: datetime | None


class OnboardingRequest(ContextProfile):
    preferences: PreferencesUpdate | None = None
