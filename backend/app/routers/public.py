"""Espace participant : lecture du séjour et saisies en autonomie (modèle « Tricount »)."""

import secrets
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from .. import schemas as s
from ..deps import DB, StayDep, person
from ..models import (
    Activity,
    Bed,
    ChoreAssignment,
    ChoreType,
    Menu,
    Person,
    Presence,
    Room,
    Signup,
    Stay,
)
from ..slots import MAX_STAY_DAYS, stay_days, stay_slots

router = APIRouter(prefix="/api")

DEFAULT_CHORES = [
    ("Cuisine", "lunch,dinner", 2, 1),
    ("Mise de table", "lunch,dinner", 1, 1),
    ("Débarrassage & vaisselle", "breakfast,lunch,dinner", 2, 1),
    ("Ménage", "day", 2, 2),
]


def validate_dates(start, end, first_meal, last_meal) -> None:
    if end < start:
        raise HTTPException(422, "La date de fin doit suivre la date de début")
    if end - start > timedelta(days=MAX_STAY_DAYS):
        raise HTTPException(422, f"Un séjour dure au plus {MAX_STAY_DAYS} jours")
    if not stay_slots(start, end, first_meal, last_meal):
        raise HTTPException(422, "Aucun repas dans cette période")


@router.post("/stays", response_model=s.StayCreated, status_code=201)
def create_stay(body: s.StayCreate, db: DB) -> Stay:
    validate_dates(body.start_date, body.end_date, body.first_meal, body.last_meal)
    stay = Stay(**body.model_dump(), slug=secrets.token_urlsafe(9), admin_key=secrets.token_urlsafe(18))
    db.add(stay)
    db.flush()
    for name, moments, needed, every in DEFAULT_CHORES:
        db.add(ChoreType(stay_id=stay.id, name=name, moments=moments, people_needed=needed, every_n_days=every))
    db.commit()
    return stay


@router.get("/stays/{slug}", response_model=s.Snapshot)
def snapshot(stay: StayDep, db: DB) -> dict:
    persons = db.scalars(select(Person).where(Person.stay_id == stay.id).order_by(Person.name)).all()
    person_ids = [p.id for p in persons]
    rooms = db.scalars(select(Room).where(Room.stay_id == stay.id).order_by(Room.name)).all()
    beds = db.scalars(select(Bed).where(Bed.room_id.in_([r.id for r in rooms])).order_by(Bed.id)).all()
    activities = db.scalars(
        select(Activity).where(Activity.stay_id == stay.id).order_by(Activity.date, Activity.start_time)
    ).all()
    return {
        "stay": stay,
        "days": stay_days(stay.start_date, stay.end_date),
        "slots": [{"date": d, "meal": m} for d, m in stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)],
        "persons": persons,
        "presences": db.scalars(select(Presence).where(Presence.person_id.in_(person_ids))).all(),
        "rooms": [
            {**s.RoomOut.model_validate(r).model_dump(exclude={"beds"}), "beds": [b for b in beds if b.room_id == r.id]}
            for r in rooms
        ],
        "chore_types": db.scalars(select(ChoreType).where(ChoreType.stay_id == stay.id).order_by(ChoreType.id)).all(),
        "chore_assignments": db.scalars(
            select(ChoreAssignment).where(ChoreAssignment.stay_id == stay.id).order_by(ChoreAssignment.date)
        ).all(),
        "activities": activities,
        "signups": db.scalars(select(Signup).where(Signup.activity_id.in_([a.id for a in activities]))).all(),
        "menus": db.scalars(select(Menu).where(Menu.stay_id == stay.id)).all(),
    }


@router.post("/stays/{slug}/persons", response_model=s.PersonOut, status_code=201)
def add_person(body: s.PersonCreate, stay: StayDep, db: DB) -> Person:
    """Un participant peut s'ajouter lui-même ou ajouter un enfant rattaché."""
    if body.guardian_id is not None:
        person(db, body.guardian_id, stay)
    does_chores = body.does_chores if body.does_chores is not None else body.kind == "adult"
    p = Person(
        stay_id=stay.id,
        name=body.name.strip(),
        kind=body.kind,
        guardian_id=body.guardian_id if body.kind == "child" else None,
        does_chores=does_chores,
        does_activities=body.does_activities,
    )
    db.add(p)
    db.commit()
    return p


@router.put("/stays/{slug}/persons/{person_id}/presences", status_code=204)
def set_presences(person_id: int, body: s.PresencesIn, stay: StayDep, db: DB) -> None:
    person(db, person_id, stay)
    allowed = set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    wanted = {(slot.date, slot.meal) for slot in body.slots}
    if wanted - allowed:
        raise HTTPException(422, "Créneau hors des dates du séjour")
    db.execute(delete(Presence).where(Presence.person_id == person_id))
    db.add_all(Presence(person_id=person_id, date=d, meal=m) for d, m in wanted)
    db.commit()


@router.put("/stays/{slug}/activities/{activity_id}/signups/{person_id}", status_code=204)
def sign_up(activity_id: int, person_id: int, stay: StayDep, db: DB) -> None:
    activity = db.get(Activity, activity_id)
    if activity is None or activity.stay_id != stay.id:
        raise HTTPException(404, "Activité introuvable")
    if not activity.optional:
        raise HTTPException(422, "Activité non facultative : tout le monde y participe")
    p = person(db, person_id, stay)
    if not p.does_activities:
        raise HTTPException(422, f"{p.name} ne participe pas aux activités")
    exists = db.scalar(select(Signup).where(Signup.activity_id == activity_id, Signup.person_id == person_id))
    if exists is None:
        db.add(Signup(activity_id=activity_id, person_id=person_id))
        db.commit()


@router.delete("/stays/{slug}/activities/{activity_id}/signups/{person_id}", status_code=204)
def sign_out(activity_id: int, person_id: int, stay: StayDep, db: DB) -> None:
    person(db, person_id, stay)
    db.execute(delete(Signup).where(Signup.activity_id == activity_id, Signup.person_id == person_id))
    db.commit()
