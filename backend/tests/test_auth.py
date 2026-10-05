"""Chaque route organisateur exige la bonne clé ; les routes publiques n'en demandent pas."""

import re

import pytest

from app.main import app

from .conftest import make_stay

# Depuis le schéma OpenAPI : toute route ajoutée plus tard est couverte d'office.
ADMIN_ROUTES = [
    (method.upper(), path)
    for path, operations in app.openapi()["paths"].items()
    if "/admin" in path
    for method in operations
]


def test_admin_routes_are_all_listed() -> None:
    assert len(ADMIN_ROUTES) >= 22


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES, ids=[f"{m} {p}" for m, p in ADMIN_ROUTES])
@pytest.mark.parametrize("key", [None, "", "mauvaise-cle"])
def test_admin_route_requires_key(client, api, method, path, key) -> None:
    url = re.sub(r"\{(\w+)\}", lambda m: api.slug if m.group(1) == "slug" else "1", path)
    headers = {} if key is None else {"X-Admin-Key": key}
    r = client.request(method, url, headers=headers, json={})
    assert r.status_code == 403, (method, url, r.status_code, r.text)


def test_key_of_another_stay_is_refused(client, api) -> None:
    other = make_stay(client)
    other.adm("GET", "", status=204)
    api.adm("GET", "", key=other.key, status=403)
    api.adm("POST", "/persons", {"name": "Intrus"}, key=other.key, status=403)


def test_admin_key_is_never_exposed_publicly(client, api) -> None:
    assert api.key not in client.get(api.base).text


def test_unknown_stay_is_404(client) -> None:
    assert client.get("/api/stays/nexistepas").status_code == 404
    assert client.get("/api/stays/nexistepas/admin", headers={"X-Admin-Key": "x"}).status_code == 404
    assert client.put("/api/stays/nexistepas/persons/1/presences", json={"slots": []}).status_code == 404


def test_slugs_and_keys_are_unique_and_unguessable(client) -> None:
    stays = [make_stay(client) for _ in range(20)]
    assert len({s.slug for s in stays}) == 20
    assert len({s.key for s in stays}) == 20
    assert all(len(s.slug) >= 12 and len(s.key) >= 24 for s in stays)
