import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["STATIC_DIR"] = "/nonexistent"
os.environ.pop("FIXTURES", None)

from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import engine
from app.main import app
from app.models import Base


@pytest.fixture(autouse=True)
def fresh_db() -> None:
    """Chaque test part d'une base vide."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


STAY = {"name": "Toussaint", "start_date": "2026-10-30", "end_date": "2026-11-01", "first_meal": "dinner", "last_meal": "lunch"}
# Créneaux de STAY : ven. dîner, sam. ×3, dim. petit-déj et déjeuner.
SLOTS = [
    {"date": "2026-10-30", "meal": "dinner"},
    {"date": "2026-10-31", "meal": "breakfast"},
    {"date": "2026-10-31", "meal": "lunch"},
    {"date": "2026-10-31", "meal": "dinner"},
    {"date": "2026-11-01", "meal": "breakfast"},
    {"date": "2026-11-01", "meal": "lunch"},
]


@dataclass
class StayApi:
    """Raccourcis pour un séjour : routes publiques (`pub`) et organisateur (`adm`)."""

    client: TestClient
    slug: str
    key: str

    @property
    def base(self) -> str:
        return f"/api/stays/{self.slug}"

    def pub(self, method: str, path: str = "", json: Any = None, status: int | None = None):
        r = self.client.request(method, f"{self.base}{path}", json=json)
        if status is not None:
            assert r.status_code == status, (r.status_code, r.text)
        return r

    def adm(self, method: str, path: str = "", json: Any = None, status: int | None = None, key: str | None = None):
        headers = {"X-Admin-Key": self.key if key is None else key}
        r = self.client.request(method, f"{self.base}/admin{path}", json=json, headers=headers)
        if status is not None:
            assert r.status_code == status, (r.status_code, r.text)
        return r

    def snap(self) -> dict:
        return self.pub("GET", status=200).json()

    def household_of(self, person_id: int) -> int:
        return self.persons()[person_id]["household_id"]

    def person(self, name: str, kind: str = "adult", with_: int | None = None, **kw) -> int:
        """Crée une personne : dans son propre foyer, ou dans celui de `with_`."""
        body = {"name": name, "kind": kind, **kw}
        if with_ is not None:
            body["household_id"] = self.household_of(with_)
        return self.adm("POST", "/persons", body, status=201).json()["id"]

    def couple(self, a: int, b: int) -> None:
        """Met b dans le foyer de a si besoin, puis les met en couple."""
        if self.household_of(a) != self.household_of(b):
            self.adm("PUT", f"/persons/{b}/household", {"household_id": self.household_of(a)}, status=200)
        self.adm("PUT", f"/persons/{a}/partner", {"partner_id": b}, status=200)

    def present(self, person_id: int, slots: list[dict] = SLOTS) -> None:
        self.pub("PUT", f"/persons/{person_id}/presences", {"slots": slots}, status=204)

    def persons(self) -> dict[int, dict]:
        return {p["id"]: p for p in self.snap()["persons"]}


def make_stay(client: TestClient, **overrides) -> StayApi:
    r = client.post("/api/stays", json={**STAY, **overrides})
    assert r.status_code == 201, r.text
    data = r.json()
    return StayApi(client, data["slug"], data["admin_key"])


@pytest.fixture
def api(client: TestClient) -> StayApi:
    return make_stay(client)


@pytest.fixture
def stay(api: StayApi) -> dict:
    """Compatibilité avec les premiers tests."""
    return {"slug": api.slug, "admin_key": api.key, "headers": {"X-Admin-Key": api.key}}
