from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import DB
from app.repositories.system import SupportResourceRepository
from app.safety.service import ResourceOut
from app.services.context import ContextPolicyService

# Public on purpose: the support page has to work for people who aren't signed in.
router = APIRouter(prefix="/resources", tags=["resources"])


class ResourcesResponse(BaseModel):
    country: str
    resources: list[ResourceOut]
    emergency_number: str | None
    support_pathway_note: str | None
    available_countries: list[str]


@router.get("", response_model=ResourcesResponse)
async def list_resources(
    db: DB, country: str = Query("IN", pattern=r"^[A-Za-z]{2}$"), language: str = "en"
) -> ResourcesResponse:
    repo = SupportResourceRepository(db)
    policy = await ContextPolicyService(db).resolve(country, language)
    rows = await repo.for_country(country)
    return ResourcesResponse(
        country=country.upper(),
        resources=[ResourceOut.of(r) for r in rows],
        emergency_number=policy.emergency_number,
        support_pathway_note=policy.support_pathway_note,
        available_countries=await repo.countries(),
    )
