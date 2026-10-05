"""Chambres et lits : capacités, affectations, suppression."""

import pytest


@pytest.fixture
def room(api) -> dict:
    return api.adm("POST", "/rooms", {"name": "Bleue", "notes": "1er étage"}, status=201).json()


def bed(api, room_id: int, kind: str) -> int:
    return api.adm("POST", f"/rooms/{room_id}/beds", {"kind": kind}, status=201).json()["id"]


@pytest.mark.parametrize(("kind", "places"), [("double", 2), ("single", 1), ("bunk", 2), ("extra", 1)])
def test_bed_capacity(api, room, kind, places) -> None:
    b = bed(api, room["id"], kind)
    people = [api.person(f"P{i}") for i in range(places + 1)]
    for p in people[:places]:
        api.adm("PUT", f"/persons/{p}/bed", {"bed_id": b}, status=200)
    api.adm("PUT", f"/persons/{people[-1]}/bed", {"bed_id": b}, status=409)
    # Réaffecter quelqu'un déjà dans ce lit ne compte pas double.
    api.adm("PUT", f"/persons/{people[0]}/bed", {"bed_id": b}, status=200)


def test_child_takes_a_place(api, room) -> None:
    b = bed(api, room["id"], "single")
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    api.adm("PUT", f"/persons/{kid}/bed", {"bed_id": b}, status=200)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": b}, status=409)


def test_move_and_unassign(api, room) -> None:
    b1, b2 = bed(api, room["id"], "single"), bed(api, room["id"], "single")
    a = api.person("Alice")
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": b1}, status=200)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": b2}, status=200)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": None}, status=200)
    assert api.persons()[a]["bed_id"] is None
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": 999999}, status=404)


def test_rename_room(api, room) -> None:
    api.adm("PATCH", f"/rooms/{room['id']}", {"name": "Bleu ciel", "notes": ""}, status=200)
    assert api.snap()["rooms"][0]["name"] == "Bleu ciel"


def test_deleting_bed_or_room_frees_people(api, room) -> None:
    b1, b2 = bed(api, room["id"], "double"), bed(api, room["id"], "single")
    a, c = api.person("Alice"), api.person("Chloé")
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": b1}, status=200)
    api.adm("PUT", f"/persons/{c}/bed", {"bed_id": b2}, status=200)
    api.adm("DELETE", f"/beds/{b1}", status=204)
    assert api.persons()[a]["bed_id"] is None
    api.adm("DELETE", f"/rooms/{room['id']}", status=204)
    snap = api.snap()
    assert snap["rooms"] == [] and all(p["bed_id"] is None for p in snap["persons"])


def test_auto_assign_only_places_unassigned_and_respects_capacity(api, room) -> None:
    single, double = bed(api, room["id"], "single"), bed(api, room["id"], "double")
    a, b, c = api.person("Alice"), api.person("Bob"), api.person("Chloé")
    api.couple(a, b)
    api.adm("PUT", f"/persons/{c}/bed", {"bed_id": double}, status=200)
    r = api.adm("POST", "/rooms/auto-assign", status=200).json()
    p = api.persons()
    assert p[c]["bed_id"] == double, "une affectation existante n'est jamais déplacée"
    # Le double n'a plus qu'une place : le couple ne peut pas y dormir ensemble.
    placed = [x for x in (a, b) if p[x]["bed_id"] is not None]
    assert len(placed) == 2 and r == {"assigned": 2, "unassigned": 0}
    assert sorted(p[x]["bed_id"] for x in placed) == sorted([single, double])


def test_auto_assign_without_beds(api) -> None:
    api.person("Alice")
    assert api.adm("POST", "/rooms/auto-assign", status=200).json() == {"assigned": 0, "unassigned": 1}
