import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserPreferences, UserProfile
from app.repositories.users import UserRepository
from app.schemas.profile import (
    ContextProfile,
    ContextProfileUpdate,
    OnboardingRequest,
    Preferences,
    PreferencesUpdate,
    ProfileResponse,
)
from app.services.errors import NotFound
from app.services.events import EventService


def _profile_schema(p: UserProfile) -> ContextProfile:
    return ContextProfile.model_validate(
        {
            "display_name": p.display_name,
            "country": p.country,
            "region": p.region,
            "preferred_language": p.preferred_language,
            "secondary_language": p.secondary_language,
            "age_range": p.age_range,
            "occupation": p.occupation,
            "living_situation": p.living_situation,
            "preferred_support_style": p.preferred_support_style,
            "selected_stressors": p.selected_stressors or [],
            "communication_preferences": p.communication_preferences or {},
            "support_network_preference": p.support_network_preference,
            "healthcare_access_preference": p.healthcare_access_preference,
            "cultural_context_notes": p.cultural_context_notes,
        }
    )


class ProfileService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.events = EventService(db)

    async def _load(self, user_id: uuid.UUID) -> tuple[UserProfile, UserPreferences]:
        profile = await self.users.get_profile(user_id)
        prefs = await self.users.get_preferences(user_id)
        if profile is None or prefs is None:
            raise NotFound("Profile not found")
        return profile, prefs

    async def get(self, user_id: uuid.UUID) -> ProfileResponse:
        profile, prefs = await self._load(user_id)
        consents = {c.consent_type: c.granted for c in await self.users.list_consents(user_id)}
        return ProfileResponse(
            profile=_profile_schema(profile),
            preferences=Preferences.model_validate(prefs, from_attributes=True),
            consents=consents,
            onboarding_completed_at=profile.onboarding_completed_at,
        )

    async def update_profile(self, user_id: uuid.UUID, data: ContextProfileUpdate) -> ProfileResponse:
        profile, _ = await self._load(user_id)
        changes = data.model_dump(exclude_unset=True)
        if "country" in changes and changes["country"]:
            changes["country"] = changes["country"].upper()
        if "communication_preferences" in changes and data.communication_preferences:
            changes["communication_preferences"] = data.communication_preferences.model_dump()
        if "selected_stressors" in changes and changes["selected_stressors"] is not None:
            changes["selected_stressors"] = ContextProfile(
                selected_stressors=changes["selected_stressors"]
            ).selected_stressors
        for key, value in changes.items():
            setattr(profile, key, value)
        self.events.audit("profile_updated", user_id, "user_profile", fields=sorted(changes))
        await self.db.commit()
        return await self.get(user_id)

    async def update_preferences(self, user_id: uuid.UUID, data: PreferencesUpdate) -> ProfileResponse:
        _, prefs = await self._load(user_id)
        changes = data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in changes.items():
            setattr(prefs, key, value)
        self.events.audit("preferences_updated", user_id, "user_preferences", fields=sorted(changes))
        await self.db.commit()
        return await self.get(user_id)

    async def complete_onboarding(self, user_id: uuid.UUID, data: OnboardingRequest) -> ProfileResponse:
        profile, prefs = await self._load(user_id)
        payload = data.model_dump(exclude={"preferences"})
        payload["communication_preferences"] = data.communication_preferences.model_dump()
        for key, value in payload.items():
            setattr(profile, key, value)
        if data.preferences:
            for key, value in data.preferences.model_dump(exclude_none=True).items():
                setattr(prefs, key, value)
        first_time = profile.onboarding_completed_at is None
        profile.onboarding_completed_at = profile.onboarding_completed_at or datetime.now(UTC)
        if first_time:
            await self.events.track("onboarding_completed", user_id, country=profile.country)
        self.events.audit("onboarding_completed", user_id, "user_profile")
        await self.db.commit()
        return await self.get(user_id)
