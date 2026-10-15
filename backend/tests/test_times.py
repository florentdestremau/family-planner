"""Heures d'arrivée et de départ : par personne, saisies pour le foyer, avec une note libre."""

from datetime import datetime, timedelta, timezone

import pytest


def times_of(api, person_id: int) -> tuple[str, str, str]:
    p = api.persons()[person_id]
    return p["arrival_time"], p["departure_time"], p["times_note"]


def put(api, household_id: int, members: list[dict], status: int = 200):
    return api.pub("PUT", f"/households/{household_id}/times", {"members": members}, status=status)


def test_a_new_person_has_no_time(api) -> None:
    alice = api.person("Alice")
    assert times_of(api, alice) == ("", "", "")
    assert api.persons()[alice]["arrival_updated_at"] is None
    assert api.persons()[alice]["departure_updated_at"] is None


def test_same_time_for_the_whole_household_but_one(api) -> None:
    alice = api.person("Alice")
    bob, paul = api.person("Bob", with_=alice), api.person("Paul", with_=alice)
    home = api.household_of(alice)
    same = {"arrival_time": "18:30", "departure_time": "15:00", "times_note": "  Nous aurons\n déjà dîné  "}
    put(api, home, [{"person_id": p, **same} for p in (alice, bob, paul)])
    put(api, home, [{"person_id": paul, "arrival_time": "23:45", "departure_time": "15:00"}])
    assert times_of(api, alice) == times_of(api, bob) == ("18:30", "15:00", "Nous aurons déjà dîné")
    assert times_of(api, paul) == ("23:45", "15:00", "")


def test_night_hours_up_to_four(api) -> None:
    alice = api.person("Alice")
    put(api, api.household_of(alice), [{"person_id": alice, "arrival_time": "01:15", "departure_time": "04:00"}])
    assert times_of(api, alice)[:2] == ("01:15", "04:00")


def test_times_are_replaced_as_a_whole(api) -> None:
    alice = api.person("Alice")
    home = api.household_of(alice)
    put(api, home, [{"person_id": alice, "arrival_time": "18:00", "departure_time": "16:00", "times_note": "Retard possible"}])
    put(api, home, [{"person_id": alice, "arrival_time": "19:00"}])
    assert times_of(api, alice) == ("19:00", "", "")


def test_change_time_is_noted_only_for_what_changes(api) -> None:
    alice = api.person("Alice")
    bob = api.person("Bob", with_=alice)
    home = api.household_of(alice)
    stamps = lambda p: (p["arrival_updated_at"], p["departure_updated_at"])  # noqa: E731
    put(api, home, [{"person_id": alice, "arrival_time": "18:00"}])
    arrival, departure = stamps(api.persons()[alice])
    when = datetime.fromisoformat(arrival)
    assert when.tzinfo is not None and abs(datetime.now(timezone.utc) - when) < timedelta(minutes=1)
    assert departure is None, "le départ n'a pas changé"
    assert stamps(api.persons()[bob]) == (None, None)
    # Rien ne change : rien n'est daté.
    put(api, home, [{"person_id": alice, "arrival_time": "18:00"}, {"person_id": bob, "arrival_time": ""}])
    persons = api.persons()
    assert stamps(persons[alice]) == (arrival, None) and stamps(persons[bob]) == (None, None)
    # Le départ seul.
    put(api, home, [{"person_id": alice, "arrival_time": "18:00", "departure_time": "15:00"}])
    later_arrival, later_departure = stamps(api.persons()[alice])
    assert later_arrival == arrival and later_departure is not None
    # La note vaut pour les deux.
    put(api, home, [{"person_id": alice, "arrival_time": "18:00", "departure_time": "15:00", "times_note": "Une heure de retard"}])
    noted = stamps(api.persons()[alice])
    assert noted[0] > arrival and noted[1] > later_departure


def test_answer_gives_the_updated_persons(api) -> None:
    alice = api.person("Alice")
    out = put(api, api.household_of(alice), [{"person_id": alice, "arrival_time": "18:00"}]).json()
    assert [(p["id"], p["arrival_time"]) for p in out] == [(alice, "18:00")]


@pytest.mark.parametrize(
    "fields",
    [
        {"arrival_time": "18:10"},  # au quart d'heure
        {"arrival_time": "8:00"},
        {"departure_time": "04:15"},  # au-delà de 4 h, ce n'est plus « dans la nuit »
        {"departure_time": "04:45"},
        {"arrival_time": "24:00"},
        {"arrival_time": 18},
        {"times_note": "x" * 201},
        {"times_note": 5},
    ],
)
def test_invalid_times(api, fields) -> None:
    alice = api.person("Alice")
    home = api.household_of(alice)
    put(api, home, [{"person_id": alice, "arrival_time": "18:00"}])
    put(api, home, [{"person_id": alice, **fields}], status=422)
    assert times_of(api, alice) == ("18:00", "", "")


def test_note_length_is_checked_once_on_one_line(api) -> None:
    alice = api.person("Alice")
    note = "Porte ouverte" + " \n" * 100
    put(api, api.household_of(alice), [{"person_id": alice, "times_note": note}])
    assert times_of(api, alice)[2] == "Porte ouverte"


def test_only_members_of_the_household(api) -> None:
    alice, paul = api.person("Alice"), api.person("Paul")
    home = api.household_of(alice)
    # Tout ou rien : Alice n'est pas modifiée quand Paul, d'un autre foyer, fait échouer la demande.
    put(api, home, [{"person_id": alice, "arrival_time": "18:00"}, {"person_id": paul, "arrival_time": "18:00"}], status=422)
    assert times_of(api, alice) == times_of(api, paul) == ("", "", "")
    put(api, home, [{"person_id": 999999}], status=404)
    put(api, 999999, [{"person_id": alice}], status=404)
    put(api, home, [], status=422)


def test_times_survive_household_changes(api) -> None:
    alice, bob = api.person("Alice"), api.person("Bob")
    put(api, api.household_of(bob), [{"person_id": bob, "arrival_time": "20:00", "times_note": "En retard"}])
    api.adm("PUT", f"/persons/{bob}/household", {"household_id": api.household_of(alice)}, status=200)
    assert times_of(api, bob) == ("20:00", "", "En retard")


def test_same_person_twice_is_refused(api) -> None:
    alice = api.person("Alice")
    members = [{"person_id": alice, "arrival_time": "18:00"}, {"person_id": alice, "arrival_time": "19:00"}]
    r = put(api, api.household_of(alice), members, status=422)
    assert r.json()["detail"] == "Une même personne apparaît deux fois"
    assert times_of(api, alice) == ("", "", "")
