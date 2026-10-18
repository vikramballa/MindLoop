"""Decides which provider and which model handle each task. Nothing else should hard-code a model."""

from functools import lru_cache

from app.ai.ollama import OllamaProvider
from app.ai.provider import EmbeddingProvider, LLMProvider, ModelTask
from app.core.config import Settings, get_settings


class ModelRouter:
    def __init__(self, settings: Settings) -> None:
        self._map = {
            ModelTask.EXTRACTION: settings.model_extraction,
            ModelTask.FINAL_RESPONSE: settings.model_chat,
            ModelTask.EMBEDDING: settings.model_embedding,
        }

    def model_for(self, task: ModelTask) -> str:
        return self._map[task]


@lru_cache
def _ollama() -> OllamaProvider:
    s = get_settings()
    return OllamaProvider(s.ollama_base_url, timeout=s.ollama_timeout_seconds, keep_alive=s.ollama_keep_alive)


_override_llm: LLMProvider | None = None
_override_embed: EmbeddingProvider | None = None


def get_llm() -> LLMProvider:
    return _override_llm or _ollama()


def get_embedder() -> EmbeddingProvider:
    return _override_embed or _ollama()


def set_providers(llm: LLMProvider | None, embedder: EmbeddingProvider | None) -> None:
    """Swap in different providers. Tests use this to install fakes."""
    global _override_llm, _override_embed
    _override_llm, _override_embed = llm, embedder


@lru_cache
def get_router() -> ModelRouter:
    return ModelRouter(get_settings())
