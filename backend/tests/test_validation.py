"""Entrées invalides : refusées avec un 422 et un message, sans rien modifier."""

import pytest

from .conftest import STAY


@pytest.mark.parametrize(
    "body",
    [
        {**STAY, "name": ""},
        {**STAY, "name": "   "},
        {**STAY, "name": "x" * 201},
        {**STAY, "end_date": "2026-10-29"},
        {**STAY, "end_date": "2027-01-15"},  # plus de 60 jours
        {**STAY, "start_date": "2026-10-30", "end_date": "2026-10-30", "first_meal": "dinner", "last_meal": "lunch"},
        {**STAY, "first_meal": "goûter"},
        {**STAY, "start_date": "pas-une-date"},
        {k: v for k, v in STAY.items() if k != "name"},
    ],
    ids=["vide", "espaces", "trop-long", "fin-avant-debut", "trop-long-sejour", "aucun-repas", "repas-inconnu", "date-invalide", "sans-nom"],
)
def test_invalid_stay_creation(client, body) -> None:
    r = client.post("/api/stays", json=body)
    assert r.status_code == 422, r.text
    assert r.json()["detail"]


def test_single_day_stay_is_valid(client) -> None:
    r = client.post("/api/stays", json={**STAY, "end_date": STAY["start_date"], "first_meal": "breakfast", "last_meal": "dinner"})
    assert r.status_code == 201


def test_names_are_trimmed(api) -> None:
    pid = api.person("  Alice  ")
    assert api.persons()[pid]["name"] == "Alice"


@pytest.mark.parametrize(
    "body",
    [{"name": ""}, {"name": "  "}, {"name": "X", "kind": "bébé"}, {"name": "x" * 101}],
)
def test_invalid_person(api, body) -> None:
    api.adm("POST", "/persons", body, status=422)
    api.pub("POST", "/persons", body, status=422)


@pytest.mark.parametrize(
    "patch",
    [
        {"start_date": "2026-11-05"},  # début après la fin
        {"end_date": "2027-02-01"},
        {"name": " "},
        {"first_meal": "brunch"},
    ],
)
def test_invalid_stay_update_changes_nothing(api, patch) -> None:
    before = api.snap()["stay"]
    api.adm("PATCH", "/stay", patch, status=422)
    assert api.snap()["stay"] == before


@pytest.mark.parametrize(
    "body",
    [
        {"name": "X", "date": "2026-10-31", "start_time": "25:00"},
        {"name": "X", "date": "2026-10-31", "start_time": "10:60"},
        {"name": "X", "date": "2026-10-31", "start_time": "9:00"},
        {"name": "X", "date": "2026-10-31", "start_time": "14:00", "end_time": "13:00"},
        {"name": "X", "date": "2026-10-29"},
        {"name": "X", "date": "2026-11-02"},
        {"name": "", "date": "2026-10-31"},
    ],
    ids=["heure-25", "minute-60", "format", "fin-avant-debut", "avant-sejour", "apres-sejour", "sans-nom"],
)
def test_invalid_activity(api, body) -> None:
    api.adm("POST", "/activities", body, status=422)
    assert api.snap()["activities"] == []


def test_valid_activity_times(api) -> None:
    body = {"name": "Veillée", "date": "2026-10-31", "start_time": "20:00", "end_time": "23:59"}
    api.adm("POST", "/activities", body, status=201)
    api.adm("POST", "/activities", {"name": "Libre", "date": "2026-11-01"}, status=201)


@pytest.mark.parametrize(
    "body",
    [
        {"name": "X", "moments": []},
        {"name": "X", "moments": ["goûter"]},
        {"name": "X", "moments": ["day"], "people_needed": 0},
        {"name": "X", "moments": ["day"], "people_needed": 21},
        {"name": "X", "moments": ["day"], "every_n_days": 0},
        {"name": " ", "moments": ["day"]},
    ],
)
def test_invalid_chore_type(api, body) -> None:
    api.adm("POST", "/chore-types", body, status=422)


@pytest.mark.parametrize(
    "slot",
    [
        {"date": "2026-10-30", "meal": "lunch"},  # avant le premier repas
        {"date": "2026-11-01", "meal": "dinner"},  # après le dernier repas
        {"date": "2026-11-02", "meal": "lunch"},
        {"date": "2026-10-31", "meal": "goûter"},
    ],
)
def test_presence_outside_slots_is_refused(api, slot) -> None:
    pid = api.person("Alice")
    api.present(pid)
    r = api.pub("PUT", f"/persons/{pid}/presences", {"slots": [slot]})
    assert r.status_code == 422
    assert len([p for p in api.snap()["presences"] if p["person_id"] == pid]) == 6, "présences inchangées"


def test_duplicate_presences_are_merged(api) -> None:
    pid = api.person("Alice")
    api.present(pid, [{"date": "2026-10-30", "meal": "dinner"}] * 3)
    assert len(api.snap()["presences"]) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"date": "2026-10-30", "meal": "lunch", "dishes": "X"},
        {"date": "2026-11-05", "meal": "lunch", "dishes": "X"},
        {"date": "2026-10-31", "meal": "day", "dishes": "X"},
    ],
)
def test_menu_outside_slots_is_refused(api, body) -> None:
    api.adm("PUT", "/menus", body, status=422)


@pytest.mark.parametrize(
    ("date", "moment"),
    [("2026-10-29", "day"), ("2026-11-02", "day"), ("2026-10-30", "lunch"), ("2026-11-01", "dinner")],
)
def test_manual_occurrence_outside_stay_is_refused(api, date, moment) -> None:
    chore = api.snap()["chore_types"][0]["id"]
    body = {"chore_type_id": chore, "date": date, "moment": moment, "person_ids": []}
    api.adm("PUT", "/chores/occurrence", body, status=422)


def test_bed_kind_is_validated(api) -> None:
    room = api.adm("POST", "/rooms", {"name": "Bleue"}, status=201).json()
    api.adm("POST", f"/rooms/{room['id']}/beds", {"kind": "hamac"}, status=422)
    api.adm("POST", "/rooms", {"name": ""}, status=422)


def test_malformed_json_is_422(client, api) -> None:
    r = client.post(f"{api.base}/persons", content=b"{pas du json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422


def test_explicit_nulls_are_ignored(api) -> None:
    pid = api.person("Alice")
    api.adm("PATCH", f"/persons/{pid}", {"name": None, "kind": None, "does_chores": None}, status=200)
    p = api.persons()[pid]
    assert p["name"] == "Alice" and p["kind"] == "adult" and p["does_chores"] is True
    before = api.snap()["stay"]
    api.adm("PATCH", "/stay", {"name": None, "start_date": None}, status=200)
    assert api.snap()["stay"] == before
