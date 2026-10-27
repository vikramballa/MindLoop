import uuid
from typing import Literal

from fastapi import APIRouter, Body, Query

from app.api.deps import DB, User
from app.schemas.reflection import (
    ReflectionCreate,
    ReflectionOut,
    ReflectionResult,
    ReflectionStats,
    SafetyPlanBody,
    SafetyPlanOut,
)
from app.services.reflections import ReflectionService, SafetyPlanService

router = APIRouter(tags=["reflections"])


@router.post("/reflections", response_model=ReflectionResult, status_code=201)
async def create_reflection(user: User, db: DB, body: ReflectionCreate = Body()) -> ReflectionResult:
    return await ReflectionService(db).create(user.id, body)


@router.get("/reflections", response_model=list[ReflectionOut])
async def list_reflections(
    user: User,
    db: DB,
    kind: Literal["reframe", "gratitude"] | None = None,
    limit: int = Query(30, ge=1, le=100),
) -> list[ReflectionOut]:
    return await ReflectionService(db).list(user.id, kind, limit)


@router.get("/reflections/stats", response_model=ReflectionStats)
async def reflection_stats(user: User, db: DB) -> ReflectionStats:
    return await ReflectionService(db).stats(user.id)


@router.delete("/reflections/{reflection_id}", status_code=204)
async def delete_reflection(reflection_id: uuid.UUID, user: User, db: DB) -> None:
    await ReflectionService(db).delete(user.id, reflection_id)


@router.get("/safety-plan", response_model=SafetyPlanOut)
async def get_safety_plan(user: User, db: DB) -> SafetyPlanOut:
    return await SafetyPlanService(db).get(user.id)


@router.put("/safety-plan", response_model=SafetyPlanOut)
async def save_safety_plan(body: SafetyPlanBody, user: User, db: DB) -> SafetyPlanOut:
    return await SafetyPlanService(db).save(user.id, body)


@router.delete("/safety-plan", status_code=204)
async def delete_safety_plan(user: User, db: DB) -> None:
    await SafetyPlanService(db).delete(user.id)
