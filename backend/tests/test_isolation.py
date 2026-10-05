"""Un séjour ne peut jamais lire ni modifier les objets d'un autre (ids devinés ou réutilisés)."""

import pytest

from .conftest import make_stay


@pytest.fixture
def two(client):
    """Séjour A peuplé ; séjour B vide, qui tente d'atteindre les objets de A."""
    a, b = make_stay(client), make_stay(client)
    ids = {"adult": a.person("Alice"), "partner": a.person("Bob")}
    ids["child"] = a.person("Léo", "child", ids["adult"])
    room = a.adm("POST", "/rooms", {"name": "Bleue"}, status=201).json()
    ids["room"] = room["id"]
    ids["bed"] = a.adm("POST", f"/rooms/{room['id']}/beds", {"kind": "double"}, status=201).json()["id"]
    ids["chore"] = a.snap()["chore_types"][0]["id"]
    ids["activity"] = a.adm(
        "POST", "/activities", {"name": "Rando", "date": "2026-10-31", "optional": True}, status=201
    ).json()["id"]
    ids["b_adult"] = b.person("Brigitte")
    ids["b_room"] = b.adm("POST", "/rooms", {"name": "Verte"}, status=201).json()["id"]
    ids["b_activity"] = b.adm(
        "POST", "/activities", {"name": "Jeux", "date": "2026-10-31", "optional": True}, status=201
    ).json()["id"]
    return a, b, ids


CASES = [
    ("pub", "PUT", "/persons/{adult}/presences", {"slots": []}),
    ("pub", "PUT", "/activities/{activity}/signups/{b_adult}", None),
    ("pub", "PUT", "/activities/{b_activity}/signups/{adult}", None),
    ("pub", "DELETE", "/activities/{b_activity}/signups/{adult}", None),
    ("pub", "POST", "/persons", {"name": "X", "kind": "child", "guardian_id": "{adult}"}),
    ("adm", "PATCH", "/persons/{adult}", {"name": "Piraté"}),
    ("adm", "PATCH", "/persons/{b_adult}", {"guardian_id": "{adult}"}),
    ("adm", "DELETE", "/persons/{adult}", None),
    ("adm", "PUT", "/persons/{adult}/partner", {"partner_id": None}),
    ("adm", "PUT", "/persons/{b_adult}/partner", {"partner_id": "{adult}"}),
    ("adm", "PUT", "/persons/{adult}/bed", {"bed_id": None}),
    ("adm", "PUT", "/persons/{b_adult}/bed", {"bed_id": "{bed}"}),
    ("adm", "PATCH", "/rooms/{room}", {"name": "Piratée"}),
    ("adm", "DELETE", "/rooms/{room}", None),
    ("adm", "POST", "/rooms/{room}/beds", {"kind": "single"}),
    ("adm", "DELETE", "/beds/{bed}", None),
    ("adm", "PATCH", "/chore-types/{chore}", {"name": "X", "moments": ["day"]}),
    ("adm", "DELETE", "/chore-types/{chore}", None),
    ("adm", "PUT", "/chores/occurrence", {"chore_type_id": "{chore}", "date": "2026-10-31", "moment": "day", "person_ids": []}),
    ("adm", "PATCH", "/activities/{activity}", {"name": "X", "date": "2026-10-31"}),
    ("adm", "DELETE", "/activities/{activity}", None),
]


def _fill(value, ids):
    if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
        return ids[value[1:-1]]
    if isinstance(value, dict):
        return {k: _fill(v, ids) for k, v in value.items()}
    return value


@pytest.mark.parametrize(("side", "method", "path", "body"), CASES, ids=[f"{c[1]} {c[2]}" for c in CASES])
def test_cross_stay_access_is_404(two, side, method, path, body) -> None:
    a, b, ids = two
    before = a.snap()
    r = getattr(b, side)(method, path.format(**ids), _fill(body, ids))
    assert r.status_code == 404, r.text
    assert a.snap() == before, "le séjour A a été modifié"


def test_occurrence_with_foreign_person_is_404(two) -> None:
    a, b, ids = two
    b_chore = b.snap()["chore_types"][0]["id"]
    body = {"chore_type_id": b_chore, "date": "2026-10-31", "moment": "day", "person_ids": [ids["adult"]]}
    b.adm("PUT", "/chores/occurrence", body, status=404)


def test_snapshot_only_contains_own_data(two) -> None:
    a, b, ids = two
    a.present(ids["adult"])
    snap = b.snap()
    assert [p["name"] for p in snap["persons"]] == ["Brigitte"]
    assert snap["presences"] == [] and snap["signups"] == []
    assert [r["name"] for r in snap["rooms"]] == ["Verte"]
    assert [a["name"] for a in snap["activities"]] == ["Jeux"]
