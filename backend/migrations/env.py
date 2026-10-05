from alembic import context
from sqlalchemy import create_engine

from app.db import DATABASE_URL
from app.models import Base

config = context.config
target_metadata = Base.metadata


def run(connection) -> None:
    # Mode « batch » : SQLite ne sait pas modifier une colonne sans recréer la table.
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


# Pas de mode hors ligne (--sql) : la migration des foyers convertit des données.
if (connection := config.attributes.get("connection")) is not None:
    run(connection)
else:
    with create_engine(DATABASE_URL).connect() as connection:
        run(connection)
