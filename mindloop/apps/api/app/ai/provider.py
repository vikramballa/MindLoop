"""Model-provider abstractions. Business logic depends only on these interfaces."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol


class ModelTask(StrEnum):
    EXTRACTION = "extraction"
    FINAL_RESPONSE = "final_response"
    EMBEDDING = "embedding"


@dataclass(frozen=True)
class ChatMessage:
    role: str  # system | user | assistant
    content: str


@dataclass
class LLMResult:
    text: str
    model: str
    latency_ms: int
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class LLMError(RuntimeError):
    """Raised for any provider failure. Callers must fall back to deterministic behaviour."""


class LLMProvider(Protocol):
    name: str

    async def generate(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.3,
        max_tokens: int = 400,
    ) -> LLMResult: ...

    def stream(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        temperature: float = 0.5,
        max_tokens: int = 400,
    ) -> AsyncIterator[str]: ...

    async def health(self) -> bool: ...


class EmbeddingProvider(Protocol):
    async def embed(self, *, model: str, texts: list[str]) -> list[list[float]]: ...
