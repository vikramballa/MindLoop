"""Pure-ASGI middleware (works with streaming responses): request ids + timing, security
headers, request-size limits and a simple per-client rate limit."""

import re
import time
import uuid
from collections import defaultdict, deque

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.core.logging import get_logger, request_id_var

log = get_logger("http")
_RID = re.compile(r"^[A-Za-z0-9-]{8,64}$")

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), geolocation=(), microphone=(self)"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    (b"cache-control", b"no-store"),
]


def _header(scope: Scope, name: bytes) -> str | None:
    for k, v in scope.get("headers", []):
        if k == name:
            return v.decode("latin-1")
    return None


def _client_key(scope: Scope) -> str:
    fwd = _header(scope, b"x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = _header(scope, b"x-request-id")
        rid = incoming if incoming and _RID.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(rid)
        start = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", rid.encode()))
                existing = {k for k, _ in headers}
                is_docs = scope.get("path", "").startswith(("/docs", "/openapi.json"))
                headers.extend(
                    h
                    for h in SECURITY_HEADERS
                    if h[0] not in existing and not (is_docs and h[0] == b"content-security-policy")
                )
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            if path not in ("/health", "/ready"):
                # Route template only (no query strings, no bodies).
                route = scope.get("route")
                log.info(
                    "request",
                    extra={
                        "method": scope.get("method"),
                        "route": getattr(route, "path", path),
                        "status": status,
                        "latency_ms": round((time.perf_counter() - start) * 1000, 1),
                    },
                )
            request_id_var.reset(token)


class BodySizeLimitMiddleware:
    """Rejects bodies over the limit. Multipart audio uploads get the (larger) audio limit."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        s = get_settings()
        is_upload = scope.get("path", "").endswith("/voice")
        limit = s.max_audio_bytes + 64 * 1024 if is_upload else s.max_request_bytes
        declared = _header(scope, b"content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            await _reject(send, 413, b'{"error":{"code":"payload_too_large","message":"Request is too large"}}')
            return
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _TooLarge:
            await _reject(send, 413, b'{"error":{"code":"payload_too_large","message":"Request is too large"}}')


class _TooLarge(Exception):
    pass


class RateLimitMiddleware:
    """Sliding-window limiter per client IP (per process). Stricter limits for auth endpoints.
    For multi-instance deployments move this to a shared store (PostgreSQL/Redis)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") in ("/health", "/ready"):
            await self.app(scope, receive, send)
            return
        s = get_settings()
        path = scope.get("path", "")
        is_auth = "/auth/login" in path or "/auth/register" in path
        limit = s.auth_rate_limit_per_minute if is_auth else s.rate_limit_per_minute
        key = f"{'auth' if is_auth else 'api'}:{_client_key(scope)}"
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= limit:
            await _reject(
                send,
                429,
                b'{"error":{"code":"rate_limited","message":"Too many requests. Please slow down."}}',
                extra=[(b"retry-after", b"60")],
            )
            return
        window.append(now)
        if len(self._hits) > 50_000:  # bound memory
            self._hits.clear()
        await self.app(scope, receive, send)


async def _reject(send: Send, status: int, body: bytes, extra: list[tuple[bytes, bytes]] | None = None) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), *(extra or [])],
        }
    )
    await send({"type": "http.response.body", "body": body})
