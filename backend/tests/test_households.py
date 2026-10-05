"""Foyers et personnes : création (célibataire par défaut), membres, couples, déplacements, fusion."""

import pytest

from .conftest import SLOTS


def households(api) -> dict[int, list[str]]:
    """{foyer: noms des membres}."""
    snap = api.snap()
    result = {h["id"]: [] for h in snap["households"]}
    for p in sorted(snap["persons"], key=lambda p: p["id"]):
        result[p["household_id"]].append(p["name"])
    return result


# --- Création -----------------------------------------------------------------


@pytest.mark.parametrize("side", ["pub", "adm"])
def test_a_new_person_forms_their_own_household(api, side) -> None:
    for name in ("Camille", "Paul"):
        getattr(api, side)("POST", "/persons", {"name": name}, status=201)
    assert sorted(households(api).values()) == [["Camille"], ["Paul"]]
    assert all(h["name"] == "" for h in api.snap()["households"])


def test_add_members_to_a_household(api) -> None:
    me = api.pub("POST", "/persons", {"name": "Florent"}, status=201).json()
    hid = me["household_id"]
    claire = api.pub("POST", "/persons", {"name": "Claire", "household_id": hid, "partner_id": me["id"]}, status=201).json()
    leo = api.pub("POST", "/persons", {"name": "Léo", "kind": "child", "household_id": hid}, status=201).json()
    assert households(api) == {hid: ["Florent", "Claire", "Léo"]}
    p = api.persons()
    assert p[me["id"]]["partner_id"] == claire["id"] and p[claire["id"]]["partner_id"] == me["id"]
    assert leo["does_chores"] is False and leo["does_activities"] is True
    assert p[me["id"]]["does_chores"] is True


def test_three_adults_one_couple(api) -> None:
    julien = api.person("Julien")
    sophie = api.person("Sophie", with_=julien, partner_id=julien)
    mamie = api.person("Mamie", with_=julien)
    p = api.persons()
    assert p[julien]["partner_id"] == sophie and p[mamie]["partner_id"] is None
    assert len({p[x]["household_id"] for x in (julien, sophie, mamie)}) == 1


def test_teen_can_do_chores(api) -> None:
    a = api.person("Alice")
    teen = api.person("Zoé", "child", a, does_chores=True)
    assert api.persons()[teen]["does_chores"] is True


@pytest.mark.parametrize(
    "extra",
    [
        {"partner_id": "other"},  # conjoint d'un autre foyer
        {"partner_id": "kid", "household_id": "mine"},  # conjoint enfant
        {"partner_id": "me", "household_id": "mine", "kind": "child"},  # je suis un enfant
    ],
)
def test_invalid_couple_at_creation(api, extra) -> None:
    me = api.person("Alice")
    ids = {"me": me, "mine": api.household_of(me), "other": api.person("Bob"), "kid": api.person("Léo", "child", me)}
    body = {"name": "Nouveau", **{k: ids.get(v, v) for k, v in extra.items()}}
    before = api.snap()
    api.pub("POST", "/persons", body, status=422)
    # Rien n'est créé, pas même un foyer vide.
    assert api.snap() == before


def test_unknown_household(api) -> None:
    api.pub("POST", "/persons", {"name": "X", "household_id": 999999}, status=404)
    assert api.snap()["households"] == []


def test_rename_household(api) -> None:
    hid = api.household_of(api.person("Alice"))
    api.pub("PATCH", f"/households/{hid}", {"name": "  Famille Martin "}, status=200)
    assert api.snap()["households"][0]["name"] == "Famille Martin"
    api.pub("PATCH", f"/households/{hid}", {"name": ""}, status=200)
    api.pub("PATCH", f"/households/{hid}", {"name": "x" * 101}, status=422)
    api.pub("PATCH", "/households/999999", {"name": "X"}, status=404)


# --- Présences du foyer ------------------------------------------------------------


def test_household_presences_in_one_call(api) -> None:
    a = api.person("Alice")
    b = api.person("Bob", with_=a)
    kid = api.person("Léo", "child", a)
    hid = api.household_of(a)
    body = {"members": [{"person_id": x, "slots": SLOTS[:2]} for x in (a, b, kid)]}
    api.pub("PUT", f"/households/{hid}/presences", body, status=204)
    assert len(api.snap()["presences"]) == 6
    # Seuls les membres listés sont modifiés.
    api.pub("PUT", f"/households/{hid}/presences", {"members": [{"person_id": kid, "slots": []}]}, status=204)
    assert {p["person_id"] for p in api.snap()["presences"]} == {a, b}


def test_household_presences_rules(api) -> None:
    a = api.person("Alice")
    stranger = api.person("Zoé")
    hid = api.household_of(a)
    before = api.snap()["presences"]
    body = {"members": [{"person_id": a, "slots": SLOTS}, {"person_id": stranger, "slots": SLOTS}]}
    api.pub("PUT", f"/households/{hid}/presences", body, status=422)
    bad_slot = {"members": [{"person_id": a, "slots": [{"date": "2030-01-01", "meal": "lunch"}]}]}
    api.pub("PUT", f"/households/{hid}/presences", bad_slot, status=422)
    api.pub("PUT", f"/households/{hid}/presences", {"members": []}, status=422)
    assert api.snap()["presences"] == before, "tout ou rien"


# --- Modifications --------------------------------------------------------------


def test_patch_updates_only_given_fields(api) -> None:
    a = api.person("Alice")
    api.adm("PATCH", f"/persons/{a}", {"does_chores": False}, status=200)
    p = api.persons()[a]
    assert p["name"] == "Alice" and p["does_chores"] is False and p["does_activities"] is True
    api.adm("PATCH", f"/persons/{a}", {"name": "Alicia", "does_activities": False}, status=200)
    p = api.persons()[a]
    assert p["name"] == "Alicia" and p["does_chores"] is False and p["does_activities"] is False


def test_partner_link_is_symmetric_and_exclusive(api) -> None:
    a = api.person("Alice")
    b, c = api.person("Bob", with_=a), api.person("Chloé", with_=a)
    api.couple(a, b)
    p = api.persons()
    assert p[a]["partner_id"] == b and p[b]["partner_id"] == a
    api.couple(a, c)
    p = api.persons()
    assert p[a]["partner_id"] == c and p[c]["partner_id"] == a and p[b]["partner_id"] is None
    api.couple(b, c)
    p = api.persons()
    assert p[b]["partner_id"] == c and p[c]["partner_id"] == b and p[a]["partner_id"] is None
    api.adm("PUT", f"/persons/{b}/partner", {"partner_id": None}, status=200)
    assert all(x["partner_id"] is None for x in api.persons().values())


def test_partner_rules(api) -> None:
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    other = api.person("Bob")
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": a}, status=422)
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": kid}, status=422)
    api.adm("PUT", f"/persons/{kid}/partner", {"partner_id": a}, status=422)
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": other}, status=422)  # autre foyer
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": 999999}, status=404)


def test_adult_becoming_child_leaves_couple(api) -> None:
    a = api.person("Alice")
    b = api.person("Bob", with_=a, partner_id=a)
    api.adm("PATCH", f"/persons/{b}", {"kind": "child"}, status=200)
    p = api.persons()
    assert p[a]["partner_id"] is None and p[b]["partner_id"] is None and p[b]["kind"] == "child"
    api.adm("PATCH", f"/persons/{b}", {"kind": "adult"}, status=200)
    assert api.persons()[b]["kind"] == "adult"


# --- Déplacements, fusion, suppression -------------------------------------------


def test_move_to_another_household_breaks_couple_and_drops_empty_household(api) -> None:
    a = api.person("Alice")
    b = api.person("Bob", with_=a, partner_id=a)
    solo = api.person("Camille")
    solo_household = api.household_of(solo)
    api.adm("PUT", f"/persons/{solo}/household", {"household_id": api.household_of(a)}, status=200)
    assert solo_household not in households(api), "le foyer vide disparaît"
    api.adm("PUT", f"/persons/{b}/household", {"household_id": None}, status=200)
    p = api.persons()
    assert p[a]["partner_id"] is None and p[b]["partner_id"] is None
    assert sorted(households(api).values()) == [["Alice", "Camille"], ["Bob"]]


def test_move_to_same_household_changes_nothing(api) -> None:
    a = api.person("Alice")
    b = api.person("Bob", with_=a, partner_id=a)
    api.adm("PUT", f"/persons/{b}/household", {"household_id": api.household_of(a)}, status=200)
    assert api.persons()[b]["partner_id"] == a


def test_merge_households(api) -> None:
    paul = api.person("Paul")
    lea = api.person("Léa")
    rose = api.person("Rose", "child", lea)
    api.present(rose)
    source, target = api.household_of(lea), api.household_of(paul)
    merged = api.adm("POST", f"/households/{source}/merge", {"into_id": target}, status=200).json()
    assert merged["id"] == target
    assert households(api) == {target: ["Paul", "Léa", "Rose"]}
    assert len(api.snap()["presences"]) == 6, "les présences suivent"
    api.couple(paul, lea)  # désormais possible
    api.adm("POST", f"/households/{target}/merge", {"into_id": target}, status=422)
    api.adm("POST", f"/households/{target}/merge", {"into_id": 999999}, status=404)


def test_delete_household_deletes_its_members(api) -> None:
    a = api.person("Alice")
    api.person("Léo", "child", a)
    keep = api.person("Bob")
    api.present(a)
    api.adm("DELETE", f"/households/{api.household_of(a)}", status=204)
    snap = api.snap()
    assert [p["id"] for p in snap["persons"]] == [keep] and snap["presences"] == []
    assert len(snap["households"]) == 1


def test_delete_person_cascades_and_drops_empty_household(api) -> None:
    a = api.person("Alice")
    b = api.person("Bob", with_=a, partner_id=a)
    api.present(a)
    act = api.adm("POST", "/activities", {"name": "Rando", "date": "2026-10-31", "optional": True}, status=201).json()
    api.pub("PUT", f"/activities/{act['id']}/signups/{a}", status=204)
    chore = api.snap()["chore_types"][0]["id"]
    api.adm("PUT", "/chores/occurrence", {"chore_type_id": chore, "date": "2026-10-31", "moment": "day", "person_ids": [a, b]}, status=204)

    api.adm("DELETE", f"/persons/{a}", status=204)
    snap = api.snap()
    p = {x["id"]: x for x in snap["persons"]}
    assert a not in p and p[b]["partner_id"] is None
    assert snap["presences"] == [] and snap["signups"] == []
    assert [x["person_id"] for x in snap["chore_assignments"]] == [b]
    api.adm("DELETE", f"/persons/{a}", status=404)

    api.adm("DELETE", f"/persons/{b}", status=204)
    assert api.snap()["households"] == []
