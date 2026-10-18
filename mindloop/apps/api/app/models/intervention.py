import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.db.base import Base, Timestamps, UUIDPk, utcnow

EMBED_DIM = get_settings().embedding_dim


class Intervention(UUIDPk, Timestamps, Base):
    """Curated, versioned, structured intervention. The LLM may phrase it but never invents it."""

    __tablename__ = "interventions"
    __table_args__ = (
        Index(
            "ix_interventions_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    targets: Mapped[list[str]] = mapped_column(ARRAY(String(40)))
    contexts: Mapped[list[str]] = mapped_column(ARRAY(String(40)))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    intensity: Mapped[str] = mapped_column(String(10))
    age_ranges: Mapped[list[str]] = mapped_column(ARRAY(String(10)))
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(10)))
    allowed_risk_levels: Mapped[list[str]] = mapped_column(ARRAY(String(12)))
    requires_professional: Mapped[bool] = mapped_column(Boolean, default=False)
    evidence_reference: Mapped[str] = mapped_column(String(500))
    contraindications: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    content: Mapped[dict] = mapped_column(JSONB)  # {lang: {title, summary, steps[], why, cta}}
    version: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))


class InterventionAssignment(UUIDPk, Timestamps, Base):
    __tablename__ = "intervention_assignments"
    __table_args__ = (Index("ix_intervention_assignments_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    intervention_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interventions.id"), index=True)
    intervention_version: Mapped[int] = mapped_column(Integer)
    source_type: Mapped[str] = mapped_column(String(12))  # checkin | message | manual
    source_id: Mapped[uuid.UUID | None] = mapped_column()
    score: Mapped[float] = mapped_column(Float)
    reason_codes: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    status: Mapped[str] = mapped_column(String(12), default="suggested")  # suggested|started|completed|skipped
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class InterventionFeedback(UUIDPk, Base):
    __tablename__ = "intervention_feedback"

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("intervention_assignments.id", ondelete="CASCADE"), unique=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    intervention_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interventions.id"), index=True)
    rating: Mapped[str] = mapped_column(String(12))  # a_lot | a_little | not_really | worse
    score: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)
