"""Migrations Alembic, lancées au démarrage."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, inspect

from .db import engine as default_engine

ALEMBIC_INI = Path(__file__).parent.parent / "alembic.ini"
BASELINE = "0001"  # schéma créé par create_all avant l'arrivée d'Alembic


def alembic_config(connection: Connection) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.attributes["connection"] = connection
    return config


def migrate(target: str = "head", engine: Engine = default_engine) -> None:
    with engine.connect() as connection:
        # Clés étrangères coupées le temps des migrations : en SQLite, recréer une table (mode
        # batch) supprime l'ancienne, ce qui déclencherait les ON DELETE CASCADE des autres tables.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                config = alembic_config(connection)
                tables = inspect(connection).get_table_names()
                if "stays" in tables and "alembic_version" not in tables:
                    command.stamp(config, BASELINE)
                command.upgrade(config, target)
                broken = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
                if broken:
                    raise RuntimeError(f"Migration : clés étrangères rompues {broken[:5]}")
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
