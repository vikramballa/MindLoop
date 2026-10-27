"""Guided journaling (thought reframes, three good things) and the personal safety plan.

Reflections are journal text, so they follow the `store_journal` consent: without it nothing is
saved. Every reflection is risk-classified before it's stored, exactly like a check-in note.

The safety plan is deliberately *not* classified. It's meant to name warning signs and crisis
contacts, so it would trip the classifier every time and bury the plan under alerts.
"""

import json
import uuid
from collections import Counter
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Reflection, SafetyPlan
from app.safety.service import SafetyService
from app.schemas.reflection import (
    GratitudeCreate,
    ReflectionOut,
    ReflectionResult,
    ReflectionStats,
    ReframeCreate,
    SafetyPlanBody,
    SafetyPlanOut,
)
from app.services.errors import Forbidden, NotFound
from app.services.events import EventService
from app.services.user_context import load_user_ctx


def _to_out(r: Reflection) -> ReflectionOut:
    data: dict[str, Any] = json.loads(r.content)
    return ReflectionOut(
        id=r.id,
        kind=r.kind,
        created_at=r.created_at,
        distortions=list(r.distortions or []),
        belief_before=r.belief_before,
        belief_after=r.belief_after,
        **data,
    )


class ReflectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.safety = SafetyService(db)
        self.events = EventService(db)

    async def create(self, user_id: uuid.UUID, body: ReframeCreate | GratitudeCreate) -> ReflectionResult:
        ctx = await load_user_ctx(self.db, user_id)
        if not ctx.consented("store_journal"):
            raise Forbidden("Saving journal entries is turned off in your privacy settings", code="journal_off")

        if isinstance(body, ReframeCreate):
            content = {
                "situation": body.situation,
                "thought": body.thought,
                "evidence_for": body.evidence_for,
                "evidence_against": body.evidence_against,
                "balanced": body.balanced,
            }
            text = "\n".join(v for v in content.values() if v)
            row = Reflection(
                user_id=user_id,
                kind="reframe",
                content=json.dumps(content),
                distortions=list(body.distortions),
                belief_before=body.belief_before,
                belief_after=body.belief_after,
            )
        else:
            content_g: dict[str, Any] = {"items": body.items, "why": body.why}
            text = "\n".join([*body.items, body.why])
            row = Reflection(user_id=user_id, kind="gratitude", content=json.dumps(content_g), distortions=[])

        assessment = self.safety.assess(text)  # always first, always deterministic
        row.risk_level = assessment.level.value
        self.db.add(row)
        await self.db.flush()
        self.safety.record(
            user_id=user_id,
            source_type="reflection",
            source_id=row.id,
            assessment=assessment,
            action="crisis_support_shown" if assessment.is_high else "support_offered",
        )
        support = await self.safety.support_response(assessment, country=ctx.country, language=ctx.language)
        await self.events.track("reflection_saved", user_id, category=row.kind, risk_level=row.risk_level)
        await self.db.commit()
        await self.db.refresh(row)
        return ReflectionResult(reflection=_to_out(row), support=support)

    async def list(self, user_id: uuid.UUID, kind: str | None, limit: int) -> list[ReflectionOut]:
        stmt = select(Reflection).where(Reflection.user_id == user_id)
        if kind:
            stmt = stmt.where(Reflection.kind == kind)
        stmt = stmt.order_by(Reflection.created_at.desc()).limit(limit)
        return [_to_out(r) for r in (await self.db.execute(stmt)).scalars()]

    async def stats(self, user_id: uuid.UUID) -> ReflectionStats:
        rows = list((await self.db.execute(select(Reflection).where(Reflection.user_id == user_id))).scalars())
        reframes = [r for r in rows if r.kind == "reframe"]
        gratitude = [r for r in rows if r.kind == "gratitude"]
        shifts = [
            r.belief_before - r.belief_after
            for r in reframes
            if r.belief_before is not None and r.belief_after is not None
        ]
        counts = Counter(d for r in reframes for d in (r.distortions or []))
        return ReflectionStats(
            reframes=len(reframes),
            gratitude=len(gratitude),
            gratitude_items=sum(len(json.loads(r.content).get("items", [])) for r in gratitude),
            avg_belief_shift=round(sum(shifts) / len(shifts), 1) if shifts else None,
            top_distortions=[d for d, _ in counts.most_common(3)],
        )

    async def delete(self, user_id: uuid.UUID, reflection_id: uuid.UUID) -> None:
        res = await self.db.execute(
            delete(Reflection).where(Reflection.id == reflection_id, Reflection.user_id == user_id)
        )
        if not res.rowcount:  # type: ignore[attr-defined]
            raise NotFound()
        self.events.audit("reflection_deleted", user_id, "reflection")
        await self.db.commit()


class SafetyPlanService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.events = EventService(db)

    async def _row(self, user_id: uuid.UUID) -> SafetyPlan | None:
        return (await self.db.execute(select(SafetyPlan).where(SafetyPlan.user_id == user_id))).scalar_one_or_none()

    async def get(self, user_id: uuid.UUID) -> SafetyPlanOut:
        row = await self._row(user_id)
        if row is None:
            return SafetyPlanOut()
        return SafetyPlanOut(**json.loads(row.content), updated_at=row.updated_at)

    async def save(self, user_id: uuid.UUID, body: SafetyPlanBody) -> SafetyPlanOut:
        content = body.model_dump_json()
        row = await self._row(user_id)
        if row is None:
            row = SafetyPlan(user_id=user_id, content=content)
            self.db.add(row)
        else:
            row.content = content
        self.events.audit("safety_plan_saved", user_id, "safety_plan")
        await self.db.commit()
        await self.db.refresh(row)
        return SafetyPlanOut(**body.model_dump(), updated_at=row.updated_at)

    async def delete(self, user_id: uuid.UUID) -> None:
        await self.db.execute(delete(SafetyPlan).where(SafetyPlan.user_id == user_id))
        self.events.audit("safety_plan_deleted", user_id, "safety_plan")
        await self.db.commit()
