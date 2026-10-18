import uuid
from datetime import date, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CheckIn, JournalEntry, StructuredSignal, UserPattern, WellbeingSnapshot


class CheckInRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def add(self, obj: CheckIn | JournalEntry | StructuredSignal) -> None:
        self.db.add(obj)
        await self.db.flush()

    async def get_for_user(self, user_id: uuid.UUID, checkin_id: uuid.UUID) -> CheckIn | None:
        stmt = select(CheckIn).where(CheckIn.id == checkin_id, CheckIn.user_id == user_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get(self, checkin_id: uuid.UUID) -> CheckIn | None:
        return await self.db.get(CheckIn, checkin_id)

    async def list_recent(self, user_id: uuid.UUID, limit: int = 20, before: date | None = None) -> list[CheckIn]:
        stmt = select(CheckIn).where(CheckIn.user_id == user_id)
        if before:
            stmt = stmt.where(CheckIn.local_date < before)
        stmt = stmt.order_by(CheckIn.created_at.desc()).limit(limit)
        return list((await self.db.execute(stmt)).scalars())

    async def list_since(self, user_id: uuid.UUID, since: date) -> list[CheckIn]:
        stmt = (
            select(CheckIn)
            .where(CheckIn.user_id == user_id, CheckIn.local_date >= since, CheckIn.status == "completed")
            .order_by(CheckIn.created_at)
        )
        return list((await self.db.execute(stmt)).scalars())

    async def recent_people(self, since: datetime) -> int:
        """Distinct users with a completed check-in since `since` (all users, no content)."""
        stmt = select(func.count(func.distinct(CheckIn.user_id))).where(
            CheckIn.created_at >= since, CheckIn.status == "completed"
        )
        return int((await self.db.execute(stmt)).scalar_one())

    async def recent_label_counts(self, column: str, since: datetime, min_people: int) -> list[tuple[str, int]]:
        """Distinct users per topic/feeling since `since`, keeping only labels with >= min_people."""
        col = CheckIn.topics if column == "topics" else CheckIn.feelings
        label = func.unnest(col).label("label")
        inner = (
            select(CheckIn.user_id, label).where(CheckIn.created_at >= since, CheckIn.status == "completed").subquery()
        )
        people = func.count(func.distinct(inner.c.user_id))
        stmt = (
            select(inner.c.label, people).group_by(inner.c.label).having(people >= min_people).order_by(people.desc())
        )
        return [(str(k), int(n)) for k, n in (await self.db.execute(stmt)).all()]

    async def count(self, user_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(CheckIn).where(CheckIn.user_id == user_id)
        return int((await self.db.execute(stmt)).scalar_one())

    async def last_before_today(self, user_id: uuid.UUID, today: date) -> CheckIn | None:
        stmt = (
            select(CheckIn)
            .where(CheckIn.user_id == user_id, CheckIn.local_date < today)
            .order_by(CheckIn.local_date.desc())
            .limit(1)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def journal_for_checkin(self, checkin_id: uuid.UUID) -> JournalEntry | None:
        stmt = select(JournalEntry).where(JournalEntry.check_in_id == checkin_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def ids_with_journal(self, checkin_ids: list[uuid.UUID]) -> set[uuid.UUID]:
        if not checkin_ids:
            return set()
        stmt = select(JournalEntry.check_in_id).where(JournalEntry.check_in_id.in_(checkin_ids))
        return {i for i in (await self.db.execute(stmt)).scalars() if i is not None}

    async def delete_journal(self, user_id: uuid.UUID) -> int:
        res = await self.db.execute(delete(JournalEntry).where(JournalEntry.user_id == user_id))
        return res.rowcount or 0  # type: ignore[attr-defined]

    async def save_snapshot(self, snap: WellbeingSnapshot) -> None:
        self.db.add(snap)

    async def latest_snapshot(self, user_id: uuid.UUID) -> WellbeingSnapshot | None:
        stmt = (
            select(WellbeingSnapshot)
            .where(WellbeingSnapshot.user_id == user_id)
            .order_by(WellbeingSnapshot.computed_at.desc())
            .limit(1)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def replace_patterns(self, user_id: uuid.UUID, patterns: list[UserPattern]) -> None:
        await self.db.execute(delete(UserPattern).where(UserPattern.user_id == user_id))
        self.db.add_all(patterns)

    async def list_patterns(self, user_id: uuid.UUID) -> list[UserPattern]:
        stmt = select(UserPattern).where(UserPattern.user_id == user_id).order_by(UserPattern.strength.desc())
        return list((await self.db.execute(stmt)).scalars())
