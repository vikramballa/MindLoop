"""User data rights: export, scoped deletion, account deletion, consent management.

User-requested deletion is always a hard delete. Withdrawing a storage consent also
deletes the data that consent covered.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.core.vocab import CONSENT_TYPES
from app.models import (
    AnalyticsEvent,
    CheckIn,
    Consent,
    ConversationMessage,
    ConversationSession,
    InterventionAssignment,
    InterventionFeedback,
    JournalEntry,
    MemoryItem,
    SafetyEvent,
    StructuredSignal,
    UserPattern,
    VoiceSession,
)
from app.repositories.checkins import CheckInRepository
from app.repositories.conversations import ConversationRepository
from app.repositories.users import UserRepository
from app.services.errors import InvalidInput, NotFound, Unauthorized
from app.services.events import EventService
from app.services.profile import ProfileService


def _rows(objs: list[Any], fields: list[str]) -> list[dict[str, Any]]:
    out = []
    for o in objs:
        row = {}
        for f in fields:
            v = getattr(o, f)
            row[f] = v.isoformat() if hasattr(v, "isoformat") else (str(v) if isinstance(v, uuid.UUID) else v)
        out.append(row)
    return out


class PrivacyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.events = EventService(db)

    async def _all(self, model: Any, user_id: uuid.UUID, order: Any = None) -> list[Any]:
        stmt = select(model).where(model.user_id == user_id)
        if order is not None:
            stmt = stmt.order_by(order)
        return list((await self.db.execute(stmt)).scalars())

    async def export(self, user_id: uuid.UUID) -> dict[str, Any]:
        user = await self.users.get(user_id)
        if user is None:
            raise NotFound()
        profile = await ProfileService(self.db).get(user_id)
        journal = {j.check_in_id: j.text for j in await self._all(JournalEntry, user_id)}
        checkins = await self._all(CheckIn, user_id, CheckIn.created_at)
        sessions = await self._all(ConversationSession, user_id, ConversationSession.created_at)
        messages = await self._all(ConversationMessage, user_id, ConversationMessage.created_at)
        by_session: dict[uuid.UUID, list[dict[str, Any]]] = {}
        for m in messages:
            by_session.setdefault(m.session_id, []).append(
                {"role": m.role, "content": m.content, "source": m.source, "created_at": m.created_at.isoformat()}
            )
        self.events.audit("data_exported", user_id, "user")
        await self.db.commit()
        return {
            "exported_at": datetime.now(UTC).isoformat(),
            "format_version": 1,
            "account": {"id": str(user.id), "email": user.email, "created_at": user.created_at.isoformat()},
            "profile": profile.model_dump(mode="json"),
            "checkins": [
                {**r, "note": journal.get(c.id)}
                for c, r in zip(
                    checkins,
                    _rows(
                        checkins,
                        [
                            "id",
                            "local_date",
                            "mood",
                            "stress",
                            "sleep_hours",
                            "energy",
                            "topics",
                            "feelings",
                            "source",
                            "risk_level",
                            "reflection",
                            "created_at",
                        ],
                    ),
                    strict=True,
                )
            ],
            "signals": _rows(
                await self._all(StructuredSignal, user_id),
                [
                    "source_type",
                    "mood_label",
                    "stress_level",
                    "energy_level",
                    "topics",
                    "triggers",
                    "behaviors",
                    "support_needed",
                    "extractor",
                    "created_at",
                ],
            ),
            "intervention_assignments": _rows(
                await self._all(InterventionAssignment, user_id),
                ["id", "intervention_id", "source_type", "status", "reason_codes", "created_at", "completed_at"],
            ),
            "intervention_feedback": _rows(
                await self._all(InterventionFeedback, user_id), ["assignment_id", "rating", "created_at"]
            ),
            "conversations": [
                {
                    "id": str(s.id),
                    "mode": s.mode,
                    "created_at": s.created_at.isoformat(),
                    "messages": by_session.get(s.id, []),
                }
                for s in sessions
            ],
            "voice_sessions": _rows(
                await self._all(VoiceSession, user_id), ["id", "status", "duration_seconds", "transcript", "created_at"]
            ),
            "memory": _rows(await self._all(MemoryItem, user_id), ["id", "kind", "content", "created_at"]),
            "patterns": _rows(await self._all(UserPattern, user_id), ["kind", "key", "statement_key", "evidence"]),
            "safety_events": _rows(
                await self._all(SafetyEvent, user_id), ["risk_level", "categories", "action_taken", "created_at"]
            ),
        }

    async def delete_account(self, user_id: uuid.UUID, password: str) -> None:
        user = await self.users.get(user_id)
        if user is None:
            raise NotFound()
        if not verify_password(password, user.password_hash):
            raise Unauthorized("Password is incorrect", code="invalid_password")
        await self.users.delete(user.id)
        self.events.audit("account_deleted", user_id, "user")
        await self.db.commit()

    async def delete_scope(self, user_id: uuid.UUID, scope: str) -> int:
        convos = ConversationRepository(self.db)
        if scope == "conversations":
            n = await convos.delete_all_sessions(user_id)
        elif scope == "journal":
            n = await CheckInRepository(self.db).delete_journal(user_id)
        elif scope == "transcripts":
            n = await convos.clear_transcripts(user_id)
        elif scope == "memory":
            n = await convos.delete_memory(user_id)
        elif scope == "checkins":
            res = await self.db.execute(delete(CheckIn).where(CheckIn.user_id == user_id))
            await self.db.execute(delete(UserPattern).where(UserPattern.user_id == user_id))
            n = res.rowcount or 0  # type: ignore[attr-defined]
        else:
            raise InvalidInput("Unknown scope")
        self.events.audit("data_deleted", user_id, scope, count=n)
        await self.db.commit()
        return n

    async def list_memory(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        items = await ConversationRepository(self.db).list_memory(user_id)
        return [
            {"id": str(m.id), "kind": m.kind, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in items
        ]

    async def delete_memory_item(self, user_id: uuid.UUID, memory_id: uuid.UUID) -> None:
        if not await ConversationRepository(self.db).delete_memory(user_id, memory_id):
            raise NotFound()
        self.events.audit("memory_item_deleted", user_id, "memory")
        await self.db.commit()

    async def consents(self, user_id: uuid.UUID) -> dict[str, bool]:
        return {c.consent_type: c.granted for c in await self.users.list_consents(user_id)}

    async def set_consent(self, user_id: uuid.UUID, consent_type: str, granted: bool) -> dict[str, bool]:
        if consent_type not in CONSENT_TYPES:
            raise InvalidInput("Unknown consent type")
        if consent_type == "data_processing" and not granted:
            raise InvalidInput("To stop all processing, delete your account instead", code="use_account_deletion")
        consent = await self.users.get_consent(user_id, consent_type)
        if consent is None:
            self.db.add(Consent(user_id=user_id, consent_type=consent_type, granted=granted))
        else:
            consent.granted = granted
        if not granted:
            await self._withdraw(user_id, consent_type)
        self.events.audit("consent_changed", user_id, "consent", consent_type=consent_type, granted=granted)
        await self.db.commit()
        return await self.consents(user_id)

    async def _withdraw(self, user_id: uuid.UUID, consent_type: str) -> None:
        convos = ConversationRepository(self.db)
        if consent_type == "memory":
            await convos.delete_memory(user_id)
        elif consent_type == "store_transcripts":
            await convos.clear_transcripts(user_id)
        elif consent_type == "store_journal":
            await CheckInRepository(self.db).delete_journal(user_id)
        elif consent_type == "analytics":
            await self.db.execute(delete(AnalyticsEvent).where(AnalyticsEvent.user_id == user_id))
