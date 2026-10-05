"""Règles des foyers et des couples, partagées par l'espace participant et l'espace organisateur."""

from datetime import date

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from . import schemas as s
from .deps import owned, person
from .models import Household, Person, Presence, Stay
from .slots import stay_slots


def household(db: Session, household_id: int | None, stay: Stay) -> Household:
    return owned(db, Household, household_id, stay)


def drop_if_empty(db: Session, household_id: int) -> None:
    db.flush()
    if not db.scalar(select(func.count(Person.id)).where(Person.household_id == household_id)):
        db.execute(delete(Household).where(Household.id == household_id))


def link_partners(db: Session, p: Person, new: Person | None) -> None:
    """Couple symétrique entre deux adultes du même foyer ; défait les couples précédents."""
    if new is not None:
        if new.id == p.id:
            raise HTTPException(422, "Une personne ne peut pas être en couple avec elle-même")
        if "child" in (p.kind, new.kind):
            raise HTTPException(422, "Le couple est un lien entre deux adultes")
        if new.household_id != p.household_id:
            raise HTTPException(422, "Un couple appartient à un même foyer")
    # La clé étrangère garantit que les anciens conjoints existent.
    for old_id in {p.partner_id, new.partner_id if new else None} - {None}:
        db.get(Person, old_id).partner_id = None
    p.partner_id = new.id if new else None
    if new is not None:
        new.partner_id = p.id


def unlink(db: Session, p: Person) -> None:
    if p.partner_id is not None:
        link_partners(db, p, None)


def create_person(db: Session, stay: Stay, body: s.PersonCreate) -> Person:
    if body.household_id is not None:
        household_id = household(db, body.household_id, stay).id
    else:
        new = Household(stay_id=stay.id, name="")
        db.add(new)
        db.flush()
        household_id = new.id
    does_chores = body.does_chores if body.does_chores is not None else body.kind == "adult"
    p = Person(
        stay_id=stay.id,
        household_id=household_id,
        name=body.name,
        kind=body.kind,
        does_chores=does_chores,
        does_activities=body.does_activities,
    )
    db.add(p)
    db.flush()
    if body.partner_id is not None:
        link_partners(db, p, person(db, body.partner_id, stay))
    db.commit()
    return p


def move(db: Session, stay: Stay, p: Person, household_id: int | None) -> Person:
    """Change de foyer (ou en crée un) ; le couple est défait, l'ancien foyer vide disparaît."""
    old = p.household_id
    if household_id is None:
        target = Household(stay_id=stay.id, name="")
        db.add(target)
        db.flush()
    else:
        target = household(db, household_id, stay)
    if target.id == old:
        return p
    unlink(db, p)
    p.household_id = target.id
    drop_if_empty(db, old)
    db.commit()
    return p


def merge(db: Session, stay: Stay, source_id: int, into_id: int) -> Household:
    source, into = household(db, source_id, stay), household(db, into_id, stay)
    if source.id == into.id:
        raise HTTPException(422, "Impossible de fusionner un foyer avec lui-même")
    for p in db.scalars(select(Person).where(Person.household_id == source.id)):
        p.household_id = into.id
    db.flush()
    db.delete(source)
    db.commit()
    return into


def replace_presences(db: Session, stay: Stay, members: list[tuple[Person, list[s.SlotIn]]]) -> None:
    allowed: set[tuple[date, str]] = set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    for _, slots in members:
        if {(slot.date, slot.meal) for slot in slots} - allowed:
            raise HTTPException(422, "Créneau hors des dates du séjour")
    for p, slots in members:
        db.execute(delete(Presence).where(Presence.person_id == p.id))
        db.add_all(Presence(person_id=p.id, date=d, meal=m) for d, m in {(slot.date, slot.meal) for slot in slots})
    db.commit()
