import uuid

from fastapi import APIRouter, File, Form, UploadFile

from app.api.deps import DB, User
from app.schemas.conversation import VoiceStatus
from app.services.voice import VoiceService

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("", response_model=VoiceStatus, status_code=202)
async def upload_voice(
    user: User, db: DB, audio: UploadFile = File(...), conversation_id: uuid.UUID | None = Form(None)
) -> VoiceStatus:
    """Accepts a short recording and returns a job id immediately. Poll GET /voice/{id}."""
    return await VoiceService(db).create(user.id, audio, conversation_id)


@router.get("/{voice_id}", response_model=VoiceStatus)
async def voice_status(voice_id: uuid.UUID, user: User, db: DB) -> VoiceStatus:
    return await VoiceService(db).status(user.id, voice_id)
