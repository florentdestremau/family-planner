"""Séjour : création, créneaux, modification des dates et nettoyage."""

from .conftest import SLOTS


def test_creation_returns_key_once_and_default_chores(client, api) -> None:
    snap = api.snap()
    assert snap["stay"]["name"] == "Toussaint" and "admin_key" not in snap["stay"]
    assert snap["days"] == ["2026-10-30", "2026-10-31", "2026-11-01"]
    assert snap["slots"] == SLOTS
    assert [c["name"] for c in snap["chore_types"]] == ["Cuisine", "Mise de table", "Débarrassage & vaisselle", "Ménage"]
    assert snap["stay"]["separate_couples"] is True


def test_update_name_and_rules(api) -> None:
    api.adm("PATCH", "/stay", {"name": "Noël", "separate_couples": False}, status=200)
    stay = api.snap()["stay"]
    assert stay["name"] == "Noël" and stay["separate_couples"] is False


def test_extending_keeps_everything(api) -> None:
    pid = api.person("Alice")
    api.present(pid)
    api.adm("PATCH", "/stay", {"end_date": "2026-11-03", "last_meal": "dinner"}, status=200)
    snap = api.snap()
    assert len(snap["presences"]) == 6
    assert len(snap["slots"]) == 1 + 4 * 3  # ven. dîner + 4 jours complets


def test_shrinking_removes_out_of_range_data(api) -> None:
    pid = api.person("Alice")
    api.present(pid)
    for slot in SLOTS:
        api.adm("PUT", "/menus", {**slot, "dishes": "Plat"}, status=200)
    chore = api.snap()["chore_types"][0]["id"]
    for date, moment in [("2026-10-30", "day"), ("2026-10-31", "dinner"), ("2026-11-01", "lunch"), ("2026-11-01", "day")]:
        body = {"chore_type_id": chore, "date": date, "moment": moment, "person_ids": [pid]}
        api.adm("PUT", "/chores/occurrence", body, status=204)

    # Le séjour devient : sam. petit-déj → sam. dîner.
    api.adm("PATCH", "/stay", {"start_date": "2026-10-31", "first_meal": "breakfast", "end_date": "2026-10-31", "last_meal": "dinner"}, status=200)
    snap = api.snap()
    kept = {(p["date"], p["meal"]) for p in snap["presences"]}
    assert kept == {("2026-10-31", "breakfast"), ("2026-10-31", "lunch"), ("2026-10-31", "dinner")}
    assert {(m["date"], m["meal"]) for m in snap["menus"]} == kept
    assert {(a["date"], a["moment"]) for a in snap["chore_assignments"]} == {("2026-10-31", "dinner")}


def test_changing_first_meal_drops_that_meal_only(api) -> None:
    pid = api.person("Alice")
    api.present(pid)
    api.adm("PATCH", "/stay", {"last_meal": "breakfast"}, status=200)
    assert ("2026-11-01", "lunch") not in {(p["date"], p["meal"]) for p in api.snap()["presences"]}
    assert len(api.snap()["presences"]) == 5


def test_snapshot_shape(api) -> None:
    snap = api.snap()
    assert set(snap) == {"stay", "days", "slots", "households", "persons", "presences", "rooms", "chore_types", "chore_assignments", "activities", "signups", "menus"}
