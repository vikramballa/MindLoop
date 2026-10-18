import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EncryptedText, Timestamps, UUIDPk, utcnow


class CheckIn(UUIDPk, Timestamps, Base):
    """One check-in. Mood, stress and sleep are stored here rather than in a separate table."""

    __tablename__ = "check_ins"
    __table_args__ = (
        Index("ix_check_ins_user_date", "user_id", "local_date"),
        Index("ix_check_ins_created_at", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    local_date: Mapped[date] = mapped_column(Date, index=True)
    mood: Mapped[int] = mapped_column(SmallInteger)  # 1 very low … 5 great
    stress: Mapped[int | None] = mapped_column(SmallInteger)  # 1 … 5
    sleep_hours: Mapped[float | None] = mapped_column(Float)
    energy: Mapped[int | None] = mapped_column(SmallInteger)  # 1 … 5, may come from extraction
    topics: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    feelings: Mapped[list[str]] = mapped_column(ARRAY(String(20)), default=list, server_default="{}")
    source: Mapped[str] = mapped_column(String(10), default="tap")  # tap | text | voice
    status: Mapped[str] = mapped_column(String(12), default="completed")  # processing|completed|failed
    risk_level: Mapped[str] = mapped_column(String(12), default="low")
    safety_categories: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    reflection: Mapped[str | None] = mapped_column(EncryptedText)
    intervention_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("intervention_assignments.id", ondelete="SET NULL", use_alter=True)
    )


class JournalEntry(UUIDPk, Timestamps, Base):
    __tablename__ = "journal_entries"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    check_in_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("check_ins.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(EncryptedText)
    source: Mapped[str] = mapped_column(String(10), default="text")
    # False when the user has not consented to keeping notes: deleted right after processing.
    retained: Mapped[bool] = mapped_column(Boolean, default=True)


class StructuredSignal(UUIDPk, Base):
    """Validated structured extraction (from rules or the extraction model). No raw text."""

    __tablename__ = "structured_signals"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(12))  # checkin | message | voice
    source_id: Mapped[uuid.UUID] = mapped_column(index=True)
    mood_label: Mapped[str | None] = mapped_column(String(12))
    stress_level: Mapped[int | None] = mapped_column(SmallInteger)  # 0-10
    energy_level: Mapped[int | None] = mapped_column(SmallInteger)  # 0-10
    topics: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    triggers: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    behaviors: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    support_needed: Mapped[str | None] = mapped_column(String(20))
    model_risk_level: Mapped[str | None] = mapped_column(String(12))
    extractor: Mapped[str] = mapped_column(String(12))  # llm | rules
    model_name: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)


class WellbeingSnapshot(UUIDPk, Base):
    __tablename__ = "wellbeing_snapshots"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    data: Mapped[dict] = mapped_column(JSONB)
    checkin_count: Mapped[int] = mapped_column(Integer)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, index=True
    )


class UserPattern(UUIDPk, Base):
    __tablename__ = "user_patterns"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    key: Mapped[str] = mapped_column(String(60))
    statement_key: Mapped[str] = mapped_column(String(80))  # i18n key
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict)
    strength: Mapped[float] = mapped_column(Float)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)
