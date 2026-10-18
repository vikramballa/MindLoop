"""Test setup: real PostgreSQL (pgvector) test database, migrations + seed, fake model providers.

Requires the compose Postgres (`docker compose up -d postgres`). Override with TEST_DATABASE_URL.
"""

import json
import os
import re
import uuid
from collections.abc import AsyncIterator
from typing import Any

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://mindloop:mindloop@localhost:55432/mindloop_test"
)
os.environ["ENVIRONMENT"] = "test"
os.environ["RATE_LIMIT_PER_MINUTE"] = "10000"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "10000"
os.environ["AUDIO_TMP_DIR"] = os.environ.get("AUDIO_TMP_DIR", "/tmp/mindloop-test-audio")  # noqa: S108

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402

from alembic import command  # noqa: E402
from app.ai import factory, stt  # noqa: E402
from app.ai.provider import ChatMessage, LLMError, LLMResult  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402

DIM = get_settings().embedding_dim


class FakeLLM:
    """Deterministic stand-in for Ollama. Tests can set `.reply`, `.extraction`, `.fail`."""

    name = "fake"

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = False
        self.reply = "That sounds difficult. Would you like to try a small step together?"
        self.extraction: dict[str, Any] = {
            "mood": "low",
            "stress_level": 7,
            "energy_level": 4,
            "topics": ["study_work"],
            "targets": ["procrastination", "overwhelm"],
            "triggers": ["interview"],
            "behaviors": ["avoidance"],
            "support_needed": "practical",
            "risk_level": "low",
            "reflection": "It sounds like the task feels too large to start.",
        }
        self.memory: dict[str, Any] = {"facts": [{"kind": "goal", "content": "Preparing for placement interviews"}]}

    async def generate(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        json_schema: dict | None = None,
        temperature: float = 0.3,
        max_tokens: int = 400,
    ) -> LLMResult:
        self.calls.append({"kind": "generate", "model": model, "messages": messages, "schema": json_schema})
        if self.fail:
            raise LLMError("fake failure")
        if json_schema is not None:
            title = json_schema.get("title")
            payload = self.memory if title == "MemoryExtraction" else self.extraction
            return LLMResult(json.dumps(payload), model, 1)
        return LLMResult(self.reply, model, 1)

    async def stream(
        self, *, model: str, messages: list[ChatMessage], temperature: float = 0.5, max_tokens: int = 400
    ) -> AsyncIterator[str]:
        self.calls.append({"kind": "stream", "model": model, "messages": messages})
        if self.fail:
            raise LLMError("fake failure")
        for word in re.split(r"(\s+)", self.reply):
            if word:
                yield word

    async def health(self) -> bool:
        return True

    async def embed(self, *, model: str, texts: list[str]) -> list[list[float]]:
        """Bag-of-words hashing embedding: deterministic and similarity-preserving enough for tests."""
        out = []
        for text in texts:
            vec = [0.0] * DIM
            for w in re.findall(r"[a-z]+", text.lower()):
                vec[hash(w) % DIM] += 1.0
            norm = sum(v * v for v in vec) ** 0.5 or 1.0
            out.append([v / norm for v in vec])
        return out


class FakeSTT:
    def __init__(self) -> None:
        self.text = "I have an exam tomorrow and I am stressed."

    def transcribe(self, path: str, *, language: str | None, max_seconds: int) -> stt.Transcription:
        return stt.Transcription(text=self.text, language="en", duration_seconds=3.0)


FAKE_LLM = FakeLLM()
FAKE_STT = FakeSTT()


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
async def _seed(_database: None) -> None:
    from app.seed.run import seed_interventions, seed_policies, seed_resources

    factory.set_providers(FAKE_LLM, FAKE_LLM)
    stt.set_stt(FAKE_STT)
    async with get_sessionmaker()() as db:
        await seed_interventions(db)
        await seed_policies(db)
        await seed_resources(db)


@pytest.fixture(autouse=True)
def _reset_fakes() -> None:
    FAKE_LLM.reset()
    FAKE_STT.text = "I have an exam tomorrow and I am stressed."


@pytest.fixture
def llm() -> FakeLLM:
    return FAKE_LLM


@pytest.fixture
def fake_stt() -> FakeSTT:
    return FAKE_STT


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def register(client: httpx.AsyncClient, **overrides: Any) -> dict[str, str]:
    body = {
        "email": f"u{uuid.uuid4().hex[:10]}@example.com",
        "password": "correct-horse-battery",
        "accept_terms": True,
        **overrides,
    }
    r = await client.post("/api/v1/auth/register", json=body)
    assert r.status_code == 201, r.text
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "_email": body["email"],
        "_password": body["password"],
    }


def auth(h: dict[str, str]) -> dict[str, str]:
    return {"Authorization": h["Authorization"]}


@pytest.fixture
async def user(client: httpx.AsyncClient) -> dict[str, str]:
    return await register(client)


async def drain_jobs() -> int:
    from app.workers.main import run_one

    n = 0
    while await run_one(get_sessionmaker()):
        n += 1
    return n
