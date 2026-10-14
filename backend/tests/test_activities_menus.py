"""Activités (toutes sur inscription, « inscrire tout le monde ») et menus."""

from datetime import date


def signups(api) -> set[tuple[int, int]]:
    return {(s["activity_id"], s["person_id"]) for s in api.snap()["signups"]}


def test_activity_crud(api) -> None:
    body = {"name": "Rando", "date": "2026-10-31", "start_time": "10:00", "end_time": "12:00", "location": "Lac", "description": "Pique-nique"}
    act = api.adm("POST", "/activities", body, status=201).json()
    assert "optional" not in act
    api.adm("PATCH", f"/activities/{act['id']}", {**body, "name": "Grande rando"}, status=200)
    got = api.snap()["activities"][0]
    assert got["name"] == "Grande rando" and got["location"] == "Lac"
    api.adm("PATCH", f"/activities/{act['id']}", {**body, "date": "2026-12-01"}, status=422)
    api.adm("DELETE", f"/activities/{act['id']}", status=204)
    assert api.snap()["activities"] == []


def test_activities_sorted_by_date_and_time(api) -> None:
    for name, date_, time in [("C", "2026-11-01", "09:00"), ("B", "2026-10-31", "15:00"), ("A", "2026-10-31", "10:00")]:
        api.adm("POST", "/activities", {"name": name, "date": date_, "start_time": time}, status=201)
    assert [a["name"] for a in api.snap()["activities"]] == ["A", "B", "C"]


def test_signup_is_free(api) -> None:
    """Toute personne du séjour s'inscrit à toute activité, même absente ce jour-là."""
    a = api.person("Alice")  # aucune présence
    kayak = api.adm("POST", "/activities", {"name": "Kayak", "date": "2026-10-31"}, status=201).json()["id"]

    api.pub("PUT", f"/activities/{kayak}/signups/{a}", status=204)
    api.pub("PUT", f"/activities/{kayak}/signups/{a}", status=204)  # idempotent
    assert signups(api) == {(kayak, a)}
    api.pub("PUT", f"/activities/999999/signups/{a}", status=404)
    api.pub("PUT", f"/activities/{kayak}/signups/999999", status=404)
    api.pub("DELETE", f"/activities/999999/signups/{a}", status=404)

    api.pub("DELETE", f"/activities/{kayak}/signups/{a}", status=204)
    api.pub("DELETE", f"/activities/{kayak}/signups/{a}", status=204)  # idempotent
    assert signups(api) == set()


def test_create_inviting_everyone_present_that_day(api) -> None:
    here = api.person("Alice")
    api.present(here, [{"date": "2026-10-31", "meal": "breakfast"}, {"date": "2026-10-31", "meal": "dinner"}])
    kid = api.person("Léo", kind="child", with_=here)
    api.present(kid, [{"date": "2026-10-31", "meal": "lunch"}])
    away = api.person("Paul")
    api.present(away, [{"date": "2026-10-30", "meal": "dinner"}])
    api.person("Nina")  # aucune présence

    jeux = api.adm("POST", "/activities", {"name": "Jeux", "date": "2026-10-31", "invite_all": True}, status=201).json()["id"]
    kayak = api.adm("POST", "/activities", {"name": "Kayak", "date": "2026-10-31"}, status=201).json()["id"]
    assert signups(api) == {(jeux, here), (jeux, kid)}, "les présents du jour, une seule fois chacun"


def test_invite_all_adds_only_missing_people_and_respects_withdrawals(api) -> None:
    a, b = api.person("Alice"), api.person("Bob")
    api.present(a)
    api.present(b)
    jeux = api.adm("POST", "/activities", {"name": "Jeux", "date": "2026-10-31", "invite_all": True}, status=201).json()["id"]
    api.pub("DELETE", f"/activities/{jeux}/signups/{b}", status=204)
    api.pub("DELETE", f"/activities/{jeux}/signups/{b}", status=204)  # idempotent
    late = api.person("Camille")
    api.present(late)

    assert api.adm("POST", f"/activities/{jeux}/signups/all", status=200).json() == {"added": 1}
    assert signups(api) == {(jeux, a), (jeux, late)}, "Bob s'est retiré : pas réinscrit"
    assert api.adm("POST", f"/activities/{jeux}/signups/all", status=200).json() == {"added": 0}
    api.adm("POST", "/activities/999999/signups/all", status=404)

    # Bob se réinscrit puis se retire de nouveau : son choix reste respecté.
    api.pub("PUT", f"/activities/{jeux}/signups/{b}", status=204)
    assert (jeux, b) in signups(api)
    api.pub("DELETE", f"/activities/{jeux}/signups/{b}", status=204)
    assert api.adm("POST", f"/activities/{jeux}/signups/all", status=200).json() == {"added": 0}


def test_presences_and_dates_never_touch_signups(api) -> None:
    a = api.person("Alice")
    api.present(a)
    body = {"name": "Jeux", "date": "2026-10-31"}
    jeux = api.adm("POST", "/activities", {**body, "invite_all": True}, status=201).json()["id"]
    api.present(a, [])
    api.adm("PATCH", f"/activities/{jeux}", {**body, "date": "2026-11-01"}, status=200)
    assert signups(api) == {(jeux, a)}
    assert api.snap()["activities"][0]["date"] == date(2026, 11, 1).isoformat()


def test_deleting_activity_removes_signups(api) -> None:
    a = api.person("Alice")
    kayak = api.adm("POST", "/activities", {"name": "Kayak", "date": "2026-10-31"}, status=201).json()["id"]
    api.pub("PUT", f"/activities/{kayak}/signups/{a}", status=204)
    api.adm("DELETE", f"/activities/{kayak}", status=204)
    assert api.snap()["signups"] == []


def test_menu_upsert(api) -> None:
    slot = {"date": "2026-10-31", "meal": "lunch"}
    api.adm("PUT", "/menus", {**slot, "dishes": "  Raclette\nSalade  ", "notes": " Sans gluten "}, status=200)
    api.adm("PUT", "/menus", {**slot, "dishes": "Raclette\nSalade\nFruits"}, status=200)
    menus = api.snap()["menus"]
    assert menus == [{**slot, "dishes": "Raclette\nSalade\nFruits", "notes": ""}]
