import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, EncryptedText, Timestamps, UUIDPk


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped["UserProfile"] = relationship(back_populates="user", uselist=False, lazy="raise")
    preferences: Mapped["UserPreferences"] = relationship(back_populates="user", uselist=False, lazy="raise")


class RefreshToken(UUIDPk, Timestamps, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column()


class UserProfile(Timestamps, Base):
    """The user-editable Context Profile. Never stores inferred sensitive traits."""

    __tablename__ = "user_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(80))
    country: Mapped[str] = mapped_column(String(2), default="IN")
    region: Mapped[str | None] = mapped_column(String(80))
    preferred_language: Mapped[str] = mapped_column(String(10), default="en")
    secondary_language: Mapped[str | None] = mapped_column(String(10))
    age_range: Mapped[str | None] = mapped_column(String(10))
    occupation: Mapped[str | None] = mapped_column(String(20))  # student | working | both | other
    living_situation: Mapped[str | None] = mapped_column(String(30))
    preferred_support_style: Mapped[str] = mapped_column(String(20), default="mixed")  # practical|reflective|mixed
    selected_stressors: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    communication_preferences: Mapped[dict] = mapped_column(JSONB, default=dict)
    support_network_preference: Mapped[str | None] = mapped_column(String(30))
    healthcare_access_preference: Mapped[str | None] = mapped_column(String(30))
    cultural_context_notes: Mapped[str | None] = mapped_column(EncryptedText)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="profile", lazy="raise")


class UserPreferences(Timestamps, Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    notification_frequency: Mapped[str] = mapped_column(String(12), default="occasional")  # off|occasional|daily
    preferred_intervention_minutes: Mapped[int] = mapped_column(Integer, default=10)
    voice_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    show_patterns: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="preferences", lazy="raise")


class Consent(UUIDPk, Timestamps, Base):
    """Current consent state per type. Every change is also written to audit_logs."""

    __tablename__ = "consents"
    __table_args__ = (UniqueConstraint("user_id", "consent_type"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    consent_type: Mapped[str] = mapped_column(String(40))
    granted: Mapped[bool] = mapped_column(Boolean)
    policy_version: Mapped[str] = mapped_column(String(20), default="2026-10")
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
