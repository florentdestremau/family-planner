"""Service du front compilé, sonde /up et démarrage (tables, fixtures)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import main
from app.db import SessionLocal
from app.models import Stay


@pytest.fixture
def static(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<div id=root>INDEX</div>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("SECRET")
    return tmp_path


@pytest.fixture
def spa(static: Path) -> TestClient:
    return TestClient(main.create_app(static))


def test_up(spa) -> None:
    r = spa.get("/up")
    assert r.status_code == 200 and r.text == "OK"


@pytest.mark.parametrize("path", ["/", "/s/abc", "/s/abc/admin", "/s/abc/imprimer/menus", "/nimporte/quoi"])
def test_client_routes_get_index(spa, path) -> None:
    r = spa.get(path)
    assert r.status_code == 200 and "INDEX" in r.text


def test_static_files_are_served(spa) -> None:
    assert spa.get("/assets/app.js").text == "console.log(1)"
    assert spa.get("/favicon.svg").text == "<svg/>"
    assert spa.get("/assets/absent.js").status_code == 404


@pytest.mark.parametrize("path", ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/../../secret.txt"])
def test_no_path_traversal(spa, path) -> None:
    assert "SECRET" not in spa.get(path).text


@pytest.mark.parametrize("path", ["/api", "/api/", "/api/inconnue", "/api/stays"])
def test_unknown_api_routes_are_not_the_spa(spa, path) -> None:
    r = spa.get(path)
    assert r.status_code in (404, 405) and "INDEX" not in r.text


def test_api_still_works_with_spa(spa) -> None:
    r = spa.post("/api/stays", json={"name": "X", "start_date": "2026-10-30", "end_date": "2026-10-31"})
    assert r.status_code == 201
    assert spa.get(f"/api/stays/{r.json()['slug']}").status_code == 200


def test_without_static_dir_only_api(tmp_path) -> None:
    client = TestClient(main.create_app(tmp_path / "absent"))
    assert client.get("/up").text == "OK"
    assert client.get("/s/abc").status_code == 404


def count_stays() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count(Stay.id)))


def test_bootstrap_without_fixtures(monkeypatch) -> None:
    monkeypatch.delenv("FIXTURES", raising=False)
    main.bootstrap()
    assert count_stays() == 0


def test_bootstrap_with_fixtures_is_idempotent(monkeypatch) -> None:
    monkeypatch.setenv("FIXTURES", "true")
    main.bootstrap()
    main.bootstrap()
    assert count_stays() == 2


def test_static_dir_without_assets(tmp_path) -> None:
    (tmp_path / "index.html").write_text("INDEX")
    client = TestClient(main.create_app(tmp_path))
    assert client.get("/s/x").text == "INDEX"
