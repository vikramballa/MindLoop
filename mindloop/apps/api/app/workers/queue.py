"""PostgreSQL job queue: enqueue inside the caller's transaction (so jobs exist iff the data
does), claim with FOR UPDATE SKIP LOCKED, retry with backoff, idempotency keys."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job

STALE_LOCK = timedelta(minutes=10)


async def enqueue(
    db: AsyncSession, kind: str, payload: dict[str, Any], idempotency_key: str | None = None, delay_seconds: float = 0
) -> None:
    """The payload should hold ids only, never user content."""
    stmt = insert(Job).values(
        id=uuid.uuid4(),
        kind=kind,
        payload=payload,
        status="queued",
        attempts=0,
        run_after=datetime.now(UTC) + timedelta(seconds=delay_seconds),
        idempotency_key=idempotency_key,
    )
    if idempotency_key:
        stmt = stmt.on_conflict_do_nothing(index_elements=["idempotency_key"])
    await db.execute(stmt)


async def claim(db: AsyncSession) -> Job | None:
    now = datetime.now(UTC)
    stmt = (
        select(Job)
        .where(
            ((Job.status == "queued") & (Job.run_after <= now))
            | ((Job.status == "running") & (Job.locked_at < now - STALE_LOCK))
        )
        .order_by(Job.run_after)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = (await db.execute(stmt)).scalar_one_or_none()
    if job is None:
        return None
    job.status = "running"
    job.locked_at = now
    job.attempts += 1
    await db.commit()
    return job


async def finish(db: AsyncSession, job_id: uuid.UUID, duration_ms: int) -> None:
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status="done", finished_at=datetime.now(UTC), duration_ms=duration_ms, last_error_type=None)
    )
    await db.commit()


async def fail(db: AsyncSession, job: Job, error_type: str, max_attempts: int) -> bool:
    """Returns True if the job is permanently failed."""
    final = job.attempts >= max_attempts
    await db.execute(
        update(Job)
        .where(Job.id == job.id)
        .values(
            status="failed" if final else "queued",
            last_error_type=error_type[:80],
            run_after=datetime.now(UTC) + timedelta(seconds=2**job.attempts),
            finished_at=datetime.now(UTC) if final else None,
        )
    )
    await db.commit()
    return final
