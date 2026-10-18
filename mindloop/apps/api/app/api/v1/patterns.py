from fastapi import APIRouter

from app.api.deps import DB, User
from app.services.patterns import PatternService, PatternsResponse
from app.services.user_context import load_user_ctx

router = APIRouter(prefix="/patterns", tags=["patterns"])


@router.get("", response_model=PatternsResponse)
async def get_patterns(user: User, db: DB) -> PatternsResponse:
    ctx = await load_user_ctx(db, user.id)
    return await PatternService(db).get(user.id, ctx.language)
