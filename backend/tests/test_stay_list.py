"""Liste publique des séjours (page d'accueil)."""

from .conftest import make_stay


def test_lists_all_stays_sorted_with_counts(client) -> None:
    assert client.get("/api/stays").json() == []
    noel = make_stay(client, name="Noël", start_date="2026-12-24", end_date="2026-12-26")
    toussaint = make_stay(client)
    alice = toussaint.person("Alice")
    toussaint.person("Léo", "child", alice)
    toussaint.person("Bob")

    stays = client.get("/api/stays").json()
    assert [s["name"] for s in stays] == ["Toussaint", "Noël"]
    assert stays[0] == {
        "slug": toussaint.slug,
        "name": "Toussaint",
        "start_date": "2026-10-30",
        "end_date": "2026-11-01",
        "households": 2,
        "persons": 3,
        "cover_image": None,
    }
    assert stays[1]["slug"] == noel.slug and stays[1]["persons"] == 0 and stays[1]["households"] == 0


def test_list_never_exposes_admin_keys(client) -> None:
    stay = make_stay(client)
    body = client.get("/api/stays").text
    assert stay.key not in body and "admin_key" not in body
