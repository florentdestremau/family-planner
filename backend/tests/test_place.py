"""Lieu et infos pratiques : adresse, lien Google Maps, consignes ; publics comme tout le séjour."""

from datetime import datetime, timezone

import pytest

from app.places import is_google_maps_url

INFO = {
    "address": "  12 chemin des Vignes, 26110 Nyons ",
    "map_url": "https://maps.app.goo.gl/AbCdEf123",
    "practical_info": "Portail : 1984\nWifi : Granges / tarte\n",
}


def test_new_stay_has_no_place(api) -> None:
    stay = api.snap()["stay"]
    assert (stay["address"], stay["map_url"], stay["practical_info"], stay["info_updated_at"]) == ("", "", "", None)


def test_organizer_sets_place_visible_to_everyone(api) -> None:
    before = datetime.now(timezone.utc)
    out = api.adm("PATCH", "/stay", INFO, status=200).json()
    stay = api.snap()["stay"]  # route publique, sans clé
    assert stay["address"] == "12 chemin des Vignes, 26110 Nyons"  # espaces retirés
    assert stay["map_url"] == INFO["map_url"]
    assert stay["practical_info"] == "Portail : 1984\nWifi : Granges / tarte"
    assert out["info_updated_at"] == stay["info_updated_at"]
    # Heure UTC explicite : le front l'affiche à l'heure de l'appareil.
    updated = datetime.fromisoformat(stay["info_updated_at"])
    assert updated.tzinfo is not None and before <= updated <= datetime.now(timezone.utc)


def test_update_date_moves_only_when_place_changes(api) -> None:
    api.adm("PATCH", "/stay", INFO, status=200)
    first = api.snap()["stay"]["info_updated_at"]
    api.adm("PATCH", "/stay", {"name": "Noël", "separate_couples": False}, status=200)
    api.adm("PATCH", "/stay", {**INFO, "address": INFO["address"].strip()}, status=200)  # mêmes valeurs
    assert api.snap()["stay"]["info_updated_at"] == first
    api.adm("PATCH", "/stay", {"practical_info": "Portail : 2025"}, status=200)
    assert api.snap()["stay"]["info_updated_at"] > first


def test_place_change_leaves_the_period_alone(api) -> None:
    """Le lieu seul ne touche pas aux présences ; un changement de dates nettoie toujours."""
    pid = api.person("Alice")
    api.present(pid)
    api.adm("PATCH", "/stay", INFO, status=200)
    assert len(api.snap()["presences"]) == 6
    api.adm("PATCH", "/stay", {**INFO, "last_meal": "breakfast"}, status=200)
    assert len(api.snap()["presences"]) == 5


def test_empty_strings_clear_the_place(api) -> None:
    api.adm("PATCH", "/stay", INFO, status=200)
    api.adm("PATCH", "/stay", {"address": "", "map_url": "", "practical_info": ""}, status=200)
    stay = api.snap()["stay"]
    assert (stay["address"], stay["map_url"], stay["practical_info"]) == ("", "", "")
    assert stay["info_updated_at"] is not None  # « mis à jour » même quand on efface


def test_map_link_without_address_is_accepted(api) -> None:
    api.adm("PATCH", "/stay", {"map_url": "https://www.google.fr/maps/place/Nyons"}, status=200)
    assert api.snap()["stay"]["address"] == ""


@pytest.mark.parametrize(
    "url",
    [
        "https://maps.app.goo.gl/AbCdEf123",
        "https://goo.gl/maps/AbCdEf123",
        "https://www.google.com/maps/place/Nyons/@44.36,5.14,14z",
        "https://google.fr/maps?q=Nyons",
        "https://www.google.co.uk/maps/search/?api=1&query=Nyons",
        "https://www.google.com.br/maps/place/Rio",
        "https://maps.google.com/?q=44.36,5.14",
        "https://MAPS.APP.GOO.GL/AbC",
    ],
)
def test_google_maps_links_are_accepted(url) -> None:
    assert is_google_maps_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://maps.app.goo.gl/AbCdEf123",  # pas https
        "javascript:alert(1)",
        "https://www.google.com/search?q=Nyons",  # Google, mais pas Maps
        "https://www.google.com/mapsfoo",
        "https://goo.gl/AbCdEf123",  # raccourci qui ne vise pas Maps
        "https://waze.com/ul?q=Nyons",
        "https://maps.apple.com/?q=Nyons",
        "https://www.google.com.evil.fr/maps",
        "https://google.fun/maps/x",  # extension générique : pas forcément à Google
        "https://maps.google.vip/",
        "https://www.google.org.uk/maps",
        "https://google.com@evil.fr/maps",  # identifiants : on irait sur evil.fr
        "https://user@maps.app.goo.gl/AbC",
        "maps.app.goo.gl/AbC",
        "pas un lien",
    ],
)
def test_other_links_are_refused(api, url) -> None:
    assert not is_google_maps_url(url)
    r = api.adm("PATCH", "/stay", {"map_url": url, "address": "Ailleurs"}, status=422)
    assert "lien Google Maps" in r.json()["detail"]
    assert api.snap()["stay"]["address"] == ""  # rien n'est enregistré


@pytest.mark.parametrize(
    ("field", "limit"),
    [("address", 300), ("map_url", 500), ("practical_info", 2000)],
)
def test_lengths_are_limited(api, field, limit) -> None:
    value = "https://maps.app.goo.gl/" if field == "map_url" else ""
    api.adm("PATCH", "/stay", {field: value + "a" * (limit - len(value))}, status=200)
    api.adm("PATCH", "/stay", {field: value + "a" * (limit + 1 - len(value))}, status=422)


def test_home_list_does_not_show_the_place(client, api) -> None:
    api.adm("PATCH", "/stay", INFO, status=200)
    assert "Nyons" not in client.get("/api/stays").text
