import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.db.base import Base, EncryptedText, Timestamps, UUIDPk, utcnow

EMBED_DIM = get_settings().embedding_dim


class ConversationSession(UUIDPk, Timestamps, Base):
    __tablename__ = "conversation_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mode: Mapped[str] = mapped_column(String(10), default="text")  # text | voice
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    summarized_message_count: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConversationMessage(UUIDPk, Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (Index("ix_conversation_messages_session_created", "session_id", "created_at"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversation_sessions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(EncryptedText)
    source: Mapped[str] = mapped_column(String(10), default="text")  # text | voice | safety | template
    risk_level: Mapped[str | None] = mapped_column(String(12))
    intervention_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("intervention_assignments.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, index=True
    )


class VoiceSession(UUIDPk, Timestamps, Base):
    __tablename__ = "voice_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    conversation_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversation_sessions.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(14), default="queued")
    # queued | transcribing | responding | completed | failed
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    transcript: Mapped[str | None] = mapped_column(EncryptedText)
    transcript_retained: Mapped[bool] = mapped_column(default=False)
    audio_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(40))
    risk_level: Mapped[str | None] = mapped_column(String(12))
    safety_categories: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    intervention_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("intervention_assignments.id", ondelete="SET NULL")
    )
    user_message_id: Mapped[uuid.UUID | None] = mapped_column()
    assistant_message_id: Mapped[uuid.UUID | None] = mapped_column()


class MemoryItem(UUIDPk, Timestamps, Base):
    """A durable, validated, user-useful fact. Content is encrypted; the embedding enables retrieval."""

    __tablename__ = "memory_items"
    __table_args__ = (
        Index(
            "ix_memory_items_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # preference|coping|goal|context|support
    content: Mapped[str] = mapped_column(EncryptedText)
    source_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversation_sessions.id", ondelete="SET NULL")
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))
