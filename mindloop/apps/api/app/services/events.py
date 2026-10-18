"""Audit logging and privacy-preserving analytics. Neither ever receives user content."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_var
from app.models import AnalyticsEvent, AuditLog
from app.repositories.system import EventRepository
from app.repositories.users import UserRepository

ANALYTICS_EVENTS = frozenset(
    {
        "signup_completed",
        "onboarding_completed",
        "checkin_started",
        "checkin_completed",
        "intervention_started",
        "intervention_completed",
        "intervention_feedback",
        "pattern_viewed",
        "support_resource_viewed",
        "conversation_message",
        "voice_message",
        "app_opened",
        "calm_tool_used",
        "reach_out_shared",
        "recap_shared",
    }
)
CLIENT_EVENTS = frozenset(
    {
        "checkin_started",
        "pattern_viewed",
        "support_resource_viewed",
        "app_opened",
        "calm_tool_used",
        "reach_out_shared",
        "recap_shared",
    }
)
_ALLOWED_PROPS = frozenset(
    {"mood", "rating", "category", "source", "risk_level", "country", "duration_minutes", "step"}
)


class EventService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = EventRepository(db)

    def audit(self, action: str, user_id: uuid.UUID | None, resource: str | None = None, **details: Any) -> None:
        self.repo.add(
            AuditLog(
                user_id=user_id, action=action, resource=resource, details=details, request_id=request_id_var.get()
            )
        )

    async def track(self, name: str, user_id: uuid.UUID | None, **props: Any) -> None:
        if name not in ANALYTICS_EVENTS:
            return
        if user_id is not None:
            consent = await UserRepository(self.db).get_consent(user_id, "analytics")
            if consent is not None and not consent.granted:
                return
        safe = {k: v for k, v in props.items() if k in _ALLOWED_PROPS and isinstance(v, str | int | float | bool)}
        self.repo.add(AnalyticsEvent(user_id=user_id, name=name, properties=safe))
