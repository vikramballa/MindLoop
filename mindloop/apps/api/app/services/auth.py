import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.core.vocab import DEFAULT_CONSENTS
from app.models import Consent, RefreshToken, User, UserPreferences, UserProfile
from app.repositories.users import RefreshTokenRepository, UserRepository
from app.services.errors import Conflict, Unauthorized
from app.services.events import EventService

# Constant dummy hash so login timing does not reveal whether an email exists.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    user: User


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.tokens = RefreshTokenRepository(db)
        self.events = EventService(db)

    async def register(self, *, email: str, password: str, country: str = "IN", language: str = "en") -> TokenPair:
        email = email.strip().lower()
        if await self.users.get_by_email(email):
            raise Conflict("An account with this email already exists", code="email_taken")
        user = await self.users.add(User(email=email, password_hash=hash_password(password)))
        self.db.add(UserProfile(user_id=user.id, country=country.upper(), preferred_language=language))
        self.db.add(UserPreferences(user_id=user.id))
        for consent_type, granted in DEFAULT_CONSENTS.items():
            self.db.add(Consent(user_id=user.id, consent_type=consent_type, granted=granted))
        self.events.audit("user_registered", user.id, "user")
        await self.events.track("signup_completed", user.id, country=country.upper())
        pair = await self._issue(user, family_id=uuid.uuid4())
        await self.db.commit()
        return pair

    async def login(self, *, email: str, password: str) -> TokenPair:
        user = await self.users.get_by_email(email.strip().lower())
        if user is None:
            verify_password(password, _DUMMY_HASH)
            raise Unauthorized("Incorrect email or password", code="invalid_credentials")
        if not verify_password(password, user.password_hash):
            raise Unauthorized("Incorrect email or password", code="invalid_credentials")
        self.events.audit("user_login", user.id, "session")
        pair = await self._issue(user, family_id=uuid.uuid4())
        await self.db.commit()
        return pair

    async def refresh(self, raw_token: str) -> TokenPair:
        now = datetime.now(UTC)
        stored = await self.tokens.get_by_hash(hash_refresh_token(raw_token))
        if stored is None:
            raise Unauthorized(code="invalid_refresh")
        if stored.revoked_at is not None:
            # Reuse of a rotated token: assume theft, revoke the whole family.
            await self.tokens.revoke_family(stored.family_id, now)
            self.events.audit("refresh_token_reuse_detected", stored.user_id, "session")
            await self.db.commit()
            raise Unauthorized(code="invalid_refresh")
        if stored.expires_at <= now:
            raise Unauthorized(code="expired_refresh")
        user = await self.users.get(stored.user_id)
        if user is None:
            raise Unauthorized(code="invalid_refresh")
        pair = await self._issue(user, family_id=stored.family_id)
        stored.revoked_at = now
        new = await self.tokens.get_by_hash(hash_refresh_token(pair.refresh_token))
        stored.replaced_by_id = new.id if new else None
        await self.db.commit()
        return pair

    async def logout(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        stored = await self.tokens.get_by_hash(hash_refresh_token(raw_token))
        if stored:
            await self.tokens.revoke_family(stored.family_id, datetime.now(UTC))
            await self.db.commit()

    async def _issue(self, user: User, family_id: uuid.UUID) -> TokenPair:
        raw, hashed = new_refresh_token()
        await self.tokens.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hashed,
                family_id=family_id,
                expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days),
            )
        )
        return TokenPair(create_access_token(user.id, user.is_admin), raw, user)
