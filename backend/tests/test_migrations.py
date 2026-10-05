"""Migrations : schéma conforme aux modèles, conversion des données existantes sans perte."""

import importlib
from contextlib import closing
import sqlite3
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from app.migrate import migrate
from app.models import Base

V1 = importlib.import_module("migrations.versions.0001_initial")

# Données au format v1 (avant les foyers) : un couple avec deux enfants, un enfant rattaché à un
# adulte seul, un enfant sans référent, un célibataire ; présences, inscriptions, corvée, lit.
LEGACY_DATA = """
INSERT INTO stays VALUES (1, 'slug1', 'key1', 'Toussaint', '2026-10-30', '2026-11-01', 'dinner', 'lunch', 1, '2026-10-05 10:00:00');
INSERT INTO stays VALUES (2, 'slug2', 'key2', 'Noël', '2026-12-24', '2026-12-26', 'dinner', 'lunch', 1, '2026-10-05 10:00:00');
INSERT INTO rooms VALUES (1, 1, 'Bleue', '');
INSERT INTO beds VALUES (1, 1, 'double', '');
INSERT INTO persons VALUES (1, 1, 'Florent', 'adult', 1, 1, NULL, 2, 1);
INSERT INTO persons VALUES (2, 1, 'Claire', 'adult', 1, 1, NULL, 1, 1);
INSERT INTO persons VALUES (3, 1, 'Léo', 'child', 0, 1, 1, NULL, NULL);
INSERT INTO persons VALUES (4, 1, 'Emma', 'child', 0, 1, 2, NULL, NULL);
INSERT INTO persons VALUES (5, 1, 'Sarah', 'adult', 1, 1, NULL, NULL, NULL);
INSERT INTO persons VALUES (6, 1, 'Tom', 'child', 0, 1, 5, NULL, NULL);
INSERT INTO persons VALUES (7, 1, 'Orphelin', 'child', 0, 1, NULL, NULL, NULL);
INSERT INTO persons VALUES (8, 2, 'Camille', 'adult', 1, 1, NULL, NULL, NULL);
INSERT INTO presences VALUES (1, 1, '2026-10-30', 'dinner');
INSERT INTO presences VALUES (2, 3, '2026-10-30', 'dinner');
INSERT INTO presences VALUES (3, 6, '2026-10-31', 'lunch');
INSERT INTO presences VALUES (4, 8, '2026-12-24', 'dinner');
INSERT INTO activities VALUES (1, 1, 'Rando', '', '', '2026-10-31', '10:00', '', 1);
INSERT INTO signups VALUES (1, 1, 3);
INSERT INTO chore_types VALUES (1, 1, 'Cuisine', 'dinner', 2, 1);
INSERT INTO chore_assignments VALUES (1, 1, 1, '2026-10-30', 'dinner', 2);
INSERT INTO menus VALUES (1, 1, '2026-10-30', 'dinner', 'Soupe', '');
"""

TABLES = ["stays", "persons", "presences", "signups", "chore_assignments", "menus", "activities", "rooms", "beds", "chore_types"]


def legacy_db(path: Path, data: str = LEGACY_DATA) -> str:
    """Base telle qu'en production avant Alembic : schéma v1, pas de table alembic_version."""
    with closing(sqlite3.connect(path)) as db:
        db.executescript(V1.SCHEMA + data)
    return f"sqlite:///{path}"


def query(path: Path, sql: str) -> list[tuple]:
    with closing(sqlite3.connect(path)) as db:
        return db.execute(sql).fetchall()


def counts(path: Path) -> dict[str, int]:
    return {t: query(path, f"SELECT count(*) FROM {t}")[0][0] for t in TABLES}


def test_fresh_database_matches_models(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path}/new.db")
    migrate(engine=engine)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()
    assert diff == [], "les modèles et les migrations divergent : écrire une migration"
    assert query(tmp_path / "new.db", "SELECT version_num FROM alembic_version") == [("0002",)]


def test_legacy_database_is_converted_without_loss(tmp_path) -> None:
    path = tmp_path / "legacy.db"
    url = legacy_db(path)
    before = counts(path)
    engine = create_engine(url)
    migrate(engine=engine)
    engine.dispose()

    assert counts(path) == before, "aucune ligne perdue (pas de cascade pendant la migration)"
    members = query(
        path,
        "SELECT h.stay_id, group_concat(p.name, ',') FROM households h JOIN persons p ON p.household_id = h.id "
        "GROUP BY h.id ORDER BY min(p.id)",
    )
    assert members == [
        (1, "Florent,Claire,Léo,Emma"),  # couple + enfants rattachés à l'un ou l'autre
        (1, "Sarah,Tom"),  # parent seul
        (1, "Orphelin"),
        (2, "Camille"),  # chaque séjour garde ses foyers
    ]
    columns = [row[1] for row in query(path, "PRAGMA table_info(persons)")]
    assert "guardian_id" not in columns and "household_id" in columns
    assert query(path, "SELECT partner_id, bed_id FROM persons WHERE id IN (1, 2) ORDER BY id") == [(2, 1), (1, 1)]
    assert query(path, "PRAGMA foreign_key_check") == []
    assert query(path, "SELECT version_num FROM alembic_version") == [("0002",)]


def test_broken_foreign_keys_abort_the_migration(tmp_path) -> None:
    path = tmp_path / "broken.db"
    url = legacy_db(path, LEGACY_DATA + "INSERT INTO presences VALUES (99, 404, '2026-10-30', 'dinner');")
    engine = create_engine(url)
    with pytest.raises(RuntimeError, match="clés étrangères rompues"):
        migrate(engine=engine)
    engine.dispose()
    assert query(path, "SELECT name FROM sqlite_master WHERE name = 'households'") == [], "transaction annulée"
