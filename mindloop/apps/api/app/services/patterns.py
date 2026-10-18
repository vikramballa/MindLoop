import uuid
from datetime import UTC, date, datetime, timedelta

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.i18n import t
from app.models import CheckIn, UserPattern, WellbeingSnapshot
from app.repositories.checkins import CheckInRepository
from app.repositories.interventions import InterventionRepository
from app.services.wellbeing import (
    CategoryFeedback,
    DayRecord,
    WellbeingModel,
    aggregate_days,
    compute_model,
    compute_patterns,
)


class PatternOut(BaseModel):
    kind: str
    statement: str
    explanation: str


class SeriesPoint(BaseModel):
    day: date
    mood: float
    stress: float | None
    sleep: float | None


class PatternsResponse(BaseModel):
    ready: bool
    checkin_count: int
    min_checkins: int
    message: str | None
    summary: dict
    patterns: list[PatternOut]
    series: list[SeriesPoint]


class PatternService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.checkins = CheckInRepository(db)
        self.interventions = InterventionRepository(db)

    async def _inputs(
        self, user_id: uuid.UUID, today: date
    ) -> tuple[list[CheckIn], list[DayRecord], list[CategoryFeedback]]:
        rows = await self.checkins.list_since(user_id, today - timedelta(days=60))
        days = aggregate_days([(c.local_date, c.mood, c.stress, c.sleep_hours, c.topics or []) for c in rows])
        feedback = [CategoryFeedback(c, n, pos) for c, n, pos in await self.interventions.category_feedback(user_id)]
        return rows, days, feedback

    async def model(self, user_id: uuid.UUID, today: date | None = None) -> WellbeingModel:
        today = today or datetime.now(UTC).date()
        _, days, feedback = await self._inputs(user_id, today)
        return compute_model(days, feedback, today)

    async def recompute(self, user_id: uuid.UUID, today: date | None = None) -> None:
        """Idempotent: rebuilds the snapshot and pattern set from source data."""
        today = today or datetime.now(UTC).date()
        rows, days, feedback = await self._inputs(user_id, today)
        model = compute_model(days, feedback, today)
        await self.checkins.save_snapshot(
            WellbeingSnapshot(user_id=user_id, data=model.to_dict(), checkin_count=len(rows))
        )
        patterns = []
        if len(rows) >= get_settings().pattern_min_checkins:
            patterns = [
                UserPattern(
                    user_id=user_id,
                    kind=p.kind,
                    key=p.key,
                    statement_key=p.statement_key,
                    params=p.params,
                    evidence=p.evidence,
                    strength=p.strength,
                )
                for p in compute_patterns(days, model, feedback)
            ]
        await self.checkins.replace_patterns(user_id, patterns)
        await self.db.commit()

    async def get(self, user_id: uuid.UUID, language: str) -> PatternsResponse:
        today = datetime.now(UTC).date()
        min_n = get_settings().pattern_min_checkins
        count = await self.checkins.count(user_id)
        _, days, feedback = await self._inputs(user_id, today)
        model = compute_model(days, feedback, today)
        stored = await self.checkins.list_patterns(user_id)
        ready = count >= min_n
        return PatternsResponse(
            ready=ready,
            checkin_count=count,
            min_checkins=min_n,
            message=None if ready else t("patterns.not_enough_data", language, n=min_n),
            summary={
                "mood_7d": model.mood_7d,
                "mood_30d": model.mood_30d,
                "stress_7d": model.stress_7d,
                "stress_30d": model.stress_30d,
                "sleep_7d": model.sleep_7d,
                "sleep_baseline": model.sleep_baseline,
                "mood_trend_per_week": model.mood_trend_per_week,
                "common_topics": [
                    {"topic": k, "label": t(f"topics.{k}", language), "count": n} for k, n in model.common_topics
                ],
            },
            patterns=[self._render(p, language) for p in stored] if ready else [],
            series=[
                SeriesPoint(day=d.day, mood=round(d.mood, 2), stress=d.stress, sleep=d.sleep)
                for d in days
                if d.day > today - timedelta(days=30)
            ],
        )

    @staticmethod
    def _render(p: UserPattern, lang: str) -> PatternOut:
        params = dict(p.params)
        if "topic" in params:
            params["topic"] = t(f"topics.{params['topic']}", lang)
        if "category" in params:
            params["category"] = t(f"categories.{params['category']}", lang)
        ev = p.evidence
        if p.kind == "topic_mood":
            why = t("patterns.why.topic_mood", lang, topic=params["topic"], **ev)
        elif p.kind in ("sleep_stress", "sleep_mood"):
            why = t(f"patterns.why.{p.kind}", lang, **ev)
        elif p.kind == "intervention":
            why = t("patterns.why.intervention", lang, category=params["category"], **ev)
        else:
            why = t("patterns.why.trend", lang, **ev)
        return PatternOut(kind=p.kind, statement=t(p.statement_key, lang, **params), explanation=why)
