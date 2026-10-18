"""Embedding + retrieval. Embeddings are optional: if the model is unavailable every caller
falls back to deterministic behaviour, so retrieval never blocks the core loop."""

import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.factory import get_embedder, get_router
from app.ai.provider import LLMError, ModelTask
from app.core.config import get_settings
from app.core.logging import get_logger
from app.repositories.interventions import InterventionRepository

log = get_logger(__name__)

# Short in-process cool-down after a failure so we don't retry a down service on every request.
_COOLDOWN_SECONDS = 30.0
_last_failure = 0.0


class EmbeddingService:
    async def embed(self, texts: list[str]) -> list[list[float]] | None:
        global _last_failure
        s = get_settings()
        if not s.embeddings_enabled or not texts or time.monotonic() - _last_failure < _COOLDOWN_SECONDS:
            return None
        try:
            vectors = await get_embedder().embed(model=get_router().model_for(ModelTask.EMBEDDING), texts=texts)
        except LLMError:
            _last_failure = time.monotonic()
            return None
        if any(len(v) != s.embedding_dim for v in vectors):
            log.error("embedding_dim_mismatch", extra={"expected": s.embedding_dim, "got": len(vectors[0])})
            return None
        return vectors

    async def embed_one(self, text: str) -> list[float] | None:
        vectors = await self.embed([text])
        return vectors[0] if vectors else None


def intervention_document(slug: str, category: str, targets: list[str], content: dict) -> str:
    en = content.get("en", {})
    return f"{en.get('title', slug)}. {en.get('summary', '')} Helps with: {', '.join(targets)}. Category: {category}."


async def embed_missing_interventions(db: AsyncSession) -> int:
    """Batch-embed interventions without vectors (idempotent; run at seed time / by the worker)."""
    repo = InterventionRepository(db)
    items = await repo.missing_embeddings()
    if not items:
        return 0
    vectors = await EmbeddingService().embed(
        [intervention_document(i.slug, i.category, i.targets, i.content) for i in items]
    )
    if vectors is None:
        return 0
    for item, vec in zip(items, vectors, strict=True):
        item.embedding = vec
    await db.commit()
    return len(items)
