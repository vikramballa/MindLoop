import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk, utcnow


class SafetyEvent(UUIDPk, Base):
    """Records that a safety rule fired. Stores rule ids and categories, never the user's words."""

    __tablename__ = "safety_events"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(12))
    source_id: Mapped[uuid.UUID | None] = mapped_column()
    risk_level: Mapped[str] = mapped_column(String(12), index=True)
    categories: Mapped[list[str]] = mapped_column(ARRAY(String(40)))
    matched_rules: Mapped[list[str]] = mapped_column(ARRAY(String(60)))
    classifier_version: Mapped[str] = mapped_column(String(20))
    action_taken: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)


class SupportResource(UUIDPk, Timestamps, Base):
    __tablename__ = "support_resources"
    __table_args__ = (UniqueConstraint("country", "organization", "phone", name="uq_support_resource"),)

    country: Mapped[str] = mapped_column(String(2), index=True)
    region: Mapped[str | None] = mapped_column(String(80))
    organization: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(30))  # emergency | crisis_line | mental_health_helpline
    phone: Mapped[str | None] = mapped_column(String(40))
    website: Mapped[str | None] = mapped_column(String(300))
    hours: Mapped[str | None] = mapped_column(String(80))
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(10)), default=list)
    description: Mapped[str | None] = mapped_column(String(400))
    verification_date: Mapped[date] = mapped_column(Date)
    verification_source: Mapped[str] = mapped_column(String(300))
    priority: Mapped[int] = mapped_column(SmallInteger, default=100)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ContextPolicyRow(UUIDPk, Timestamps, Base):
    __tablename__ = "context_policies"
    __table_args__ = (UniqueConstraint("country", "language", name="uq_context_policy"),)

    country: Mapped[str] = mapped_column(String(2))  # "ZZ" = global default
    language: Mapped[str] = mapped_column(String(10))
    data: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(UUIDPk, Base):
    __tablename__ = "audit_logs"

    user_id: Mapped[uuid.UUID | None] = mapped_column(index=True)  # kept after deletion for accountability
    action: Mapped[str] = mapped_column(String(60))
    resource: Mapped[str | None] = mapped_column(String(60))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, index=True
    )


class Job(UUIDPk, Timestamps, Base):
    """PostgreSQL-backed job queue (SKIP LOCKED). Payloads contain ids only, never content."""

    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_queued", "run_after", postgresql_where=text("status = 'queued'")),)

    kind: Mapped[str] = mapped_column(String(40), index=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(12), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    idempotency_key: Mapped[str | None] = mapped_column(String(120), unique=True)
    last_error_type: Mapped[str | None] = mapped_column(String(80))
    duration_ms: Mapped[int | None] = mapped_column(Integer)


class AnalyticsEvent(UUIDPk, Base):
    """Privacy-preserving product analytics: event names + non-content properties only."""

    __tablename__ = "analytics_events"
    __table_args__ = (Index("ix_analytics_events_name_time", "name", "occurred_at"),)

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(40), index=True)
    properties: Mapped[dict] = mapped_column(JSONB, default=dict)
    occurred_on: Mapped[date] = mapped_column(Date, default=lambda: utcnow().date())
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)
