"""Image de couverture : upload, remplacement, suppression, validation."""

import io

from .conftest import make_stay

# PNG 1×1 transparent minimal.
PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fcffff3f030005fe02fea72d994d0000000049454e44ae426082"
)


def _png(name: str = "cover.png") -> tuple[str, bytes, str]:
    return (name, PNG_1PX, "image/png")


def test_upload_cover(client, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    from app import uploads

    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path / "uploads")
    # Recréer l'app avec le nouveau UPLOAD_DIR pour le StaticFiles.
    from app.main import create_app

    monkeypatch.setattr("app.main.uploads.UPLOAD_DIR", tmp_path / "uploads")
    app = create_app(static_dir=__import__("pathlib").Path("/nonexistent"))
    from fastapi.testclient import TestClient

    c = TestClient(app)
    api = make_stay(c)

    assert api.snap()["stay"]["cover_image"] is None

    r = c.post(
        f"{api.base}/admin/stay/cover",
        files={"file": _png()},
        headers={"X-Admin-Key": api.key},
    )
    assert r.status_code == 200, r.text
    stay = r.json()
    assert stay["cover_image"] is not None
    assert stay["cover_image"].startswith("cover-")
    assert stay["cover_image"].endswith(".png")

    # L'image est servie.
    img = c.get(f"/uploads/{api.slug}/{stay['cover_image']}")
    assert img.status_code == 200
    assert img.content == PNG_1PX

    # Le snapshot reflète l'image.
    assert api.snap()["stay"]["cover_image"] == stay["cover_image"]


def test_upload_cover_requires_admin(client) -> None:
    api = make_stay(client)
    r = client.post(f"{api.base}/admin/stay/cover", files={"file": _png()})
    assert r.status_code == 403
    r = client.post(f"{api.base}/admin/stay/cover", files={"file": _png()}, headers={"X-Admin-Key": "wrong"})
    assert r.status_code == 403


def test_upload_cover_rejects_bad_type(client) -> None:
    api = make_stay(client)
    r = client.post(
        f"{api.base}/admin/stay/cover",
        files={"file": ("doc.txt", b"hello", "text/plain")},
        headers={"X-Admin-Key": api.key},
    )
    assert r.status_code == 422


def test_upload_cover_rejects_empty(client) -> None:
    api = make_stay(client)
    r = client.post(
        f"{api.base}/admin/stay/cover",
        files={"file": ("empty.png", b"", "image/png")},
        headers={"X-Admin-Key": api.key},
    )
    assert r.status_code == 422


def test_replace_cover_deletes_old_file(client, tmp_path, monkeypatch) -> None:
    from app import uploads

    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path / "uploads")
    api = make_stay(client)

    r1 = client.post(f"{api.base}/admin/stay/cover", files={"file": _png("a.png")}, headers={"X-Admin-Key": api.key})
    first = r1.json()["cover_image"]
    assert (tmp_path / "uploads" / api.slug / first).exists()

    r2 = client.post(f"{api.base}/admin/stay/cover", files={"file": _png("b.png")}, headers={"X-Admin-Key": api.key})
    second = r2.json()["cover_image"]
    assert second != first
    assert not (tmp_path / "uploads" / api.slug / first).exists(), "l'ancienne image est supprimée"
    assert (tmp_path / "uploads" / api.slug / second).exists()


def test_delete_cover(client, tmp_path, monkeypatch) -> None:
    from app import uploads

    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path / "uploads")
    api = make_stay(client)

    r = client.post(f"{api.base}/admin/stay/cover", files={"file": _png()}, headers={"X-Admin-Key": api.key})
    filename = r.json()["cover_image"]
    assert (tmp_path / "uploads" / api.slug / filename).exists()

    r = client.delete(f"{api.base}/admin/stay/cover", headers={"X-Admin-Key": api.key})
    assert r.status_code == 200
    assert r.json()["cover_image"] is None
    assert not (tmp_path / "uploads" / api.slug / filename).exists()
    assert api.snap()["stay"]["cover_image"] is None


def test_delete_cover_requires_admin(client) -> None:
    api = make_stay(client)
    r = client.delete(f"{api.base}/admin/stay/cover")
    assert r.status_code == 403


def test_stay_list_includes_cover(client) -> None:
    api = make_stay(client)
    r = client.post(f"{api.base}/admin/stay/cover", files={"file": _png()}, headers={"X-Admin-Key": api.key})
    assert r.status_code == 200
    filename = r.json()["cover_image"]

    stays = client.get("/api/stays").json()
    found = [s for s in stays if s["slug"] == api.slug]
    assert found[0]["cover_image"] == filename
