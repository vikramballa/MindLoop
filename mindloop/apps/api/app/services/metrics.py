"""Product metrics for the internal dashboard. Only aggregate counts, nothing about individual users."""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_RETENTION_SQL = text(
    """
    WITH cohort AS (
        SELECT id, created_at::date AS d0 FROM users WHERE created_at < now() - make_interval(days => :days)
    ), active AS (
        SELECT DISTINCT user_id, local_date FROM check_ins
    )
    SELECT count(*) AS cohort,
           count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM active a WHERE a.user_id = cohort.id AND a.local_date >= cohort.d0 + :days
           )) AS retained
    FROM cohort
    """
)


def _pct(num: int, den: int) -> float | None:
    return round(100.0 * num / den, 1) if den else None


class MetricsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _scalar(self, sql: str, **params: Any) -> int:
        return int((await self.db.execute(text(sql), params)).scalar_one() or 0)

    async def summary(self) -> dict[str, Any]:
        users = await self._scalar("SELECT count(*) FROM users")
        activated = await self._scalar("SELECT count(DISTINCT user_id) FROM check_ins")
        onboarded = await self._scalar("SELECT count(*) FROM user_profiles WHERE onboarding_completed_at IS NOT NULL")
        checkins = await self._scalar("SELECT count(*) FROM check_ins")
        assigned = await self._scalar("SELECT count(*) FROM intervention_assignments")
        completed = await self._scalar("SELECT count(*) FROM intervention_assignments WHERE status = 'completed'")
        feedback = await self._scalar("SELECT count(*) FROM intervention_feedback")
        positive = await self._scalar("SELECT count(*) FROM intervention_feedback WHERE score > 0")
        returning = await self._scalar(
            "SELECT count(*) FROM (SELECT user_id FROM check_ins GROUP BY user_id "
            "HAVING count(DISTINCT local_date) >= 2) r"
        )
        retention = {}
        for days in (1, 7, 30):
            row = (await self.db.execute(_RETENTION_SQL, {"days": days})).one()
            retention[f"d{days}"] = {"cohort": row.cohort, "retained_pct": _pct(row.retained, row.cohort)}
        since = datetime.now(UTC) - timedelta(days=7)
        events = (
            await self.db.execute(
                text(
                    "SELECT name, count(*) FROM analytics_events WHERE occurred_at >= :since "
                    "GROUP BY name ORDER BY 2 DESC"
                ),
                {"since": since},
            )
        ).all()
        jobs = (
            await self.db.execute(
                text(
                    "SELECT kind, status, count(*), avg(duration_ms)::int FROM jobs GROUP BY kind, status ORDER BY kind"
                )
            )
        ).all()
        safety = (
            await self.db.execute(text("SELECT risk_level, count(*) FROM safety_events GROUP BY risk_level"))
        ).all()
        return {
            "users": users,
            "onboarding_completion_pct": _pct(onboarded, users),
            "activation_pct": _pct(activated, users),
            "checkins_per_user": round(checkins / activated, 2) if activated else None,
            "intervention_completion_pct": _pct(completed, assigned),
            "helpful_feedback_pct": _pct(positive, feedback),
            "voluntary_return_pct": _pct(returning, activated),
            "retention": retention,
            "events_last_7_days": {name: n for name, n in events},
            "jobs": [{"kind": k, "status": s, "count": c, "avg_ms": a} for k, s, c, a in jobs],
            "safety_events": {lvl: n for lvl, n in safety},
        }
