import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import DB, User
from app.interventions.service import ActionOut, InterventionService, LibraryItem
from app.schemas.checkin import FeedbackRequest
from app.services.user_context import load_user_ctx

router = APIRouter(prefix="/interventions", tags=["interventions"])


class AssignRequest(BaseModel):
    slug: str


@router.get("", response_model=list[LibraryItem])
async def library(user: User, db: DB, category: str | None = None) -> list[LibraryItem]:
    ctx = await load_user_ctx(db, user.id)
    return await InterventionService(db).library(ctx.language, category)


@router.post("/assignments", response_model=ActionOut, status_code=201)
async def assign(body: AssignRequest, user: User, db: DB) -> ActionOut:
    ctx = await load_user_ctx(db, user.id)
    return await InterventionService(db).assign_manual(user.id, body.slug, ctx.language)


@router.get("/assignments/{assignment_id}", response_model=ActionOut)
async def get_assignment(assignment_id: uuid.UUID, user: User, db: DB) -> ActionOut:
    ctx = await load_user_ctx(db, user.id)
    return await InterventionService(db).action_for_assignment(user.id, assignment_id, ctx.language)


@router.post("/assignments/{assignment_id}/start", response_model=ActionOut)
async def start(assignment_id: uuid.UUID, user: User, db: DB) -> ActionOut:
    ctx = await load_user_ctx(db, user.id)
    return await InterventionService(db).start(user.id, assignment_id, ctx.language)


@router.post("/assignments/{assignment_id}/complete", response_model=ActionOut)
async def complete(assignment_id: uuid.UUID, user: User, db: DB) -> ActionOut:
    ctx = await load_user_ctx(db, user.id)
    return await InterventionService(db).complete(user.id, assignment_id, ctx.language)


@router.post("/assignments/{assignment_id}/feedback", response_model=ActionOut)
async def feedback(assignment_id: uuid.UUID, body: FeedbackRequest, user: User, db: DB) -> ActionOut:
    ctx = await load_user_ctx(db, user.id)
    return await InterventionService(db).feedback(user.id, assignment_id, body.rating, ctx.language)


@router.post("/assignments/{assignment_id}/alternative", response_model=ActionOut, status_code=201)
async def alternative(assignment_id: uuid.UUID, user: User, db: DB) -> ActionOut:
    """'Try something else': deterministic re-selection excluding the current action."""
    return await InterventionService(db).alternative(await load_user_ctx(db, user.id), assignment_id)
