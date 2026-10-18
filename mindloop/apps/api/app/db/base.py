import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.core.encryption import decrypt, encrypt

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


def utcnow() -> datetime:
    return datetime.now(UTC)


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=utcnow, onupdate=utcnow, nullable=False
    )


class EncryptedText(TypeDecorator[str]):
    """Text column encrypted at rest with Fernet. Not queryable by content (by design)."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: object) -> str | None:
        return None if value is None else encrypt(value)

    def process_result_value(self, value: str | None, dialect: object) -> str | None:
        return None if value is None else decrypt(value)
