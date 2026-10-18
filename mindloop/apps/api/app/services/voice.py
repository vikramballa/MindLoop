"""Voice messages: the upload returns a job id, then the worker transcribes the audio
locally, deletes it and runs the transcript through the normal Talk flow.

Audio is never stored beyond processing. Transcripts are kept only with explicit consent;
otherwise they are shown once to the user and then purged.
"""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.orchestrator import ConversationOrchestrator, get_or_create_session
from app.ai.stt import AudioRejected, get_stt
from app.core.config import get_settings
from app.core.logging import get_logger
from app.interventions.service import InterventionService
from app.models import ConversationMessage, VoiceSession
from app.repositories.conversations import ConversationRepository
from app.repositories.users import UserRepository
from app.safety.classifier import RiskLevel, SafetyAssessment
from app.safety.service import SafetyService
from app.schemas.conversation import VoiceStatus
from app.services.errors import Forbidden, InvalidInput, NotFound, PayloadTooLarge
from app.services.events import EventService
from app.services.user_context import load_user_ctx
from app.workers.queue import enqueue

log = get_logger(__name__)
ALLOWED_AUDIO = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/aac",
    "video/webm",
}
TRANSCRIPT_DISPLAY_TTL = timedelta(hours=1)


def _audio_path(voice_id: uuid.UUID) -> Path:
    return Path(get_settings().audio_tmp_dir) / f"{voice_id}.audio"


class VoiceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ConversationRepository(db)

    async def create(self, user_id: uuid.UUID, upload: UploadFile, conversation_id: uuid.UUID | None) -> VoiceStatus:
        prefs = await UserRepository(self.db).get_preferences(user_id)
        if prefs is not None and not prefs.voice_enabled:
            raise Forbidden("Voice is turned off in your preferences", code="voice_disabled")
        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        if content_type not in ALLOWED_AUDIO:
            raise InvalidInput("Unsupported audio format", code="unsupported_audio")

        limit = get_settings().max_audio_bytes
        data = bytearray()
        while chunk := await upload.read(256 * 1024):
            data.extend(chunk)
            if len(data) > limit:
                raise PayloadTooLarge("Audio file is too large", code="audio_too_large")
        if len(data) < 1000:
            raise InvalidInput("Recording is too short", code="audio_too_short")

        session = await get_or_create_session(self.db, user_id, conversation_id, mode="voice")
        if session is None:
            raise NotFound("Conversation not found")
        voice = VoiceSession(user_id=user_id, conversation_session_id=session.id, status="queued")
        await self.repo.add(voice)

        path = _audio_path(voice.id)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        await asyncio.to_thread(_write_private, path, bytes(data))
        await enqueue(
            self.db, "process_voice", {"voice_id": str(voice.id)}, idempotency_key=f"process_voice:{voice.id}"
        )
        await EventService(self.db).track("voice_message", user_id)
        await self.db.commit()
        return await self.status(user_id, voice.id)

    async def process(self, voice_id: uuid.UUID) -> None:
        """Worker entry point. Always deletes the audio file, even on failure."""
        voice = await self.repo.get_voice_by_id(voice_id)
        if voice is None or voice.status in ("completed", "failed"):
            _delete_audio(voice_id)
            return
        path = _audio_path(voice_id)
        try:
            if not path.exists():
                await self._fail(voice, "audio_missing")
                return
            ctx = await load_user_ctx(self.db, voice.user_id)
            voice.status = "transcribing"
            await self.db.commit()
            try:
                result = await asyncio.to_thread(
                    get_stt().transcribe, str(path), language=None, max_seconds=get_settings().max_audio_seconds
                )
            except AudioRejected as exc:
                await self._fail(voice, exc.code)
                return
        finally:
            _delete_audio(voice_id)
        voice.audio_deleted_at = datetime.now(UTC)
        voice.duration_seconds = result.duration_seconds
        if not result.text:
            await self._fail(voice, "no_speech_detected")
            return

        voice.status = "responding"
        voice.transcript = result.text
        voice.transcript_retained = ctx.consented("store_transcripts")
        await self.db.commit()

        session = await self.repo.get_session(voice.user_id, voice.conversation_session_id)  # type: ignore[arg-type]
        if session is None:
            await self._fail(voice, "conversation_missing")
            return
        orchestrator = ConversationOrchestrator(self.db, ctx)
        prepared = await orchestrator.prepare(
            session, result.text, source="voice", store_user_text=voice.transcript_retained, model_extraction=True
        )
        reply, source = await orchestrator.generate(prepared)
        msg = await orchestrator.finalize(prepared, reply, source)
        voice.user_message_id = prepared.user_message.id
        voice.assistant_message_id = msg.id
        voice.risk_level = prepared.assessment.level.value
        voice.safety_categories = prepared.assessment.categories
        voice.intervention_assignment_id = prepared.user_message.intervention_assignment_id
        voice.status = "completed"
        await self.db.commit()

    async def _fail(self, voice: VoiceSession, code: str) -> None:
        voice.status = "failed"
        voice.error_code = code
        voice.audio_deleted_at = datetime.now(UTC)
        await self.db.commit()
        log.info("voice_failed", extra={"error_code": code})

    async def mark_failed(self, voice_id: uuid.UUID) -> None:
        voice = await self.repo.get_voice_by_id(voice_id)
        _delete_audio(voice_id)
        if voice is not None and voice.status not in ("completed", "failed"):
            await self._fail(voice, "processing_failed")

    async def status(self, user_id: uuid.UUID, voice_id: uuid.UUID) -> VoiceStatus:
        voice = await self.repo.get_voice(user_id, voice_id)
        if voice is None:
            raise NotFound("Voice message not found")
        ctx = await load_user_ctx(self.db, user_id)
        reply, support, action = None, None, None
        if voice.status == "completed":
            if voice.assistant_message_id:
                msg = await self.db.get(ConversationMessage, voice.assistant_message_id)
                reply = msg.content if msg else None
            if voice.risk_level and voice.risk_level != RiskLevel.LOW.value:
                support = await SafetyService(self.db).support_response(
                    SafetyAssessment(level=RiskLevel(voice.risk_level), categories=voice.safety_categories or []),
                    country=ctx.country,
                    language=ctx.language,
                )
            if voice.intervention_assignment_id:
                action = await InterventionService(self.db).action_for_assignment(
                    user_id, voice.intervention_assignment_id, ctx.language
                )
        out = VoiceStatus(
            id=voice.id,
            conversation_id=voice.conversation_session_id,
            status=voice.status,
            transcript=voice.transcript,
            reply=reply,
            error_code=voice.error_code,
            support=support,
            action=action,
        )
        if voice.status == "completed" and voice.transcript and not voice.transcript_retained:
            voice.transcript = None  # shown once, then purged
            await self.db.commit()
        return out

    async def purge_stale_transcripts(self) -> int:
        cutoff = datetime.now(UTC) - TRANSCRIPT_DISPLAY_TTL
        res = await self.db.execute(
            update(VoiceSession)
            .where(
                VoiceSession.transcript_retained.is_(False),
                VoiceSession.transcript.is_not(None),
                VoiceSession.updated_at < cutoff,
            )
            .values(transcript=None)
        )
        await self.db.commit()
        return res.rowcount or 0  # type: ignore[attr-defined]


def _write_private(path: Path, data: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)


def _delete_audio(voice_id: uuid.UUID) -> None:
    try:
        _audio_path(voice_id).unlink(missing_ok=True)
    except OSError:
        log.error("audio_delete_failed")
