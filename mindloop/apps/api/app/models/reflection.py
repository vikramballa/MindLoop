import uuid

from sqlalchemy import ForeignKey, Index, SmallInteger, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EncryptedText, Timestamps, UUIDPk


class Reflection(UUIDPk, Timestamps, Base):
    """A guided journal entry: a thought reframe or three good things.

    Everything the user wrote lives in `content`, an encrypted JSON document. Only the numbers and
    the vocabulary keys the UI needs for summaries are stored in the clear.
    """

    __tablename__ = "reflections"
    __table_args__ = (Index("ix_reflections_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # reframe | gratitude
    content: Mapped[str] = mapped_column(EncryptedText)
    distortions: Mapped[list[str]] = mapped_column(ARRAY(String(30)), default=list)
    belief_before: Mapped[int | None] = mapped_column(SmallInteger)  # 0-100
    belief_after: Mapped[int | None] = mapped_column(SmallInteger)  # 0-100
    risk_level: Mapped[str] = mapped_column(String(12), default="low")


class SafetyPlan(UUIDPk, Timestamps, Base):
    """A personal safety plan (Stanley-Brown structure). One per user, fully encrypted."""

    __tablename__ = "safety_plans"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    content: Mapped[str] = mapped_column(EncryptedText)
