import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversationMessage, ConversationSession, MemoryItem, VoiceSession


class ConversationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add(self, obj: ConversationSession | ConversationMessage | VoiceSession | MemoryItem) -> None:
        self.db.add(obj)
        await self.db.flush()

    async def get_session(self, user_id: uuid.UUID, session_id: uuid.UUID) -> ConversationSession | None:
        stmt = select(ConversationSession).where(
            ConversationSession.id == session_id, ConversationSession.user_id == user_id
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_sessions(self, user_id: uuid.UUID, limit: int = 20, offset: int = 0) -> list[ConversationSession]:
        stmt = (
            select(ConversationSession)
            .where(ConversationSession.user_id == user_id, ConversationSession.message_count > 0)
            .order_by(ConversationSession.last_message_at.desc().nulls_last())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.db.execute(stmt)).scalars())

    async def messages(self, session_id: uuid.UUID, limit: int = 50) -> list[ConversationMessage]:
        stmt = (
            select(ConversationMessage)
            .where(ConversationMessage.session_id == session_id)
            .order_by(ConversationMessage.created_at.desc())
            .limit(limit)
        )
        return list(reversed(list((await self.db.execute(stmt)).scalars())))

    async def messages_after(self, session_id: uuid.UUID, offset: int) -> list[ConversationMessage]:
        stmt = (
            select(ConversationMessage)
            .where(ConversationMessage.session_id == session_id)
            .order_by(ConversationMessage.created_at)
            .offset(offset)
        )
        return list((await self.db.execute(stmt)).scalars())

    async def delete_session(self, session_id: uuid.UUID) -> None:
        await self.db.execute(delete(ConversationSession).where(ConversationSession.id == session_id))

    async def delete_all_sessions(self, user_id: uuid.UUID) -> int:
        res = await self.db.execute(delete(ConversationSession).where(ConversationSession.user_id == user_id))
        return res.rowcount or 0  # type: ignore[attr-defined]

    # Voice
    async def get_voice(self, user_id: uuid.UUID, voice_id: uuid.UUID) -> VoiceSession | None:
        stmt = select(VoiceSession).where(VoiceSession.id == voice_id, VoiceSession.user_id == user_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_voice_by_id(self, voice_id: uuid.UUID) -> VoiceSession | None:
        return await self.db.get(VoiceSession, voice_id)

    async def clear_transcripts(self, user_id: uuid.UUID) -> int:
        res = await self.db.execute(
            update(VoiceSession)
            .where(VoiceSession.user_id == user_id, VoiceSession.transcript.is_not(None))
            .values(transcript=None, transcript_retained=False)
        )
        voice_msgs = await self.db.execute(
            delete(ConversationMessage).where(
                ConversationMessage.user_id == user_id, ConversationMessage.source == "voice"
            )
        )
        return (res.rowcount or 0) + (voice_msgs.rowcount or 0)  # type: ignore[attr-defined]

    # Memory
    async def search_memory(
        self, user_id: uuid.UUID, query_vec: list[float], k: int = 3, max_distance: float = 0.6
    ) -> list[MemoryItem]:
        distance = MemoryItem.embedding.cosine_distance(query_vec)
        stmt = (
            select(MemoryItem)
            .where(MemoryItem.user_id == user_id, MemoryItem.embedding.is_not(None), distance < max_distance)
            .order_by(distance)
            .limit(k)
        )
        return list((await self.db.execute(stmt)).scalars())

    async def list_memory(self, user_id: uuid.UUID) -> list[MemoryItem]:
        stmt = select(MemoryItem).where(MemoryItem.user_id == user_id).order_by(MemoryItem.created_at.desc())
        return list((await self.db.execute(stmt)).scalars())

    async def delete_memory(self, user_id: uuid.UUID, memory_id: uuid.UUID | None = None) -> int:
        stmt = delete(MemoryItem).where(MemoryItem.user_id == user_id)
        if memory_id:
            stmt = stmt.where(MemoryItem.id == memory_id)
        res = await self.db.execute(stmt)
        return res.rowcount or 0  # type: ignore[attr-defined]
