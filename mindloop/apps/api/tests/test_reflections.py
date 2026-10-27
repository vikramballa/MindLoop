"""Reflections (thought reframes, three good things) and the personal safety plan."""

import httpx
from sqlalchemy import select, text

from app.db.session import get_sessionmaker
from app.models import Reflection, SafetyEvent
from tests.conftest import FakeLLM, auth, register

API = "/api/v1"

REFRAME = {
    "kind": "reframe",
    "situation": "My manager didn't reply to my message.",
    "thought": "She thinks my work is useless.",
    "belief_before": 80,
    "distortions": ["mind_reading", "catastrophizing", "mind_reading"],
    "evidence_for": "She was short with me last week.",
    "evidence_against": "She praised my report on Monday and she's in meetings all day.",
    "balanced": "She's probably busy. One slow reply doesn't say anything about my work.",
    "belief_after": 30,
}


async def test_reframe_round_trip_is_encrypted_and_uses_no_llm(
    client: httpx.AsyncClient, user: dict, llm: FakeLLM
) -> None:
    r = await client.post(f"{API}/reflections", json=REFRAME, headers=auth(user))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["support"] is None
    out = d["reflection"]
    assert out["kind"] == "reframe" and out["thought"] == REFRAME["thought"]
    assert out["distortions"] == ["mind_reading", "catastrophizing"]  # deduplicated, order kept
    assert out["belief_before"] == 80 and out["belief_after"] == 30
    assert llm.calls == []

    # The text is encrypted at rest: the raw column never contains what the user wrote.
    async with get_sessionmaker()() as db:
        raw = (await db.execute(text("SELECT content FROM reflections WHERE id = :id"), {"id": out["id"]})).scalar()
    assert raw and "manager" not in raw and "useless" not in raw

    listed = (await client.get(f"{API}/reflections", headers=auth(user))).json()
    assert [x["id"] for x in listed] == [out["id"]]
    assert listed[0]["balanced"] == REFRAME["balanced"]


async def test_gratitude_and_stats(client: httpx.AsyncClient, user: dict) -> None:
    body = {"kind": "gratitude", "items": ["Chai with Riya", "  ", "Finished the assignment"], "why": "I made time"}
    r = await client.post(f"{API}/reflections", json=body, headers=auth(user))
    assert r.status_code == 201
    assert r.json()["reflection"]["items"] == ["Chai with Riya", "Finished the assignment"]
    await client.post(f"{API}/reflections", json=REFRAME, headers=auth(user))
    await client.post(
        f"{API}/reflections", json={**REFRAME, "belief_before": 60, "belief_after": 50}, headers=auth(user)
    )

    s = (await client.get(f"{API}/reflections/stats", headers=auth(user))).json()
    assert s["reframes"] == 2 and s["gratitude"] == 1 and s["gratitude_items"] == 2
    assert s["avg_belief_shift"] == 30.0  # (50 + 10) / 2
    assert s["top_distortions"][:2] == ["mind_reading", "catastrophizing"]

    only = (await client.get(f"{API}/reflections", params={"kind": "gratitude"}, headers=auth(user))).json()
    assert [x["kind"] for x in only] == ["gratitude"]


async def test_reflection_validation(client: httpx.AsyncClient, user: dict) -> None:
    bad = [
        {"kind": "reframe", "thought": "   "},
        {"kind": "reframe", "thought": "x", "belief_before": 140},
        {"kind": "reframe", "thought": "x", "distortions": ["not_a_trap"]},
        {
            "kind": "reframe",
            "thought": "x",
            "distortions": ["labeling", "comparing", "mind_reading", "fortune_telling", "mental_filter"],
        },  # noqa: E501
        {"kind": "gratitude", "items": []},
        {"kind": "gratitude", "items": ["", " "]},
        {"kind": "gratitude", "items": ["a", "b", "c", "d"]},
        {"kind": "diary", "text": "hi"},
    ]
    for body in bad:
        r = await client.post(f"{API}/reflections", json=body, headers=auth(user))
        assert r.status_code == 422, body


async def test_high_risk_reflection_shows_reviewed_support_and_logs_event(
    client: httpx.AsyncClient, user: dict, llm: FakeLLM
) -> None:
    body = {**REFRAME, "thought": "I want to kill myself tonight."}
    d = (await client.post(f"{API}/reflections", json=body, headers=auth(user))).json()
    assert d["support"]["level"] == "high" and d["support"]["allow_continue"] is False
    assert {"14416", "112"} <= {res["phone"] for res in d["support"]["resources"]}
    assert llm.calls == []
    async with get_sessionmaker()() as db:
        row = (await db.execute(select(Reflection).where(Reflection.id == d["reflection"]["id"]))).scalar_one()
        assert row.risk_level == "high"
        event = (await db.execute(select(SafetyEvent).where(SafetyEvent.source_id == row.id))).scalar_one()
        assert event.source_type == "reflection" and event.action_taken == "crisis_support_shown"


async def test_reflections_respect_journal_consent(client: httpx.AsyncClient, user: dict) -> None:
    await client.post(f"{API}/reflections", json=REFRAME, headers=auth(user))
    # Withdrawing the journal consent deletes existing reflections and stops new ones being kept.
    await client.put(f"{API}/privacy/consents/store_journal", json={"granted": False}, headers=auth(user))
    assert (await client.get(f"{API}/reflections", headers=auth(user))).json() == []
    r = await client.post(f"{API}/reflections", json=REFRAME, headers=auth(user))
    assert r.status_code == 403 and r.json()["error"]["code"] == "journal_off"


async def test_reflections_are_private_and_deletable(client: httpx.AsyncClient, user: dict) -> None:
    other = await register(client)
    rid = (await client.post(f"{API}/reflections", json=REFRAME, headers=auth(user))).json()["reflection"]["id"]
    assert (await client.get(f"{API}/reflections", headers=auth(other))).json() == []
    assert (await client.delete(f"{API}/reflections/{rid}", headers=auth(other))).status_code == 404
    assert (await client.delete(f"{API}/reflections/{rid}", headers=auth(user))).status_code == 204
    assert (await client.delete(f"{API}/reflections/{rid}", headers=auth(user))).status_code == 404


PLAN = {
    "warning_signs": ["Not replying to anyone", " ", "Staying up past 3am"],
    "coping": ["Cold water on my face", "Box breathing"],
    "distractions": ["The library cafe"],
    "people": [{"name": "Riya", "phone": "+91 98000 00000"}],
    "professionals": [{"name": "College counsellor", "phone": "0000"}],
    "safe_environment": ["Give my meds to my sister"],
    "reasons": ["My dog", "Seeing the ocean"],
}


async def test_safety_plan_round_trip_without_triggering_crisis_flow(client: httpx.AsyncClient, user: dict) -> None:
    empty = (await client.get(f"{API}/safety-plan", headers=auth(user))).json()
    assert empty["updated_at"] is None and empty["coping"] == [] and empty["people"] == []

    # Warning signs naturally mention crisis words; the plan is not risk-classified.
    plan = {**PLAN, "warning_signs": [*PLAN["warning_signs"], "Thinking about suicide"]}
    r = await client.put(f"{API}/safety-plan", json=plan, headers=auth(user))
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["warning_signs"] == ["Not replying to anyone", "Staying up past 3am", "Thinking about suicide"]
    assert saved["updated_at"]

    got = (await client.get(f"{API}/safety-plan", headers=auth(user))).json()
    assert got["people"] == PLAN["people"] and got["reasons"] == PLAN["reasons"]

    async with get_sessionmaker()() as db:
        raw = (await db.execute(text("SELECT content FROM safety_plans"))).scalars().all()
    assert raw and all("Riya" not in x for x in raw)

    # Saving again replaces the plan rather than adding a second one.
    r = await client.put(f"{API}/safety-plan", json={"coping": ["Walk"]}, headers=auth(user))
    assert r.json()["coping"] == ["Walk"] and r.json()["people"] == []

    assert (await client.delete(f"{API}/safety-plan", headers=auth(user))).status_code == 204
    assert (await client.get(f"{API}/safety-plan", headers=auth(user))).json()["updated_at"] is None


async def test_safety_plan_validation(client: httpx.AsyncClient, user: dict) -> None:
    for body in (
        {"coping": ["x"] * 11},
        {"people": [{"name": "", "phone": "1"}]},
        {"reasons": ["x" * 301]},
    ):
        assert (await client.put(f"{API}/safety-plan", json=body, headers=auth(user))).status_code == 422, body


async def test_export_and_scoped_deletion_cover_new_data(client: httpx.AsyncClient, user: dict) -> None:
    await client.post(f"{API}/reflections", json=REFRAME, headers=auth(user))
    await client.put(f"{API}/safety-plan", json=PLAN, headers=auth(user))
    data = (await client.get(f"{API}/privacy/export", headers=auth(user))).json()
    assert data["reflections"][0]["thought"] == REFRAME["thought"]
    assert data["safety_plan"]["reasons"] == PLAN["reasons"]

    r = await client.delete(f"{API}/privacy/data/reflections", headers=auth(user))
    assert r.json()["deleted"] == 1
    r = await client.delete(f"{API}/privacy/data/safety_plan", headers=auth(user))
    assert r.json()["deleted"] == 1
    data = (await client.get(f"{API}/privacy/export", headers=auth(user))).json()
    assert data["reflections"] == [] and data["safety_plan"] is None


async def test_deleting_account_removes_reflections_and_plan(client: httpx.AsyncClient) -> None:
    h = await register(client)
    rid = (await client.post(f"{API}/reflections", json=REFRAME, headers=auth(h))).json()["reflection"]["id"]
    await client.put(f"{API}/safety-plan", json=PLAN, headers=auth(h))
    r = await client.post(f"{API}/privacy/delete-account", json={"password": h["_password"]}, headers=auth(h))
    assert r.status_code == 204
    async with get_sessionmaker()() as db:
        assert (await db.execute(select(Reflection).where(Reflection.id == rid))).scalar_one_or_none() is None
