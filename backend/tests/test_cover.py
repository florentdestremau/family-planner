"""Image de couverture : envoi par l'organisateur, lecture publique, formats et taille."""

import pytest

from app.images import MAX_COVER_BYTES

from .conftest import make_stay

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 60
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 60
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 60


def upload(api, data: bytes, content_type: str = "image/jpeg", key: str | None = None):
    headers = {"X-Admin-Key": api.key if key is None else key, "Content-Type": content_type}
    return api.client.put(f"{api.base}/admin/cover", content=data, headers=headers)


def test_no_cover_by_default(client, api) -> None:
    assert api.snap()["stay"]["cover_version"] is None
    assert client.get(f"{api.base}/cover").status_code == 404


@pytest.mark.parametrize(("data", "content_type"), [(JPEG, "image/jpeg"), (PNG, "image/png"), (WEBP, "image/webp")])
def test_upload_then_read(client, api, data, content_type) -> None:
    r = upload(api, data, "application/octet-stream")  # type reconnu au contenu, pas à l'en-tête
    assert r.status_code == 200, r.text
    assert r.json()["cover_version"] == 1
    got = client.get(f"{api.base}/cover?v=1")
    assert got.status_code == 200 and got.content == data
    assert got.headers["content-type"] == content_type
    assert "immutable" in got.headers["cache-control"] and got.headers["x-content-type-options"] == "nosniff"


def test_replacing_bumps_version_and_listing_shows_it(client, api) -> None:
    upload(api, JPEG)
    assert upload(api, PNG).json()["cover_version"] == 2
    assert client.get(f"{api.base}/cover").content == PNG
    assert api.snap()["stay"]["cover_version"] == 2
    assert [s["cover_version"] for s in client.get("/api/stays").json()] == [2]


def test_delete(client, api) -> None:
    upload(api, JPEG)
    assert api.adm("DELETE", "/cover", status=200).json()["cover_version"] is None
    assert client.get(f"{api.base}/cover").status_code == 404
    api.adm("DELETE", "/cover", status=200)  # sans image : rien à faire


def test_empty_body_is_refused(api) -> None:
    assert upload(api, b"").status_code == 422


@pytest.mark.parametrize("data", [b"GIF89a" + b"\x00" * 20, b"<svg onload=alert(1)>", b"RIFF\x00\x00\x00\x00WAVE"])
def test_unsupported_formats_are_refused(api, data) -> None:
    r = upload(api, data, "image/png")
    assert r.status_code == 415 and "JPEG, PNG ou WebP" in r.json()["detail"]


def test_too_large_is_refused(api) -> None:
    r = upload(api, JPEG[:4] + b"\x00" * MAX_COVER_BYTES)
    assert r.status_code == 413
    assert api.snap()["stay"]["cover_version"] is None


def test_cover_belongs_to_its_stay(client, api) -> None:
    other = make_stay(client)
    upload(api, JPEG)
    assert client.get(f"{other.base}/cover").status_code == 404
    assert upload(api, PNG, key=other.key).status_code == 403
    assert client.get(f"{api.base}/cover").content == JPEG
