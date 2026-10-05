"""Activités (facultatives ou non, inscriptions) et menus."""


def test_activity_crud(api) -> None:
    body = {"name": "Rando", "date": "2026-10-31", "start_time": "10:00", "end_time": "12:00", "location": "Lac", "description": "Pique-nique"}
    act = api.adm("POST", "/activities", body, status=201).json()
    api.adm("PATCH", f"/activities/{act['id']}", {**body, "name": "Grande rando", "optional": True}, status=200)
    got = api.snap()["activities"][0]
    assert got["name"] == "Grande rando" and got["optional"] and got["location"] == "Lac"
    api.adm("PATCH", f"/activities/{act['id']}", {**body, "date": "2026-12-01"}, status=422)
    api.adm("DELETE", f"/activities/{act['id']}", status=204)
    assert api.snap()["activities"] == []


def test_activities_sorted_by_date_and_time(api) -> None:
    for name, date, time in [("C", "2026-11-01", "09:00"), ("B", "2026-10-31", "15:00"), ("A", "2026-10-31", "10:00")]:
        api.adm("POST", "/activities", {"name": name, "date": date, "start_time": time}, status=201)
    assert [a["name"] for a in api.snap()["activities"]] == ["A", "B", "C"]


def test_signup_rules(api) -> None:
    a = api.person("Alice")
    lazy = api.person("Paul", does_activities=False)
    opt = api.adm("POST", "/activities", {"name": "Kayak", "date": "2026-10-31", "optional": True}, status=201).json()["id"]
    mandatory = api.adm("POST", "/activities", {"name": "Jeux", "date": "2026-10-31"}, status=201).json()["id"]

    api.pub("PUT", f"/activities/{opt}/signups/{a}", status=204)
    api.pub("PUT", f"/activities/{opt}/signups/{a}", status=204)  # idempotent
    assert api.snap()["signups"] == [{"activity_id": opt, "person_id": a}]
    api.pub("PUT", f"/activities/{mandatory}/signups/{a}", status=422)
    api.pub("PUT", f"/activities/{opt}/signups/{lazy}", status=422)
    api.pub("PUT", f"/activities/999999/signups/{a}", status=404)

    api.pub("DELETE", f"/activities/{opt}/signups/{a}", status=204)
    api.pub("DELETE", f"/activities/{opt}/signups/{a}", status=204)  # idempotent
    assert api.snap()["signups"] == []


def test_deleting_activity_removes_signups(api) -> None:
    a = api.person("Alice")
    opt = api.adm("POST", "/activities", {"name": "Kayak", "date": "2026-10-31", "optional": True}, status=201).json()["id"]
    api.pub("PUT", f"/activities/{opt}/signups/{a}", status=204)
    api.adm("DELETE", f"/activities/{opt}", status=204)
    assert api.snap()["signups"] == []


def test_menu_upsert(api) -> None:
    slot = {"date": "2026-10-31", "meal": "lunch"}
    api.adm("PUT", "/menus", {**slot, "dishes": "  Raclette\nSalade  ", "notes": " Sans gluten "}, status=200)
    api.adm("PUT", "/menus", {**slot, "dishes": "Raclette\nSalade\nFruits"}, status=200)
    menus = api.snap()["menus"]
    assert menus == [{**slot, "dishes": "Raclette\nSalade\nFruits", "notes": ""}]
