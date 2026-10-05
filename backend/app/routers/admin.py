"""Espace organisateur : configuration du séjour, tirage des corvées, affectations."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from .. import households as h
from .. import schemas as s
from ..deps import DB, AdminStay, owned, person
from ..lottery import build_occurrences, draw
from ..models import Activity, Bed, ChoreAssignment, ChoreType, Household, Menu, Person, Presence, Room, Stay
from ..rooms import auto_assign
from ..slots import BED_PLACES, stay_days, stay_slots
from .public import validate_dates

router = APIRouter(prefix="/api/stays/{slug}/admin")


@router.get("", status_code=204)
def check_key(stay: AdminStay) -> None:
    """Permet au front de vérifier la clé organisateur."""


# --- Séjour ------------------------------------------------------------------


@router.patch("/stay", response_model=s.StayOut)
def update_stay(body: s.StayUpdate, stay: AdminStay, db: DB) -> Stay:
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(stay, key, value)
    validate_dates(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)
    # Nettoyage des données sorties de la nouvelle période.
    slots = set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    days = set(stay_days(stay.start_date, stay.end_date))
    person_ids = select(Person.id).where(Person.stay_id == stay.id)
    for p in db.scalars(select(Presence).where(Presence.person_id.in_(person_ids))):
        if (p.date, p.meal) not in slots:
            db.delete(p)
    for m in db.scalars(select(Menu).where(Menu.stay_id == stay.id)):
        if (m.date, m.meal) not in slots:
            db.delete(m)
    for a in db.scalars(select(ChoreAssignment).where(ChoreAssignment.stay_id == stay.id)):
        if a.date not in days or (a.moment != "day" and (a.date, a.moment) not in slots):
            db.delete(a)
    db.commit()
    return stay


# --- Personnes ---------------------------------------------------------------


@router.post("/persons", response_model=s.PersonOut, status_code=201)
def create_person(body: s.PersonCreate, stay: AdminStay, db: DB) -> Person:
    """Par défaut, la personne forme son propre foyer (célibataire en un geste)."""
    return h.create_person(db, stay, body)


@router.patch("/persons/{person_id}", response_model=s.PersonOut)
def update_person(person_id: int, body: s.PersonUpdate, stay: AdminStay, db: DB) -> Person:
    p = person(db, person_id, stay)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(p, key, value)
    if p.kind == "child":
        h.unlink(db, p)  # le couple est un lien entre adultes
    db.commit()
    return p


@router.delete("/persons/{person_id}", status_code=204)
def delete_person(person_id: int, stay: AdminStay, db: DB) -> None:
    p = person(db, person_id, stay)
    household_id = p.household_id
    db.delete(p)
    h.drop_if_empty(db, household_id)
    db.commit()


@router.put("/persons/{person_id}/partner", response_model=s.PersonOut)
def set_partner(person_id: int, body: s.PartnerIn, stay: AdminStay, db: DB) -> Person:
    """Lien de couple, maintenu symétriquement, entre deux adultes du même foyer."""
    p = person(db, person_id, stay)
    h.link_partners(db, p, person(db, body.partner_id, stay) if body.partner_id is not None else None)
    db.commit()
    return p


@router.put("/persons/{person_id}/household", response_model=s.PersonOut)
def move_person(person_id: int, body: s.MoveIn, stay: AdminStay, db: DB) -> Person:
    return h.move(db, stay, person(db, person_id, stay), body.household_id)


# --- Foyers ------------------------------------------------------------------


@router.post("/households/{household_id}/merge", response_model=s.HouseholdOut)
def merge_households(household_id: int, body: s.MergeIn, stay: AdminStay, db: DB) -> Household:
    """Rassemble deux foyers (par exemple deux conjoints inscrits chacun de leur côté)."""
    return h.merge(db, stay, household_id, body.into_id)


@router.delete("/households/{household_id}", status_code=204)
def delete_household(household_id: int, stay: AdminStay, db: DB) -> None:
    """Supprime le foyer et tous ses membres."""
    db.delete(h.household(db, household_id, stay))
    db.commit()


@router.put("/persons/{person_id}/bed", response_model=s.PersonOut)
def set_bed(person_id: int, body: s.BedAssignIn, stay: AdminStay, db: DB) -> Person:
    p = person(db, person_id, stay)
    if body.bed_id is not None:
        bed = owned(db, Bed, body.bed_id, stay)
        taken = len(db.scalars(select(Person).where(Person.bed_id == bed.id, Person.id != p.id)).all())
        if taken >= BED_PLACES[bed.kind]:
            raise HTTPException(409, "Ce lit est déjà complet")
    p.bed_id = body.bed_id
    db.commit()
    return p


# --- Chambres ----------------------------------------------------------------


@router.post("/rooms", response_model=s.RoomOut, status_code=201)
def create_room(body: s.RoomIn, stay: AdminStay, db: DB) -> Room:
    room = Room(stay_id=stay.id, **body.model_dump())
    db.add(room)
    db.commit()
    return room


@router.patch("/rooms/{room_id}", response_model=s.RoomOut)
def update_room(room_id: int, body: s.RoomIn, stay: AdminStay, db: DB) -> Room:
    room = owned(db, Room, room_id, stay)
    room.name, room.notes = body.name, body.notes
    db.commit()
    return room


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: int, stay: AdminStay, db: DB) -> None:
    db.delete(owned(db, Room, room_id, stay))
    db.commit()


@router.post("/rooms/{room_id}/beds", response_model=s.BedOut, status_code=201)
def create_bed(room_id: int, body: s.BedIn, stay: AdminStay, db: DB) -> Bed:
    owned(db, Room, room_id, stay)
    bed = Bed(room_id=room_id, **body.model_dump())
    db.add(bed)
    db.commit()
    return bed


@router.delete("/beds/{bed_id}", status_code=204)
def delete_bed(bed_id: int, stay: AdminStay, db: DB) -> None:
    db.delete(owned(db, Bed, bed_id, stay))
    db.commit()


@router.post("/rooms/auto-assign")
def rooms_auto_assign(stay: AdminStay, db: DB) -> dict:
    people = db.scalars(select(Person).where(Person.stay_id == stay.id)).all()
    beds = db.scalars(select(Bed).join(Room).where(Room.stay_id == stay.id)).all()
    proposal = auto_assign(
        [{"id": p.id, "kind": p.kind, "partner_id": p.partner_id, "household_id": p.household_id, "bed_id": p.bed_id} for p in people],
        [{"id": b.id, "room_id": b.room_id, "kind": b.kind} for b in beds],
    )
    for p in people:
        if p.id in proposal:
            p.bed_id = proposal[p.id]
    db.commit()
    return {"assigned": len(proposal), "unassigned": sum(1 for p in people if p.bed_id is None)}


# --- Corvées -----------------------------------------------------------------


@router.post("/chore-types", response_model=s.ChoreTypeOut, status_code=201)
def create_chore_type(body: s.ChoreTypeIn, stay: AdminStay, db: DB) -> ChoreType:
    chore = ChoreType(stay_id=stay.id, **body.model_dump(exclude={"moments"}), moments=",".join(body.moments))
    db.add(chore)
    db.commit()
    return chore


@router.patch("/chore-types/{chore_id}", response_model=s.ChoreTypeOut)
def update_chore_type(chore_id: int, body: s.ChoreTypeIn, stay: AdminStay, db: DB) -> ChoreType:
    chore = owned(db, ChoreType, chore_id, stay)
    chore.name, chore.people_needed, chore.every_n_days = body.name, body.people_needed, body.every_n_days
    chore.moments = ",".join(body.moments)
    db.commit()
    return chore


@router.delete("/chore-types/{chore_id}", status_code=204)
def delete_chore_type(chore_id: int, stay: AdminStay, db: DB) -> None:
    db.delete(owned(db, ChoreType, chore_id, stay))
    db.commit()


@router.post("/chores/draw", response_model=s.DrawOut)
def draw_chores(stay: AdminStay, db: DB) -> dict:
    """(Re)tire au sort toutes les corvées. Écrase les ajustements manuels."""
    people = db.scalars(select(Person).where(Person.stay_id == stay.id)).all()
    presences = db.scalars(select(Presence).where(Presence.person_id.in_([p.id for p in people]))).all()
    chores = db.scalars(select(ChoreType).where(ChoreType.stay_id == stay.id)).all()
    occurrences = build_occurrences(
        stay_days(stay.start_date, stay.end_date),
        set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)),
        [(c.id, c.moments.split(","), c.people_needed, c.every_n_days) for c in chores],
        [p.id for p in people if p.does_chores],
        {(pr.person_id, pr.date, pr.meal) for pr in presences},
    )
    partners = {p.id: p.partner_id for p in people if p.partner_id}
    result = draw(occurrences, partners, stay.separate_couples)
    db.execute(delete(ChoreAssignment).where(ChoreAssignment.stay_id == stay.id))
    for occ, chosen in zip(occurrences, result.assignments):
        db.add_all(
            ChoreAssignment(stay_id=stay.id, chore_type_id=occ.chore_type_id, date=occ.date, moment=occ.moment, person_id=pid)
            for pid in chosen
        )
    db.commit()
    return {
        "occurrences": len(occurrences),
        "assigned": sum(len(c) for c in result.assignments),
        "unfilled": result.unfilled,
    }


@router.put("/chores/occurrence", status_code=204)
def set_occurrence(body: s.OccurrenceIn, stay: AdminStay, db: DB) -> None:
    """Ajustement manuel d'une occurrence de corvée."""
    owned(db, ChoreType, body.chore_type_id, stay)
    if body.moment == "day":
        valid = stay.start_date <= body.date <= stay.end_date
    else:
        valid = (body.date, body.moment) in set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    if not valid:
        raise HTTPException(422, "Créneau hors du séjour")
    for pid in body.person_ids:
        person(db, pid, stay)
    db.execute(
        delete(ChoreAssignment).where(
            ChoreAssignment.stay_id == stay.id,
            ChoreAssignment.chore_type_id == body.chore_type_id,
            ChoreAssignment.date == body.date,
            ChoreAssignment.moment == body.moment,
        )
    )
    db.add_all(
        ChoreAssignment(stay_id=stay.id, chore_type_id=body.chore_type_id, date=body.date, moment=body.moment, person_id=pid)
        for pid in dict.fromkeys(body.person_ids)
    )
    db.commit()


# --- Activités ---------------------------------------------------------------


def _check_activity_date(body: s.ActivityIn, stay: Stay) -> None:
    if not stay.start_date <= body.date <= stay.end_date:
        raise HTTPException(422, "Date hors du séjour")


@router.post("/activities", response_model=s.ActivityOut, status_code=201)
def create_activity(body: s.ActivityIn, stay: AdminStay, db: DB) -> Activity:
    _check_activity_date(body, stay)
    activity = Activity(stay_id=stay.id, **body.model_dump())
    db.add(activity)
    db.commit()
    return activity


@router.patch("/activities/{activity_id}", response_model=s.ActivityOut)
def update_activity(activity_id: int, body: s.ActivityIn, stay: AdminStay, db: DB) -> Activity:
    _check_activity_date(body, stay)
    activity = owned(db, Activity, activity_id, stay)
    for key, value in body.model_dump().items():
        setattr(activity, key, value)
    db.commit()
    return activity


@router.delete("/activities/{activity_id}", status_code=204)
def delete_activity(activity_id: int, stay: AdminStay, db: DB) -> None:
    db.delete(owned(db, Activity, activity_id, stay))
    db.commit()


# --- Menus -------------------------------------------------------------------


@router.put("/menus", response_model=s.MenuOut)
def set_menu(body: s.MenuIn, stay: AdminStay, db: DB) -> Menu:
    if (body.date, body.meal) not in set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)):
        raise HTTPException(422, "Repas hors du séjour")
    menu = db.scalar(select(Menu).where(Menu.stay_id == stay.id, Menu.date == body.date, Menu.meal == body.meal))
    if menu is None:
        menu = Menu(stay_id=stay.id, date=body.date, meal=body.meal)
        db.add(menu)
    menu.dishes, menu.notes = body.dishes.strip(), body.notes.strip()
    db.commit()
    return menu
