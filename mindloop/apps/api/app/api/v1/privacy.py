import uuid
from typing import Any, Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.deps import DB, User
from app.services.privacy import PrivacyService

router = APIRouter(prefix="/privacy", tags=["privacy"])


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class ConsentUpdate(BaseModel):
    granted: bool


class DeletedResponse(BaseModel):
    deleted: int


@router.get("/export")
async def export_data(user: User, db: DB) -> JSONResponse:
    data = await PrivacyService(db).export(user.id)
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="mindloop-export.json"'})


@router.post("/delete-account", status_code=204)
async def delete_account(body: DeleteAccountRequest, user: User, db: DB) -> None:
    await PrivacyService(db).delete_account(user.id, body.password)


@router.delete("/data/{scope}", response_model=DeletedResponse)
async def delete_scope(
    scope: Literal["conversations", "journal", "transcripts", "memory", "checkins"], user: User, db: DB
) -> DeletedResponse:
    return DeletedResponse(deleted=await PrivacyService(db).delete_scope(user.id, scope))


@router.get("/memory")
async def list_memory(user: User, db: DB) -> list[dict[str, Any]]:
    return await PrivacyService(db).list_memory(user.id)


@router.delete("/memory/{memory_id}", status_code=204)
async def delete_memory(memory_id: uuid.UUID, user: User, db: DB) -> None:
    await PrivacyService(db).delete_memory_item(user.id, memory_id)


@router.get("/consents", response_model=dict[str, bool])
async def get_consents(user: User, db: DB) -> dict[str, bool]:
    return await PrivacyService(db).consents(user.id)


@router.put("/consents/{consent_type}", response_model=dict[str, bool])
async def set_consent(consent_type: str, body: ConsentUpdate, user: User, db: DB) -> dict[str, bool]:
    return await PrivacyService(db).set_consent(user.id, consent_type, body.granted)
