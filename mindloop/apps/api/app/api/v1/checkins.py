import uuid
from datetime import date

from fastapi import APIRouter, Query, Response

from app.api.deps import DB, User
from app.schemas.checkin import CheckInCreate, CheckInResult, CheckInSummary, HomeResponse
from app.services.checkins import CheckInService

router = APIRouter(prefix="/checkins", tags=["checkins"])


@router.post(
    "",
    response_model=CheckInResult,
    status_code=201,
    responses={202: {"model": CheckInResult, "description": "Accepted; poll GET /checkins/{id}"}},
)
async def create_checkin(body: CheckInCreate, response: Response, user: User, db: DB) -> CheckInResult:
    result = await CheckInService(db).create(user.id, body)
    if result.status == "processing":
        response.status_code = 202
    return result


@router.get("/home", response_model=HomeResponse)
async def home(user: User, db: DB) -> HomeResponse:
    return await CheckInService(db).home(user.id)


@router.get("", response_model=list[CheckInSummary])
async def history(
    user: User, db: DB, limit: int = Query(20, ge=1, le=100), before: date | None = None
) -> list[CheckInSummary]:
    return await CheckInService(db).history(user.id, limit, before)


@router.get("/{checkin_id}", response_model=CheckInResult)
async def get_checkin(checkin_id: uuid.UUID, user: User, db: DB) -> CheckInResult:
    return await CheckInService(db).result(user.id, checkin_id)
