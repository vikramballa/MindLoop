import json
import re
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai.provider import ChatMessage, LLMError, LLMResult
from app.core.logging import get_logger

log = get_logger(__name__)
_THINK = re.compile(r"<think>.*?</think>\s*", re.S)


class OllamaProvider:
    """Ollama over HTTP. Uses `format=<json schema>` for structured outputs and disables
    'thinking' for reasoning models to keep latency and token use low."""

    name = "ollama"

    def __init__(self, base_url: str, timeout: float = 60.0, keep_alive: str = "15m") -> None:
        self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=httpx.Timeout(timeout, connect=5.0))
        # Ollama accepts a duration string ("15m") or a number of seconds (-1 = forever).
        self._keep_alive: str | int = int(keep_alive) if keep_alive.lstrip("-").isdigit() else keep_alive

    def _body(self, model: str, messages: list[ChatMessage], temperature: float, max_tokens: int) -> dict[str, Any]:
        return {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "think": False,
            "keep_alive": self._keep_alive,
            "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": 4096},
        }

    async def generate(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.3,
        max_tokens: int = 400,
    ) -> LLMResult:
        body = self._body(model, messages, temperature, max_tokens) | {"stream": False}
        if json_schema is not None:
            body["format"] = json_schema
        start = time.perf_counter()
        try:
            resp = await self._client.post("/api/chat", json=body)
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning(
                "llm_call_failed", extra={"provider": self.name, "model": model, "error_type": type(exc).__name__}
            )
            raise LLMError(type(exc).__name__) from exc
        latency = int((time.perf_counter() - start) * 1000)
        log.info(
            "llm_call",
            extra={
                "provider": self.name,
                "model": model,
                "latency_ms": latency,
                "structured": json_schema is not None,
                "completion_tokens": data.get("eval_count"),
            },
        )
        return LLMResult(
            text=_THINK.sub("", data.get("message", {}).get("content", "")).strip(),
            model=model,
            latency_ms=latency,
            prompt_tokens=data.get("prompt_eval_count"),
            completion_tokens=data.get("eval_count"),
        )

    async def stream(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        temperature: float = 0.5,
        max_tokens: int = 400,
    ) -> AsyncIterator[str]:
        body = self._body(model, messages, temperature, max_tokens) | {"stream": True}
        start = time.perf_counter()
        try:
            async with self._client.stream("POST", "/api/chat", json=body) as resp:
                resp.raise_for_status()
                in_think = False
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    piece = chunk.get("message", {}).get("content") or ""
                    # Never stream hidden reasoning from "thinking" models.
                    if "<think>" in piece:
                        in_think, piece = True, piece.split("<think>", 1)[0]
                    if in_think and "</think>" in piece:
                        in_think, piece = False, piece.split("</think>", 1)[1].lstrip()
                    if piece and not in_think:
                        yield piece
                    if chunk.get("done"):
                        break
        except (httpx.HTTPError, ValueError) as exc:
            log.warning(
                "llm_stream_failed", extra={"provider": self.name, "model": model, "error_type": type(exc).__name__}
            )
            raise LLMError(type(exc).__name__) from exc
        log.info(
            "llm_stream",
            extra={"provider": self.name, "model": model, "latency_ms": int((time.perf_counter() - start) * 1000)},
        )

    async def embed(self, *, model: str, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        start = time.perf_counter()
        try:
            resp = await self._client.post(
                "/api/embed", json={"model": model, "input": texts, "keep_alive": self._keep_alive}
            )
            resp.raise_for_status()
            vectors = resp.json()["embeddings"]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            log.warning("embed_failed", extra={"model": model, "error_type": type(exc).__name__})
            raise LLMError(type(exc).__name__) from exc
        log.info(
            "embed_call",
            extra={"model": model, "batch": len(texts), "latency_ms": int((time.perf_counter() - start) * 1000)},
        )
        return [list(map(float, v)) for v in vectors]

    async def health(self) -> bool:
        try:
            resp = await self._client.get("/api/version", timeout=3.0)
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def aclose(self) -> None:
        await self._client.aclose()
