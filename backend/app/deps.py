import secrets
from typing import Annotated, TypeVar

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Base, Bed, Person, Room, Stay

DB = Annotated[Session, Depends(get_db)]
M = TypeVar("M", bound=Base)


def get_stay(slug: str, db: DB) -> Stay:
    stay = db.scalar(select(Stay).where(Stay.slug == slug))
    if stay is None:
        raise HTTPException(404, "Séjour introuvable")
    return stay


def get_admin_stay(stay: Annotated[Stay, Depends(get_stay)], x_admin_key: Annotated[str, Header()] = "") -> Stay:
    if not secrets.compare_digest(x_admin_key, stay.admin_key):
        raise HTTPException(403, "Clé organisateur invalide")
    return stay


StayDep = Annotated[Stay, Depends(get_stay)]
AdminStay = Annotated[Stay, Depends(get_admin_stay)]


def owned(db: Session, model: type[M], obj_id: int | None, stay: Stay) -> M:
    """Charge un objet en vérifiant qu'il appartient bien au séjour."""
    obj = db.get(model, obj_id) if obj_id is not None else None
    if obj is not None:
        if isinstance(obj, Bed):
            room = db.get(Room, obj.room_id)
            stay_id = room.stay_id if room else None
        else:
            stay_id = getattr(obj, "stay_id", None)
        if stay_id == stay.id:
            return obj
    raise HTTPException(404, f"{model.__name__} introuvable")


def person(db: Session, person_id: int | None, stay: Stay) -> Person:
    return owned(db, Person, person_id, stay)
