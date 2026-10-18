"""Turns conversations into a few long-lived facts we can use in later replies.

One model call proposes facts; each one is validated, deduplicated against existing
memories by embedding distance, then stored. Anything touching a sensitive category is
rejected by `validate_fact`, whatever the model returned.
"""

import re
import uuid

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.factory import get_llm, get_router
from app.ai.prompts import memory_messages
from app.ai.provider import LLMError, ModelTask
from app.ai.schemas import MemoryExtraction, MemoryFact
from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import ConversationSession, MemoryItem
from app.repositories.conversations import ConversationRepository
from app.safety.classifier import classify
from app.services.embeddings import EmbeddingService

log = get_logger(__name__)
MAX_MEMORIES_PER_USER = 50
DUPLICATE_DISTANCE = 0.12

_SENSITIVE = re.compile(
    r"\b(?:diagnos\w*|disorder|depress\w*|bipolar|adhd|ptsd|ocd|schizo\w*|medicat\w*|pills?|dose|"
    r"religio\w*|hindu|muslim|christian|sikh|jain|buddhist|caste|dalit|brahmin|ethnic\w*|race|"
    r"gay|lesbian|bisexual|queer|trans\w*|sexual\w*|politic\w*|bjp|congress party|"
    r"suicid\w*|self[- ]?harm|kill|die|dead)\b",
    re.I,
)
_GENERALISATION = re.compile(
    r"\b(?:indian|german|british|french|portuguese|american|japanese|asian|western)\s+"
    r"(?:people|parents|families|culture|students|men|women)\b",
    re.I,
)


def validate_fact(fact: MemoryFact) -> bool:
    text = fact.content
    if _SENSITIVE.search(text) or _GENERALISATION.search(text):
        return False
    return classify(text).level.value == "low"


class MemoryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ConversationRepository(db)

    async def summarize_session(self, session_id: uuid.UUID) -> int:
        """Idempotent per message offset. Returns number of facts stored."""
        session = await self.db.get(ConversationSession, session_id)
        if session is None or not get_settings().llm_enabled:
            return 0
        new_msgs = await self.repo.messages_after(session.id, session.summarized_message_count)
        usable = [
            (m.role, m.content)
            for m in new_msgs
            if m.source in ("text", "voice", "assistant", "template") and m.risk_level != "high"
        ]
        session.summarized_message_count = session.message_count
        if not any(role == "user" for role, _ in usable):
            await self.db.commit()
            return 0
        try:
            raw = await get_llm().generate(
                model=get_router().model_for(ModelTask.EXTRACTION),
                messages=memory_messages(usable[-12:]),
                json_schema=MemoryExtraction.model_json_schema(),
                temperature=0.0,
                max_tokens=250,
            )
            proposed = MemoryExtraction.model_validate_json(raw.text).facts
        except (LLMError, ValidationError, ValueError) as exc:
            log.warning("memory_extraction_failed", extra={"error_type": type(exc).__name__})
            await self.db.rollback()
            raise
        facts = [f for f in proposed if validate_fact(f)]
        stored = 0
        if facts:
            vectors = await EmbeddingService().embed([f.content for f in facts])
            for i, fact in enumerate(facts):
                vec = vectors[i] if vectors else None
                if vec is not None and await self.repo.search_memory(
                    session.user_id, vec, k=1, max_distance=DUPLICATE_DISTANCE
                ):
                    continue
                await self.repo.add(
                    MemoryItem(
                        user_id=session.user_id,
                        kind=fact.kind,
                        content=fact.content,
                        source_session_id=session.id,
                        embedding=vec,
                    )
                )
                stored += 1
            await self._enforce_cap(session.user_id)
        await self.db.commit()
        log.info("memory_summarized", extra={"facts_stored": stored, "facts_rejected": len(proposed) - len(facts)})
        return stored

    async def _enforce_cap(self, user_id: uuid.UUID) -> None:
        items = await self.repo.list_memory(user_id)
        for old in items[MAX_MEMORIES_PER_USER:]:
            await self.db.delete(old)
