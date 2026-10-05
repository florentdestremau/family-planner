"""Corvées : types, tirage par l'API, ajustements manuels."""

from collections import Counter, defaultdict

import pytest

from .conftest import SLOTS


def occurrences(snap) -> dict:
    occ = defaultdict(list)
    for a in snap["chore_assignments"]:
        occ[(a["chore_type_id"], a["date"], a["moment"])].append(a["person_id"])
    return occ


@pytest.fixture
def family(api) -> dict:
    """Trois couples, une personne dispensée, un enfant ; tout le monde présent."""
    ids = {n: api.person(n) for n in ["A1", "A2", "B1", "B2", "C1", "C2", "Mamie"]}
    ids["Léo"] = api.person("Léo", "child", ids["A1"])
    for x, y in [("A1", "A2"), ("B1", "B2"), ("C1", "C2")]:
        api.couple(ids[x], ids[y])
    api.adm("PATCH", f"/persons/{ids['Mamie']}", {"does_chores": False}, status=200)
    for pid in ids.values():
        api.present(pid)
    return ids


def test_chore_type_crud(api) -> None:
    c = api.adm("POST", "/chore-types", {"name": "Courses", "moments": ["day"], "people_needed": 2, "every_n_days": 2}, status=201).json()
    assert c["moments"] == ["day"]
    api.adm("PATCH", f"/chore-types/{c['id']}", {"name": "Courses", "moments": ["breakfast", "day"], "people_needed": 1}, status=200)
    got = next(x for x in api.snap()["chore_types"] if x["id"] == c["id"])
    assert got["moments"] == ["breakfast", "day"] and got["people_needed"] == 1 and got["every_n_days"] == 1
    api.adm("DELETE", f"/chore-types/{c['id']}", status=204)
    assert c["id"] not in [x["id"] for x in api.snap()["chore_types"]]


def test_draw_respects_all_rules(api, family) -> None:
    result = api.adm("POST", "/chores/draw", status=200).json()
    snap = api.snap()
    persons = {p["id"]: p for p in snap["persons"]}
    chores = {c["id"]: c for c in snap["chore_types"]}
    occ = occurrences(snap)
    assert result["unfilled"] == 0
    assert result["assigned"] == len(snap["chore_assignments"]) == sum(len(v) for v in occ.values())
    assert result["occurrences"] == len(occ)
    for (chore_id, date, moment), people in occ.items():
        assert len(people) == len(set(people)) == chores[chore_id]["people_needed"]
        for p in people:
            assert persons[p]["does_chores"], "seules les personnes « corvées » sont tirées"
            assert persons[p]["partner_id"] not in people, "couple sur la même corvée"
    load = Counter(a["person_id"] for a in snap["chore_assignments"])
    assert set(load) == {family[n] for n in ["A1", "A2", "B1", "B2", "C1", "C2"]}
    assert max(load.values()) - min(load.values()) <= 1


def test_draw_only_uses_present_people(api, family) -> None:
    api.present(family["C1"], [SLOTS[0]])  # C1 ne vient qu'au premier dîner
    api.adm("POST", "/chores/draw", status=200)
    for a in api.snap()["chore_assignments"]:
        if a["person_id"] == family["C1"]:
            assert a["date"] == "2026-10-30" and a["moment"] in ("dinner", "day")


def test_redraw_replaces_manual_adjustments(api, family) -> None:
    api.adm("POST", "/chores/draw", status=200)
    chore = api.snap()["chore_types"][0]["id"]
    body = {"chore_type_id": chore, "date": "2026-10-31", "moment": "lunch", "person_ids": [family["Mamie"]]}
    api.adm("PUT", "/chores/occurrence", body, status=204)
    assert occurrences(api.snap())[(chore, "2026-10-31", "lunch")] == [family["Mamie"]]
    api.adm("POST", "/chores/draw", status=200)
    assert family["Mamie"] not in occurrences(api.snap())[(chore, "2026-10-31", "lunch")]


def test_manual_occurrence_replaces_and_dedups(api, family) -> None:
    chore = api.snap()["chore_types"][0]["id"]
    key = (chore, "2026-10-31", "dinner")
    body = {"chore_type_id": chore, "date": "2026-10-31", "moment": "dinner", "person_ids": [family["A1"], family["A1"], family["B1"]]}
    api.adm("PUT", "/chores/occurrence", body, status=204)
    assert occurrences(api.snap())[key] == [family["A1"], family["B1"]]
    api.adm("PUT", "/chores/occurrence", {**body, "person_ids": []}, status=204)
    assert key not in occurrences(api.snap())


def test_couples_together_when_rule_disabled(api) -> None:
    a, b = api.person("A"), api.person("B")
    api.couple(a, b)
    for p in (a, b):
        api.present(p)
    for c in api.snap()["chore_types"]:
        api.adm("DELETE", f"/chore-types/{c['id']}", status=204)
    api.adm("POST", "/chore-types", {"name": "Cuisine", "moments": ["dinner"], "people_needed": 2}, status=201)
    assert api.adm("POST", "/chores/draw", status=200).json()["unfilled"] == 2  # deux dîners, une place vide chacun
    api.adm("PATCH", "/stay", {"separate_couples": False}, status=200)
    assert api.adm("POST", "/chores/draw", status=200).json()["unfilled"] == 0


def test_draw_without_presences_assigns_nothing(api) -> None:
    api.person("Alice")
    assert api.adm("POST", "/chores/draw", status=200).json() == {"occurrences": 0, "assigned": 0, "unfilled": 0}


def test_every_n_days_rhythm(api, family) -> None:
    for c in api.snap()["chore_types"]:
        api.adm("DELETE", f"/chore-types/{c['id']}", status=204)
    api.adm("POST", "/chore-types", {"name": "Ménage", "moments": ["day"], "people_needed": 1, "every_n_days": 2}, status=201)
    api.adm("POST", "/chores/draw", status=200)
    assert sorted({a["date"] for a in api.snap()["chore_assignments"]}) == ["2026-10-30", "2026-11-01"]


def test_deleting_chore_type_removes_its_assignments(api, family) -> None:
    api.adm("POST", "/chores/draw", status=200)
    chore = api.snap()["chore_types"][0]["id"]
    api.adm("DELETE", f"/chore-types/{chore}", status=204)
    assert all(a["chore_type_id"] != chore for a in api.snap()["chore_assignments"])
