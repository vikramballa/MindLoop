"""Structured JSON logging that keeps user content out of the logs.

Never log message bodies, journal text, transcripts, audio, passwords or tokens.
`SensitiveDataFilter` redacts known-sensitive keys passed through `extra=` as a backstop,
but callers should only ever log ids, counts and timings.
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

SENSITIVE_KEYS = frozenset(
    {
        "password",
        "token",
        "access_token",
        "refresh_token",
        "authorization",
        "cookie",
        "text",
        "note",
        "content",
        "message",
        "transcript",
        "audio",
        "body",
        "journal",
        "email",
        "fact",
        "prompt",
        "response",
    }
)

_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


def _redact(value: Any, key: str | None = None) -> Any:
    if key is not None and key.lower() in SENSITIVE_KEYS:
        return "[REDACTED]"
    if isinstance(value, dict):
        return {k: _redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_redact(v) for v in value]
    return value


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key not in _RESERVED:
                record.__dict__[key] = _redact(record.__dict__[key], key)
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        if rid := request_id_var.get():
            payload["request_id"] = rid
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            # Exception type only: messages can echo user content.
            payload["error_type"] = record.exc_info[0].__name__
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SensitiveDataFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for noisy in ("uvicorn.access", "httpx", "httpcore", "faster_whisper"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    # uvicorn installs its own handlers; route them through ours.
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
