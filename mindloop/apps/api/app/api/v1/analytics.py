from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import DB, Admin, User
from app.core.config import get_settings
from app.services.errors import Forbidden
from app.services.events import CLIENT_EVENTS, EventService
from app.services.metrics import MetricsService

router = APIRouter(tags=["analytics"])


class ClientEvent(BaseModel):
    name: str = Field(max_length=40)
    properties: dict[str, str | int | float | bool] = Field(default_factory=dict, max_length=5)


@router.post("/analytics/events", status_code=204)
async def track(body: ClientEvent, user: User, db: DB) -> None:
    if body.name in CLIENT_EVENTS:
        await EventService(db).track(body.name, user.id, **body.properties)
        await db.commit()


@router.get("/admin/metrics")
async def metrics(_: Admin, db: DB) -> dict[str, Any]:
    if not get_settings().metrics_enabled:
        raise Forbidden()
    return await MetricsService(db).summary()
