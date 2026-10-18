import uuid
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vocab import FEEDBACK_SCORE
from app.i18n import base_language, t
from app.interventions.selector import SelectionInput, select
from app.models import Intervention, InterventionAssignment, InterventionFeedback
from app.repositories.checkins import CheckInRepository
from app.repositories.interventions import InterventionRepository
from app.services.errors import Conflict, NotFound
from app.services.events import EventService
from app.services.user_context import UserCtx


class InterventionContent(BaseModel):
    title: str
    summary: str
    steps: list[str]
    why: str


class ActionOut(BaseModel):
    assignment_id: uuid.UUID
    slug: str
    category: str
    category_label: str
    duration_minutes: int
    requires_professional: bool
    content: InterventionContent
    start_label: str
    status: str
    feedback: str | None = None
    reasons: list[str]


class LibraryItem(BaseModel):
    slug: str
    category: str
    category_label: str
    duration_minutes: int
    intensity: str
    targets: list[str]
    contexts: list[str]
    evidence_reference: str
    version: int
    content: InterventionContent


def localized(item: Intervention, language: str) -> InterventionContent:
    content = item.content.get(base_language(language)) or item.content["en"]
    return InterventionContent.model_validate(content)


class InterventionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = InterventionRepository(db)
        self.events = EventService(db)

    async def build_input(self, user_id: uuid.UUID, base: SelectionInput) -> SelectionInput:
        stats = await self.repo.feedback_stats(user_id)
        base.item_feedback = {iid: (n, total) for iid, _, n, total, _ in stats}
        cat: dict[str, tuple[int, int]] = {}
        for _, category, n, total, _ in stats:
            pn, pt = cat.get(category, (0, 0))
            cat[category] = (pn + n, pt + total)
        base.category_feedback = cat
        base.recent_ids = await self.repo.recent_assignment_ids(user_id)
        base.blocked_ids = await self.repo.worse_since(user_id, datetime.now(UTC) - timedelta(days=14))
        return base

    async def choose(
        self,
        *,
        user_id: uuid.UUID,
        inp: SelectionInput,
        language: str,
        age_range: str | None,
        source_type: str,
        source_id: uuid.UUID | None,
        query_vec: list[float] | None = None,
    ) -> tuple[Intervention, InterventionAssignment] | None:
        inp = await self.build_input(user_id, inp)
        lang = base_language(language)
        candidates = await self.repo.candidates(language=lang, risk_level=inp.risk_level, age_range=age_range)
        if not candidates and lang != "en":
            candidates = await self.repo.candidates(language="en", risk_level=inp.risk_level, age_range=age_range)
        if not candidates:
            candidates = await self.repo.candidates(language="en", risk_level=inp.risk_level, age_range=None)
        if query_vec is not None:
            inp.similarity = await self.repo.similarities([c.id for c in candidates], query_vec)
        best = select(candidates, inp)
        if best is None:
            return None
        assignment = InterventionAssignment(
            user_id=user_id,
            intervention_id=best.intervention.id,
            intervention_version=best.intervention.version,
            source_type=source_type,
            source_id=source_id,
            score=best.score,
            reason_codes=best.reasons,
        )
        await self.repo.add(assignment)
        return best.intervention, assignment

    def to_action(
        self, item: Intervention, assignment: InterventionAssignment, language: str, feedback: str | None = None
    ) -> ActionOut:
        return ActionOut(
            assignment_id=assignment.id,
            slug=item.slug,
            category=item.category,
            category_label=t(f"categories.{item.category}", language),
            duration_minutes=item.duration_minutes,
            requires_professional=item.requires_professional,
            content=localized(item, language),
            start_label=t("action.start", language, minutes=item.duration_minutes),
            status=assignment.status,
            feedback=feedback,
            reasons=assignment.reason_codes,
        )

    async def action_for_assignment(self, user_id: uuid.UUID, assignment_id: uuid.UUID, language: str) -> ActionOut:
        assignment = await self.repo.get_assignment(user_id, assignment_id)
        if assignment is None:
            raise NotFound("Action not found")
        item = await self.repo.get(assignment.intervention_id)
        if item is None:
            raise NotFound("Action not found")
        fb = await self.repo.get_feedback(assignment.id)
        return self.to_action(item, assignment, language, fb.rating if fb else None)

    async def start(self, user_id: uuid.UUID, assignment_id: uuid.UUID, language: str) -> ActionOut:
        assignment = await self._owned(user_id, assignment_id)
        if assignment.status == "suggested":
            assignment.status = "started"
            assignment.started_at = datetime.now(UTC)
            item = await self.repo.get(assignment.intervention_id)
            await self.events.track("intervention_started", user_id, category=item.category if item else None)
            await self.db.commit()
        return await self.action_for_assignment(user_id, assignment_id, language)

    async def complete(self, user_id: uuid.UUID, assignment_id: uuid.UUID, language: str) -> ActionOut:
        assignment = await self._owned(user_id, assignment_id)
        if assignment.status != "completed":
            now = datetime.now(UTC)
            assignment.started_at = assignment.started_at or now
            assignment.status = "completed"
            assignment.completed_at = now
            item = await self.repo.get(assignment.intervention_id)
            await self.events.track("intervention_completed", user_id, category=item.category if item else None)
            await self.db.commit()
        return await self.action_for_assignment(user_id, assignment_id, language)

    async def feedback(self, user_id: uuid.UUID, assignment_id: uuid.UUID, rating: str, language: str) -> ActionOut:
        assignment = await self._owned(user_id, assignment_id)
        if await self.repo.get_feedback(assignment.id):
            raise Conflict("Feedback already recorded", code="feedback_exists")
        await self.repo.add(
            InterventionFeedback(
                assignment_id=assignment.id,
                user_id=user_id,
                intervention_id=assignment.intervention_id,
                rating=rating,
                score=FEEDBACK_SCORE[rating],
            )
        )
        if assignment.status != "completed":
            assignment.status = "completed"
            assignment.completed_at = datetime.now(UTC)
        item = await self.repo.get(assignment.intervention_id)
        await self.events.track(
            "intervention_feedback", user_id, rating=rating, category=item.category if item else None
        )
        await self.db.commit()
        return await self.action_for_assignment(user_id, assignment_id, language)

    async def alternative(self, ctx: UserCtx, assignment_id: uuid.UUID) -> ActionOut:
        """'Try something else': deterministic re-selection for the same context, excluding the current item."""
        previous = await self._owned(ctx.user_id, assignment_id)
        item = await self.repo.get(previous.intervention_id)
        topics: list[str] = []
        mood: int | None = None
        if previous.source_type == "checkin" and previous.source_id:
            checkin = await CheckInRepository(self.db).get_for_user(ctx.user_id, previous.source_id)
            if checkin:
                topics, mood = list(checkin.topics), checkin.mood
        if previous.status == "suggested":
            previous.status = "skipped"
        inp = SelectionInput(
            targets=list(item.targets) if item else [],
            topics=topics,
            mood=mood,
            support_style=ctx.support_style,
            preferred_minutes=ctx.preferred_minutes,
            exclude_ids={previous.intervention_id},
        )
        chosen = await self.choose(
            user_id=ctx.user_id,
            inp=inp,
            language=ctx.language,
            age_range=ctx.age_range,
            source_type=previous.source_type,
            source_id=previous.source_id,
        )
        if chosen is None:
            raise NotFound("No other action available", code="no_alternative")
        await self.db.commit()
        return self.to_action(chosen[0], chosen[1], ctx.language)

    async def library(self, language: str, category: str | None = None) -> list[LibraryItem]:
        return [
            LibraryItem(
                slug=i.slug,
                category=i.category,
                category_label=t(f"categories.{i.category}", language),
                duration_minutes=i.duration_minutes,
                intensity=i.intensity,
                targets=i.targets,
                contexts=i.contexts,
                evidence_reference=i.evidence_reference,
                version=i.version,
                content=localized(i, language),
            )
            for i in await self.repo.list_active(category)
        ]

    async def assign_manual(self, user_id: uuid.UUID, slug: str, language: str) -> ActionOut:
        item = await self.repo.get_by_slug(slug)
        if item is None or not item.active:
            raise NotFound("Action not found")
        assignment = InterventionAssignment(
            user_id=user_id,
            intervention_id=item.id,
            intervention_version=item.version,
            source_type="manual",
            source_id=None,
            score=0.0,
            reason_codes=["user_chosen"],
        )
        await self.repo.add(assignment)
        await self.db.commit()
        return self.to_action(item, assignment, language)

    async def _owned(self, user_id: uuid.UUID, assignment_id: uuid.UUID) -> InterventionAssignment:
        assignment = await self.repo.get_assignment(user_id, assignment_id)
        if assignment is None:
            raise NotFound("Action not found")
        return assignment
