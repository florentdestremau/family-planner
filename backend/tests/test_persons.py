"""Personnes : attributs, enfants rattachés, couples, suppression."""


def test_defaults_depend_on_kind(api) -> None:
    adult = api.person("Alice")
    child = api.person("Léo", "child", adult)
    persons = api.persons()
    assert persons[adult]["does_chores"] and persons[adult]["does_activities"]
    assert not persons[child]["does_chores"] and persons[child]["does_activities"]
    teen = api.person("Zoé", "child", adult, does_chores=True)
    assert api.persons()[teen]["does_chores"]


def test_public_self_registration(api) -> None:
    me = api.pub("POST", "/persons", {"name": "Florent"}, status=201).json()
    kid = api.pub("POST", "/persons", {"name": "Emma", "kind": "child", "guardian_id": me["id"]}, status=201).json()
    assert me["kind"] == "adult" and me["guardian_id"] is None
    assert kid["guardian_id"] == me["id"] and kid["does_chores"] is False


def test_adult_never_has_a_guardian(api) -> None:
    a = api.person("Alice")
    b = api.adm("POST", "/persons", {"name": "Bob", "kind": "adult", "guardian_id": a}, status=201).json()
    assert b["guardian_id"] is None


def test_guardian_must_be_an_adult(api) -> None:
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    api.pub("POST", "/persons", {"name": "Emma", "kind": "child", "guardian_id": kid}, status=422)
    other = api.person("Emma", "child", a)
    api.adm("PATCH", f"/persons/{other}", {"guardian_id": kid}, status=422)
    api.adm("PATCH", f"/persons/{kid}", {"guardian_id": kid}, status=422)


def test_patch_updates_only_given_fields(api) -> None:
    a = api.person("Alice")
    api.adm("PATCH", f"/persons/{a}", {"does_chores": False}, status=200)
    p = api.persons()[a]
    assert p["name"] == "Alice" and p["does_chores"] is False and p["does_activities"] is True
    api.adm("PATCH", f"/persons/{a}", {"name": "Alicia", "does_activities": False}, status=200)
    p = api.persons()[a]
    assert p["name"] == "Alicia" and p["does_chores"] is False and p["does_activities"] is False


def test_child_can_be_detached_from_guardian(api) -> None:
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    api.adm("PATCH", f"/persons/{kid}", {"guardian_id": None}, status=200)
    assert api.persons()[kid]["guardian_id"] is None


def test_child_becoming_adult_loses_guardian(api) -> None:
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    api.adm("PATCH", f"/persons/{kid}", {"kind": "adult"}, status=200)
    assert api.persons()[kid]["guardian_id"] is None


def test_guardian_cannot_become_child_while_responsible(api) -> None:
    a = api.person("Alice")
    api.person("Léo", "child", a)
    api.adm("PATCH", f"/persons/{a}", {"kind": "child"}, status=422)
    assert api.persons()[a]["kind"] == "adult"


def test_partner_link_is_symmetric_and_exclusive(api) -> None:
    a, b, c = api.person("Alice"), api.person("Bob"), api.person("Chloé")
    api.couple(a, b)
    p = api.persons()
    assert p[a]["partner_id"] == b and p[b]["partner_id"] == a
    # Alice avec Chloé : Bob redevient seul.
    api.couple(a, c)
    p = api.persons()
    assert p[a]["partner_id"] == c and p[c]["partner_id"] == a and p[b]["partner_id"] is None
    # Bob avec Chloé : Alice redevient seule.
    api.couple(b, c)
    p = api.persons()
    assert p[b]["partner_id"] == c and p[c]["partner_id"] == b and p[a]["partner_id"] is None
    # Rupture.
    api.adm("PUT", f"/persons/{b}/partner", {"partner_id": None}, status=200)
    assert all(p["partner_id"] is None for p in api.persons().values())


def test_partner_rules(api) -> None:
    a = api.person("Alice")
    kid = api.person("Léo", "child", a)
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": a}, status=422)
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": kid}, status=422)
    api.adm("PUT", f"/persons/{kid}/partner", {"partner_id": a}, status=422)
    api.adm("PUT", f"/persons/{a}/partner", {"partner_id": 999999}, status=404)


def test_adult_becoming_child_leaves_couple(api) -> None:
    a, b = api.person("Alice"), api.person("Bob")
    api.couple(a, b)
    api.adm("PATCH", f"/persons/{b}", {"kind": "child"}, status=200)
    p = api.persons()
    assert p[a]["partner_id"] is None and p[b]["partner_id"] is None


def test_delete_person_cascades(api) -> None:
    a, b = api.person("Alice"), api.person("Bob")
    kid = api.person("Léo", "child", a)
    api.couple(a, b)
    api.present(a)
    act = api.adm("POST", "/activities", {"name": "Rando", "date": "2026-10-31", "optional": True}, status=201).json()
    api.pub("PUT", f"/activities/{act['id']}/signups/{a}", status=204)
    chore = api.snap()["chore_types"][0]["id"]
    api.adm("PUT", "/chores/occurrence", {"chore_type_id": chore, "date": "2026-10-31", "moment": "day", "person_ids": [a, b]}, status=204)

    api.adm("DELETE", f"/persons/{a}", status=204)
    snap = api.snap()
    p = {x["id"]: x for x in snap["persons"]}
    assert a not in p
    assert p[b]["partner_id"] is None
    assert p[kid]["guardian_id"] is None
    assert snap["presences"] == [] and snap["signups"] == []
    assert [x["person_id"] for x in snap["chore_assignments"]] == [b]
    api.adm("DELETE", f"/persons/{a}", status=404)


def test_child_can_change_guardian_then_former_guardian_can_become_child(api) -> None:
    a, b = api.person("Alice"), api.person("Bob")
    kid = api.person("Léo", "child", a)
    api.adm("PATCH", f"/persons/{kid}", {"guardian_id": b}, status=200)
    assert api.persons()[kid]["guardian_id"] == b
    api.adm("PATCH", f"/persons/{a}", {"kind": "child", "guardian_id": b}, status=200)
    assert api.persons()[a]["kind"] == "child" and api.persons()[a]["guardian_id"] == b
