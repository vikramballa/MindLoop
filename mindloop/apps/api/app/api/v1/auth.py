from typing import Annotated

from fastapi import APIRouter, Cookie, Response

from app.api.deps import DB, User
from app.core.config import get_settings
from app.repositories.users import UserRepository
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse
from app.services.auth import AuthService, TokenPair
from app.services.errors import InvalidInput, NotFound, Unauthorized

router = APIRouter(prefix="/auth", tags=["auth"])
REFRESH_COOKIE = "ml_refresh"
COOKIE_PATH = "/api/v1/auth"


def _set_refresh(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=s.refresh_token_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )


async def _token_response(db: DB, pair: TokenPair, response: Response) -> TokenResponse:
    _set_refresh(response, pair.refresh_token)
    profile = await UserRepository(db).get_profile(pair.user.id)
    return TokenResponse(
        access_token=pair.access_token,
        user_id=pair.user.id,
        onboarding_completed=bool(profile and profile.onboarding_completed_at),
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, response: Response, db: DB) -> TokenResponse:
    if not body.accept_terms:
        raise InvalidInput("You need to accept the terms to continue", code="terms_required")
    pair = await AuthService(db).register(
        email=body.email, password=body.password, country=body.country, language=body.language
    )
    return await _token_response(db, pair, response)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: DB) -> TokenResponse:
    pair = await AuthService(db).login(email=body.email, password=body.password)
    return await _token_response(db, pair, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(response: Response, db: DB, ml_refresh: Annotated[str | None, Cookie()] = None) -> TokenResponse:
    if not ml_refresh:
        raise Unauthorized(code="missing_refresh")
    pair = await AuthService(db).refresh(ml_refresh)
    return await _token_response(db, pair, response)


@router.post("/logout", status_code=204)
async def logout(response: Response, db: DB, ml_refresh: Annotated[str | None, Cookie()] = None) -> None:
    await AuthService(db).logout(ml_refresh)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


@router.get("/me", response_model=MeResponse)
async def me(user: User, db: DB) -> MeResponse:
    repo = UserRepository(db)
    u = await repo.get(user.id)
    profile = await repo.get_profile(user.id)
    if u is None or profile is None:
        raise NotFound()
    return MeResponse(
        id=u.id,
        email=u.email,
        is_admin=u.is_admin,
        onboarding_completed=profile.onboarding_completed_at is not None,
        display_name=profile.display_name,
        preferred_language=profile.preferred_language,
        country=profile.country,
    )
