"""Assistant IA : boucle outil/validation avec un faux client Anthropic, routes, limite de demandes."""

from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select

from app import assistant as mod
from app import schemas as sc
from app.db import SessionLocal
from app.models import AssistantCall, Household, Night, Person, Presence, Stay


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def make_stay(db, alice="Alice", bob="Bob") -> tuple[Stay, Household, Person, Person]:
    stay = Stay(
        name="Toussaint",
        slug="assistant-test",
        admin_key="k",
        start_date=date(2026, 10, 30),
        end_date=date(2026, 11, 1),
        first_meal="dinner",
        last_meal="lunch",
    )
    db.add(stay)
    db.flush()
    home = Household(stay_id=stay.id, name="")
    db.add(home)
    db.flush()
    a = Person(stay_id=stay.id, household_id=home.id, name=alice, kind="adult")
    b = Person(stay_id=stay.id, household_id=home.id, name=bob, kind="adult")
    db.add_all([a, b])
    db.commit()
    return stay, home, a, b


def text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def tool_block(*, name: str = "propose_household_presences", members: list | None = None, raw: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", id="toolu_01", name=name, input={"members": members} if raw is None else raw)


def answer(*blocks: SimpleNamespace, stop_reason: str | None = None) -> SimpleNamespace:
    if stop_reason is None:
        stop_reason = "tool_use" if any(b.type == "tool_use" for b in blocks) else "end_turn"
    return SimpleNamespace(content=list(blocks), stop_reason=stop_reason)


class FakeClient:
    """Faux client Anthropic : renvoie les réponses à la suite et mémorise les appels."""

    def __init__(self, responses: list) -> None:
        self.responses = list(responses)
        self.messages = self
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


VALID_MEMBERS = lambda ids: [
    {"person_id": ids[0], "slots": [{"date": "2026-10-30", "meal": "dinner"}]},
    {"person_id": ids[1], "slots": [{"date": "2026-10-30", "meal": "dinner"}]},
]
OUT_OF_STAY = lambda id: [{"person_id": id, "slots": [{"date": "2027-01-01", "meal": "lunch"}]}]


def tool_results_of(fake, call: int) -> list[dict]:
    """Premier message de « tool_result » renvoyé à Claude (le tableau messages est muté ensuite)."""
    for msg in fake.calls[call]["messages"]:
        content = msg["content"]
        if msg["role"] == "user" and isinstance(content, list):
            return content
    raise AssertionError("aucun tool_result dans les messages")


def tool_result_of(fake, call: int) -> dict:
    return tool_results_of(fake, call)[0]


# --- Boucle outil / validation -------------------------------------------------


def test_text_only_reply(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    db.add(Person(stay_id=stay.id, household_id=alice.household_id, name="Léo", kind="child"))
    db.commit()
    fake = FakeClient([answer(text_block("Dis-moi !"))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Salut"), fake)
    assert out.text == "Dis-moi !" and out.actions == []
    assert ": Léo (enfant) — repas : aucun ; nuits : aucune" in fake.calls[0]["system"]


def test_valid_proposal_then_summary(db) -> None:
    stay, _h, alice, bob = make_stay(db)
    db.add(Presence(person_id=alice.id, date=date(2026, 10, 30), meal="dinner"))
    db.commit()
    fake = FakeClient(
        [
            answer(text_block("Voici."), tool_block(members=VALID_MEMBERS([alice.id, bob.id]))),
            answer(text_block("Alice et Bob dînent vendredi.")),
        ]
    )
    out = mod.assistant_reply(
        db, stay, sc.AssistantIn(person_id=alice.id, message="On mange vendredi soir ?", history=["Bonjour", "Salut"]), fake
    )
    assert out.text == "Alice et Bob dînent vendredi."
    assert [(a.name, a.slots[0].date, a.slots[0].meal) for a in out.actions] == [
        ("Alice", date(2026, 10, 30), "dinner"),
        ("Bob", date(2026, 10, 30), "dinner"),
    ]
    first = fake.calls[0]
    assert first["model"] == "claude-sonnet-5-5"
    assert first["output_config"] == {"effort": "low"}
    assert [t["name"] for t in first["tools"]] == ["propose_household_presences"]
    assert "ven 30/10 dîner" in first["system"] and "dim 01/11 petit-déjeuner" in first["system"]
    assert "Tu parles avec Alice." in first["system"]
    assert f"person_id {alice.id} : Alice — repas : ven 30/10 dîner ; nuits : aucune" in first["system"]
    assert f"person_id {bob.id} : Bob — repas : aucun ; nuits : aucune" in first["system"]
    assert "- nuit du ven. 30/10 (2026-10-30)" in first["system"] and "- nuit du sam. 31/10 (2026-10-31)" in first["system"]
    assert first["messages"][0]["role"] == "user" and first["messages"][1]["role"] == "assistant"  # historique alterné
    feedback = tool_result_of(fake, 1)
    assert feedback["content"] == mod.PENDING_TEXT and feedback["is_error"] is False


def test_nights_explicit_or_following_meals(db) -> None:
    """Nuits données par Claude (arrivée après le dîner), ou à défaut déduites du changement de repas."""
    stay, _h, alice, bob = make_stay(db)
    db.add(Night(person_id=alice.id, date=date(2026, 10, 31)))
    db.commit()
    late = [
        {"person_id": alice.id, "slots": [{"date": "2026-10-31", "meal": "breakfast"}], "nights": ["2026-10-30", "2026-10-31"]},
        {"person_id": bob.id, "slots": [{"date": "2026-10-30", "meal": "dinner"}, {"date": "2026-10-31", "meal": "breakfast"}]},
    ]
    fake = FakeClient([answer(tool_block(members=late), text_block("Noté."))] + [answer(text_block("Noté."))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="On arrive après le dîner"), fake)
    assert {a.name: a.nights for a in out.actions} == {"Alice": [date(2026, 10, 30), date(2026, 10, 31)], "Bob": [date(2026, 10, 30)]}
    assert "nuits : nuit du sam. 31/10 (2026-10-31)" in fake.calls[0]["system"]
    assert mod.PROPOSE_TOOL["input_schema"]["properties"]["members"]["items"]["properties"]["nights"]["type"] == "array"


def test_night_out_of_stay_fed_back(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    wrong = [{"person_id": alice.id, "slots": [], "nights": ["2026-11-01"]}]  # pas de nuit le dernier jour
    fake = FakeClient([answer(tool_block(members=wrong)), answer(text_block("Corrigé."))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="?"), fake)
    assert out.actions == [] and "Nuit hors des dates" in tool_result_of(fake, 1)["content"]


def test_thinking_blocks_are_sent_back_untouched(db) -> None:
    stay, _h, alice, bob = make_stay(db)
    first = answer(SimpleNamespace(type="thinking", thinking="", signature="sig"), tool_block(members=VALID_MEMBERS([alice.id, bob.id])))
    fake = FakeClient([first, answer(text_block("C'est noté."))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Vendredi soir"), fake)
    assert out.text == "C'est noté." and len(out.actions) == 2
    assert fake.calls[1]["messages"][1] == {"role": "assistant", "content": first.content}


def test_parallel_tool_calls_answered_in_one_message_last_wins(db) -> None:
    stay, _h, alice, bob = make_stay(db)
    later = [{"person_id": alice.id, "slots": [{"date": "2026-10-31", "meal": "lunch"}]}]
    calls = answer(tool_block(members=VALID_MEMBERS([alice.id, bob.id])), tool_block(members=later))
    fake = FakeClient([calls, answer(text_block("Voilà."))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="?"), fake)
    results = tool_results_of(fake, 1)
    assert [r["type"] for r in results] == ["tool_result", "tool_result"]
    assert {a.name: a.slots[0].meal for a in out.actions} == {"Alice": "lunch", "Bob": "dinner"}


def test_refusal(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    fake = FakeClient([answer(stop_reason="refusal")])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Hors sujet"), fake)
    assert out.text == mod.REFUSAL_TEXT and out.actions == []


def test_unknown_tool_fed_back(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    fake = FakeClient([answer(tool_block(name="autre_outil", members=[])), answer(text_block("D'accord."))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Rien"), fake)
    assert out.text == "D'accord." and out.actions == []
    feedback = tool_result_of(fake, 1)
    assert feedback["is_error"] is True and "Outil inconnu" in feedback["content"]


def test_invalid_proposal_fed_back(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    fake = FakeClient([answer(tool_block(members=[])), answer(text_block("Corrigé."))])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Rien"), fake)
    assert out.text == "Corrigé." and out.actions == []
    feedback = tool_result_of(fake, 1)
    assert feedback["is_error"] is True and "Proposition incomplète" in feedback["content"]


def test_business_rule_refused_then_corrected(db) -> None:
    stay, _h, alice, bob = make_stay(db)
    fake = FakeClient(
        [answer(tool_block(members=OUT_OF_STAY(alice.id))), answer(tool_block(members=VALID_MEMBERS([alice.id, bob.id]))), answer(text_block("Voilà."))]
    )
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Jeudi ?"), fake)
    assert len(out.actions) == 2 and out.text == "Voilà."
    feedback = tool_result_of(fake, 1)
    assert feedback["is_error"] is True and "hors des dates" in feedback["content"]


def test_exhaust_rounds_without_action(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    fake = FakeClient([answer(tool_block(members=OUT_OF_STAY(alice.id))) for _ in range(mod.MAX_TOOL_ROUNDS)])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Rien"), fake)
    assert out.actions == [] and "n'ai pas pu formuler" in out.text


def test_exhaust_rounds_with_actions_builds_summary(db) -> None:
    stay, _h, alice, bob = make_stay(db)
    fake = FakeClient([answer(tool_block(members=VALID_MEMBERS([alice.id, bob.id]))) for _ in range(mod.MAX_TOOL_ROUNDS)])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Rien"), fake)
    assert [a.name for a in out.actions] == ["Alice", "Bob"]  # propositions répétées fusionnées
    assert out.text.startswith("Voici mes propositions") and "- Alice : ven 30/10 dîner ; nuits : aucune" in out.text


def test_exhaust_rounds_keeps_model_text(db) -> None:
    stay, _h, alice, _bob = make_stay(db)
    response = answer(text_block("Je cherche…"), tool_block(members=OUT_OF_STAY(alice.id)))
    fake = FakeClient([response for _ in range(mod.MAX_TOOL_ROUNDS)])
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Rien"), fake)
    assert out.text == "Je cherche…" and out.actions == []


def test_default_client_is_an_anthropic_instance(db, monkeypatch) -> None:
    fake = FakeClient([answer(text_block("OK"))])
    monkeypatch.setattr(mod, "Anthropic", lambda: fake)
    stay, _h, alice, _bob = make_stay(db)
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="Salut"))
    assert out.text == "OK"


# --- Routes ----------------------------------------------------------------


def test_status_disabled(client, monkeypatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert client.get("/api/assistant").json() == {"enabled": False}


def test_status_enabled(client, monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    assert client.get("/api/assistant").json() == {"enabled": True}


def test_post_requires_key(client, api, monkeypatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post(f"/api/stays/{api.slug}/assistant", json={"person_id": 1, "message": "On mange ?"})
    assert r.status_code == 503


def test_stub_mode_is_deterministic(db, monkeypatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ASSISTANT_STUB", "true")
    assert mod.enabled() is True
    stay, _home, alice, bob = make_stay(db)
    out = mod.assistant_reply(db, stay, sc.AssistantIn(person_id=alice.id, message="On mange ?"))
    assert out.text.startswith("Voici ma proposition")
    assert [a.name for a in out.actions] == ["Alice", "Bob"]
    assert all(a.slots == [sc.SlotIn(date=date(2026, 10, 30), meal="dinner")] for a in out.actions)


def _stub_reply(client, api, monkeypatch, new_value) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr(mod, "assistant_reply", new_value)


def test_post_reply_ok(client, api, monkeypatch) -> None:
    def stub(_db, _stay, _body):
        return sc.AssistantOut(text="Bonjour", actions=[])

    alice = api.person("Alice")
    _stub_reply(client, api, monkeypatch, stub)
    r = client.post(f"/api/stays/{api.slug}/assistant", json={"person_id": alice, "message": "On mange ?"})
    assert r.status_code == 200 and r.json() == {"text": "Bonjour", "actions": []}


def test_post_api_error_is_502(client, api, monkeypatch) -> None:
    def boom(_db, _stay, _body):
        raise RuntimeError("réseau")

    alice = api.person("Alice")
    _stub_reply(client, api, monkeypatch, boom)
    r = client.post(f"/api/stays/{api.slug}/assistant", json={"person_id": alice, "message": "On mange ?"})
    assert r.status_code == 502


def test_post_rate_limited(client, api, monkeypatch) -> None:
    def stub(_db, _stay, _body):
        return sc.AssistantOut(text="Bonjour", actions=[])

    alice = api.person("Alice")
    _stub_reply(client, api, monkeypatch, stub)
    monkeypatch.setattr(mod, "RATE_LIMIT", 2)
    body = {"person_id": alice, "message": "On mange ?"}
    assert client.post(f"/api/stays/{api.slug}/assistant", json=body).status_code == 200
    assert client.post(f"/api/stays/{api.slug}/assistant", json=body).status_code == 200
    r = client.post(f"/api/stays/{api.slug}/assistant", json=body)
    assert r.status_code == 429 and "Trop de demandes" in r.json()["detail"]


def test_post_unknown_person_is_404_without_consuming_quota(client, api, db, monkeypatch) -> None:
    _stub_reply(client, api, monkeypatch, lambda *a: sc.AssistantOut(text="", actions=[]))
    r = client.post(f"/api/stays/{api.slug}/assistant", json={"person_id": 999, "message": "Salut"})
    assert r.status_code == 404
    assert db.scalar(select(func.count(AssistantCall.id))) == 0


def test_post_http_error_passes_through(client, api, monkeypatch) -> None:
    def teapot(*_a):
        raise HTTPException(418, "Je suis une théière")

    alice = api.person("Alice")
    _stub_reply(client, api, monkeypatch, teapot)
    r = client.post(f"/api/stays/{api.slug}/assistant", json={"person_id": alice, "message": "?"})
    assert r.status_code == 418


def test_assistant_in_history_is_bounded_and_alternating() -> None:
    with pytest.raises(ValidationError):
        sc.AssistantIn(person_id=1, message="a", history=["u", "a", "u"])
    with pytest.raises(ValidationError):
        sc.AssistantIn(person_id=1, message="a", history=["x" * 2001])
    assert sc.AssistantIn(person_id=1, message="a", history=["u", "a"]).history == ["u", "a"]