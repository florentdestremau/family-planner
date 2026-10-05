import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["STATIC_DIR"] = "/nonexistent"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def stay(client: TestClient) -> dict:
    r = client.post(
        "/api/stays",
        json={"name": "Toussaint", "start_date": "2026-10-30", "end_date": "2026-11-01", "first_meal": "dinner", "last_meal": "lunch"},
    )
    assert r.status_code == 201
    data = r.json()
    data["headers"] = {"X-Admin-Key": data["admin_key"]}
    return data
