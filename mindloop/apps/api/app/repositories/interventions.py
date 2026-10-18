import uuid
from datetime import datetime

from sqlalchemy import any_, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Intervention, InterventionAssignment, InterventionFeedback


class InterventionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def candidates(self, *, language: str, risk_level: str, age_range: str | None) -> list[Intervention]:
        """Metadata pre-filter in SQL; scoring happens in the selector."""
        stmt = select(Intervention).where(
            Intervention.active.is_(True),
            literal(language) == any_(Intervention.languages),
            literal(risk_level) == any_(Intervention.allowed_risk_levels),
        )
        if age_range:
            stmt = stmt.where(literal(age_range) == any_(Intervention.age_ranges))
        return list((await self.db.execute(stmt)).scalars())

    async def similarities(self, ids: list[uuid.UUID], query_vec: list[float]) -> dict[uuid.UUID, float]:
        if not ids:
            return {}
        distance = Intervention.embedding.cosine_distance(query_vec)
        stmt = select(Intervention.id, distance).where(Intervention.id.in_(ids), Intervention.embedding.is_not(None))
        return {row[0]: 1.0 - float(row[1]) for row in await self.db.execute(stmt)}

    async def list_active(self, category: str | None = None) -> list[Intervention]:
        stmt = (
            select(Intervention).where(Intervention.active.is_(True)).order_by(Intervention.category, Intervention.slug)
        )
        if category:
            stmt = stmt.where(Intervention.category == category)
        return list((await self.db.execute(stmt)).scalars())

    async def get(self, intervention_id: uuid.UUID) -> Intervention | None:
        return await self.db.get(Intervention, intervention_id)

    async def get_by_slug(self, slug: str) -> Intervention | None:
        return (await self.db.execute(select(Intervention).where(Intervention.slug == slug))).scalar_one_or_none()

    async def missing_embeddings(self) -> list[Intervention]:
        stmt = select(Intervention).where(Intervention.embedding.is_(None), Intervention.active.is_(True))
        return list((await self.db.execute(stmt)).scalars())

    # Assignments and feedback
    async def add(self, obj: InterventionAssignment | InterventionFeedback) -> None:
        self.db.add(obj)
        await self.db.flush()

    async def get_assignment(self, user_id: uuid.UUID, assignment_id: uuid.UUID) -> InterventionAssignment | None:
        stmt = select(InterventionAssignment).where(
            InterventionAssignment.id == assignment_id, InterventionAssignment.user_id == user_id
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def recent_assignment_ids(self, user_id: uuid.UUID, limit: int = 7) -> list[uuid.UUID]:
        stmt = (
            select(InterventionAssignment.intervention_id)
            .where(InterventionAssignment.user_id == user_id)
            .order_by(InterventionAssignment.created_at.desc())
            .limit(limit)
        )
        return list((await self.db.execute(stmt)).scalars())

    async def feedback_stats(self, user_id: uuid.UUID) -> list[tuple[uuid.UUID, str, int, int, datetime]]:
        """Per intervention: (intervention_id, category, n, score_sum, last_feedback_at)."""
        stmt = (
            select(
                InterventionFeedback.intervention_id,
                Intervention.category,
                func.count(),
                func.sum(InterventionFeedback.score),
                func.max(InterventionFeedback.created_at),
            )
            .join(Intervention, Intervention.id == InterventionFeedback.intervention_id)
            .where(InterventionFeedback.user_id == user_id)
            .group_by(InterventionFeedback.intervention_id, Intervention.category)
        )
        return [(r[0], r[1], int(r[2]), int(r[3] or 0), r[4]) for r in await self.db.execute(stmt)]

    async def category_feedback(self, user_id: uuid.UUID) -> list[tuple[str, int, int]]:
        """Per category: (category, ratings, positive ratings)."""
        stmt = (
            select(
                Intervention.category,
                func.count(),
                func.count().filter(InterventionFeedback.score > 0),
            )
            .join(Intervention, Intervention.id == InterventionFeedback.intervention_id)
            .where(InterventionFeedback.user_id == user_id)
            .group_by(Intervention.category)
        )
        return [(r[0], int(r[1]), int(r[2])) for r in await self.db.execute(stmt)]

    async def worse_since(self, user_id: uuid.UUID, since: datetime) -> set[uuid.UUID]:
        stmt = select(InterventionFeedback.intervention_id).where(
            InterventionFeedback.user_id == user_id,
            InterventionFeedback.rating == "worse",
            InterventionFeedback.created_at >= since,
        )
        return set((await self.db.execute(stmt)).scalars())

    async def get_feedback(self, assignment_id: uuid.UUID) -> InterventionFeedback | None:
        stmt = select(InterventionFeedback).where(InterventionFeedback.assignment_id == assignment_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()
