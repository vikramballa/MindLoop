"""Background worker: `python -m app.workers.main`.

Runs a few concurrent loops that claim jobs from PostgreSQL. Expensive things like the
Whisper model and HTTP clients are created once per process. Every handler is idempotent,
so retrying a job is always safe.
"""

import asyncio
import contextlib
import signal
import time
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import get_sessionmaker
from app.models import Job
from app.services.checkins import CheckInService
from app.services.embeddings import embed_missing_interventions
from app.services.memory import MemoryService
from app.services.patterns import PatternService
from app.services.voice import VoiceService
from app.workers import queue

log = get_logger("worker")
HEARTBEAT = Path("/tmp/mindloop-worker-heartbeat")  # noqa: S108 - liveness file for the container health check

Handler = Callable[[AsyncSession, dict], Awaitable[None]]


async def _process_checkin(db: AsyncSession, p: dict) -> None:
    await CheckInService(db).process(uuid.UUID(p["checkin_id"]))


async def _process_voice(db: AsyncSession, p: dict) -> None:
    await VoiceService(db).process(uuid.UUID(p["voice_id"]))


async def _recompute_patterns(db: AsyncSession, p: dict) -> None:
    await PatternService(db).recompute(uuid.UUID(p["user_id"]))


async def _summarize_memory(db: AsyncSession, p: dict) -> None:
    await MemoryService(db).summarize_session(uuid.UUID(p["session_id"]))


HANDLERS: dict[str, Handler] = {
    "process_checkin": _process_checkin,
    "process_voice": _process_voice,
    "recompute_patterns": _recompute_patterns,
    "summarize_memory": _summarize_memory,
}

# Called when a job exhausts its retries, so the user never waits forever.
ON_FINAL_FAILURE: dict[str, Handler] = {
    "process_checkin": lambda db, p: CheckInService(db).mark_failed(uuid.UUID(p["checkin_id"])),
    "process_voice": lambda db, p: VoiceService(db).mark_failed(uuid.UUID(p["voice_id"])),
}


async def run_one(db_factory: Callable[[], AsyncSession]) -> bool:
    """Claims and runs one job. Returns False if the queue was empty."""
    s = get_settings()
    async with db_factory() as db:
        job = await queue.claim(db)
        if job is None:
            return False
        job_id, kind, payload = job.id, job.kind, dict(job.payload)
    start = time.perf_counter()
    try:
        async with db_factory() as db:
            await HANDLERS[kind](db, payload)
        async with db_factory() as db:
            await queue.finish(db, job_id, int((time.perf_counter() - start) * 1000))
        log.info("job_done", extra={"kind": kind, "duration_ms": int((time.perf_counter() - start) * 1000)})
    except Exception as exc:  # noqa: BLE001 - classify and retry
        log.warning("job_error", extra={"kind": kind, "error_type": type(exc).__name__})
        async with db_factory() as db:
            claimed = await db.get(Job, job_id)
            final = claimed is not None and await queue.fail(db, claimed, type(exc).__name__, s.job_max_attempts)
        if final and kind in ON_FINAL_FAILURE:
            try:
                async with db_factory() as db:
                    await ON_FINAL_FAILURE[kind](db, payload)
            except Exception as fallback_exc:  # noqa: BLE001
                log.error("job_fallback_failed", extra={"kind": kind, "error_type": type(fallback_exc).__name__})
    return True


async def _loop(stop: asyncio.Event, worker_no: int) -> None:
    s = get_settings()
    factory = get_sessionmaker()
    while not stop.is_set():
        try:
            had_job = await run_one(factory)
        except Exception as exc:  # noqa: BLE001 - e.g. database temporarily unavailable
            log.error("worker_loop_error", extra={"worker": worker_no, "error_type": type(exc).__name__})
            had_job = False
            await asyncio.sleep(2)
        if not had_job:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=s.worker_poll_seconds)


async def _maintenance(stop: asyncio.Event) -> None:
    factory = get_sessionmaker()
    last_purge = 0.0
    while not stop.is_set():
        await asyncio.to_thread(HEARTBEAT.write_text, str(int(time.time())))
        now = time.monotonic()
        if now - last_purge > 600:
            try:
                async with factory() as db:
                    purged = await VoiceService(db).purge_stale_transcripts()
                async with factory() as db:
                    embedded = await embed_missing_interventions(db)
                log.info("maintenance", extra={"transcripts_purged": purged, "interventions_embedded": embedded})
                last_purge = now
            except Exception as exc:  # noqa: BLE001
                log.error("maintenance_error", extra={"error_type": type(exc).__name__})
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=15)


async def main() -> None:
    s = get_settings()
    configure_logging(s.log_level)
    await asyncio.to_thread(Path(s.audio_tmp_dir).mkdir, parents=True, exist_ok=True, mode=0o700)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    log.info("worker_started", extra={"concurrency": s.worker_concurrency, "stt_model": s.model_stt})
    await asyncio.gather(_maintenance(stop), *(_loop(stop, i) for i in range(s.worker_concurrency)))
    log.info("worker_stopped")


if __name__ == "__main__":
    asyncio.run(main())
