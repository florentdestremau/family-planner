"""Doublons : homonymes refusés à l'ajout (même foyer, ou ailleurs sans confirmation), y compris quand
le formulaire part deux fois en même temps ; l'organisateur fusionne un doublon dans la personne gardée."""

import threading

import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.households import name_key
from app.models import Decline, LogEntry

from .conftest import NIGHTS, SLOTS, make_stay
from .test_journal import adm, entries, pub, said

FRI, SAT, SUN = "2026-10-30", "2026-10-31", "2026-11-01"


def names(api) -> list[str]:
    return sorted(p["name"] for p in api.snap()["persons"])


# --- Homonymes à l'ajout -----------------------------------------------------


def test_name_key_ignores_case_accents_and_spaces() -> None:
    assert name_key("  Aliénor ") == name_key("ALIENOR") == "alienor"
    assert name_key("Marie  Claire") == "marie claire"
    assert name_key("Marie") != name_key("Mario")


@pytest.mark.parametrize("side", ["pub", "adm"])
def test_same_name_in_the_household_is_refused(api, side) -> None:
    """Guillemette, à peine inscrite, s'ajoute elle-même à son foyer « en couple avec Guillemette »."""
    g = api.pub("POST", "/persons", {"name": "Guillemette"}, status=201).json()
    body = {"name": "guillemette ", "household_id": g["household_id"], "partner_id": g["id"], "allow_same_name": True}
    r = getattr(api, side)("POST", "/persons", body, status=409)
    assert r.json()["detail"] == "Guillemette fait déjà partie de ce foyer"
    assert names(api) == ["Guillemette"]
    assert api.persons()[g["id"]]["partner_id"] is None


@pytest.mark.parametrize("side", ["pub", "adm"])
def test_same_name_elsewhere_needs_a_confirmation(api, side) -> None:
    api.pub("POST", "/persons", {"name": "Florent"}, status=201)
    r = getattr(api, side)("POST", "/persons", {"name": "FLORENT"}, status=409)
    assert r.json()["detail"].startswith("« Florent » est déjà dans le séjour")
    assert names(api) == ["Florent"]
    # Un vrai homonyme (un cousin), confirmé : accepté.
    getattr(api, side)("POST", "/persons", {"name": "Florent", "allow_same_name": True}, status=201)
    assert names(api) == ["Florent", "Florent"]


def test_homonyms_in_another_stay_do_not_count(client) -> None:
    a, b = make_stay(client), make_stay(client)
    a.pub("POST", "/persons", {"name": "Florent"}, status=201)
    b.pub("POST", "/persons", {"name": "Florent"}, status=201)


def test_join_sent_twice_at_once_creates_one_person(api) -> None:
    """Florent touche deux fois « M'ajouter » : deux requêtes simultanées, une seule personne."""
    for attempt in range(10):
        barrier = threading.Barrier(3)
        codes: list[int] = []

        def join(name: str = f"Florent {attempt}") -> None:
            barrier.wait()
            codes.append(api.client.post(f"{api.base}/persons", json={"name": name}).status_code)

        threads = [threading.Thread(target=join) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert sorted(codes) == [201, 409, 409]
    assert len(api.snap()["persons"]) == 10


# --- Fusion d'un doublon -----------------------------------------------------


def test_merge_the_florent_double_join(api) -> None:
    """Le cas de prod : un second Florent, seul dans son foyer, sans rien."""
    florent = api.person("Florent")
    carole = api.person("Carole", with_=florent, partner_id=florent)
    api.present(florent)
    dup = api.person("Florent", allow_same_name=True)
    adm(api, "POST", f"/persons/{dup}/merge", {"into_id": florent}, actor=florent, status=204)
    snap = api.snap()
    assert names(api) == ["Carole", "Florent"]
    assert len(snap["households"]) == 1, "le foyer vide du doublon disparaît"
    assert api.persons()[florent]["partner_id"] == carole
    entry = entries(api)[0]
    assert said(entry) == "Florent a fusionné le doublon Florent (foyer « Florent ») dans Florent (foyer « Carole & Florent »)"
    assert entry["subjects"] == [florent]
    assert entry["detail"] == ["Florent (adulte, foyer « Florent »)"]


def test_merge_the_guillemette_self_couple(api) -> None:
    """L'autre cas de prod : deux Guillemette du même foyer, en couple l'une avec l'autre."""
    g1 = api.person("Guillemette")
    g2 = api.person("Guillemette 2", with_=g1, partner_id=g1)
    adm(api, "PATCH", f"/persons/{g2}", {"name": "Guillemette"}, status=200)  # comme en prod
    for g in (g1, g2):
        api.present(g)
    adm(api, "POST", f"/persons/{g2}/merge", {"into_id": g1}, status=204)
    p = api.persons()
    assert list(p) == [g1] and p[g1]["partner_id"] is None
    assert len(api.snap()["households"]) == 1
    assert {(x["date"], x["meal"]) for x in api.snap()["presences"]} == {(s["date"], s["meal"]) for s in SLOTS}


def test_merge_keeps_everything_the_duplicate_had_in_addition(api) -> None:
    keep, dup = api.person("Paul"), api.person("Paulo")
    room = adm(api, "POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    bed = adm(api, "POST", f"/rooms/{room}/beds", {"kind": "double"}, status=201).json()["id"]
    # Repas : Paul le vendredi soir et le samedi matin, le doublon tout le séjour, dans le lit double.
    api.present(keep, SLOTS[:2])
    api.present(dup)
    adm(api, "PUT", f"/persons/{dup}/bed", {"bed_id": bed}, status=200)
    assert api.nights()[keep] == {NIGHTS[0]: None}
    # Activités : Paul inscrit à la rando ; le doublon à la rando, aux jeux, et retiré du cinéma.
    rando, jeux, cine, foot = (
        adm(api, "POST", "/activities", {"name": name, "date": SAT}, status=201).json()["id"] for name in ("Rando", "Jeux", "Ciné", "Foot")
    )
    pub(api, "PUT", f"/activities/{rando}/signups/{keep}", status=204)
    pub(api, "DELETE", f"/activities/{jeux}/signups/{keep}", status=204)  # Paul s'était retiré des jeux
    pub(api, "DELETE", f"/activities/{foot}/signups/{keep}", status=204)  # et du foot
    for activity in (rando, jeux):
        pub(api, "PUT", f"/activities/{activity}/signups/{dup}", status=204)
    pub(api, "DELETE", f"/activities/{cine}/signups/{dup}", status=204)
    pub(api, "DELETE", f"/activities/{foot}/signups/{dup}", status=204)
    # Corvées : la même vaisselle du vendredi pour les deux, et celle du samedi pour le doublon.
    chore = adm(api, "POST", "/chore-types", {"name": "Vaisselle", "moments": ["dinner"]}, status=201).json()["id"]
    for day, people in ((FRI, [keep, dup]), (SAT, [dup])):
        adm(api, "PUT", "/chores/occurrence", {"chore_type_id": chore, "date": day, "moment": "dinner", "person_ids": people}, status=204)
    # Régimes et heures : le doublon les a donnés, Paul seulement son heure d'arrivée.
    pub(api, "PUT", f"/persons/{dup}/diet", {"diets": ["vegan"], "diet_note": "pas de kiwi"}, status=200)
    times = {"arrival_time": "18:00", "departure_time": "16:00", "times_note": "en train"}
    pub(api, "PUT", f"/households/{api.household_of(dup)}/times", {"members": [{"person_id": dup, **times}]}, status=200)
    mine = {"arrival_time": "20:00", "departure_time": "", "times_note": ""}
    pub(api, "PUT", f"/households/{api.household_of(keep)}/times", {"members": [{"person_id": keep, **mine}]}, status=200)
    pub(api, "PATCH", f"/households/{api.household_of(dup)}", {"name": "Les Paulo"}, actor=dup, status=200)

    adm(api, "POST", f"/persons/{dup}/merge", {"into_id": keep}, status=204)

    snap = api.snap()
    assert [p["id"] for p in snap["persons"]] == [keep]
    assert {(x["date"], x["meal"]) for x in snap["presences"]} == {(s["date"], s["meal"]) for s in SLOTS}
    assert api.nights()[keep] == {NIGHTS[0]: bed, NIGHTS[1]: bed}, "nuit gardée sans lit : prend celui du doublon"
    assert {s["activity_id"] for s in snap["signups"]} == {rando, jeux}, "inscrit aux jeux par le doublon"
    with SessionLocal() as db:
        declines = set(db.scalars(select(Decline.activity_id).where(Decline.person_id == keep)))
    assert declines == {cine, foot}, "retiré du ciné (par le doublon) et du foot ; plus des jeux"
    assert sorted((a["date"], a["person_id"]) for a in snap["chore_assignments"]) == [(FRI, keep), (SAT, keep)]
    p = snap["persons"][0]
    assert (p["diets"], p["diet_note"]) == (["vegan"], "pas de kiwi")
    assert (p["arrival_time"], p["departure_time"], p["times_note"]) == ("20:00", "16:00", "en train")
    # « Me concerne » : Paul retrouve les lignes du doublon ; aucune ne désigne plus le doublon.
    with SessionLocal() as db:
        subjects = db.scalars(select(LogEntry.subjects)).all()
    assert not any(f",{dup}," in s for s in subjects)
    mine_lines = [said(e) for e in entries(api, persons=keep)]
    assert "quelqu'un a modifié les régimes et allergies de Paulo — coché végan ; précision modifiée" in mine_lines
    detail = entries(api)[0]["detail"]
    assert detail[0] == "Paulo (adulte, foyer « Les Paulo »)" and "  Régimes et allergies : végan, « pas de kiwi »" in detail


def test_merge_keeps_the_kept_person_own_beds_diets_and_times(api) -> None:
    keep, dup = api.person("Anne"), api.person("Annie")
    room = adm(api, "POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    beds = [adm(api, "POST", f"/rooms/{room}/beds", {"kind": "single"}, status=201).json()["id"] for _ in range(2)]
    for p, bed in zip((keep, dup), beds):
        api.present(p)
        adm(api, "PUT", f"/persons/{p}/bed", {"bed_id": bed}, status=200)
    pub(api, "PUT", f"/persons/{keep}/diet", {"diets": ["gluten_free"]}, status=200)
    pub(api, "PUT", f"/persons/{dup}/diet", {"diets": ["vegan"], "diet_note": "œufs"}, status=200)
    for p, t in ((keep, "09:00"), (dup, "10:00")):
        times = {"person_id": p, "arrival_time": t, "departure_time": t, "times_note": f"note {t}"}
        pub(api, "PUT", f"/households/{api.household_of(p)}/times", {"members": [times]}, status=200)
    adm(api, "POST", f"/persons/{dup}/merge", {"into_id": keep}, status=204)
    assert api.beds_of(keep) == {beds[0]}
    p = api.persons()[keep]
    assert (p["diets"], p["diet_note"]) == (["gluten_free"], "")
    assert (p["arrival_time"], p["departure_time"], p["times_note"]) == ("09:00", "09:00", "note 09:00")


def test_merge_passes_the_duplicate_couple_on(api) -> None:
    """Le doublon de Paul était en couple avec Marie dans le foyer de Paul : le couple passe à Paul."""
    paul = api.person("Paul")
    dup = api.person("Paul bis", with_=paul)
    marie = api.person("Marie", with_=paul, partner_id=dup)
    adm(api, "POST", f"/persons/{dup}/merge", {"into_id": paul}, status=204)
    p = api.persons()
    assert p[paul]["partner_id"] == marie and p[marie]["partner_id"] == paul


@pytest.mark.parametrize("case", ["kept_in_couple", "other_household", "kept_is_child"])
def test_merge_drops_a_couple_it_cannot_pass_on(api, case) -> None:
    paul = api.person("Paul", "child" if case == "kept_is_child" else "adult")
    dup = api.person("Paul bis")
    marie = api.person("Marie", with_=dup, partner_id=dup)
    if case == "kept_in_couple":
        api.person("Léa", with_=paul, partner_id=paul)
    if case != "other_household":
        adm(api, "PUT", f"/persons/{marie}/household", {"household_id": api.household_of(paul)}, status=200)
        adm(api, "PUT", f"/persons/{dup}/household", {"household_id": api.household_of(paul)}, status=200)
        adm(api, "PUT", f"/persons/{dup}/partner", {"partner_id": marie}, status=200)
    adm(api, "POST", f"/persons/{dup}/merge", {"into_id": paul}, status=204)
    assert api.persons()[marie]["partner_id"] is None


def test_merge_rules(api, client) -> None:
    a, b = api.person("Anne"), api.person("Bob")
    other = make_stay(client)
    stranger = other.person("Anne")
    adm(api, "POST", f"/persons/{a}/merge", {"into_id": a}, status=422)
    adm(api, "POST", f"/persons/{a}/merge", {"into_id": stranger}, status=404)
    adm(api, "POST", f"/persons/{stranger}/merge", {"into_id": a}, status=404)
    assert api.client.post(f"{api.base}/admin/persons/{a}/merge", json={"into_id": b}).status_code == 403
    assert api.client.post(
        f"{api.base}/admin/persons/{a}/merge", json={"into_id": b}, headers={"X-Admin-Key": other.key}
    ).status_code == 403
    assert names(api) == ["Anne", "Bob"] and [p["name"] for p in other.snap()["persons"]] == ["Anne"]
