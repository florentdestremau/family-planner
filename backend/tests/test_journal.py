"""Journal d'activité : une phrase par modification, son auteur déclaré, le détail pour l'organisateur."""

from datetime import datetime

from sqlalchemy import select

from app.db import SessionLocal
from app.models import LogEntry, Stay

from .conftest import NIGHTS, SLOTS, StayApi, make_stay
from .test_cover import JPEG, upload

FRI, SAT, SUN = "2026-10-30", "2026-10-31", "2026-11-01"


def headers(api: StayApi, actor: int | str | None = None, via: str | None = None, admin: bool = False) -> dict:
    h = {"X-Admin-Key": api.key} if admin else {}
    if actor is not None:
        h["X-Actor"] = str(actor)
    if via is not None:
        h["X-Via"] = via
    return h


def pub(api: StayApi, method: str, path: str, json=None, actor=None, via=None, status: int | None = None):
    r = api.client.request(method, f"{api.base}{path}", json=json, headers=headers(api, actor, via))
    if status is not None:
        assert r.status_code == status, (r.status_code, r.text)
    return r


def adm(api: StayApi, method: str, path: str, json=None, actor=None, status: int | None = None):
    r = api.client.request(method, f"{api.base}/admin{path}", json=json, headers=headers(api, actor, admin=True))
    if status is not None:
        assert r.status_code == status, (r.status_code, r.text)
    return r


def entries(api: StayApi, **params) -> list[dict]:
    """Journal complet, vu par l'organisateur (avec le détail), le plus récent d'abord."""
    r = api.client.get(f"{api.base}/admin/journal", params=params, headers={"X-Admin-Key": api.key})
    assert r.status_code == 200, r.text
    return r.json()["entries"]


def said(entry: dict) -> str:
    via = ", via l'assistant," if entry["via_assistant"] else ""
    return f"{entry['actor']}{via} {entry['text']}".strip()


def last(api: StayApi) -> str:
    return said(entries(api)[0])


def count(api: StayApi) -> int:
    return len(entries(api, limit=200))


def unchanged(api: StayApi, action) -> None:
    """L'action ne change rien : aucune ligne de plus."""
    before = count(api)
    action()
    assert count(api) == before


# --- Auteur ------------------------------------------------------------------


def test_stay_creation_is_logged_without_author(api) -> None:
    [entry] = entries(api)
    assert entry["actor"] == "" and entry["actor_id"] is None
    assert entry["text"] == "Séjour « Toussaint » créé"
    assert datetime.fromisoformat(entry["created_at"]).tzinfo is not None


def test_author_is_the_declared_person(api) -> None:
    anne = api.person("Anne")
    pub(api, "PATCH", f"/households/{api.household_of(anne)}", {"name": "Les A"}, actor=anne, status=200)
    [entry] = entries(api, limit=1)
    assert (entry["actor"], entry["actor_id"], entry["via_assistant"]) == ("Anne", anne, False)


def test_unknown_author_falls_back(client, api) -> None:
    anne = api.person("Anne")
    stranger = make_stay(client).person("Intrus")  # personne d'un autre séjour : ignorée
    for actor in [None, "abc", "99999", "9" * 40, str(stranger)]:
        pub(api, "PUT", f"/persons/{anne}/presences", {"slots": SLOTS[:1] if actor is None else []}, actor=actor, status=204)
        pub(api, "PUT", f"/persons/{anne}/presences", {"slots": SLOTS[:1]}, actor=actor, status=204)
        assert entries(api)[0]["actor"] == "quelqu'un"
        assert entries(api)[0]["actor_id"] is None
    adm(api, "PUT", "/menus", {"date": FRI, "meal": "dinner", "dishes": "Soupe"}, actor="abc", status=200)
    assert last(api) == "l'organisateur a modifié le menu du dîner du ven. 30/10"


def test_assistant_is_mentioned(api) -> None:
    anne = api.person("Anne")
    body = {"members": [{"person_id": anne, "slots": SLOTS[:1]}]}
    pub(api, "PUT", f"/households/{api.household_of(anne)}/presences", body, actor=anne, via="assistant", status=204)
    assert last(api) == "Anne, via l'assistant, a modifié les présences d'Anne — repas ajouté : ven. 30/10 (dîner)"


# --- Personnes et foyers -----------------------------------------------------


def test_joining_and_adding_people(api) -> None:
    paul = pub(api, "POST", "/persons", {"name": "Paul"}, status=201).json()["id"]
    [entry] = entries(api, limit=1)
    assert (said(entry), entry["actor_id"], entry["subjects"]) == ("Paul a rejoint le séjour", paul, [paul])
    pub(api, "POST", "/persons", {"name": "Léo", "kind": "child", "household_id": api.household_of(paul)}, actor=paul, status=201)
    assert last(api) == "Paul a ajouté Léo (enfant) au foyer « Paul »"
    pub(api, "POST", "/persons", {"name": "Zoé"}, actor=paul, status=201)
    assert last(api) == "Paul a ajouté Zoé, dans un nouveau foyer"
    adm(api, "POST", "/persons", {"name": "Marie", "household_id": api.household_of(paul), "partner_id": paul}, actor=paul, status=201)
    assert last(api) == "Paul a ajouté Marie au foyer « Paul », en couple avec Paul"
    adm(api, "POST", "/persons", {"name": "Jean"}, status=201)
    assert last(api) == "l'organisateur a ajouté Jean, dans un nouveau foyer"


def test_rename_household(api) -> None:
    anne = api.person("Anne")
    hh = api.household_of(anne)
    pub(api, "PATCH", f"/households/{hh}", {"name": "Les Martin"}, actor=anne, status=200)
    assert last(api) == "Anne a renommé le foyer « Anne » en « Les Martin »"
    assert entries(api)[0]["subjects"] == [anne]
    unchanged(api, lambda: pub(api, "PATCH", f"/households/{hh}", {"name": "Les Martin"}, status=200))


def test_update_person(api) -> None:
    anne, paul = api.person("Anne"), api.person("Paul")
    api.couple(anne, paul)
    adm(api, "PATCH", f"/persons/{paul}", {"name": "Paulo", "kind": "child", "does_chores": False}, actor=anne, status=200)
    assert last(api) == "Anne a modifié Paul — nom : « Paul » → « Paulo » ; passe en enfant ; ne participe plus aux corvées ; couple avec Anne défait"
    assert entries(api)[0]["subjects"] == [anne, paul]
    adm(api, "PATCH", f"/persons/{paul}", {"kind": "adult", "does_chores": True}, actor=anne, status=200)
    assert last(api) == "Anne a modifié Paulo — passe en adulte ; participe aux corvées"
    unchanged(api, lambda: adm(api, "PATCH", f"/persons/{paul}", {"name": "Paulo"}, status=200))


def test_partners(api) -> None:
    anne, paul, jean = api.person("Anne"), api.person("Paul"), api.person("Jean")
    for p in (paul, jean):
        adm(api, "PUT", f"/persons/{p}/household", {"household_id": api.household_of(anne)}, status=200)
    adm(api, "PUT", f"/persons/{anne}/partner", {"partner_id": paul}, actor=anne, status=200)
    assert last(api) == "Anne a mis Anne et Paul en couple"
    unchanged(api, lambda: adm(api, "PUT", f"/persons/{anne}/partner", {"partner_id": paul}, status=200))
    adm(api, "PUT", f"/persons/{jean}/partner", {"partner_id": anne}, actor=anne, status=200)
    assert last(api) == "Anne a mis Jean et Anne en couple ; couple d'Anne et Paul défait"
    assert sorted(entries(api)[0]["subjects"]) == sorted([anne, paul, jean])
    adm(api, "PUT", f"/persons/{anne}/partner", {"partner_id": None}, actor=anne, status=200)
    assert last(api) == "Anne a défait le couple d'Anne et Jean"


def test_move_person(api) -> None:
    anne, paul = api.person("Anne"), api.person("Paul")
    api.couple(anne, paul)
    adm(api, "PUT", f"/persons/{paul}/household", {"household_id": None}, status=200)
    assert last(api) == "l'organisateur a déplacé Paul du foyer « Anne & Paul » vers un nouveau foyer ; couple avec Anne défait"
    assert entries(api)[0]["subjects"] == [anne, paul]  # Anne aussi : son couple est défait
    adm(api, "PUT", f"/persons/{paul}/household", {"household_id": api.household_of(anne)}, status=200)
    assert last(api) == "l'organisateur a déplacé Paul du foyer « Paul » vers le foyer « Anne »"
    unchanged(api, lambda: adm(api, "PUT", f"/persons/{paul}/household", {"household_id": api.household_of(anne)}, status=200))


def test_merge_households(api) -> None:
    anne, paul = api.person("Anne"), api.person("Paul")
    adm(api, "POST", f"/households/{api.household_of(paul)}/merge", {"into_id": api.household_of(anne)}, status=200)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a fusionné le foyer « Paul » dans le foyer « Anne »"
    assert (entry["subjects"], entry["detail"]) == ([paul], ["Membres déplacés : Paul"])


def test_delete_person_keeps_what_is_needed_to_recreate_it(api) -> None:
    anne, paul = api.person("Anne"), api.person("Paul")
    api.couple(anne, paul)
    api.present(paul)
    room = adm(api, "POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    bed = adm(api, "POST", f"/rooms/{room}/beds", {"kind": "double"}, status=201).json()["id"]
    adm(api, "PUT", f"/persons/{paul}/bed", {"bed_id": bed}, status=200)
    activity = adm(api, "POST", "/activities", {"name": "Rando", "date": SAT, "start_time": "10:00"}, status=201).json()["id"]
    pub(api, "PUT", f"/activities/{activity}/signups/{paul}", status=204)
    chore = adm(api, "POST", "/chore-types", {"name": "Vaisselle", "moments": ["dinner"]}, status=201).json()["id"]
    adm(api, "PUT", "/chores/occurrence", {"chore_type_id": chore, "date": FRI, "moment": "dinner", "person_ids": [paul]}, status=204)
    pub(api, "PUT", f"/persons/{paul}/diet", {"diets": ["vegan"], "diet_note": "pas de kiwi"}, status=200)
    adm(api, "DELETE", f"/persons/{paul}", actor=anne, status=204)
    entry = entries(api)[0]
    assert said(entry) == "Anne a supprimé Paul"
    assert entry["subjects"] == [paul]
    assert entry["detail"] == [
        "Paul (adulte, foyer « Anne & Paul »)",
        "  En couple avec Anne",
        "  Repas : ven. 30/10 (dîner), sam. 31/10 (petit-déjeuner, déjeuner, dîner), dim. 01/11 (petit-déjeuner, déjeuner)",
        "  Nuits : ven. 30/10 (Bleue — lit double), sam. 31/10 (Bleue — lit double)",
        "  Activités : « Rando » (sam. 31/10 à 10:00)",
        "  Corvées : Vaisselle ven. 30/10 (dîner)",
        "  Régimes et allergies : végan, « pas de kiwi »",
    ]
    # Le journal survit à la personne, avec son nom d'alors.
    assert "Paul" in said(entries(api)[2])


def test_delete_household(api) -> None:
    anne = api.person("Anne")
    leo = api.person("Léo", kind="child", with_=anne)
    adm(api, "DELETE", f"/households/{api.household_of(anne)}", status=204)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a supprimé le foyer « Anne » (Anne et Léo)"
    assert sorted(entry["subjects"]) == sorted([anne, leo])
    assert entry["detail"] == ["Anne (adulte, foyer « Anne »)", "Léo (enfant, foyer « Anne »)"]


# --- Présences, régimes, inscriptions ----------------------------------------


def test_presences_say_what_changed(api) -> None:
    anne = api.person("Anne")
    pub(api, "PUT", f"/persons/{anne}/presences", {"slots": SLOTS}, actor=anne, status=204)
    assert last(api) == (
        "Anne a modifié les présences d'Anne — repas ajoutés : ven. 30/10 (dîner), sam. 31/10 (petit-déjeuner, déjeuner, "
        "dîner), dim. 01/11 (petit-déjeuner, déjeuner) ; nuits ajoutées : ven. 30/10, sam. 31/10"
    )
    without_saturday_dinner = [s for s in SLOTS if s != {"date": SAT, "meal": "dinner"}]
    pub(api, "PUT", f"/persons/{anne}/presences", {"slots": without_saturday_dinner, "nights": NIGHTS[:1]}, actor=anne, status=204)
    assert last(api) == "Anne a modifié les présences d'Anne — repas retiré : sam. 31/10 (dîner) ; nuit retirée : sam. 31/10"
    unchanged(api, lambda: pub(api, "PUT", f"/persons/{anne}/presences", {"slots": without_saturday_dinner}, status=204))


def test_household_presences_grouped_in_one_sentence(api) -> None:
    anne = api.person("Anne")
    paul, leo = api.person("Paul", with_=anne), api.person("Léo", kind="child", with_=anne)
    hh = api.household_of(anne)
    same = {"members": [{"person_id": p, "slots": SLOTS[:1]} for p in (anne, paul, leo)]}
    pub(api, "PUT", f"/households/{hh}/presences", same, actor=anne, status=204)
    assert last(api) == "Anne a modifié les présences d'Anne, Paul et Léo — repas ajouté : ven. 30/10 (dîner)"
    assert sorted(entries(api)[0]["subjects"]) == sorted([anne, paul, leo])
    different = {"members": [{"person_id": anne, "slots": []}, {"person_id": paul, "slots": SLOTS[:2]}, {"person_id": leo, "slots": SLOTS[:1]}]}
    pub(api, "PUT", f"/households/{hh}/presences", different, actor=paul, status=204)
    assert last(api) == (
        "Paul a modifié les présences du foyer — Anne : repas retiré : ven. 30/10 (dîner) · "
        "Paul : repas ajouté : sam. 31/10 (petit-déjeuner) ; nuit ajoutée : ven. 30/10"
    )
    assert sorted(entries(api)[0]["subjects"]) == sorted([anne, paul])


def test_same_person_twice_is_refused(api) -> None:
    anne = api.person("Anne")
    body = {"members": [{"person_id": anne, "slots": SLOTS[:1]}, {"person_id": anne, "slots": []}]}
    r = pub(api, "PUT", f"/households/{api.household_of(anne)}/presences", body, status=422)
    assert r.json()["detail"] == "Une même personne apparaît deux fois"


def test_person_ids_are_never_reused(api) -> None:
    """Le journal désigne les personnes par leur id : celui d'une personne supprimée ne revient pas."""
    api.person("Anne")
    paul = api.person("Paul")
    adm(api, "DELETE", f"/persons/{paul}", status=204)
    lea = api.person("Léa")
    assert lea > paul
    mine = api.client.get(f"{api.base}/journal", params={"persons": [lea]}).json()["entries"]
    assert [e["text"] for e in mine] == ["a ajouté Léa, dans un nouveau foyer"]


def test_diets(api) -> None:
    rose = api.person("Rose")
    pub(api, "PUT", f"/persons/{rose}/diet", {"diets": ["vegan", "gluten_free"], "diet_note": "œufs"}, actor=rose, status=200)
    assert last(api) == "Rose a modifié les régimes et allergies de Rose — coché végan, sans gluten ; précision modifiée"
    assert "œufs" not in last(api)
    pub(api, "PUT", f"/persons/{rose}/diet", {"diets": ["gluten_free"], "diet_note": "œufs"}, actor=rose, status=200)
    assert last(api) == "Rose a modifié les régimes et allergies de Rose — décoché végan"
    unchanged(api, lambda: pub(api, "PUT", f"/persons/{rose}/diet", {"diets": ["gluten_free"], "diet_note": "œufs"}, status=200))


def test_signups(api) -> None:
    anne = api.person("Anne")
    activity = adm(api, "POST", "/activities", {"name": "Rando", "date": SAT}, status=201).json()["id"]
    pub(api, "PUT", f"/activities/{activity}/signups/{anne}", actor=anne, status=204)
    assert last(api) == "Anne a inscrit Anne à « Rando » (sam. 31/10)"
    unchanged(api, lambda: pub(api, "PUT", f"/activities/{activity}/signups/{anne}", status=204))
    pub(api, "DELETE", f"/activities/{activity}/signups/{anne}", actor=anne, status=204)
    assert last(api) == "Anne a désinscrit Anne de « Rando » (sam. 31/10)"
    unchanged(api, lambda: pub(api, "DELETE", f"/activities/{activity}/signups/{anne}", status=204))


def test_times(api) -> None:
    anne = api.person("Anne")
    paul, leo = api.person("Paul", with_=anne), api.person("Léo", kind="child", with_=anne)
    hh = api.household_of(anne)

    def times(members: list[dict], actor: int) -> None:
        pub(api, "PUT", f"/households/{hh}/times", {"members": members}, actor=actor, status=200)

    times([{"person_id": anne, "arrival_time": "18:30", "times_note": "Porte ouverte"}], anne)
    assert last(api) == "Anne a modifié les heures d'arrivée et de départ d'Anne — arrivée : sans heure → 18 h 30 ; note modifiée"
    assert "Porte" not in last(api)
    # « Même heure pour tout le foyer » : une phrase, les personnes aux mêmes changements regroupées.
    same = {"arrival_time": "18:30", "departure_time": "15:00", "times_note": "Porte ouverte"}
    times([{"person_id": p, **same} for p in (anne, paul, leo)], paul)
    assert last(api) == (
        "Paul a modifié les heures d'arrivée et de départ du foyer — Anne : départ : sans heure → 15 h · "
        "Paul et Léo : arrivée : sans heure → 18 h 30 ; départ : sans heure → 15 h ; note modifiée"
    )
    assert sorted(entries(api)[0]["subjects"]) == sorted([anne, paul, leo])
    times([{"person_id": leo, **same, "arrival_time": "00:30"}], anne)
    assert last(api) == "Anne a modifié les heures d'arrivée et de départ de Léo — arrivée : 18 h 30 → 0 h 30 (dans la nuit)"
    unchanged(api, lambda: times([{"person_id": leo, **same, "arrival_time": "00:30"}], anne))
    # Supprimée, la personne laisse de quoi redonner ses heures.
    adm(api, "DELETE", f"/persons/{leo}", status=204)
    assert "  Arrivée 0 h 30 (dans la nuit), départ 15 h, note « Porte ouverte »" in entries(api)[0]["detail"]


# --- Séjour ------------------------------------------------------------------


def test_stay_settings(api) -> None:
    body = {"name": "Toussaint 2026", "separate_couples": False, "address": "1 rue Haute", "map_url": "https://maps.app.goo.gl/x", "practical_info": "Code 1234"}
    adm(api, "PATCH", "/stay", body, status=200)
    assert last(api) == (
        "l'organisateur a modifié le séjour — nom : « Toussaint » → « Toussaint 2026 » ; couples autorisés sur une même "
        "corvée ; adresse : aucune → « 1 rue Haute » ; lien Google Maps modifié ; infos pratiques modifiées"
    )
    assert "1234" not in last(api)
    adm(api, "PATCH", "/stay", {"separate_couples": True, "address": ""}, status=200)
    assert last(api) == "l'organisateur a modifié le séjour — couples séparés aux corvées ; adresse : « 1 rue Haute » → aucune"
    unchanged(api, lambda: adm(api, "PATCH", "/stay", {"name": "Toussaint 2026"}, status=200))


def test_shorter_stay_lists_what_was_removed(api) -> None:
    anne = api.person("Anne")
    api.present(anne)
    adm(api, "PUT", "/menus", {"date": SUN, "meal": "lunch", "dishes": "Gigot"}, status=200)
    chore = adm(api, "POST", "/chore-types", {"name": "Vaisselle", "moments": ["lunch"]}, status=201).json()["id"]
    adm(api, "PUT", "/chores/occurrence", {"chore_type_id": chore, "date": SUN, "moment": "lunch", "person_ids": [anne]}, status=204)
    adm(api, "PATCH", "/stay", {"end_date": SAT, "last_meal": "dinner"}, status=200)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a modifié le séjour — dates : du ven. 30/10 (dîner) au dim. 01/11 (déjeuner) → du ven. 30/10 (dîner) au sam. 31/10 (dîner)"
    assert entry["subjects"] == [anne]
    assert entry["detail"] == [
        "Anne — repas retirés : dim. 01/11 (petit-déjeuner, déjeuner) ; nuit retirée : sam. 31/10",
        "Menus retirés : dim. 01/11 (déjeuner)",
        "Corvée retirée : Vaisselle dim. 01/11 (déjeuner), Anne",
    ]


def test_cover(api) -> None:
    assert upload(api, JPEG).status_code == 200
    assert last(api) == "l'organisateur a changé l'image de couverture"
    adm(api, "DELETE", "/cover", status=200)
    assert last(api) == "l'organisateur a retiré l'image de couverture"
    unchanged(api, lambda: adm(api, "DELETE", "/cover", status=200))


# --- Chambres ----------------------------------------------------------------


def test_rooms_and_beds(api) -> None:
    room = adm(api, "POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    assert last(api) == "l'organisateur a créé la chambre « Bleue »"
    adm(api, "PATCH", f"/rooms/{room}", {"name": "Verte", "notes": "Fenêtre qui grince"}, status=200)
    assert last(api) == "l'organisateur a modifié la chambre « Bleue » — nom : « Bleue » → « Verte » ; notes modifiées"
    unchanged(api, lambda: adm(api, "PATCH", f"/rooms/{room}", {"name": "Verte", "notes": "Fenêtre qui grince"}, status=200))
    adm(api, "POST", f"/rooms/{room}/beds", {"kind": "bunk"}, status=201)
    assert last(api) == "l'organisateur a ajouté des lits superposés dans la chambre « Verte »"
    bed = adm(api, "POST", f"/rooms/{room}/beds", {"kind": "single", "label": "Près de la porte"}, status=201).json()["id"]
    anne = api.person("Anne")
    api.present(anne)
    adm(api, "PUT", f"/persons/{anne}/bed", {"bed_id": bed}, status=200)
    adm(api, "DELETE", f"/beds/{bed}", status=204)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a retiré un lit simple « Près de la porte » de la chambre « Verte »"
    assert (entry["subjects"], entry["detail"]) == ([anne], ["Verte — Près de la porte : Anne (ven. 30/10, sam. 31/10)"])
    plain = adm(api, "POST", f"/rooms/{room}/beds", {"kind": "double"}, status=201).json()["id"]
    adm(api, "DELETE", f"/beds/{plain}", status=204)
    assert (last(api), entries(api)[0]["detail"]) == ("l'organisateur a retiré un lit double de la chambre « Verte »", [])
    adm(api, "DELETE", f"/rooms/{room}", status=204)
    assert last(api) == "l'organisateur a supprimé la chambre « Verte »"


def test_set_bed(api) -> None:
    anne = api.person("Anne")
    api.present(anne)
    room = adm(api, "POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    double = adm(api, "POST", f"/rooms/{room}/beds", {"kind": "double"}, status=201).json()["id"]
    single = adm(api, "POST", f"/rooms/{room}/beds", {"kind": "single"}, status=201).json()["id"]
    adm(api, "PUT", f"/persons/{anne}/bed", {"bed_id": double}, status=200)
    assert last(api) == "l'organisateur a couché Anne dans Bleue — lit double — nuits du ven. 30/10, sam. 31/10 (avant : sans lit)"
    unchanged(api, lambda: adm(api, "PUT", f"/persons/{anne}/bed", {"bed_id": double}, status=200))
    adm(api, "PUT", f"/persons/{anne}/bed", {"bed_id": single, "dates": [SAT]}, status=200)
    assert last(api) == "l'organisateur a couché Anne dans Bleue — lit simple — nuit du sam. 31/10 (avant : Bleue — lit double)"
    adm(api, "PUT", f"/persons/{anne}/bed", {"bed_id": None}, status=200)
    assert last(api) == (
        "l'organisateur a retiré Anne de son lit — nuits du ven. 30/10, sam. 31/10 "
        "(avant : Bleue — lit double le ven. 30/10, Bleue — lit simple le sam. 31/10)"
    )
    paul = api.person("Paul")
    adm(api, "PUT", f"/persons/{paul}/bed", {"bed_id": double, "dates": [FRI]}, status=200)
    assert last(api) == "l'organisateur a couché Paul dans Bleue — lit double — nuit du ven. 30/10 ; nuit ajoutée à ses présences"


def test_auto_assign(api) -> None:
    anne, paul = api.person("Anne"), api.person("Paul")
    api.present(anne)
    api.present(paul, SLOTS[:2])
    room = adm(api, "POST", "/rooms", {"name": "Bleue"}, status=201).json()["id"]
    adm(api, "POST", f"/rooms/{room}/beds", {"kind": "single"}, status=201)
    adm(api, "POST", f"/rooms/{room}/beds", {"kind": "extra"}, status=201)
    adm(api, "POST", "/rooms/auto-assign", status=200)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a proposé un lit pour 3 nuitées"
    assert sorted(entry["subjects"]) == sorted([anne, paul])
    assert len(entry["detail"]) == 2 and entry["detail"][0].startswith("Anne : Bleue — ")
    unchanged(api, lambda: adm(api, "POST", "/rooms/auto-assign", status=200))


# --- Corvées -----------------------------------------------------------------


def test_chore_types(api) -> None:
    body = {"name": "Vaisselle", "moments": ["lunch", "dinner"], "people_needed": 2}
    chore = adm(api, "POST", "/chore-types", body, status=201).json()["id"]
    assert last(api) == "l'organisateur a créé la corvée « Vaisselle » (déjeuner, dîner ; 2 personnes ; tous les jours)"
    adm(api, "PATCH", f"/chore-types/{chore}", {**body, "name": "Plonge", "people_needed": 1, "every_n_days": 2}, status=200)
    assert last(api) == (
        "l'organisateur a modifié la corvée « Vaisselle » — nom : « Vaisselle » → « Plonge » ; "
        "déjeuner, dîner ; 2 personnes ; tous les jours → déjeuner, dîner ; 1 personne ; tous les 2 jours"
    )
    unchanged(api, lambda: adm(api, "PATCH", f"/chore-types/{chore}", {**body, "name": "Plonge", "people_needed": 1, "every_n_days": 2}, status=200))
    anne = api.person("Anne")
    adm(api, "PUT", "/chores/occurrence", {"chore_type_id": chore, "date": SAT, "moment": "lunch", "person_ids": [anne]}, status=204)
    adm(api, "DELETE", f"/chore-types/{chore}", status=204)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a supprimé la corvée « Plonge »"
    assert (entry["subjects"], entry["detail"]) == ([anne], ["sam. 31/10 (déjeuner) : Anne"])


def test_draw_then_redraw(api) -> None:
    for chore in api.snap()["chore_types"]:
        adm(api, "DELETE", f"/chore-types/{chore['id']}", status=204)
    chore = adm(api, "POST", "/chore-types", {"name": "Vaisselle", "moments": ["dinner"]}, status=201).json()["id"]
    anne, paul = api.person("Anne"), api.person("Paul")
    for p in (anne, paul):
        api.present(p)
    adm(api, "POST", "/chores/draw", status=200)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a tiré au sort les corvées — 2 affectations sur 2 créneaux"
    assert len(entry["detail"]) == 2 and entry["detail"][0].startswith("Vaisselle ven. 30/10 (dîner) : personne → ")
    # Ajustement manuel, puis tirage relancé : l'équipe d'avant reste dans le détail.
    adm(api, "PUT", "/chores/occurrence", {"chore_type_id": chore, "date": FRI, "moment": "dinner", "person_ids": [anne, paul]}, status=204)
    adm(api, "POST", "/chores/draw", status=200)
    entry = entries(api)[0]
    # Le tirage est aléatoire : l'autre créneau peut changer aussi.
    assert said(entry) in [f"l'organisateur a relancé le tirage des corvées — {n} sur 2" for n in ("1 créneau change", "2 créneaux changent")]
    assert entry["detail"][0].startswith("Vaisselle ven. 30/10 (dîner) : Anne et Paul → ")


def test_draw_without_change_is_not_logged(api) -> None:
    for chore in api.snap()["chore_types"]:
        adm(api, "DELETE", f"/chore-types/{chore['id']}", status=204)
    unchanged(api, lambda: adm(api, "POST", "/chores/draw", status=200))  # rien à tirer
    adm(api, "POST", "/chore-types", {"name": "Vaisselle", "moments": ["dinner"]}, status=201)
    api.present(api.person("Anne"))
    adm(api, "POST", "/chores/draw", status=200)
    unchanged(api, lambda: adm(api, "POST", "/chores/draw", status=200))  # seule possible : même équipe


def test_set_occurrence(api) -> None:
    chore = api.snap()["chore_types"][0]
    anne, paul = api.person("Anne"), api.person("Paul")
    body = {"chore_type_id": chore["id"], "date": SAT, "moment": "dinner", "person_ids": [anne]}
    adm(api, "PUT", "/chores/occurrence", body, actor=paul, status=204)
    assert last(api) == f"Paul a changé « {chore['name']} » du sam. 31/10 (dîner) — personne → Anne"
    unchanged(api, lambda: adm(api, "PUT", "/chores/occurrence", body, status=204))
    adm(api, "PUT", "/chores/occurrence", {**body, "person_ids": [paul]}, status=204)
    assert last(api) == f"l'organisateur a changé « {chore['name']} » du sam. 31/10 (dîner) — Anne → Paul"
    assert sorted(entries(api)[0]["subjects"]) == sorted([anne, paul])


# --- Activités et menus ------------------------------------------------------


def test_activities(api) -> None:
    anne, leo = api.person("Anne"), api.person("Léo", kind="child")
    api.present(anne)
    api.present(leo)
    body = {"name": "Rando", "date": SAT, "start_time": "10:00", "end_time": "12:00", "invite_all": True}
    activity = adm(api, "POST", "/activities", body, status=201).json()["id"]
    assert last(api) == "l'organisateur a créé l'activité « Rando » (sam. 31/10 à 10:00) et inscrit 2 personnes : Anne et Léo"
    pub(api, "DELETE", f"/activities/{activity}/signups/{leo}", status=204)
    unchanged(api, lambda: adm(api, "POST", f"/activities/{activity}/signups/all", status=200))
    pub(api, "PUT", f"/persons/{anne}/presences", {"slots": []}, status=204)
    paul = api.person("Paul")
    api.present(paul)
    adm(api, "POST", f"/activities/{activity}/signups/all", status=200)
    assert last(api) == "l'organisateur a inscrit tout le monde à « Rando » (sam. 31/10 à 10:00) — 1 personne ajoutée : Paul"
    change = {"name": "Grande rando", "date": SUN, "location": "Col", "description": "Prévoir de l'eau"}
    adm(api, "PATCH", f"/activities/{activity}", change, status=200)
    entry = entries(api)[0]
    assert said(entry) == (
        "l'organisateur a modifié l'activité « Rando » (sam. 31/10 à 10:00) — nom : « Rando » → « Grande rando » ; "
        "date : sam. 31/10 → dim. 01/11 ; horaire : 10:00–12:00 → sans horaire ; lieu : aucun → « Col » ; description modifiée"
    )
    assert sorted(entry["subjects"]) == sorted([anne, paul])
    adm(api, "PATCH", f"/activities/{activity}", {**change, "location": ""}, status=200)
    assert last(api).endswith("lieu : « Col » → aucun")
    unchanged(api, lambda: adm(api, "PATCH", f"/activities/{activity}", {**change, "location": ""}, status=200))
    adm(api, "DELETE", f"/activities/{activity}", status=204)
    entry = entries(api)[0]
    assert said(entry) == "l'organisateur a supprimé l'activité « Grande rando » (dim. 01/11)"
    assert entry["detail"] == ["Inscrits : Anne et Paul"]
    lonely = adm(api, "POST", "/activities", {"name": "Sieste", "date": SAT}, status=201).json()["id"]
    assert last(api) == "l'organisateur a créé l'activité « Sieste » (sam. 31/10)"
    adm(api, "DELETE", f"/activities/{lonely}", status=204)
    assert entries(api)[0]["detail"] == []


def test_menus(api) -> None:
    adm(api, "PUT", "/menus", {"date": SAT, "meal": "breakfast", "dishes": "Crêpes"}, status=200)
    assert last(api) == "l'organisateur a modifié le menu du petit-déjeuner du sam. 31/10"
    unchanged(api, lambda: adm(api, "PUT", "/menus", {"date": SAT, "meal": "breakfast", "dishes": " Crêpes "}, status=200))
    unchanged(api, lambda: adm(api, "PUT", "/menus", {"date": SAT, "meal": "lunch"}, status=200))


# --- Lecture -----------------------------------------------------------------


def test_public_journal_hides_detail(api) -> None:
    api.person("Anne")
    data = pub(api, "GET", "/journal", status=200).json()
    assert data["more"] is False
    assert [e["text"] for e in data["entries"]] == ["a ajouté Anne, dans un nouveau foyer", "Séjour « Toussaint » créé"]
    assert all("detail" not in e for e in data["entries"])
    assert api.client.get(f"{api.base}/admin/journal").status_code == 403
    assert api.client.get(f"{api.base}/admin/journal", headers={"X-Admin-Key": "faux"}).status_code == 403


def test_pagination_and_filter(api) -> None:
    anne, paul = api.person("Anne"), api.person("Paul")
    for slots in (SLOTS[:1], SLOTS[:2], SLOTS[:3]):
        api.present(anne, slots)
    api.present(paul)
    first = pub(api, "GET", "/journal", status=200, json=None)
    assert len(first.json()["entries"]) == 7
    page = api.client.get(f"{api.base}/journal", params={"limit": 3}).json()
    assert (len(page["entries"]), page["more"]) == (3, True)
    rest = api.client.get(f"{api.base}/journal", params={"limit": 50, "before": page["entries"][-1]["id"]}).json()
    assert (len(rest["entries"]), rest["more"]) == (4, False)
    mine = api.client.get(f"{api.base}/journal", params={"persons": [anne]}).json()["entries"]
    assert len(mine) == 4 and all(anne in e["subjects"] for e in mine)
    both = api.client.get(f"{api.base}/journal", params={"persons": [anne, paul]}).json()["entries"]
    assert len(both) == 6
    assert api.client.get(f"{api.base}/journal", params={"limit": 500}).status_code == 422


def test_isolation_between_stays(client, api) -> None:
    other = make_stay(client, name="Noël")
    other.person("Camille")
    assert [e["text"] for e in entries(api)] == ["Séjour « Toussaint » créé"]
    assert client.get("/api/stays/inconnu/journal").status_code == 404


def test_journal_goes_with_its_stay(api) -> None:
    with SessionLocal() as db:
        db.delete(db.scalar(select(Stay).where(Stay.slug == api.slug)))
        db.commit()
        assert db.scalars(select(LogEntry)).all() == []
