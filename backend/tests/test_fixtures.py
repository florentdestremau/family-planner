from collections import Counter

from app.fixtures import FIXTURES, load_all


def test_fixtures_are_complete_and_idempotent(client) -> None:
    assert sorted(load_all()) == sorted(f.slug for f in FIXTURES)
    assert load_all() == []
    assert load_all(reset=True) and client.get("/api/stays/ete").status_code == 200

    for fx in FIXTURES:
        snap = client.get(f"/api/stays/{fx.slug}").json()
        assert all(p["bed_id"] for p in snap["persons"]), f"{fx.slug} : quelqu'un n'a pas de lit"
        assert snap["chore_assignments"] and snap["activities"] and snap["menus"]
        persons = {p["id"]: p for p in snap["persons"]}
        team: dict = {}
        for a in snap["chore_assignments"]:
            assert persons[a["person_id"]]["does_chores"]
            team.setdefault((a["chore_type_id"], a["date"], a["moment"]), set()).add(a["person_id"])
        for people in team.values():
            assert not any(persons[p]["partner_id"] in people for p in people), "couple sur la même corvée"
        assert client.get(f"/api/stays/{fx.slug}/admin", headers={"X-Admin-Key": "demo"}).status_code == 204

    assert client.get("/up").text == "OK"


def test_fixtures_have_contrasted_presences(client) -> None:
    """Arrivées et départs échelonnés : les couverts varient, un foyer au moins est décalé."""
    load_all()
    for fx in FIXTURES:
        snap = client.get(f"/api/stays/{fx.slug}").json()
        per_slot = Counter((p["date"], p["meal"]) for p in snap["presences"])
        covers = [per_slot[(s["date"], s["meal"])] for s in snap["slots"]]
        assert len(set(covers)) >= 5, f"{fx.slug} : couverts trop uniformes {covers}"
        assert min(covers) <= max(covers) // 2, f"{fx.slug} : pas assez de contraste {covers}"
        presences = {p["id"]: {(x["date"], x["meal"]) for x in snap["presences"] if x["person_id"] == p["id"]} for p in snap["persons"]}
        offset = [
            h["id"]
            for h in snap["households"]
            if len({frozenset(presences[p["id"]]) for p in snap["persons"] if p["household_id"] == h["id"]}) > 1
        ]
        assert offset, f"{fx.slug} : aucun foyer avec un membre décalé"


def test_weekend_is_four_days_with_plenty_of_activities(client) -> None:
    load_all()
    snap = client.get("/api/stays/demo").json()
    assert len(snap["days"]) == 4
    assert len(snap["activities"]) >= 8
    assert {a["date"] for a in snap["activities"]} == set(snap["days"]), "des activités chaque jour"


def test_command_line(tmp_path) -> None:
    import os
    import subprocess
    import sys

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{tmp_path}/cli.db"}
    run = lambda *a: subprocess.run([sys.executable, "-m", "app.fixtures", *a], env=env, capture_output=True, text=True, check=True).stdout  # noqa: E731
    first = run()
    assert first.count("(chargé)") == 2 and "/s/demo/admin?key=demo" in first
    assert run().count("(déjà présent)") == 2
    assert run("--reset").count("(chargé)") == 2
