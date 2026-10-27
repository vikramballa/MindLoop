"""Idempotent seeding: `python -m app.seed.run [--demo]`.

Upserts the intervention library, context policies and support resources, embeds the
interventions if the embedding model is reachable, and with --demo creates development
users with made-up check-in history.
"""

import argparse
import asyncio
import json
import random
import secrets
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.core.vocab import DEFAULT_CONSENTS
from app.db.session import get_sessionmaker
from app.models import (
    CheckIn,
    Consent,
    ContextPolicyRow,
    Intervention,
    InterventionAssignment,
    InterventionFeedback,
    Reflection,
    SafetyPlan,
    SupportResource,
    User,
    UserPreferences,
    UserProfile,
)
from app.services.embeddings import embed_missing_interventions
from app.services.patterns import PatternService

log = get_logger("seed")
DIR = Path(__file__).parent
EVIDENCE_PLACEHOLDER = (
    "UNVERIFIED — requires professional/clinical reference review before production. "
    "General technique family: {category}."
)
DEFAULT_AGES = ["18-21", "22-25", "26-30", "31+"]


def _load(name: str) -> Any:
    return json.loads((DIR / name).read_text(encoding="utf-8"))


async def seed_interventions(db: AsyncSession) -> int:
    count = 0
    for raw in _load("interventions.json"):
        values = {
            "slug": raw["slug"],
            "category": raw["category"],
            "targets": raw["targets"],
            "contexts": raw["contexts"],
            "duration_minutes": raw["duration_minutes"],
            "intensity": raw["intensity"],
            "age_ranges": raw.get("age_ranges", DEFAULT_AGES),
            "languages": raw.get("languages", ["en"]),
            "allowed_risk_levels": raw.get(
                "allowed_risk_levels", ["low", "concerning"] if raw["intensity"] == "low" else ["low"]
            ),
            "requires_professional": raw.get("requires_professional", False),
            "evidence_reference": raw.get("evidence_reference")
            or EVIDENCE_PLACEHOLDER.format(category=raw["category"]),
            "contraindications": raw.get("contraindications", []),
            "content": raw["content"],
            "version": raw.get("version", 1),
            "active": True,
        }
        existing = (await db.execute(select(Intervention).where(Intervention.slug == raw["slug"]))).scalar_one_or_none()
        if existing is None:
            db.add(Intervention(**values))
        elif existing.version != values["version"] or existing.content != values["content"]:
            for k, v in values.items():
                setattr(existing, k, v)
            existing.embedding = None  # re-embed changed content
        count += 1
    await db.commit()
    return count


async def seed_policies(db: AsyncSession) -> int:
    rows = _load("context_policies.json")
    for row in rows:
        stmt = insert(ContextPolicyRow).values(country=row["country"], language=row["language"], data=row["data"])
        await db.execute(stmt.on_conflict_do_update(constraint="uq_context_policy", set_={"data": row["data"]}))
    await db.commit()
    return len(rows)


async def seed_resources(db: AsyncSession) -> int:
    doc = _load("support_resources.json")
    compiled = date.fromisoformat(doc["compiled_on"])
    for r in doc["resources"]:
        values = {
            "country": r["country"],
            "region": r.get("region"),
            "organization": r["organization"],
            "type": r["type"],
            "phone": r.get("phone"),
            "website": r.get("website"),
            "hours": r.get("hours"),
            "languages": r.get("languages", []),
            "description": r.get("description"),
            "verification_date": compiled,
            "verification_source": r["verification_source"],
            "priority": r.get("priority", 100),
            "active": r.get("active", True),
        }
        stmt = insert(SupportResource).values(**values)
        await db.execute(
            stmt.on_conflict_do_update(
                constraint="uq_support_resource",
                set_={k: v for k, v in values.items() if k not in ("country", "organization", "phone")},
            )
        )
    await db.commit()
    return len(doc["resources"])


async def _ensure_user(db: AsyncSession, email: str, password: str, *, admin: bool, name: str | None) -> User:
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user:
        return user
    user = User(email=email, password_hash=hash_password(password), is_admin=admin)
    db.add(user)
    await db.flush()
    db.add(
        UserProfile(
            user_id=user.id,
            display_name=name,
            country="IN",
            preferred_language="en",
            age_range="22-25",
            occupation="student",
            preferred_support_style="practical",
            selected_stressors=["study_work", "sleep"],
            onboarding_completed_at=datetime.now(UTC),
        )
    )
    db.add(UserPreferences(user_id=user.id))
    for consent_type, granted in DEFAULT_CONSENTS.items():
        db.add(Consent(user_id=user.id, consent_type=consent_type, granted=granted))
    await db.flush()
    return user


async def seed_demo(db: AsyncSession) -> None:
    """Development users. All of their data is made up."""
    s = get_settings()
    if s.is_production:
        raise SystemExit("Refusing to create demo users in production")
    password = "mindloop-demo-1234"  # noqa: S105 - documented development-only credential
    demo = await _ensure_user(db, "demo@mindloop.example", password, admin=True, name="Asha")
    await _ensure_user(db, "fresh@mindloop.example", password, admin=False, name=None)
    has_history = (await db.execute(select(CheckIn.id).where(CheckIn.user_id == demo.id).limit(1))).first()
    if not has_history:
        rng = random.Random(42)  # deterministic synthetic history
        today = datetime.now(UTC).date()
        interventions = list((await db.execute(select(Intervention))).scalars())
        by_slug = {i.slug: i for i in interventions}
        for offset in range(20, 0, -1):
            day = today - timedelta(days=offset)
            study = rng.random() < 0.5
            sleep = round(rng.uniform(5.0, 6.2) if study else rng.uniform(6.8, 8.2), 1)
            stress = rng.choice([4, 5]) if study else rng.choice([2, 3])
            mood = max(1, min(5, (2 if study else 4) + rng.choice([-1, 0, 0, 1])))
            topics = ["study_work"] if study else rng.choice([["relationships"], ["social_media"], []])
            feelings = (
                rng.sample(["stressed", "overwhelmed", "tired", "anxious"], k=2)
                if study
                else (rng.sample(["calm", "hopeful", "grateful", "meh"], k=1))
            )
            if sleep < 6:
                topics = [*topics, "sleep"]
            checkin = CheckIn(
                user_id=demo.id,
                local_date=day,
                mood=mood,
                stress=stress,
                sleep_hours=sleep,
                topics=topics,
                feelings=feelings,
                source="tap",
                status="completed",
                risk_level="low",
                safety_categories=[],
            )
            db.add(checkin)
            await db.flush()
            slug = "task_breakdown_001" if study else "connection_message_001"
            item = by_slug.get(slug)
            if item and offset % 2 == 0:
                a = InterventionAssignment(
                    user_id=demo.id,
                    intervention_id=item.id,
                    intervention_version=1,
                    source_type="checkin",
                    source_id=checkin.id,
                    score=1.0,
                    reason_codes=["seed"],
                    status="completed",
                )
                db.add(a)
                await db.flush()
                rating = "a_lot" if study else rng.choice(["a_little", "not_really"])
                db.add(
                    InterventionFeedback(
                        assignment_id=a.id,
                        user_id=demo.id,
                        intervention_id=item.id,
                        rating=rating,
                        score={"a_lot": 2, "a_little": 1, "not_really": 0}[rating],
                    )
                )
                checkin.intervention_assignment_id = a.id
    await db.commit()
    await PatternService(db).recompute(demo.id)
    await seed_demo_reflections(db, demo)
    await seed_demo_community(db)


_DEMO_REFRAMES: list[dict[str, Any]] = [
    {
        "situation": "My mock interview went badly.",
        "thought": "I'm never going to get placed anywhere.",
        "evidence_for": "I froze on the second question.",
        "evidence_against": "It was a mock. I answered the first and third well, and I have six weeks left.",
        "balanced": "One rough practice run shows me what to work on. It doesn't decide the whole season.",
        "distortions": ["fortune_telling", "overgeneralizing"],
        "belief": (85, 35),
    },
    {
        "situation": "Friends made plans in the group chat without me.",
        "thought": "Nobody actually wants me around.",
        "evidence_for": "I found out after.",
        "evidence_against": "Riya called me on Sunday. The plan was made in five minutes by whoever was online.",
        "balanced": "It was probably last-minute, not a judgement about me. I can ask to join next time.",
        "distortions": ["mind_reading", "personalizing"],
        "belief": (70, 30),
    },
]
_DEMO_GRATITUDE = [
    ["Chai with Riya after class", "The rain finally stopped", "Mum's voice note"],
    ["Finished the DBMS assignment", "A stranger held the lift"],
    ["Slept eight hours", "Found my favourite pen"],
]


async def seed_demo_reflections(db: AsyncSession, demo: User) -> None:
    """A few journal entries and a sample safety plan, so Reflect has something to show."""
    if (await db.execute(select(Reflection.id).where(Reflection.user_id == demo.id).limit(1))).first():
        return
    now = datetime.now(UTC)
    for i, r in enumerate(_DEMO_REFRAMES):
        before, after = r["belief"]
        content = {k: r[k] for k in ("situation", "thought", "evidence_for", "evidence_against", "balanced")}
        db.add(
            Reflection(
                user_id=demo.id,
                kind="reframe",
                content=json.dumps(content),
                distortions=r["distortions"],
                belief_before=before,
                belief_after=after,
                risk_level="low",
                created_at=now - timedelta(days=2 + i * 5),
            )
        )
    for i, items in enumerate(_DEMO_GRATITUDE):
        db.add(
            Reflection(
                user_id=demo.id,
                kind="gratitude",
                content=json.dumps({"items": items, "why": ""}),
                distortions=[],
                risk_level="low",
                created_at=now - timedelta(days=1 + i * 3),
            )
        )
    plan = {
        "warning_signs": ["Skipping meals and staying in my room", "Not replying to anyone for a day"],
        "coping": ["Physiological sigh, five times", "Shower, then a walk round the block"],
        "distractions": ["Library cafe on the ground floor", "Calling my cousin"],
        "people": [{"name": "Riya", "phone": ""}, {"name": "Mum", "phone": ""}],
        "professionals": [{"name": "College counsellor", "phone": ""}],
        "safe_environment": ["Leave my phone outside the room at night"],
        "reasons": ["My little sister", "Seeing the mountains next summer"],
    }
    if not (await db.execute(select(SafetyPlan.id).where(SafetyPlan.user_id == demo.id))).first():
        db.add(SafetyPlan(user_id=demo.id, content=json.dumps(plan)))
    await db.commit()


DEMO_PEERS = 36
_PEER_PROFILES: list[tuple[list[int], list[str], list[str]]] = [
    # (moods, feelings, topics): roughly what a student's week might look like
    ([1, 2], ["lonely", "left_out", "sad"], ["loneliness", "relationships"]),
    ([2, 3], ["stressed", "overwhelmed", "anxious"], ["study_work", "money"]),
    ([2, 3], ["tired", "drained"], ["sleep", "study_work"]),
    ([3, 4], ["meh", "distracted"], ["social_media"]),
    ([4, 5], ["calm", "grateful", "hopeful"], ["relationships"]),
    ([2, 3], ["anxious", "self_doubt"], ["family", "health"]),
]


async def seed_demo_community(db: AsyncSession) -> None:
    """Synthetic peers with a check-in in the last day, so the anonymous community pulse has
    something to show in development. Re-run on every `migrate` to keep "today" fresh."""
    rng = random.Random()
    since = datetime.now(UTC) - timedelta(hours=20)
    today = datetime.now(UTC).date()
    for n in range(DEMO_PEERS):
        peer = await _ensure_user(
            db, f"peer-{n:02d}@mindloop.example", secrets.token_urlsafe(24), admin=False, name=None
        )
        recent = (
            await db.execute(select(CheckIn.id).where(CheckIn.user_id == peer.id, CheckIn.created_at >= since).limit(1))
        ).first()
        if recent:
            continue
        moods, feelings, topics = _PEER_PROFILES[n % len(_PEER_PROFILES)]
        db.add(
            CheckIn(
                user_id=peer.id,
                local_date=today,
                mood=rng.choice(moods),
                feelings=rng.sample(feelings, k=rng.randint(1, min(2, len(feelings)))),
                topics=rng.sample(topics, k=rng.randint(1, len(topics))),
                source="tap",
                status="completed",
                risk_level="low",
                safety_categories=[],
            )
        )
    await db.commit()


async def main(demo: bool) -> None:
    configure_logging(get_settings().log_level)
    async with get_sessionmaker()() as db:
        n_int = await seed_interventions(db)
        n_pol = await seed_policies(db)
        n_res = await seed_resources(db)
        embedded = await embed_missing_interventions(db)
        if demo:
            await seed_demo(db)
    log.info(
        "seed_complete",
        extra={"interventions": n_int, "policies": n_pol, "resources": n_res, "embedded": embedded, "demo": demo},
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="create development users with synthetic history")
    asyncio.run(main(parser.parse_args().demo or get_settings().seed_demo))
