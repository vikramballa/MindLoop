"""Handles one turn of a Talk or Voice conversation.

1. Run the safety classifier. On high risk, show reviewed support content and stop.
2. Extract signals (rules for text, one extra model call for voice).
3. Look up relevant memories and a short wellbeing note.
4. Pick an intervention if one fits.
5. Generate the reply (streamed for text), check it with the output guard, save it.
"""

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.extraction import extract_signals
from app.ai.factory import get_llm, get_router
from app.ai.prompts import ResponseContext, response_messages
from app.ai.provider import ChatMessage, LLMError, ModelTask
from app.core.config import get_settings
from app.core.logging import get_logger
from app.i18n import t
from app.interventions.selector import SelectionInput
from app.interventions.service import ActionOut, InterventionService, localized
from app.models import ConversationMessage, ConversationSession, Intervention, StructuredSignal
from app.repositories.checkins import CheckInRepository
from app.repositories.conversations import ConversationRepository
from app.safety.classifier import RiskLevel, SafetyAssessment, combine_with_model_risk
from app.safety.output_guard import check_output
from app.safety.service import SafetyService, SupportResponse
from app.services.context import ContextPolicyService
from app.services.embeddings import EmbeddingService
from app.services.events import EventService
from app.services.user_context import UserCtx
from app.services.wellbeing import WellbeingModel, wellbeing_note
from app.workers.queue import enqueue

log = get_logger(__name__)
ACTION_EVERY_N_MESSAGES = 4  # don't push an exercise on every message


@dataclass
class Prepared:
    session: ConversationSession
    user_message: ConversationMessage
    assessment: SafetyAssessment
    support: SupportResponse | None
    action_item: Intervention | None
    action: ActionOut | None
    messages: list[ChatMessage] | None  # None when the safety flow replaces generation


class ConversationOrchestrator:
    def __init__(self, db: AsyncSession, ctx: UserCtx) -> None:
        self.db = db
        self.ctx = ctx
        self.repo = ConversationRepository(db)
        self.safety = SafetyService(db)
        self.interventions = InterventionService(db)
        self.events = EventService(db)

    async def prepare(
        self,
        session: ConversationSession,
        text: str,
        *,
        source: str = "text",
        store_user_text: bool = True,
        model_extraction: bool = False,
    ) -> Prepared:
        ctx = self.ctx
        assessment = self.safety.assess(text)  # deterministic, before any model call
        user_msg = ConversationMessage(
            session_id=session.id,
            user_id=ctx.user_id,
            role="user",
            source=source,
            content=text if store_user_text else "[voice message — transcript not stored]",
            risk_level=assessment.level.value,
        )
        await self.repo.add(user_msg)
        self._bump(session)

        if assessment.is_high:
            self.safety.record(
                user_id=ctx.user_id,
                source_type="message",
                source_id=user_msg.id,
                assessment=assessment,
                action="crisis_support_shown",
            )
            support = await self.safety.support_response(assessment, country=ctx.country, language=ctx.language)
            await self.db.commit()
            return Prepared(session, user_msg, assessment, support, None, None, None)

        extraction = await extract_signals(text=text, mood=None, topics=[], stress=None, allow_model=model_extraction)
        signals = extraction.result
        assessment = combine_with_model_risk(assessment, signals.risk_level if extraction.extractor == "llm" else None)
        self.db.add(
            StructuredSignal(
                user_id=ctx.user_id,
                source_type="voice" if source == "voice" else "message",
                source_id=user_msg.id,
                mood_label=signals.mood,
                stress_level=signals.stress_level,
                energy_level=signals.energy_level,
                topics=signals.topics,
                triggers=signals.triggers,
                behaviors=signals.behaviors,
                support_needed=signals.support_needed,
                model_risk_level=signals.risk_level,
                extractor=extraction.extractor,
                model_name=extraction.model,
            )
        )
        self.safety.record(
            user_id=ctx.user_id,
            source_type="message",
            source_id=user_msg.id,
            assessment=assessment,
            action="support_offered",
        )
        support = await self.safety.support_response(assessment, country=ctx.country, language=ctx.language)

        query_vec = await EmbeddingService().embed_one(text)
        memories: list[str] = []
        if ctx.consented("memory") and query_vec is not None:
            memories = [m.content for m in await self.repo.search_memory(ctx.user_id, query_vec, k=3)]

        action_item, action = None, None
        if signals.targets and self._action_due(session):
            chosen = await self.interventions.choose(
                user_id=ctx.user_id,
                inp=SelectionInput(
                    targets=signals.targets,
                    topics=signals.topics,
                    risk_level=assessment.level.value,
                    safety_categories=assessment.categories,
                    support_style=ctx.support_style,
                    preferred_minutes=ctx.preferred_minutes,
                ),
                language=ctx.language,
                age_range=ctx.age_range,
                source_type="message",
                source_id=user_msg.id,
                query_vec=query_vec,
            )
            if chosen:
                action_item = chosen[0]
                action = self.interventions.to_action(chosen[0], chosen[1], ctx.language)
                user_msg.intervention_assignment_id = chosen[1].id

        snapshot = await CheckInRepository(self.db).latest_snapshot(ctx.user_id)
        note = None
        if snapshot:
            try:
                note = wellbeing_note(WellbeingModel(**snapshot.data))
            except TypeError:
                note = None

        history_rows = await self.repo.messages(session.id, limit=get_settings().conversation_context_messages + 1)
        history = [(m.role, m.content) for m in history_rows if m.id != user_msg.id and m.source != "safety"]
        content = localized(action_item, ctx.language) if action_item else None
        policy = await ContextPolicyService(self.db).resolve(ctx.country, ctx.language)
        messages = response_messages(
            ctx=ResponseContext(
                policy=policy,
                support_style=ctx.support_style,
                memories=memories,
                wellbeing_note=note,
                action_title=content.title if content else None,
                action_summary=content.summary if content else None,
                stereotype_request=assessment.stereotype_request,
                concerning=assessment.level is RiskLevel.CONCERNING,
            ),
            history=history[-get_settings().conversation_context_messages :],
            user_text=text,
        )
        await self.db.commit()  # don't hold a transaction open while the model generates
        return Prepared(session, user_msg, assessment, support, action_item, action, messages)

    def _action_due(self, session: ConversationSession) -> bool:
        return session.message_count <= 1 or session.message_count % ACTION_EVERY_N_MESSAGES == 1

    @staticmethod
    def _bump(session: ConversationSession) -> None:
        session.message_count += 1
        session.last_message_at = datetime.now(UTC)

    def fallback_text(self, prepared: Prepared, guarded: bool = False) -> str:
        lang = self.ctx.language
        content = localized(prepared.action_item, lang) if prepared.action_item else None
        if guarded:
            return t("reply.guarded", lang, title=content.title if content else t("categories.reflection", lang))
        if content:
            return t("reply.fallback", lang, title=content.title, summary=content.summary)
        return t("reflection.none", lang)

    def guard(self, prepared: Prepared, text: str) -> tuple[str, bool]:
        """Returns (final text, replaced?)."""
        if not text.strip():
            return self.fallback_text(prepared), True
        result = check_output(text)
        if result.ok:
            return text, False
        log.warning("output_guard_triggered", extra={"violations": result.violations})
        return self.fallback_text(prepared, guarded=True), True

    async def finalize(self, prepared: Prepared, reply: str, source: str) -> ConversationMessage:
        msg = ConversationMessage(
            session_id=prepared.session.id,
            user_id=self.ctx.user_id,
            role="assistant",
            content=reply,
            source=source,
            risk_level=prepared.assessment.level.value,
            intervention_assignment_id=prepared.user_message.intervention_assignment_id,
        )
        await self.repo.add(msg)
        self._bump(prepared.session)
        s = get_settings()
        if (
            self.ctx.consented("memory")
            and prepared.session.message_count - prepared.session.summarized_message_count
            >= s.memory_summarize_every_n_messages
        ):
            await enqueue(
                self.db,
                "summarize_memory",
                {"session_id": str(prepared.session.id)},
                idempotency_key=f"summarize_memory:{prepared.session.id}:{prepared.session.message_count}",
            )
        await self.events.track("conversation_message", self.ctx.user_id, risk_level=prepared.assessment.level.value)
        await self.db.commit()
        return msg

    async def generate(self, prepared: Prepared) -> tuple[str, str]:
        """Non-streamed generation (voice). Returns (reply, source)."""
        if prepared.messages is None:
            assert prepared.support is not None
            return SafetyService.as_text(prepared.support), "safety"
        if not get_settings().llm_enabled:
            return self.fallback_text(prepared), "template"
        try:
            result = await get_llm().generate(
                model=get_router().model_for(ModelTask.FINAL_RESPONSE),
                messages=prepared.messages,
                temperature=0.5,
                max_tokens=260,
            )
        except LLMError:
            return self.fallback_text(prepared), "template"
        text, replaced = self.guard(prepared, result.text)
        return text, "template" if replaced else "assistant"

    async def stream(self, prepared: Prepared) -> AsyncIterator[dict[str, Any]]:
        """Streamed generation (text Talk). Yields SSE-ready event dicts."""
        if prepared.support is not None:
            yield {"type": "support", "support": prepared.support.model_dump()}
        if prepared.messages is None:
            assert prepared.support is not None
            msg = await self.finalize(prepared, SafetyService.as_text(prepared.support), "safety")
            yield {"type": "done", "message_id": str(msg.id), "risk_level": "high", "action": None}
            return
        if prepared.action:
            yield {"type": "action", "action": prepared.action.model_dump(mode="json")}

        parts: list[str] = []
        source = "assistant"
        if get_settings().llm_enabled:
            try:
                async for piece in get_llm().stream(
                    model=get_router().model_for(ModelTask.FINAL_RESPONSE),
                    messages=prepared.messages,
                    temperature=0.5,
                    max_tokens=260,
                ):
                    parts.append(piece)
                    yield {"type": "token", "text": piece}
            except LLMError:
                parts = []
        text, replaced = self.guard(prepared, "".join(parts))
        if replaced:
            source = "template"
            yield {"type": "replace", "text": text}
        msg = await self.finalize(prepared, text, source)
        yield {
            "type": "done",
            "message_id": str(msg.id),
            "risk_level": prepared.assessment.level.value,
            "action": prepared.action.model_dump(mode="json") if prepared.action else None,
        }


async def get_or_create_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID | None, mode: str = "text"
) -> ConversationSession | None:
    repo = ConversationRepository(db)
    if session_id:
        return await repo.get_session(user_id, session_id)
    session = ConversationSession(user_id=user_id, mode=mode)
    await repo.add(session)
    return session
