from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import DB, User
from app.safety.service import SafetyService, SupportResponse
from app.services.user_context import load_user_ctx

router = APIRouter(prefix="/safety", tags=["safety"])


class AssessRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class AssessResponse(BaseModel):
    level: str
    categories: list[str]
    support: SupportResponse | None


@router.post("/assess", response_model=AssessResponse)
async def assess(body: AssessRequest, user: User, db: DB) -> AssessResponse:
    """Runs the rule-based classifier only. The text is not stored."""
    ctx = await load_user_ctx(db, user.id)
    service = SafetyService(db)
    result = service.assess(body.text)
    support = await service.support_response(result, country=ctx.country, language=ctx.language)
    return AssessResponse(level=result.level.value, categories=result.categories, support=support)
