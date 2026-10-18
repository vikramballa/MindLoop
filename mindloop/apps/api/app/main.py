from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.ai.factory import get_llm
from app.api.v1 import (
    analytics,
    auth,
    checkins,
    conversations,
    interventions,
    meta,
    patterns,
    privacy,
    profile,
    resources,
    safety,
    voice,
)
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.middleware import BodySizeLimitMiddleware, RateLimitMiddleware, RequestContextMiddleware
from app.db.session import get_engine
from app.services.errors import DomainError

log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    configure_logging(s.log_level)
    log.info(
        "startup",
        extra={
            "environment": s.environment,
            "model_chat": s.model_chat,
            "model_extraction": s.model_extraction,
            "model_embedding": s.model_embedding,
        },
    )
    yield
    await get_engine().dispose()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="MindLoop API",
        version="0.1.0",
        description="Privacy-first wellbeing companion API. Not a medical device; performs no diagnosis.",
        lifespan=lifespan,
        docs_url=None if s.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if s.is_production else "/openapi.json",
    )

    # Starlette runs the last-added middleware first.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"error": {"code": exc.code, "message": str(exc)}}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Return field locations and messages only. Echoing the submitted values could leak sensitive text.
        details = [{"loc": [str(p) for p in e["loc"]], "msg": e["msg"]} for e in exc.errors()]
        return JSONResponse(
            {"error": {"code": "invalid_input", "message": "Invalid request", "details": details}}, status_code=422
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_error", extra={"error_type": type(exc).__name__})
        return JSONResponse({"error": {"code": "internal_error", "message": "Something went wrong"}}, status_code=500)

    @app.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready", tags=["ops"])
    async def ready() -> JSONResponse:
        checks: dict[str, str] = {}
        try:
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks["database"] = f"error:{type(exc).__name__}"
        # A missing LLM doesn't make us unready: every feature has a rule-based fallback.
        checks["llm"] = "ok" if (not s.llm_enabled or await get_llm().health()) else "degraded"
        ok = checks["database"] == "ok"
        return JSONResponse(
            {"status": "ready" if ok else "not_ready", "checks": checks}, status_code=200 if ok else 503
        )

    v1 = APIRouter(prefix="/api/v1")
    for module in (
        auth,
        profile,
        checkins,
        interventions,
        conversations,
        voice,
        patterns,
        safety,
        resources,
        privacy,
        analytics,
        meta,
    ):
        v1.include_router(module.router)
    app.include_router(v1)
    return app


app = create_app()
