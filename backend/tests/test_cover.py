"""Image de couverture : envoi par l'organisateur, lecture publique, vignette, formats, taille et cache."""

import io
import time

import pytest
from PIL import Image

from app.images import MAX_COVER_BYTES, THUMB_SIDE

from .conftest import make_stay


def image(fmt: str, size: tuple[int, int] = (300, 200), mode: str = "RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, (200, 80, 40, 128) if mode == "RGBA" else (200, 80, 40)).save(out, fmt)
    return out.getvalue()


JPEG = image("JPEG")
PNG = image("PNG")
WEBP = image("WEBP")


def upload(api, data: bytes, content_type: str = "image/jpeg", key: str | None = None):
    headers = {"X-Admin-Key": api.key if key is None else key, "Content-Type": content_type}
    return api.client.put(f"{api.base}/admin/cover", content=data, headers=headers)


def version(api) -> int | None:
    return api.snap()["stay"]["cover_version"]


def test_no_cover_by_default(client, api) -> None:
    assert version(api) is None
    assert client.get(f"{api.base}/cover").status_code == 404
    assert client.get(f"{api.base}/cover/thumb").status_code == 404


@pytest.mark.parametrize(("data", "content_type"), [(JPEG, "image/jpeg"), (PNG, "image/png"), (WEBP, "image/webp")])
def test_upload_then_read(client, api, data, content_type) -> None:
    r = upload(api, data, "application/octet-stream")  # type reconnu au contenu, pas à l'en-tête
    assert r.status_code == 200, r.text
    v = r.json()["cover_version"]
    assert v == version(api) and v > 0
    got = client.get(f"{api.base}/cover?v={v}")
    assert got.status_code == 200 and got.content == data
    assert got.headers["content-type"] == content_type
    assert "immutable" in got.headers["cache-control"] and got.headers["x-content-type-options"] == "nosniff"


def test_thumbnail_is_a_small_square_webp(client, api) -> None:
    v = upload(api, image("JPEG", (1600, 900))).json()["cover_version"]
    got = client.get(f"{api.base}/cover/thumb?v={v}")
    assert got.headers["content-type"] == "image/webp" and "immutable" in got.headers["cache-control"]
    thumb = Image.open(io.BytesIO(got.content))
    assert thumb.format == "WEBP" and thumb.size == (THUMB_SIDE, THUMB_SIDE) and thumb.mode == "RGB"


def test_thumbnail_keeps_transparency(client, api) -> None:
    upload(api, image("PNG", mode="RGBA"))
    thumb = Image.open(io.BytesIO(client.get(f"{api.base}/cover/thumb").content))
    assert thumb.mode == "RGBA" and thumb.getpixel((0, 0))[3] == 128


@pytest.mark.parametrize("path", ["/cover", "/cover/thumb"])
def test_only_the_current_version_is_cached_for_long(client, api, path) -> None:
    v = upload(api, JPEG).json()["cover_version"]
    for query in ["", f"?v={v - 1}"]:  # sans version, ou périmée : à revalider
        assert client.get(f"{api.base}{path}{query}").headers["cache-control"] == "no-cache"


def test_replacing_changes_version_and_listing_shows_it(client, api) -> None:
    first = upload(api, JPEG).json()["cover_version"]
    second = upload(api, PNG).json()["cover_version"]
    assert second > first
    assert client.get(f"{api.base}/cover?v={second}").content == PNG
    assert [s["cover_version"] for s in client.get("/api/stays").json()] == [second]


def test_versions_never_repeat_even_within_the_same_millisecond(api, monkeypatch) -> None:
    monkeypatch.setattr(time, "time_ns", lambda: 1_800_000_000_000 * 1_000_000)
    assert [upload(api, JPEG).json()["cover_version"] for _ in range(3)] == [1_800_000_000_000 + i for i in range(3)]


def test_delete_then_upload_never_reuses_a_version(client, api) -> None:
    before = upload(api, JPEG).json()["cover_version"]
    assert api.adm("DELETE", "/cover", status=200).json()["cover_version"] is None
    assert client.get(f"{api.base}/cover").status_code == 404
    assert client.get(f"{api.base}/cover/thumb").status_code == 404
    api.adm("DELETE", "/cover", status=200)  # sans image : rien à faire
    time.sleep(0.002)
    after = upload(api, PNG).json()["cover_version"]
    assert after > before  # sinon le navigateur garderait l'ancienne image, en cache sous ?v=<before>
    assert client.get(f"{api.base}/cover?v={after}").content == PNG


def test_empty_body_is_refused(api) -> None:
    assert upload(api, b"").status_code == 415


@pytest.mark.parametrize("data", [b"GIF89a" + b"\x00" * 20, b"<svg onload=alert(1)>", b"RIFF\x00\x00\x00\x00WAVE"])
def test_unsupported_formats_are_refused(api, data) -> None:
    r = upload(api, data, "image/png")
    assert r.status_code == 415 and "JPEG, PNG ou WebP" in r.json()["detail"]


@pytest.mark.parametrize(
    "data",
    [
        b"\xff\xd8\xff\xe0" + b"\x00" * 60,  # signature JPEG, contenu illisible
        JPEG[: len(JPEG) // 2],  # tronquée
        image("PNG", (4097, 4096)),  # trop de pixels à décoder
    ],
    ids=["corrompue", "tronquée", "démesurée"],
)
def test_unreadable_images_are_refused(api, data) -> None:
    r = upload(api, data)
    assert r.status_code == 415 and r.json()["detail"] == "Image illisible ou trop grande"
    assert version(api) is None


def test_too_large_is_refused(api) -> None:
    r = upload(api, JPEG[:4] + b"\x00" * MAX_COVER_BYTES)
    assert r.status_code == 413
    assert version(api) is None


def test_too_large_without_content_length_is_cut_while_reading(api) -> None:
    def chunks():  # envoi par morceaux : pas d'en-tête Content-Length
        for _ in range(6):
            yield b"\x00" * 1_000_000

    r = api.client.put(f"{api.base}/admin/cover", content=chunks(), headers={"X-Admin-Key": api.key})
    assert r.status_code == 413
    assert version(api) is None


def test_key_is_checked_before_the_body(api) -> None:
    # Clé fausse et corps démesuré : la clé est vérifiée d'abord (le corps n'est lu qu'ensuite).
    assert upload(api, b"\x00" * (MAX_COVER_BYTES + 1), key="mauvaise-cle").status_code == 403


def test_cover_belongs_to_its_stay(client, api) -> None:
    other = make_stay(client)
    upload(api, JPEG)
    assert client.get(f"{other.base}/cover").status_code == 404
    assert upload(api, PNG, key=other.key).status_code == 403
    assert client.get(f"{api.base}/cover").content == JPEG
