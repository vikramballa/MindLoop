"""reflections (thought reframes, three good things) and personal safety plans

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-27 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reflections",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("distortions", postgresql.ARRAY(sa.String(length=30)), nullable=False),
        sa.Column("belief_before", sa.SmallInteger(), nullable=True),
        sa.Column("belief_after", sa.SmallInteger(), nullable=True),
        sa.Column("risk_level", sa.String(length=12), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_reflections_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reflections")),
    )
    op.create_index(op.f("ix_reflections_user_id"), "reflections", ["user_id"], unique=False)
    op.create_index("ix_reflections_user_created", "reflections", ["user_id", "created_at"], unique=False)

    op.create_table(
        "safety_plans",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_safety_plans_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_safety_plans")),
        sa.UniqueConstraint("user_id", name=op.f("uq_safety_plans_user_id")),
    )


def downgrade() -> None:
    op.drop_table("safety_plans")
    op.drop_index("ix_reflections_user_created", table_name="reflections")
    op.drop_index(op.f("ix_reflections_user_id"), table_name="reflections")
    op.drop_table("reflections")
