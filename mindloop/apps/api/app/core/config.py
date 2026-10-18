from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration. Every value is overridable through the environment."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # Database
    database_url: str = "postgresql+asyncpg://mindloop:mindloop@localhost:5432/mindloop"
    db_pool_size: int = 10
    db_echo: bool = False

    # Security
    jwt_secret: str = Field(default="dev-only-change-me-dev-only-change-me", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    encryption_key: str = ""  # Fernet key; required outside development/test
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    cookie_secure: bool = False

    # Limits
    max_request_bytes: int = 64 * 1024
    max_audio_bytes: int = 8 * 1024 * 1024
    max_audio_seconds: int = 120
    rate_limit_per_minute: int = 120
    auth_rate_limit_per_minute: int = 10

    # Ollama / models (model names never appear in business logic)
    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout_seconds: float = 60.0
    ollama_keep_alive: str = "15m"
    model_chat: str = "qwen3:4b-instruct"
    model_extraction: str = "qwen3:4b-instruct"
    model_embedding: str = "nomic-embed-text"
    embedding_dim: int = 768
    llm_enabled: bool = True
    embeddings_enabled: bool = True

    # Speech to text
    model_stt: str = "base"
    stt_device: str = "cpu"
    stt_compute_type: str = "int8"
    audio_tmp_dir: str = "/tmp/mindloop-audio"  # noqa: S108 - overridden to a private volume in Docker

    # Worker
    worker_poll_seconds: float = 0.5
    worker_concurrency: int = 2
    job_max_attempts: int = 3

    # Product
    memory_summarize_every_n_messages: int = 6
    conversation_context_messages: int = 6
    pattern_min_checkins: int = 5
    metrics_enabled: bool = True
    seed_demo: bool = False  # create development users with synthetic data (never in production)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str) and not v.startswith("["):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
