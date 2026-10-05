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
