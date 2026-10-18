"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-05 00:10:11.551648

"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.config import get_settings

# Vector size follows the configured embedding model (EMBEDDING_DIM).
EMBED_DIM = get_settings().embedding_dim

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "audit_logs",
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("resource", sa.String(length=60), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_id", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False)
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"], unique=False)
    op.create_table(
        "context_policies",
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_context_policies")),
        sa.UniqueConstraint("country", "language", name="uq_context_policy"),
    )
    op.create_table(
        "interventions",
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("targets", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("contexts", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("intensity", sa.String(length=10), nullable=False),
        sa.Column("age_ranges", postgresql.ARRAY(sa.String(length=10)), nullable=False),
        sa.Column("languages", postgresql.ARRAY(sa.String(length=10)), nullable=False),
        sa.Column("allowed_risk_levels", postgresql.ARRAY(sa.String(length=12)), nullable=False),
        sa.Column("requires_professional", sa.Boolean(), nullable=False),
        sa.Column("evidence_reference", sa.String(length=500), nullable=False),
        sa.Column("contraindications", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_interventions")),
    )
    op.create_index(op.f("ix_interventions_category"), "interventions", ["category"], unique=False)
    op.create_index(op.f("ix_interventions_slug"), "interventions", ["slug"], unique=True)
    op.create_table(
        "jobs",
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("run_after", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column("last_error_type", sa.String(length=80), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_jobs")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_jobs_idempotency_key")),
    )
    op.create_index(op.f("ix_jobs_kind"), "jobs", ["kind"], unique=False)
    op.create_index(op.f("ix_jobs_status"), "jobs", ["status"], unique=False)
    op.create_table(
        "support_resources",
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("region", sa.String(length=80), nullable=True),
        sa.Column("organization", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("website", sa.String(length=300), nullable=True),
        sa.Column("hours", sa.String(length=80), nullable=True),
        sa.Column("languages", postgresql.ARRAY(sa.String(length=10)), nullable=False),
        sa.Column("description", sa.String(length=400), nullable=True),
        sa.Column("verification_date", sa.Date(), nullable=False),
        sa.Column("verification_source", sa.String(length=300), nullable=False),
        sa.Column("priority", sa.SmallInteger(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_resources")),
        sa.UniqueConstraint("country", "organization", "phone", name="uq_support_resource"),
    )
    op.create_index(op.f("ix_support_resources_country"), "support_resources", ["country"], unique=False)
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "analytics_events",
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("properties", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_analytics_events_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_analytics_events")),
    )
    op.create_index(op.f("ix_analytics_events_name"), "analytics_events", ["name"], unique=False)
    op.create_index(op.f("ix_analytics_events_user_id"), "analytics_events", ["user_id"], unique=False)
    op.create_table(
        "check_ins",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("mood", sa.SmallInteger(), nullable=False),
        sa.Column("stress", sa.SmallInteger(), nullable=True),
        sa.Column("sleep_hours", sa.Float(), nullable=True),
        sa.Column("energy", sa.SmallInteger(), nullable=True),
        sa.Column("topics", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("risk_level", sa.String(length=12), nullable=False),
        sa.Column("safety_categories", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("reflection", sa.Text(), nullable=True),
        sa.Column("intervention_assignment_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_check_ins_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_check_ins")),
    )
    op.create_index(op.f("ix_check_ins_local_date"), "check_ins", ["local_date"], unique=False)
    op.create_index(op.f("ix_check_ins_user_id"), "check_ins", ["user_id"], unique=False)
    op.create_table(
        "consents",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("consent_type", sa.String(length=40), nullable=False),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("policy_version", sa.String(length=20), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_consents_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_consents")),
        sa.UniqueConstraint("user_id", "consent_type", name=op.f("uq_consents_user_id")),
    )
    op.create_index(op.f("ix_consents_user_id"), "consents", ["user_id"], unique=False)
    op.create_table(
        "conversation_sessions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("mode", sa.String(length=10), nullable=False),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.Column("summarized_message_count", sa.Integer(), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_conversation_sessions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_conversation_sessions")),
    )
    op.create_index(op.f("ix_conversation_sessions_user_id"), "conversation_sessions", ["user_id"], unique=False)
    op.create_table(
        "intervention_assignments",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("intervention_id", sa.Uuid(), nullable=False),
        sa.Column("intervention_version", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=12), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("reason_codes", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["intervention_id"],
            ["interventions.id"],
            name=op.f("fk_intervention_assignments_intervention_id_interventions"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_intervention_assignments_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intervention_assignments")),
    )
    op.create_index(
        op.f("ix_intervention_assignments_intervention_id"),
        "intervention_assignments",
        ["intervention_id"],
        unique=False,
    )
    op.create_index(op.f("ix_intervention_assignments_user_id"), "intervention_assignments", ["user_id"], unique=False)
    op.create_table(
        "refresh_tokens",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_refresh_tokens_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(op.f("ix_refresh_tokens_family_id"), "refresh_tokens", ["family_id"], unique=False)
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)
    op.create_table(
        "safety_events",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source_type", sa.String(length=12), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("risk_level", sa.String(length=12), nullable=False),
        sa.Column("categories", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("matched_rules", postgresql.ARRAY(sa.String(length=60)), nullable=False),
        sa.Column("classifier_version", sa.String(length=20), nullable=False),
        sa.Column("action_taken", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_safety_events_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_safety_events")),
    )
    op.create_index(op.f("ix_safety_events_risk_level"), "safety_events", ["risk_level"], unique=False)
    op.create_index(op.f("ix_safety_events_user_id"), "safety_events", ["user_id"], unique=False)
    op.create_table(
        "structured_signals",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("source_type", sa.String(length=12), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("mood_label", sa.String(length=12), nullable=True),
        sa.Column("stress_level", sa.SmallInteger(), nullable=True),
        sa.Column("energy_level", sa.SmallInteger(), nullable=True),
        sa.Column("topics", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("triggers", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("behaviors", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("support_needed", sa.String(length=20), nullable=True),
        sa.Column("model_risk_level", sa.String(length=12), nullable=True),
        sa.Column("extractor", sa.String(length=12), nullable=False),
        sa.Column("model_name", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_structured_signals_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_structured_signals")),
    )
    op.create_index(op.f("ix_structured_signals_source_id"), "structured_signals", ["source_id"], unique=False)
    op.create_index(op.f("ix_structured_signals_user_id"), "structured_signals", ["user_id"], unique=False)
    op.create_table(
        "user_patterns",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("statement_key", sa.String(length=80), nullable=False),
        sa.Column("params", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("strength", sa.Float(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_patterns_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_patterns")),
    )
    op.create_index(op.f("ix_user_patterns_user_id"), "user_patterns", ["user_id"], unique=False)
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("notification_frequency", sa.String(length=12), nullable=False),
        sa.Column("preferred_intervention_minutes", sa.Integer(), nullable=False),
        sa.Column("voice_enabled", sa.Boolean(), nullable=False),
        sa.Column("show_patterns", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_preferences_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_preferences")),
    )
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("region", sa.String(length=80), nullable=True),
        sa.Column("preferred_language", sa.String(length=10), nullable=False),
        sa.Column("secondary_language", sa.String(length=10), nullable=True),
        sa.Column("age_range", sa.String(length=10), nullable=True),
        sa.Column("occupation", sa.String(length=20), nullable=True),
        sa.Column("living_situation", sa.String(length=30), nullable=True),
        sa.Column("preferred_support_style", sa.String(length=20), nullable=False),
        sa.Column("selected_stressors", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("communication_preferences", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("support_network_preference", sa.String(length=30), nullable=True),
        sa.Column("healthcare_access_preference", sa.String(length=30), nullable=True),
        sa.Column("cultural_context_notes", sa.Text(), nullable=True),
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_profiles_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_profiles")),
    )
    op.create_table(
        "wellbeing_snapshots",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("checkin_count", sa.Integer(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_wellbeing_snapshots_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_wellbeing_snapshots")),
    )
    op.create_index(op.f("ix_wellbeing_snapshots_computed_at"), "wellbeing_snapshots", ["computed_at"], unique=False)
    op.create_index(op.f("ix_wellbeing_snapshots_user_id"), "wellbeing_snapshots", ["user_id"], unique=False)
    op.create_table(
        "conversation_messages",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("risk_level", sa.String(length=12), nullable=True),
        sa.Column("intervention_assignment_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["intervention_assignment_id"],
            ["intervention_assignments.id"],
            name=op.f("fk_conversation_messages_intervention_assignment_id_intervention_assignments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["conversation_sessions.id"],
            name=op.f("fk_conversation_messages_session_id_conversation_sessions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_conversation_messages_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_conversation_messages")),
    )
    op.create_index(op.f("ix_conversation_messages_created_at"), "conversation_messages", ["created_at"], unique=False)
    op.create_index(op.f("ix_conversation_messages_session_id"), "conversation_messages", ["session_id"], unique=False)
    op.create_index(op.f("ix_conversation_messages_user_id"), "conversation_messages", ["user_id"], unique=False)
    op.create_table(
        "intervention_feedback",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("intervention_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.String(length=12), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["intervention_assignments.id"],
            name=op.f("fk_intervention_feedback_assignment_id_intervention_assignments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["intervention_id"],
            ["interventions.id"],
            name=op.f("fk_intervention_feedback_intervention_id_interventions"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_intervention_feedback_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intervention_feedback")),
        sa.UniqueConstraint("assignment_id", name=op.f("uq_intervention_feedback_assignment_id")),
    )
    op.create_index(
        op.f("ix_intervention_feedback_intervention_id"), "intervention_feedback", ["intervention_id"], unique=False
    )
    op.create_index(op.f("ix_intervention_feedback_user_id"), "intervention_feedback", ["user_id"], unique=False)
    op.create_table(
        "journal_entries",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("check_in_id", sa.Uuid(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("retained", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["check_in_id"], ["check_ins.id"], name=op.f("fk_journal_entries_check_in_id_check_ins"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_journal_entries_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journal_entries")),
    )
    op.create_index(op.f("ix_journal_entries_user_id"), "journal_entries", ["user_id"], unique=False)
    op.create_table(
        "memory_items",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_session_id", sa.Uuid(), nullable=True),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["source_session_id"],
            ["conversation_sessions.id"],
            name=op.f("fk_memory_items_source_session_id_conversation_sessions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_memory_items_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_memory_items")),
    )
    op.create_index(op.f("ix_memory_items_user_id"), "memory_items", ["user_id"], unique=False)
    op.create_table(
        "voice_sessions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_session_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=14), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("transcript_retained", sa.Boolean(), nullable=False),
        sa.Column("audio_deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("risk_level", sa.String(length=12), nullable=True),
        sa.Column("safety_categories", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("intervention_assignment_id", sa.Uuid(), nullable=True),
        sa.Column("user_message_id", sa.Uuid(), nullable=True),
        sa.Column("assistant_message_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_session_id"],
            ["conversation_sessions.id"],
            name=op.f("fk_voice_sessions_conversation_session_id_conversation_sessions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["intervention_assignment_id"],
            ["intervention_assignments.id"],
            name=op.f("fk_voice_sessions_intervention_assignment_id_intervention_assignments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_voice_sessions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_voice_sessions")),
    )
    op.create_index(op.f("ix_voice_sessions_user_id"), "voice_sessions", ["user_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_check_ins_intervention_assignment_id_intervention_assignments"),
        "check_ins",
        "intervention_assignments",
        ["intervention_assignment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Query-path indexes
    op.create_index("ix_check_ins_user_date", "check_ins", ["user_id", "local_date"])
    op.create_index("ix_conversation_messages_session_created", "conversation_messages", ["session_id", "created_at"])
    op.create_index("ix_intervention_assignments_user_created", "intervention_assignments", ["user_id", "created_at"])
    op.create_index("ix_jobs_queued", "jobs", ["run_after"], postgresql_where=sa.text("status = 'queued'"))
    op.create_index("ix_analytics_events_name_time", "analytics_events", ["name", "occurred_at"])
    # Approximate-nearest-neighbour indexes (HNSW, cosine distance)
    op.execute("CREATE INDEX ix_interventions_embedding_hnsw ON interventions USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX ix_memory_items_embedding_hnsw ON memory_items USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f("fk_check_ins_intervention_assignment_id_intervention_assignments"), "check_ins", type_="foreignkey"
    )
    op.drop_index(op.f("ix_voice_sessions_user_id"), table_name="voice_sessions")
    op.drop_table("voice_sessions")
    op.drop_index(op.f("ix_memory_items_user_id"), table_name="memory_items")
    op.drop_table("memory_items")
    op.drop_index(op.f("ix_journal_entries_user_id"), table_name="journal_entries")
    op.drop_table("journal_entries")
    op.drop_index(op.f("ix_intervention_feedback_user_id"), table_name="intervention_feedback")
    op.drop_index(op.f("ix_intervention_feedback_intervention_id"), table_name="intervention_feedback")
    op.drop_table("intervention_feedback")
    op.drop_index(op.f("ix_conversation_messages_user_id"), table_name="conversation_messages")
    op.drop_index(op.f("ix_conversation_messages_session_id"), table_name="conversation_messages")
    op.drop_index(op.f("ix_conversation_messages_created_at"), table_name="conversation_messages")
    op.drop_table("conversation_messages")
    op.drop_index(op.f("ix_wellbeing_snapshots_user_id"), table_name="wellbeing_snapshots")
    op.drop_index(op.f("ix_wellbeing_snapshots_computed_at"), table_name="wellbeing_snapshots")
    op.drop_table("wellbeing_snapshots")
    op.drop_table("user_profiles")
    op.drop_table("user_preferences")
    op.drop_index(op.f("ix_user_patterns_user_id"), table_name="user_patterns")
    op.drop_table("user_patterns")
    op.drop_index(op.f("ix_structured_signals_user_id"), table_name="structured_signals")
    op.drop_index(op.f("ix_structured_signals_source_id"), table_name="structured_signals")
    op.drop_table("structured_signals")
    op.drop_index(op.f("ix_safety_events_user_id"), table_name="safety_events")
    op.drop_index(op.f("ix_safety_events_risk_level"), table_name="safety_events")
    op.drop_table("safety_events")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_family_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_intervention_assignments_user_id"), table_name="intervention_assignments")
    op.drop_index(op.f("ix_intervention_assignments_intervention_id"), table_name="intervention_assignments")
    op.drop_table("intervention_assignments")
    op.drop_index(op.f("ix_conversation_sessions_user_id"), table_name="conversation_sessions")
    op.drop_table("conversation_sessions")
    op.drop_index(op.f("ix_consents_user_id"), table_name="consents")
    op.drop_table("consents")
    op.drop_index(op.f("ix_check_ins_user_id"), table_name="check_ins")
    op.drop_index(op.f("ix_check_ins_local_date"), table_name="check_ins")
    op.drop_table("check_ins")
    op.drop_index(op.f("ix_analytics_events_user_id"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_name"), table_name="analytics_events")
    op.drop_table("analytics_events")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_support_resources_country"), table_name="support_resources")
    op.drop_table("support_resources")
    op.drop_index(op.f("ix_jobs_status"), table_name="jobs")
    op.drop_index(op.f("ix_jobs_kind"), table_name="jobs")
    op.drop_table("jobs")
    op.drop_index(op.f("ix_interventions_slug"), table_name="interventions")
    op.drop_index(op.f("ix_interventions_category"), table_name="interventions")
    op.drop_table("interventions")
    op.drop_table("context_policies")
    op.drop_index(op.f("ix_audit_logs_user_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_table("audit_logs")
