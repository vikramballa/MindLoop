import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.interventions.service import ActionOut
from app.safety.service import SupportResponse


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("empty message")
        return v


class SessionOut(BaseModel):
    id: uuid.UUID
    mode: str
    message_count: int
    created_at: datetime
    last_message_at: datetime | None


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    source: str
    risk_level: str | None
    created_at: datetime


class VoiceStatus(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID | None
    status: Literal["queued", "transcribing", "responding", "completed", "failed"]
    transcript: str | None
    reply: str | None
    error_code: str | None
    support: SupportResponse | None
    action: ActionOut | None
