import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.repositories.users import UserRepository
from app.services.errors import Forbidden, Unauthorized

DB = Annotated[AsyncSession, Depends(get_db)]


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    is_admin: bool


async def current_user(db: DB, authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized(code="missing_token")
    try:
        payload = decode_access_token(authorization[7:])
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise Unauthorized(code="invalid_token") from exc
    repo = UserRepository(db)
    user = await repo.get(user_id)
    if user is None:
        raise Unauthorized(code="invalid_token")
    now = datetime.now(UTC)
    if user.last_active_at is None or now - user.last_active_at > timedelta(minutes=10):
        await repo.touch_active(user.id, now)
        await db.commit()
    return CurrentUser(id=user.id, is_admin=user.is_admin)


async def admin_user(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if not user.is_admin:
        raise Forbidden()
    return user


User = Annotated[CurrentUser, Depends(current_user)]
Admin = Annotated[CurrentUser, Depends(admin_user)]
