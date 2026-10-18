from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnalyticsEvent, AuditLog, ContextPolicyRow, SafetyEvent, SupportResource


class SupportResourceRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def for_country(self, country: str, types: tuple[str, ...] | None = None) -> list[SupportResource]:
        stmt = select(SupportResource).where(
            SupportResource.country == country.upper(), SupportResource.active.is_(True)
        )
        if types:
            stmt = stmt.where(SupportResource.type.in_(types))
        return list((await self.db.execute(stmt.order_by(SupportResource.priority))).scalars())

    async def countries(self) -> list[str]:
        stmt = select(SupportResource.country).where(SupportResource.active.is_(True)).distinct()
        return sorted((await self.db.execute(stmt)).scalars())


class ContextPolicyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def find(self, country: str, language: str) -> ContextPolicyRow | None:
        stmt = select(ContextPolicyRow).where(
            ContextPolicyRow.country == country,
            ContextPolicyRow.language == language,
            ContextPolicyRow.active.is_(True),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()


class EventRepository:
    """Append-only writes for audit logs, safety events and analytics."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def add(self, obj: AuditLog | SafetyEvent | AnalyticsEvent) -> None:
        self.db.add(obj)
