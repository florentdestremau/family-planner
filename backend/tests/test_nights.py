"""Nuits sur place et lits nuit par nuit, dont les cas rencontrés lors d'une cousinade."""

import pytest

from .conftest import NIGHTS, SLOTS, make_stay

FRI, SAT = NIGHTS
FRI_DINNER, SAT_BREAKFAST, SAT_LUNCH, SAT_DINNER = SLOTS[:4]


@pytest.fixture
def room(api) -> int:
    return api.adm("POST", "/rooms", {"name": "Chambre d'amis"}, status=201).json()["id"]


def bed(api, room_id: int, kind: str = "double") -> int:
    return api.adm("POST", f"/rooms/{room_id}/beds", {"kind": kind}, status=201).json()["id"]


def nights(api, person_id: int) -> list[str]:
    return sorted(api.nights().get(person_id, {}))


# --- Nuits déduites des repas -------------------------------------------------


def test_whole_stay_sleeps_every_night(api) -> None:
    a = api.person("Alice")
    api.present(a)
    assert nights(api, a) == NIGHTS
    api.present(a, [])
    assert nights(api, a) == [], "plus aucun repas autour : plus de nuit"


def test_arrival_after_dinner_keeps_the_night(api) -> None:
    """Cas 1 : tout le séjour, puis on retire le dîner du vendredi ; la nuit du vendredi reste."""
    a = api.person("Alice")
    api.present(a)
    api.present(a, SLOTS[1:])
    assert nights(api, a) == NIGHTS


def test_arrival_after_dinner_from_scratch_is_explicit(api) -> None:
    """Sans dîner, le petit-déjeuner seul ne dit pas où l'on a dormi : la nuit se coche à part."""
    a = api.person("Alice")
    api.present(a, SLOTS[1:])
    assert nights(api, a) == [SAT]
    api.pub("PUT", f"/persons/{a}/presences", {"slots": SLOTS[1:], "nights": NIGHTS}, status=204)
    assert nights(api, a) == NIGHTS


def test_night_away_is_ambiguous_until_said(api) -> None:
    """Cas 2 : absente samedi midi et soir, de retour dimanche matin ; la nuit du samedi se décoche à la main."""
    a = api.person("Alice")
    api.present(a)
    away = [s for s in SLOTS if s not in (SAT_LUNCH, SAT_DINNER)]
    api.present(a, away)
    assert nights(api, a) == NIGHTS, "un seul repas autour de la nuit : on ne devine pas"
    api.pub("PUT", f"/persons/{a}/presences", {"slots": away, "nights": [FRI]}, status=204)
    assert nights(api, a) == [FRI]
    api.present(a, [*away, SAT_LUNCH])
    assert nights(api, a) == [FRI], "repas sans lien avec la nuit : le choix manuel tient"
    api.present(a, [*away, SAT_DINNER])
    assert nights(api, a) == NIGHTS, "dîner et petit-déjeuner du lendemain : la nuit revient"


def test_household_nights_and_bounds(api) -> None:
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    body = {"members": [{"person_id": a, "slots": SLOTS, "nights": [FRI]}, {"person_id": kid, "slots": SLOTS}]}
    api.pub("PUT", f"/households/{api.household_of(a)}/presences", body, status=204)
    assert nights(api, a) == [FRI] and nights(api, kid) == NIGHTS
    last_day = {"members": [{"person_id": a, "slots": [], "nights": ["2026-11-01"]}]}
    r = api.pub("PUT", f"/households/{api.household_of(a)}/presences", last_day, status=422)
    assert "Nuit hors des dates" in r.text


def test_shorter_stay_drops_nights(api) -> None:
    a = api.person("Alice")
    api.present(a)
    api.adm("PATCH", "/stay", {"end_date": "2026-10-31", "last_meal": "dinner"}, status=200)
    assert nights(api, a) == [FRI]


# --- Lits nuit par nuit --------------------------------------------------------


def test_same_room_two_couples_two_nights(api, room) -> None:
    """Cas 3 : le lit double sert à un couple vendredi et à un autre samedi."""
    double = bed(api, room)
    a, b, c, d = (api.person(n) for n in ("Alice", "Bob", "Chloé", "David"))
    for x in (a, b):
        api.pub("PUT", f"/persons/{x}/presences", {"slots": SLOTS[:2], "nights": [FRI]}, status=204)
    for x in (c, d):
        api.pub("PUT", f"/persons/{x}/presences", {"slots": SLOTS[3:], "nights": [SAT]}, status=204)
    for x in (a, b, c, d):
        assert api.adm("PUT", f"/persons/{x}/bed", {"bed_id": double}, status=200).json() == {"warning": None}
    assert api.nights() == {a: {FRI: double}, b: {FRI: double}, c: {SAT: double}, d: {SAT: double}}
    e = api.person("Eve")
    api.pub("PUT", f"/persons/{e}/presences", {"slots": [], "nights": NIGHTS}, status=204)
    r = api.adm("PUT", f"/persons/{e}/bed", {"bed_id": double}, status=409)
    assert "ven. 30/10, sam. 31/10" in r.text


def test_one_night_only_and_bounds(api, room) -> None:
    single, other = bed(api, room, "single"), bed(api, room, "single")
    a = api.person("Alice")
    api.present(a)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": single}, status=200)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": other, "dates": [SAT]}, status=200)
    assert api.nights()[a] == {FRI: single, SAT: other}
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": None, "dates": [FRI]}, status=200)
    assert api.nights()[a] == {FRI: None, SAT: other}
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": other, "dates": ["2026-11-01"]}, status=422)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": other, "dates": []}, status=422)


def test_bed_for_undeclared_nights_adds_them_with_a_warning(api, room) -> None:
    double = bed(api, room)
    a, b = api.person("Alice"), api.person("Bob")
    r = api.adm("PUT", f"/persons/{a}/bed", {"bed_id": double}, status=200).json()
    assert r["warning"] == "Alice n'avait pas déclaré la nuit du ven. 30/10, sam. 31/10 : ajoutée à ses présences."
    assert api.nights()[a] == {FRI: double, SAT: double}
    api.pub("PUT", f"/persons/{b}/presences", {"slots": [], "nights": [FRI]}, status=204)
    r = api.adm("PUT", f"/persons/{b}/bed", {"bed_id": double, "dates": NIGHTS}, status=200).json()
    assert r["warning"] == "Bob n'avait pas déclaré la nuit du sam. 31/10 : ajoutée à ses présences."
    # Retirer le lit d'une personne sans nuit ne crée rien.
    c = api.person("Chloé")
    api.adm("PUT", f"/persons/{c}/bed", {"bed_id": None}, status=200)
    api.adm("PUT", f"/persons/{c}/bed", {"bed_id": None, "dates": [SAT]}, status=200)
    assert c not in api.nights()


def test_new_night_keeps_the_nearest_bed_if_free(api, room) -> None:
    double, single = bed(api, room), bed(api, room, "single")
    a, b, c = api.person("Alice"), api.person("Bob"), api.person("Chloé")
    api.pub("PUT", f"/persons/{a}/presences", {"slots": [], "nights": [SAT]}, status=204)
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": double}, status=200)
    api.pub("PUT", f"/persons/{a}/presences", {"slots": [], "nights": NIGHTS}, status=204)
    assert api.nights()[a] == {FRI: double, SAT: double}, "même lit tout le séjour sans rien refaire"
    # Plus de place la nuit ajoutée : la nuit reste sans lit.
    api.pub("PUT", f"/persons/{b}/presences", {"slots": [], "nights": [SAT]}, status=204)
    api.adm("PUT", f"/persons/{b}/bed", {"bed_id": single}, status=200)
    api.adm("PUT", f"/persons/{c}/bed", {"bed_id": single, "dates": [FRI]}, status=200)
    api.pub("PUT", f"/persons/{b}/presences", {"slots": [], "nights": NIGHTS}, status=204)
    assert api.nights()[b] == {FRI: None, SAT: single}


def test_auto_assign_night_by_night(api, room) -> None:
    double = bed(api, room)
    a, b, c, d = (api.person(n) for n in ("Alice", "Bob", "Chloé", "David"))
    api.couple(a, b)
    api.couple(c, d)
    for x, night in ((a, FRI), (b, FRI), (c, SAT), (d, SAT)):
        api.pub("PUT", f"/persons/{x}/presences", {"slots": [], "nights": [night]}, status=204)
    assert api.adm("POST", "/rooms/auto-assign", status=200).json() == {"assigned": 4, "unassigned": 0, "undeclared": 0}
    assert {bed_ for x in (a, b, c, d) for bed_ in api.beds_of(x)} == {double}


def test_stay_without_night(client) -> None:
    api = make_stay(client, end_date="2026-10-30", first_meal="lunch", last_meal="dinner")
    assert api.snap()["nights"] == []
    room = api.adm("POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    a = api.person("Alice")
    api.adm("PUT", f"/persons/{a}/bed", {"bed_id": bed(api, room)}, status=422)
