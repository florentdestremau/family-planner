import os
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./family_planner.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_connection, _record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    # WAL : lectures et écriture concurrentes sans « database is locked ».
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
