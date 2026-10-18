"""Runs the risk assessment, records a safety event and builds the reviewed support response."""

import uuid

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.i18n import has_key, t, t_list
from app.models import SafetyEvent, SupportResource
from app.repositories.system import EventRepository, SupportResourceRepository
from app.safety.classifier import RiskLevel, SafetyAssessment, classify

log = get_logger(__name__)

# Most urgent category first: decides which reviewed template is used.
_HIGH_PRIORITY = (
    "medical_emergency",
    "harm_to_others",
    "unsafe_situation",
    "suicide",
    "self_harm",
    "severe_disorientation",
)
_CONCERNING_PRIORITY = ("third_party_risk", "abuse", "unusual_experiences", "functioning")


class ResourceOut(BaseModel):
    organization: str
    type: str
    phone: str | None
    website: str | None
    hours: str | None
    description: str | None

    @classmethod
    def of(cls, r: SupportResource) -> "ResourceOut":
        return cls(
            organization=r.organization,
            type=r.type,
            phone=r.phone,
            website=r.website,
            hours=r.hours,
            description=r.description,
        )


class SupportResponse(BaseModel):
    """Deterministic, reviewed support content. Never model-generated."""

    level: str
    title: str
    paragraphs: list[str]
    resources: list[ResourceOut]
    ai_notice: str | None = None
    allow_continue: bool = True


class SafetyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.resources = SupportResourceRepository(db)
        self.events = EventRepository(db)

    def assess(self, text: str | None) -> SafetyAssessment:
        return classify(text)

    def record(
        self,
        *,
        user_id: uuid.UUID,
        source_type: str,
        source_id: uuid.UUID | None,
        assessment: SafetyAssessment,
        action: str,
    ) -> None:
        if assessment.level is RiskLevel.LOW and not assessment.injection_detected:
            return
        self.events.add(
            SafetyEvent(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                risk_level=assessment.level.value,
                categories=assessment.categories + (["prompt_injection"] if assessment.injection_detected else []),
                matched_rules=assessment.matched_rules,
                classifier_version=assessment.version,
                action_taken=action,
            )
        )
        log.info(
            "safety_event",
            extra={
                "risk_level": assessment.level.value,
                "rules": assessment.matched_rules,
                "source_type": source_type,
                "action": action,
            },
        )

    async def support_response(
        self, assessment: SafetyAssessment, *, country: str, language: str
    ) -> SupportResponse | None:
        if assessment.level is RiskLevel.LOW:
            return None
        if assessment.level is RiskLevel.HIGH:
            category = next((c for c in _HIGH_PRIORITY if c in assessment.categories), "suicide")
            rows = await self.resources.for_country(country)
            paragraphs = t_list(f"safety.high.{category}", language)
            if not rows:
                paragraphs.append(t("safety.high.no_local_resources", language))
            return SupportResponse(
                level="high",
                title=t("safety.high.title", language),
                paragraphs=paragraphs,
                resources=[ResourceOut.of(r) for r in rows],
                ai_notice=t("safety.high.ai_notice", language),
                allow_continue=False,
            )
        category = next((c for c in _CONCERNING_PRIORITY if c in assessment.categories), "default")
        key = f"safety.concerning.{category}"
        if not has_key(key, language):
            key = "safety.concerning.default"
        rows = await self.resources.for_country(country, types=("mental_health_helpline", "crisis_line", "emergency"))
        return SupportResponse(
            level="concerning",
            title=t("safety.concerning.title", language),
            paragraphs=t_list(key, language),
            resources=[ResourceOut.of(r) for r in rows],
            allow_continue=True,
        )

    @staticmethod
    def as_text(resp: SupportResponse) -> str:
        """Plain-text rendering for storage in a conversation transcript."""
        lines = list(resp.paragraphs)
        for r in resp.resources:
            contact = " · ".join(x for x in (r.phone, r.website) if x)
            lines.append(f"{r.organization}: {contact}" + (f" ({r.hours})" if r.hours else ""))
        if resp.ai_notice:
            lines.append(resp.ai_notice)
        return "\n".join(lines)
