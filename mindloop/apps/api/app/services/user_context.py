import uuid
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vocab import DEFAULT_CONSENTS
from app.repositories.users import UserRepository
from app.services.errors import NotFound


@dataclass
class UserCtx:
    """Everything request handlers need about the user, loaded once per request."""

    user_id: uuid.UUID
    country: str
    language: str
    age_range: str | None
    support_style: str
    preferred_minutes: int
    display_name: str | None
    consents: dict[str, bool] = field(default_factory=dict)

    def consented(self, consent_type: str) -> bool:
        return self.consents.get(consent_type, DEFAULT_CONSENTS.get(consent_type, False))


async def load_user_ctx(db: AsyncSession, user_id: uuid.UUID) -> UserCtx:
    repo = UserRepository(db)
    profile = await repo.get_profile(user_id)
    prefs = await repo.get_preferences(user_id)
    if profile is None or prefs is None:
        raise NotFound("Profile not found")
    return UserCtx(
        user_id=user_id,
        country=profile.country,
        language=profile.preferred_language,
        age_range=profile.age_range,
        support_style=profile.preferred_support_style,
        preferred_minutes=prefs.preferred_intervention_minutes,
        display_name=profile.display_name,
        consents={c.consent_type: c.granted for c in await repo.list_consents(user_id)},
    )
