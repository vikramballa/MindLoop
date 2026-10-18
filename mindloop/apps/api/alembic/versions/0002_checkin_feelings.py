"""check-in feeling words

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-05 14:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "check_ins",
        sa.Column("feelings", postgresql.ARRAY(sa.String(length=20)), server_default="{}", nullable=False),
    )
    # Community pulse aggregates recent check-ins across users.
    op.create_index("ix_check_ins_created_at", "check_ins", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_check_ins_created_at", table_name="check_ins")
    op.drop_column("check_ins", "feelings")
