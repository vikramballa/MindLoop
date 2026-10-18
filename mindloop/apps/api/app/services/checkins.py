"""Check-ins. A check-in without a note needs no model call; one with a note gets a
single extraction call, run later by the worker.

Safety always runs first. If it flags high risk we show support and stop there; otherwise
we extract signals and then choose an intervention.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.extraction import extract_signals
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.vocab import FEELING_TARGETS, TARGETS, TOPIC_DEFAULT_TARGETS
from app.i18n import t
from app.interventions.selector import SelectionInput
from app.interventions.service import InterventionService
from app.models import CheckIn, JournalEntry, StructuredSignal
from app.repositories.checkins import CheckInRepository
from app.safety.classifier import RiskLevel, SafetyAssessment, combine_with_model_risk
from app.safety.service import SafetyService
from app.schemas.checkin import (
    CheckInCreate,
    CheckInResult,
    CheckInSummary,
    CommunityPulse,
    DayMood,
    HomeResponse,
    PulseItem,
)
from app.services.embeddings import EmbeddingService
from app.services.errors import NotFound
from app.services.events import EventService
from app.services.user_context import UserCtx, load_user_ctx
from app.workers.queue import enqueue

log = get_logger(__name__)
WELCOME_BACK_AFTER_DAYS = 3
# Community pulse: anonymous counts over a rolling window. A count is only shown when at least
# this many different people contribute to it, so no number can point to an individual.
COMMUNITY_WINDOW_HOURS = 24
COMMUNITY_MIN_PEOPLE = 5
COMMUNITY_MAX_ITEMS = 10


def feeling_targets(feelings: Sequence[str], targets: Sequence[str]) -> list[str]:
    """Explicit feeling words first, then extracted targets; deduplicated, capped at 4."""
    merged = [tg for f in feelings for tg in FEELING_TARGETS.get(f, [])] + list(targets)
    return [tg for tg in dict.fromkeys(merged) if tg in TARGETS][:4]


def reflection_template(mood: int, topics: Sequence[str], lang: str) -> str:
    if mood >= 4:
        return t("reflection.positive", lang)
    primary = next((tp for tp in topics if tp in TOPIC_DEFAULT_TARGETS), None)
    if primary:
        return t(f"reflection.topic.{primary}", lang)
    return t("reflection.neutral", lang) if mood == 3 else t("reflection.topic.other", lang)


def _resolve_local_date(requested: date | None) -> date:
    today = datetime.now(UTC).date()
    if requested and abs((requested - today).days) <= 1:
        return requested
    return today


class CheckInService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = CheckInRepository(db)
        self.safety = SafetyService(db)
        self.interventions = InterventionService(db)
        self.events = EventService(db)

    async def create(self, user_id: uuid.UUID, data: CheckInCreate) -> CheckInResult:
        ctx = await load_user_ctx(self.db, user_id)
        assessment = self.safety.assess(data.note)  # always first, always deterministic
        async_path = bool(data.note) and not assessment.is_high and get_settings().llm_enabled

        checkin = CheckIn(
            user_id=user_id,
            local_date=_resolve_local_date(data.local_date),
            mood=data.mood,
            stress=data.stress,
            sleep_hours=data.sleep_hours,
            topics=list(data.topics),
            feelings=list(data.feelings),
            source=data.source if data.note else "tap",
            status="processing" if async_path else "completed",
            risk_level=assessment.level.value,
            safety_categories=assessment.categories,
        )
        await self.repo.add(checkin)
        if data.note:
            await self.repo.add(
                JournalEntry(
                    user_id=user_id,
                    check_in_id=checkin.id,
                    text=data.note,
                    source=checkin.source,
                    retained=ctx.consented("store_journal"),
                )
            )

        if assessment.is_high:
            self.safety.record(
                user_id=user_id,
                source_type="checkin",
                source_id=checkin.id,
                assessment=assessment,
                action="crisis_support_shown",
            )
            await self._drop_unretained_note(checkin.id)
        elif async_path:
            await enqueue(
                self.db,
                "process_checkin",
                {"checkin_id": str(checkin.id)},
                idempotency_key=f"process_checkin:{checkin.id}",
            )
        else:
            await self._complete(checkin, ctx, assessment, data.note)

        if checkin.status == "completed":
            await self._after_complete(checkin)
        await self.db.commit()
        return await self.result(user_id, checkin.id, ctx=ctx)

    async def process(self, checkin_id: uuid.UUID) -> None:
        """Worker entry point. Idempotent: does nothing if already completed."""
        checkin = await self.repo.get(checkin_id)
        if checkin is None or checkin.status == "completed":
            return
        ctx = await load_user_ctx(self.db, checkin.user_id)
        journal = await self.repo.journal_for_checkin(checkin.id)
        note = journal.text if journal else None
        assessment = self.safety.assess(note)
        await self._complete(checkin, ctx, assessment, note)
        await self._drop_unretained_note(checkin.id)
        await self._after_complete(checkin)
        await self.db.commit()

    async def mark_failed(self, checkin_id: uuid.UUID) -> None:
        """Called when the job permanently fails: fall back to a rules-only result."""
        checkin = await self.repo.get(checkin_id)
        if checkin is None or checkin.status == "completed":
            return
        ctx = await load_user_ctx(self.db, checkin.user_id)
        journal = await self.repo.journal_for_checkin(checkin.id)
        note = journal.text if journal else None
        await self._complete(checkin, ctx, self.safety.assess(note), note, allow_model=False)
        await self._drop_unretained_note(checkin.id)
        await self._after_complete(checkin)
        await self.db.commit()

    async def _complete(
        self, checkin: CheckIn, ctx: UserCtx, assessment: SafetyAssessment, note: str | None, allow_model: bool = True
    ) -> None:
        extraction = await extract_signals(
            text=note, mood=checkin.mood, topics=checkin.topics, stress=checkin.stress, allow_model=allow_model
        )
        signals = extraction.result
        assessment = combine_with_model_risk(assessment, signals.risk_level)
        self.db.add(
            StructuredSignal(
                user_id=ctx.user_id,
                source_type="checkin",
                source_id=checkin.id,
                mood_label=signals.mood,
                stress_level=signals.stress_level,
                energy_level=signals.energy_level,
                topics=signals.topics,
                triggers=signals.triggers,
                behaviors=signals.behaviors,
                support_needed=signals.support_needed,
                model_risk_level=signals.risk_level if extraction.extractor == "llm" else None,
                extractor=extraction.extractor,
                model_name=extraction.model,
            )
        )
        checkin.risk_level = assessment.level.value
        checkin.safety_categories = assessment.categories
        if signals.energy_level is not None:
            checkin.energy = max(1, min(5, round(signals.energy_level / 2)))
        self.safety.record(
            user_id=ctx.user_id,
            source_type="checkin",
            source_id=checkin.id,
            assessment=assessment,
            action="support_offered",
        )
        checkin.reflection = signals.reflection or reflection_template(checkin.mood, signals.topics, ctx.language)

        query_vec = await EmbeddingService().embed_one(note) if note and allow_model else None
        chosen = await self.interventions.choose(
            user_id=ctx.user_id,
            inp=SelectionInput(
                targets=feeling_targets(checkin.feelings or [], signals.targets),
                topics=signals.topics,
                mood=checkin.mood,
                risk_level=assessment.level.value,
                safety_categories=assessment.categories,
                support_style=ctx.support_style,
                preferred_minutes=ctx.preferred_minutes,
            ),
            language=ctx.language,
            age_range=ctx.age_range,
            source_type="checkin",
            source_id=checkin.id,
            query_vec=query_vec,
        )
        if chosen:
            checkin.intervention_assignment_id = chosen[1].id
        checkin.status = "completed"

    async def _after_complete(self, checkin: CheckIn) -> None:
        await self.events.track(
            "checkin_completed",
            checkin.user_id,
            mood=checkin.mood,
            source=checkin.source,
            risk_level=checkin.risk_level,
        )
        await enqueue(
            self.db,
            "recompute_patterns",
            {"user_id": str(checkin.user_id)},
            idempotency_key=f"recompute_patterns:{checkin.id}",
        )

    async def _drop_unretained_note(self, checkin_id: uuid.UUID) -> None:
        journal = await self.repo.journal_for_checkin(checkin_id)
        if journal is not None and not journal.retained:
            await self.db.delete(journal)

    async def result(self, user_id: uuid.UUID, checkin_id: uuid.UUID, ctx: UserCtx | None = None) -> CheckInResult:
        checkin = await self.repo.get_for_user(user_id, checkin_id)
        if checkin is None:
            raise NotFound("Check-in not found")
        ctx = ctx or await load_user_ctx(self.db, user_id)
        support = None
        if checkin.risk_level != RiskLevel.LOW.value:
            support = await self.safety.support_response(
                SafetyAssessment(level=RiskLevel(checkin.risk_level), categories=checkin.safety_categories or []),
                country=ctx.country,
                language=ctx.language,
            )
        action = None
        if checkin.intervention_assignment_id:
            action = await self.interventions.action_for_assignment(
                user_id, checkin.intervention_assignment_id, ctx.language
            )
        completed = checkin.status == "completed"
        return CheckInResult(
            id=checkin.id,
            status=checkin.status,
            created_at=checkin.created_at,
            local_date=checkin.local_date,
            mood=checkin.mood,
            topics=checkin.topics,
            feelings=checkin.feelings or [],
            risk_level=checkin.risk_level,
            reflection=checkin.reflection,
            action_lead=t("action.lead", ctx.language) if action else None,
            action=action,
            support=support,
            feedback_question=t("action.feedback_question", ctx.language) if action and completed else None,
        )

    async def history(self, user_id: uuid.UUID, limit: int, before: date | None) -> list[CheckInSummary]:
        rows = await self.repo.list_recent(user_id, limit=limit, before=before)
        with_notes = await self.repo.ids_with_journal([c.id for c in rows])
        return [
            CheckInSummary(
                id=c.id,
                local_date=c.local_date,
                mood=c.mood,
                stress=c.stress,
                sleep_hours=c.sleep_hours,
                topics=c.topics,
                feelings=c.feelings or [],
                has_note=c.id in with_notes,
            )
            for c in rows
        ]

    async def home(self, user_id: uuid.UUID) -> HomeResponse:
        ctx = await load_user_ctx(self.db, user_id)
        today = datetime.now(UTC).date()
        recent = await self.repo.list_recent(user_id, limit=1)
        today_result = None
        if recent and recent[0].local_date >= today:
            today_result = await self.result(user_id, recent[0].id, ctx=ctx)
        welcome = None
        last = await self.repo.last_before_today(user_id, today)
        if last and not today_result and (today - last.local_date).days >= WELCOME_BACK_AFTER_DAYS:
            welcome = t("home.welcome_back", ctx.language)
        week_start = today - timedelta(days=6)
        by_day: dict[date, int] = {}
        for c in await self.repo.list_since(user_id, week_start):
            by_day[c.local_date] = c.mood  # ordered by created_at, so the latest wins
        days = [week_start + timedelta(days=i) for i in range(7)]
        week = [DayMood(day=d, mood=by_day.get(d)) for d in days]
        return HomeResponse(
            display_name=ctx.display_name,
            welcome_back=welcome,
            checkin_count=await self.repo.count(user_id),
            today=today_result,
            week=week,
            days_checked_in_7d=len(by_day),
            community=await self.community(),
        )

    async def community(self) -> CommunityPulse | None:
        since = datetime.now(UTC) - timedelta(hours=COMMUNITY_WINDOW_HOURS)
        people = await self.repo.recent_people(since)
        if people < COMMUNITY_MIN_PEOPLE:
            return None
        items = [
            PulseItem(kind=kind, key=key, people=n)
            for kind, column in (("feeling", "feelings"), ("topic", "topics"))
            for key, n in await self.repo.recent_label_counts(column, since, COMMUNITY_MIN_PEOPLE)
            if key != "other"
        ]
        items.sort(key=lambda it: it.people, reverse=True)
        return CommunityPulse(window_hours=COMMUNITY_WINDOW_HOURS, people=people, items=items[:COMMUNITY_MAX_ITEMS])
