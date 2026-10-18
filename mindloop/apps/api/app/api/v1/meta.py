from typing import Any

from fastapi import APIRouter

from app.core.vocab import CONSENT_TYPES, TOPICS
from app.i18n import SUPPORTED_LANGUAGES, t

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("")
async def get_meta(language: str = "en") -> dict[str, Any]:
    return {
        "languages": [{"code": c, "translated": c == "en"} for c in SUPPORTED_LANGUAGES],
        "topics": [{"id": tp, "label": t(f"topics.{tp}", language)} for tp in TOPICS],
        "consent_types": list(CONSENT_TYPES),
        "age_ranges": ["18-21", "22-25", "26-30", "31+"],
        "countries": ["IN", "GB", "US", "DE", "FR", "PT", "JP"],
    }
