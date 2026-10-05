def test_full_flow(client, stay) -> None:
    slug, admin = stay["slug"], stay["headers"]
    base = f"/api/stays/{slug}"

    assert client.get(f"{base}/admin").status_code == 403
    assert client.get(f"{base}/admin", headers=admin).status_code == 204

    snap = client.get(base).json()
    assert len(snap["slots"]) == 1 + 3 + 2
    assert len(snap["chore_types"]) == 4  # corvées par défaut

    # Participants (public) : un adulte s'ajoute et ajoute son enfant.
    alice = client.post(f"{base}/persons", json={"name": "Alice"}).json()
    home = alice["household_id"]
    kid = client.post(f"{base}/persons", json={"name": "Léo", "kind": "child", "household_id": home}).json()
    assert kid["does_chores"] is False and kid["household_id"] == home
    bob = client.post(f"{base}/admin/persons", json={"name": "Bob", "household_id": home}, headers=admin).json()
    others = [client.post(f"{base}/admin/persons", json={"name": n}, headers=admin).json() for n in ["Cléo", "Dan", "Eve"]]

    # Couple symétrique.
    r = client.put(f"{base}/admin/persons/{alice['id']}/partner", json={"partner_id": bob["id"]}, headers=admin)
    assert r.json()["partner_id"] == bob["id"]
    persons = {p["id"]: p for p in client.get(base).json()["persons"]}
    assert persons[bob["id"]]["partner_id"] == alice["id"]

    # Présences : tout le monde partout.
    slots = snap["slots"]
    for p in [alice, kid, bob, *others]:
        assert client.put(f"{base}/persons/{p['id']}/presences", json={"slots": slots}).status_code == 204
    bad = client.put(f"{base}/persons/{alice['id']}/presences", json={"slots": [{"date": "2027-01-01", "meal": "lunch"}]})
    assert bad.status_code == 422

    # Tirage.
    result = client.post(f"{base}/admin/chores/draw", headers=admin).json()
    assert result["unfilled"] == 0 and result["assigned"] > 0
    snap = client.get(base).json()
    assert kid["id"] not in {a["person_id"] for a in snap["chore_assignments"]}
    by_occ: dict = {}
    for a in snap["chore_assignments"]:
        by_occ.setdefault((a["chore_type_id"], a["date"], a["moment"]), set()).add(a["person_id"])
    assert all(not {alice["id"], bob["id"]} <= people for people in by_occ.values())

    # Ajustement manuel.
    occ = next(iter(by_occ))
    r = client.put(
        f"{base}/admin/chores/occurrence",
        json={"chore_type_id": occ[0], "date": occ[1], "moment": occ[2], "person_ids": [others[0]["id"]]},
        headers=admin,
    )
    assert r.status_code == 204

    # Chambres.
    room = client.post(f"{base}/admin/rooms", json={"name": "Bleue"}, headers=admin).json()
    double = client.post(f"{base}/admin/rooms/{room['id']}/beds", json={"kind": "double"}, headers=admin).json()
    client.post(f"{base}/admin/rooms/{room['id']}/beds", json={"kind": "bunk"}, headers=admin)
    assert client.post(f"{base}/admin/rooms/auto-assign", headers=admin).json()["assigned"] == 4
    persons = {p["id"]: p for p in client.get(base).json()["persons"]}
    assert persons[alice["id"]]["bed_id"] == persons[bob["id"]]["bed_id"] == double["id"]
    r = client.put(f"{base}/admin/persons/{others[2]['id']}/bed", json={"bed_id": double["id"]}, headers=admin)
    assert r.status_code == 409

    # Activités facultatives.
    act = client.post(
        f"{base}/admin/activities",
        json={"name": "Rando", "date": "2026-10-31", "start_time": "10:00", "optional": True},
        headers=admin,
    ).json()
    assert client.put(f"{base}/activities/{act['id']}/signups/{kid['id']}").status_code == 204
    assert client.get(base).json()["signups"] == [{"activity_id": act["id"], "person_id": kid["id"]}]

    # Menus.
    r = client.put(f"{base}/admin/menus", json={"date": "2026-10-30", "meal": "dinner", "dishes": "Soupe\nGratin"}, headers=admin)
    assert r.status_code == 200

    # Raccourcir le séjour nettoie les données hors période.
    r = client.patch(f"{base}/admin/stay", json={"end_date": "2026-10-31", "last_meal": "dinner"}, headers=admin)
    assert r.status_code == 200
    snap = client.get(base).json()
    assert all(p["date"] <= "2026-10-31" for p in snap["presences"])

    # Suppression d'une personne : le lien de couple est retiré.
    client.delete(f"{base}/admin/persons/{bob['id']}", headers=admin)
    persons = {p["id"]: p for p in client.get(base).json()["persons"]}
    assert persons[alice["id"]]["partner_id"] is None


def test_stays_are_isolated(client, stay) -> None:
    other = client.post("/api/stays", json={"name": "Noël", "start_date": "2026-12-24", "end_date": "2026-12-26"}).json()
    alice = client.post(f"/api/stays/{stay['slug']}/persons", json={"name": "Alice"}).json()
    r = client.put(f"/api/stays/{other['slug']}/persons/{alice['id']}/presences", json={"slots": []})
    assert r.status_code == 404
    r = client.get(f"/api/stays/{other['slug']}/admin", headers=stay["headers"])
    assert r.status_code == 403
