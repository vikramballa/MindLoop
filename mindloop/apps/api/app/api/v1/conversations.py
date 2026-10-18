import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.ai.orchestrator import ConversationOrchestrator, get_or_create_session
from app.api.deps import DB, User
from app.db.session import get_sessionmaker
from app.repositories.conversations import ConversationRepository
from app.schemas.conversation import MessageCreate, MessageOut, SessionOut
from app.services.errors import NotFound
from app.services.events import EventService
from app.services.user_context import load_user_ctx

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=SessionOut, status_code=201)
async def create_session(user: User, db: DB) -> SessionOut:
    session = await get_or_create_session(db, user.id, None)
    assert session is not None
    await db.commit()
    return SessionOut.model_validate(session, from_attributes=True)


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    user: User, db: DB, limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0)
) -> list[SessionOut]:
    rows = await ConversationRepository(db).list_sessions(user.id, limit, offset)
    return [SessionOut.model_validate(r, from_attributes=True) for r in rows]


@router.get("/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(
    session_id: uuid.UUID, user: User, db: DB, limit: int = Query(50, ge=1, le=200)
) -> list[MessageOut]:
    repo = ConversationRepository(db)
    if await repo.get_session(user.id, session_id) is None:
        raise NotFound("Conversation not found")
    return [MessageOut.model_validate(m, from_attributes=True) for m in await repo.messages(session_id, limit)]


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, user: User, db: DB) -> None:
    repo = ConversationRepository(db)
    if await repo.get_session(user.id, session_id) is None:
        raise NotFound("Conversation not found")
    await repo.delete_session(session_id)
    EventService(db).audit("conversation_deleted", user.id, "conversation")
    await db.commit()


@router.post(
    "/{session_id}/messages",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "SSE events: support | action | token | replace | done | error",
        }
    },
)
async def send_message(session_id: uuid.UUID, body: MessageCreate, user: User, db: DB) -> StreamingResponse:
    if await ConversationRepository(db).get_session(user.id, session_id) is None:
        raise NotFound("Conversation not found")

    async def events() -> AsyncIterator[str]:
        # Own session: the request-scoped one may close before streaming finishes.
        async with get_sessionmaker()() as stream_db:
            ctx = await load_user_ctx(stream_db, user.id)
            session = await ConversationRepository(stream_db).get_session(user.id, session_id)
            assert session is not None
            orchestrator = ConversationOrchestrator(stream_db, ctx)
            try:
                prepared = await orchestrator.prepare(session, body.text)
                async for event in orchestrator.stream(prepared):
                    yield f"data: {json.dumps(event, default=str)}\n\n"
            except Exception:
                await stream_db.rollback()
                yield f"data: {json.dumps({'type': 'error', 'code': 'generation_failed'})}\n\n"
                raise

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
