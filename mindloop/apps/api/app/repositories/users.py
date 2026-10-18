import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Consent, RefreshToken, User, UserPreferences, UserProfile


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.db.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        return (await self.db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()

    async def add(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        return user

    async def touch_active(self, user_id: uuid.UUID, at: datetime) -> None:
        await self.db.execute(update(User).where(User.id == user_id).values(last_active_at=at))

    async def delete(self, user_id: uuid.UUID) -> None:
        """Hard delete; every user-owned table cascades via ON DELETE CASCADE foreign keys."""
        await self.db.execute(delete(User).where(User.id == user_id))

    async def get_profile(self, user_id: uuid.UUID) -> UserProfile | None:
        return await self.db.get(UserProfile, user_id)

    async def get_preferences(self, user_id: uuid.UUID) -> UserPreferences | None:
        return await self.db.get(UserPreferences, user_id)

    async def list_consents(self, user_id: uuid.UUID) -> list[Consent]:
        return list((await self.db.execute(select(Consent).where(Consent.user_id == user_id))).scalars())

    async def get_consent(self, user_id: uuid.UUID, consent_type: str) -> Consent | None:
        stmt = select(Consent).where(Consent.user_id == user_id, Consent.consent_type == consent_type)
        return (await self.db.execute(stmt)).scalar_one_or_none()


class RefreshTokenRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def add(self, token: RefreshToken) -> None:
        self.db.add(token)
        await self.db.flush()

    async def revoke_family(self, family_id: uuid.UUID, at: datetime) -> None:
        await self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=at)
        )
