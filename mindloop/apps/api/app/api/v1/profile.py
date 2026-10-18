from fastapi import APIRouter

from app.api.deps import DB, User
from app.schemas.profile import ContextProfileUpdate, OnboardingRequest, PreferencesUpdate, ProfileResponse
from app.services.profile import ProfileService

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(user: User, db: DB) -> ProfileResponse:
    return await ProfileService(db).get(user.id)


@router.patch("", response_model=ProfileResponse)
async def update_profile(body: ContextProfileUpdate, user: User, db: DB) -> ProfileResponse:
    return await ProfileService(db).update_profile(user.id, body)


@router.patch("/preferences", response_model=ProfileResponse)
async def update_preferences(body: PreferencesUpdate, user: User, db: DB) -> ProfileResponse:
    return await ProfileService(db).update_preferences(user.id, body)


@router.post("/onboarding", response_model=ProfileResponse)
async def complete_onboarding(body: OnboardingRequest, user: User, db: DB) -> ProfileResponse:
    return await ProfileService(db).complete_onboarding(user.id, body)
