"""Espace organisateur : configuration du séjour, tirage des corvées, affectations."""

import time
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .. import households as h
from .. import journal as j
from .. import nights as n
from .. import schemas as s
from ..deps import DB, AdminStay, owned, person
from ..lottery import build_occurrences, draw
from ..images import MAX_COVER_BYTES, image_type, thumbnail
from ..journal import AdminActorDep
from ..models import (
    Activity,
    Bed,
    ChoreAssignment,
    ChoreType,
    Decline,
    Household,
    Menu,
    Night,
    Person,
    Presence,
    Room,
    Signup,
    Stay,
    StayCover,
)
from ..places import is_google_maps_url
from ..rooms import auto_assign_nights
from ..slots import MEAL_LABELS, MOMENT_LABELS, short_day, stay_days, stay_nights, stay_slots
from .public import create_person as add_person
from .public import validate_dates

router = APIRouter(prefix="/api/stays/{slug}/admin")

# Leur changement date la mention « Mis à jour le … » des infos pratiques.
PLACE_FIELDS = {"address", "map_url", "practical_info"}
# Leur changement déclenche la vérification des dates et le nettoyage hors période.
PERIOD_FIELDS = {"start_date", "end_date", "first_meal", "last_meal"}


@router.get("", status_code=204)
def check_key(stay: AdminStay) -> None:
    """Permet au front de vérifier la clé organisateur."""


# --- Séjour ------------------------------------------------------------------


@router.patch("/stay", response_model=s.StayOut)
def update_stay(body: s.StayUpdate, stay: AdminStay, db: DB, actor: AdminActorDep) -> Stay:
    if body.map_url and not is_google_maps_url(body.map_url):
        raise HTTPException(422, "Le lien de carte doit être un lien Google Maps (https://maps.app.goo.gl/… ou https://www.google.com/maps/…)")
    before = {key: getattr(stay, key) for key in s.StayUpdate.model_fields}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            if key in PLACE_FIELDS and value != getattr(stay, key):
                stay.info_updated_at = datetime.now(timezone.utc)
            setattr(stay, key, value)
    subjects: list[int] = []
    detail: list[str] = []
    if body.model_fields_set & PERIOD_FIELDS:  # nom, règles, lieu : la période ne bouge pas
        validate_dates(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)
        subjects, detail = _clean_period(db, stay)
    if changes := _stay_changes(before, stay):
        j.record(db, stay, actor, f"a modifié le séjour — {' ; '.join(changes)}", subjects, detail)
    db.commit()
    return stay


def _period(v: dict) -> str:
    return f"du {short_day(v['start_date'])} ({MEAL_LABELS[v['first_meal']]}) au {short_day(v['end_date'])} ({MEAL_LABELS[v['last_meal']]})"


def _stay_changes(before: dict, stay: Stay) -> list[str]:
    after = {key: getattr(stay, key) for key in before}
    changes = []
    if before["name"] != after["name"]:
        changes.append(f"nom : {j.quoted(before['name'])} → {j.quoted(after['name'])}")
    if any(before[key] != after[key] for key in PERIOD_FIELDS):
        changes.append(f"dates : {_period(before)} → {_period(after)}")
    if before["separate_couples"] != after["separate_couples"]:
        changes.append("couples séparés aux corvées" if after["separate_couples"] else "couples autorisés sur une même corvée")
    if before["address"] != after["address"]:
        changes.append(f"adresse : {j.quoted(before['address']) if before['address'] else 'aucune'} → "
                       f"{j.quoted(after['address']) if after['address'] else 'aucune'}")
    if before["map_url"] != after["map_url"]:
        changes.append("lien Google Maps modifié")
    if before["practical_info"] != after["practical_info"]:
        changes.append("infos pratiques modifiées")
    return changes


def _clean_period(db: Session, stay: Stay) -> tuple[list[int], list[str]]:
    """Retire les données sorties de la nouvelle période ; rend les personnes touchées et le détail."""
    slots = set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    days = set(stay_days(stay.start_date, stay.end_date))
    nights = set(stay_nights(stay.start_date, stay.end_date))
    people = {p.id: p.name for p in db.scalars(select(Person).where(Person.stay_id == stay.id))}
    lost_slots: dict[int, set] = defaultdict(set)
    lost_nights: dict[int, set] = defaultdict(set)
    for p in db.scalars(select(Presence).where(Presence.person_id.in_(people))):
        if (p.date, p.meal) not in slots:
            lost_slots[p.person_id].add((p.date, p.meal))
            db.delete(p)
    for night in db.scalars(select(Night).where(Night.person_id.in_(people))):
        if night.date not in nights:
            lost_nights[night.person_id].add(night.date)
            db.delete(night)
    detail = []
    touched = sorted(set(lost_slots) | set(lost_nights), key=lambda pid: people[pid])
    for pid in touched:
        lost = j.Presences(frozenset(lost_slots[pid]), frozenset(lost_nights[pid]))
        detail.append(f"{people[pid]} — {j.presence_changes(lost, j.Presences(frozenset(), frozenset()))}")
    menus = []
    for m in db.scalars(select(Menu).where(Menu.stay_id == stay.id)):
        if (m.date, m.meal) not in slots:
            menus.append((m.date, m.meal))
            db.delete(m)
    if menus:
        detail.append(f"Menus retirés : {j.slots_label(menus)}")
    chore_names = {c.id: c.name for c in db.scalars(select(ChoreType).where(ChoreType.stay_id == stay.id))}
    for a in db.scalars(select(ChoreAssignment).where(ChoreAssignment.stay_id == stay.id).order_by(ChoreAssignment.date)):
        if a.date not in days or (a.moment != "day" and (a.date, a.moment) not in slots):
            detail.append(f"Corvée retirée : {chore_names[a.chore_type_id]} {j.moment_label(a.date, a.moment)}, {people[a.person_id]}")
            db.delete(a)
    return touched, detail


async def cover_body(request: Request, _: AdminStay) -> bytes:
    """Corps brut de l'envoi, lu seulement après la clé organisateur et coupé au-delà de la limite :
    un envoi démesuré n'est jamais gardé en mémoire."""
    too_large = HTTPException(413, f"Image trop lourde (au plus {MAX_COVER_BYTES // 1_000_000} Mo)")
    if int(request.headers.get("content-length") or 0) > MAX_COVER_BYTES:
        raise too_large
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > MAX_COVER_BYTES:
            raise too_large
    return bytes(data)


COVER_BODY = {"required": True, "content": {"image/*": {"schema": {"type": "string", "format": "binary"}}}}


@router.put("/cover", response_model=s.StayOut, openapi_extra={"requestBody": COVER_BODY})
def set_cover(stay: AdminStay, data: Annotated[bytes, Depends(cover_body)], db: DB, actor: AdminActorDep) -> Stay:
    """Image de couverture, envoyée telle quelle dans le corps (le front la réduit avant)."""
    content_type = image_type(data)
    if content_type is None:
        raise HTTPException(415, "Format d'image non pris en charge (JPEG, PNG ou WebP)")
    thumb = thumbnail(data)
    if thumb is None:
        raise HTTPException(415, "Image illisible ou trop grande")
    # Upsert : l'ancienne image n'est pas relue pour être écrasée.
    db.execute(
        sqlite_insert(StayCover)
        .values(stay_id=stay.id, content_type=content_type, data=data, thumb=thumb)
        .on_conflict_do_update(
            index_elements=[StayCover.stay_id], set_={"content_type": content_type, "data": data, "thumb": thumb}
        )
    )
    # Horodatage en ms, toujours croissant : une version n'est jamais reprise, même après un retrait,
    # et deux envois concurrents ne tombent pas sur la même (l'URL ?v= est en cache pour un an).
    stay.cover_version = max(time.time_ns() // 1_000_000, (stay.cover_version or 0) + 1)
    j.record(db, stay, actor, "a changé l'image de couverture")
    db.commit()
    return stay


@router.delete("/cover", response_model=s.StayOut)
def delete_cover(stay: AdminStay, db: DB, actor: AdminActorDep) -> Stay:
    if stay.cover_version is not None:
        j.record(db, stay, actor, "a retiré l'image de couverture")
    db.execute(delete(StayCover).where(StayCover.stay_id == stay.id))
    stay.cover_version = None
    db.commit()
    return stay


# --- Personnes ---------------------------------------------------------------


@router.post("/persons", response_model=s.PersonOut, status_code=201)
def create_person(body: s.PersonCreate, stay: AdminStay, db: DB, actor: AdminActorDep) -> Person:
    """Par défaut, la personne forme son propre foyer (célibataire en un geste)."""
    return add_person(db, stay, body, actor)


@router.patch("/persons/{person_id}", response_model=s.PersonOut)
def update_person(person_id: int, body: s.PersonUpdate, stay: AdminStay, db: DB, actor: AdminActorDep) -> Person:
    p = person(db, person_id, stay)
    name, kind, does_chores = p.name, p.kind, p.does_chores
    partner = db.get(Person, p.partner_id) if p.partner_id is not None else None
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(p, key, value)
    if p.kind == "child":
        h.unlink(db, p)  # le couple est un lien entre adultes
    changes = []
    if p.name != name:
        changes.append(f"nom : {j.quoted(name)} → {j.quoted(p.name)}")
    if p.kind != kind:
        changes.append("passe en enfant" if p.kind == "child" else "passe en adulte")
    if p.does_chores != does_chores:
        changes.append("participe aux corvées" if p.does_chores else "ne participe plus aux corvées")
    if partner is not None and p.partner_id is None:
        changes.append(f"couple avec {partner.name} défait")
    if changes:
        j.record(db, stay, actor, f"a modifié {name} — {' ; '.join(changes)}", [p.id, *([partner.id] if partner else [])])
    db.commit()
    return p


@router.delete("/persons/{person_id}", status_code=204)
def delete_person(person_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    p = person(db, person_id, stay)
    j.record(db, stay, actor, f"a supprimé {p.name}", [p.id], j.person_lines(db, p))
    household_id = p.household_id
    db.delete(p)
    h.drop_if_empty(db, household_id)
    db.commit()


@router.put("/persons/{person_id}/partner", response_model=s.PersonOut)
def set_partner(person_id: int, body: s.PartnerIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Person:
    """Lien de couple, maintenu symétriquement, entre deux adultes du même foyer."""
    p = person(db, person_id, stay)
    new = person(db, body.partner_id, stay) if body.partner_id is not None else None
    if (new.id if new else None) != p.partner_id:
        old = [db.get(Person, pid) for pid in dict.fromkeys([p.partner_id, new.partner_id if new else None]) if pid is not None]
        h.link_partners(db, p, new)
        undone = [o for o in old if new is None or o.id != new.id]
        if new is None:
            text = f"a défait le couple {j.of(p.name)} et {undone[0].name}"
        else:
            text = f"a mis {p.name} et {new.name} en couple"
            if undone:
                text += f" ; couple avec {j.join(o.name for o in undone)} défait"
        j.record(db, stay, actor, text, [p.id, *([new.id] if new else []), *(o.id for o in undone)])
    db.commit()
    return p


@router.put("/persons/{person_id}/household", response_model=s.PersonOut)
def move_person(person_id: int, body: s.MoveIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Person:
    p = person(db, person_id, stay)
    old_id, old = p.household_id, j.household_label(db, db.get(Household, p.household_id))
    target = "un nouveau foyer"
    if body.household_id is not None:
        target = f"le foyer {j.quoted(j.household_label(db, h.household(db, body.household_id, stay)))}"
    partner = db.get(Person, p.partner_id) if p.partner_id is not None else None
    h.move(db, stay, p, body.household_id)
    if p.household_id != old_id:
        text = f"a déplacé {p.name} du foyer {j.quoted(old)} vers {target}"
        if partner is not None:
            text += f" ; couple avec {partner.name} défait"
        j.record(db, stay, actor, text, [p.id])
    db.commit()
    return p


# --- Foyers ------------------------------------------------------------------


@router.post("/households/{household_id}/merge", response_model=s.HouseholdOut)
def merge_households(household_id: int, body: s.MergeIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Household:
    """Rassemble deux foyers (par exemple deux conjoints inscrits chacun de leur côté)."""
    source, into = h.household(db, household_id, stay), h.household(db, body.into_id, stay)
    labels = j.household_label(db, source), j.household_label(db, into)
    moved = db.scalars(select(Person).where(Person.household_id == source.id).order_by(Person.name)).all()
    merged = h.merge(db, stay, household_id, body.into_id)
    j.record(
        db,
        stay,
        actor,
        f"a fusionné le foyer {j.quoted(labels[0])} dans le foyer {j.quoted(labels[1])}",
        [p.id for p in moved],
        [f"Membres déplacés : {j.join(p.name for p in moved)}"],
    )
    db.commit()
    return merged


@router.delete("/households/{household_id}", status_code=204)
def delete_household(household_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    """Supprime le foyer et tous ses membres."""
    found = h.household(db, household_id, stay)
    members = db.scalars(select(Person).where(Person.household_id == found.id).order_by(Person.name)).all()
    # Un foyer n'est jamais vide : le dernier membre parti, il disparaît.
    text = f"a supprimé le foyer {j.quoted(j.household_label(db, found))} ({j.join(p.name for p in members)})"
    j.record(db, stay, actor, text, [p.id for p in members], [line for p in members for line in j.person_lines(db, p)])
    db.delete(found)
    db.commit()


@router.put("/persons/{person_id}/bed", response_model=s.BedAssignOut)
def set_bed(person_id: int, body: s.BedAssignIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> dict:
    """Lit pour les nuits demandées, par défaut toutes celles de la personne (capacité vérifiée nuit par nuit)."""
    p = person(db, person_id, stay)
    bed = owned(db, Bed, body.bed_id, stay) if body.bed_id is not None else None
    before = {d: night.bed_id for d, night in n.nights_of(db, p.id).items()}
    warning = n.assign_bed(db, stay, p, bed, body.dates)
    after = {d: night.bed_id for d, night in n.nights_of(db, p.id).items()}
    changed = sorted(d for d in after if d not in before or before[d] != after[d])
    if changed:
        nights = f"{j.plural(len(changed), 'nuit', 'nuits')} du {j.days_label(changed)}"
        if bed is not None:
            text = f"a couché {p.name} dans {j.bed_label(db, bed.id)} — {nights}"
        else:
            text = f"a retiré {p.name} de son lit — {nights}"
        previous: dict[str, list[date]] = defaultdict(list)
        for d in changed:
            if d in before:
                previous[j.bed_label(db, before[d])].append(d)
        if len(previous) == 1:
            text += f" (avant : {next(iter(previous))})"
        elif previous:
            text += " (avant : " + ", ".join(f"{label} le {j.days_label(days)}" for label, days in previous.items()) + ")"
        if added := [d for d in changed if d not in before]:
            text += f" ; {j.plural(len(added), 'nuit ajoutée', 'nuits ajoutées')} à ses présences"
        j.record(db, stay, actor, text, [p.id])
    db.commit()
    return {"warning": warning}


def _sleepers(db: Session, bed_ids: list[int]) -> tuple[list[int], list[str]]:
    """Qui dort dans ces lits, et quelles nuits : de quoi recoucher chacun à la main."""
    people = {p.id: p.name for p in db.scalars(select(Person).join(Night).where(Night.bed_id.in_(bed_ids)))}
    lines = []
    for bed_id in bed_ids:
        by_person: dict[int, list[date]] = defaultdict(list)
        for night in db.scalars(select(Night).where(Night.bed_id == bed_id).order_by(Night.date)):
            by_person[night.person_id].append(night.date)
        if by_person:
            sleepers = ", ".join(f"{people[pid]} ({j.days_label(days)})" for pid, days in by_person.items())
            lines.append(f"{j.bed_label(db, bed_id)} : {sleepers}")
    return sorted(people), lines


# --- Chambres ----------------------------------------------------------------


@router.post("/rooms", response_model=s.RoomOut, status_code=201)
def create_room(body: s.RoomIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Room:
    room = Room(stay_id=stay.id, **body.model_dump())
    db.add(room)
    j.record(db, stay, actor, f"a créé la chambre {j.quoted(room.name)}")
    db.commit()
    return room


@router.patch("/rooms/{room_id}", response_model=s.RoomOut)
def update_room(room_id: int, body: s.RoomIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Room:
    room = owned(db, Room, room_id, stay)
    changes = []
    if body.name != room.name:
        changes.append(f"nom : {j.quoted(room.name)} → {j.quoted(body.name)}")
    if body.notes != room.notes:
        changes.append("notes modifiées")
    if changes:
        j.record(db, stay, actor, f"a modifié la chambre {j.quoted(room.name)} — {' ; '.join(changes)}")
    room.name, room.notes = body.name, body.notes
    db.commit()
    return room


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    room = owned(db, Room, room_id, stay)
    subjects, detail = _sleepers(db, list(db.scalars(select(Bed.id).where(Bed.room_id == room.id).order_by(Bed.id))))
    j.record(db, stay, actor, f"a supprimé la chambre {j.quoted(room.name)}", subjects, detail)
    db.delete(room)
    db.commit()


@router.post("/rooms/{room_id}/beds", response_model=s.BedOut, status_code=201)
def create_bed(room_id: int, body: s.BedIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Bed:
    room = owned(db, Room, room_id, stay)
    bed = Bed(room_id=room_id, **body.model_dump())
    db.add(bed)
    j.record(db, stay, actor, f"a ajouté {j.BED_ARTICLES[bed.kind]} dans la chambre {j.quoted(room.name)}")
    db.commit()
    return bed


@router.delete("/beds/{bed_id}", status_code=204)
def delete_bed(bed_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    bed = owned(db, Bed, bed_id, stay)
    subjects, detail = _sleepers(db, [bed.id])
    room = db.get(Room, bed.room_id)
    label = f" {j.quoted(bed.label)}" if bed.label else ""
    j.record(db, stay, actor, f"a retiré {j.BED_ARTICLES[bed.kind]}{label} de la chambre {j.quoted(room.name)}", subjects, detail)
    db.delete(bed)
    db.commit()


@router.post("/rooms/auto-assign", response_model=s.AutoAssignOut)
def rooms_auto_assign(stay: AdminStay, db: DB, actor: AdminActorDep) -> dict:
    """Propose un lit pour chaque nuit qui n'en a pas ; les nuits déjà attribuées ne bougent pas."""
    people = db.scalars(select(Person).where(Person.stay_id == stay.id)).all()
    beds = db.scalars(select(Bed).join(Room).where(Room.stay_id == stay.id)).all()
    nights = db.scalars(select(Night).where(Night.person_id.in_([p.id for p in people]))).all()
    proposal = auto_assign_nights(
        [{"id": p.id, "kind": p.kind, "partner_id": p.partner_id, "household_id": p.household_id} for p in people],
        [{"id": b.id, "room_id": b.room_id, "kind": b.kind} for b in beds],
        [{"person_id": x.person_id, "date": x.date, "bed_id": x.bed_id} for x in nights],
    )
    for x in nights:
        x.bed_id = proposal.get((x.person_id, x.date), x.bed_id)
    if proposal:
        names = {p.id: p.name for p in people}
        placed: dict[tuple[int, int], list[date]] = defaultdict(list)
        for (pid, d), bed_id in sorted(proposal.items(), key=lambda kv: (names[kv[0][0]], kv[0][1])):
            placed[(pid, bed_id)].append(d)
        j.record(
            db,
            stay,
            actor,
            f"a proposé un lit pour {len(proposal)} {j.plural(len(proposal), 'nuitée', 'nuitées')}",
            {pid for pid, _ in proposal},
            [f"{names[pid]} : {j.bed_label(db, bed_id)} ({j.days_label(days)})" for (pid, bed_id), days in placed.items()],
        )
    db.commit()
    sleeping = {x.person_id for x in nights}
    return {
        "assigned": len(proposal),
        "unassigned": sum(1 for x in nights if x.bed_id is None),
        "undeclared": sum(1 for p in people if p.id not in sleeping),
    }


# --- Corvées -----------------------------------------------------------------


@router.post("/chore-types", response_model=s.ChoreTypeOut, status_code=201)
def create_chore_type(body: s.ChoreTypeIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> ChoreType:
    chore = ChoreType(stay_id=stay.id, **body.model_dump(exclude={"moments"}), moments=",".join(body.moments))
    db.add(chore)
    j.record(db, stay, actor, f"a créé la corvée {j.quoted(chore.name)} ({_chore_rule(chore)})")
    db.commit()
    return chore


@router.patch("/chore-types/{chore_id}", response_model=s.ChoreTypeOut)
def update_chore_type(chore_id: int, body: s.ChoreTypeIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> ChoreType:
    chore = owned(db, ChoreType, chore_id, stay)
    name, rule = chore.name, _chore_rule(chore)
    chore.name, chore.people_needed, chore.every_n_days = body.name, body.people_needed, body.every_n_days
    chore.moments = ",".join(body.moments)
    changes = []
    if chore.name != name:
        changes.append(f"nom : {j.quoted(name)} → {j.quoted(chore.name)}")
    if _chore_rule(chore) != rule:
        changes.append(f"{rule} → {_chore_rule(chore)}")
    if changes:
        j.record(db, stay, actor, f"a modifié la corvée {j.quoted(name)} — {' ; '.join(changes)}")
    db.commit()
    return chore


@router.delete("/chore-types/{chore_id}", status_code=204)
def delete_chore_type(chore_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    chore = owned(db, ChoreType, chore_id, stay)
    teams = _teams(db, stay, ChoreAssignment.chore_type_id == chore.id)
    people = _names(db, stay)
    detail = [f"{j.moment_label(d, m)} : {_team_label(people, team)}" for (_, d, m), team in sorted(teams.items(), key=_occurrence_order)]
    j.record(db, stay, actor, f"a supprimé la corvée {j.quoted(chore.name)}", {pid for team in teams.values() for pid in team}, detail)
    db.delete(chore)
    db.commit()


def _chore_rule(chore: ChoreType) -> str:
    """« déjeuner, dîner ; 2 personnes ; tous les jours »."""
    moments = ", ".join(MOMENT_LABELS[m] for m in chore.moments.split(","))
    people = f"{chore.people_needed} {j.plural(chore.people_needed, 'personne', 'personnes')}"
    rhythm = "tous les jours" if chore.every_n_days == 1 else f"tous les {chore.every_n_days} jours"
    return f"{moments} ; {people} ; {rhythm}"


Occurrence = tuple[int, date, str]  # (corvée, jour, moment)


def _teams(db: Session, stay: Stay, *where) -> dict[Occurrence, frozenset[int]]:
    teams: dict[Occurrence, set[int]] = defaultdict(set)
    for a in db.scalars(select(ChoreAssignment).where(ChoreAssignment.stay_id == stay.id, *where)):
        teams[(a.chore_type_id, a.date, a.moment)].add(a.person_id)
    return {key: frozenset(team) for key, team in teams.items()}


def _names(db: Session, stay: Stay) -> dict[int, str]:
    return {p.id: p.name for p in db.scalars(select(Person).where(Person.stay_id == stay.id))}


def _team_label(people: dict[int, str], team: frozenset[int]) -> str:
    return j.join(sorted(people[pid] for pid in team)) or "personne"


def _occurrence_order(item: tuple[Occurrence, frozenset[int]]) -> tuple:
    (chore_id, d, moment), _ = item
    return d, list(MOMENT_LABELS).index(moment), chore_id


@router.post("/chores/draw", response_model=s.DrawOut)
def draw_chores(stay: AdminStay, db: DB, actor: AdminActorDep) -> dict:
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
    before = _teams(db, stay)
    db.execute(delete(ChoreAssignment).where(ChoreAssignment.stay_id == stay.id))
    for occ, chosen in zip(occurrences, result.assignments):
        db.add_all(
            ChoreAssignment(stay_id=stay.id, chore_type_id=occ.chore_type_id, date=occ.date, moment=occ.moment, person_id=pid)
            for pid in chosen
        )
    after = {(occ.chore_type_id, occ.date, occ.moment): frozenset(chosen) for occ, chosen in zip(occurrences, result.assignments)}
    _record_draw(db, stay, actor, before, after, sum(len(c) for c in result.assignments))
    db.commit()
    return {
        "occurrences": len(occurrences),
        "assigned": sum(len(c) for c in result.assignments),
        "unfilled": result.unfilled,
    }


def _record_draw(
    db: Session, stay: Stay, actor: j.Actor, before: dict[Occurrence, frozenset[int]], after: dict[Occurrence, frozenset[int]], assigned: int
) -> None:
    """Le tirage écrase les ajustements manuels : le détail garde, créneau par créneau, l'équipe d'avant."""
    empty: frozenset[int] = frozenset()
    changed = {key: (before.get(key, empty), after.get(key, empty)) for key in before.keys() | after.keys()}
    changed = {key: teams for key, teams in changed.items() if teams[0] != teams[1]}
    if before:
        text = f"a relancé le tirage des corvées — {len(changed)} {j.plural(len(changed), 'créneau change', 'créneaux changent')} sur {len(after)}"
    else:
        text = f"a tiré au sort les corvées — {assigned} {j.plural(assigned, 'affectation', 'affectations')} sur {len(after)} {j.plural(len(after), 'créneau', 'créneaux')}"
    people = _names(db, stay)
    chores = {c.id: c.name for c in db.scalars(select(ChoreType).where(ChoreType.stay_id == stay.id))}
    detail = [
        f"{chores[chore_id]} {j.moment_label(d, m)} : {_team_label(people, old)} → {_team_label(people, new)}"
        for (chore_id, d, m), (old, new) in sorted(changed.items(), key=_occurrence_order)
    ]
    j.record(db, stay, actor, text, {pid for old, new in changed.values() for pid in old | new}, detail)


@router.put("/chores/occurrence", status_code=204)
def set_occurrence(body: s.OccurrenceIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    """Ajustement manuel d'une occurrence de corvée."""
    chore = owned(db, ChoreType, body.chore_type_id, stay)
    if body.moment == "day":
        valid = stay.start_date <= body.date <= stay.end_date
    else:
        valid = (body.date, body.moment) in set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    if not valid:
        raise HTTPException(422, "Créneau hors du séjour")
    for pid in body.person_ids:
        person(db, pid, stay)
    old = _teams(
        db, stay, ChoreAssignment.chore_type_id == chore.id, ChoreAssignment.date == body.date, ChoreAssignment.moment == body.moment
    ).get((chore.id, body.date, body.moment), frozenset())
    new = frozenset(body.person_ids)
    if old != new:
        people = _names(db, stay)
        text = f"a changé {j.quoted(chore.name)} du {j.moment_label(body.date, body.moment)} — {_team_label(people, old)} → {_team_label(people, new)}"
        j.record(db, stay, actor, text, old | new)
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


def _invite_all(db: Session, activity: Activity) -> list[int]:
    """Inscrit les présents du jour qui manquent ; ni ceux qui se sont retirés, ni désinscription."""
    present = select(Presence.person_id).where(Presence.date == activity.date)
    signed = select(Signup.person_id).where(Signup.activity_id == activity.id)
    declined = select(Decline.person_id).where(Decline.activity_id == activity.id)
    ids = db.scalars(
        select(Person.id).where(
            Person.stay_id == activity.stay_id, Person.id.in_(present), Person.id.not_in(signed), Person.id.not_in(declined)
        )
    ).all()
    db.add_all(Signup(activity_id=activity.id, person_id=pid) for pid in ids)
    return list(ids)


@router.post("/activities", response_model=s.ActivityOut, status_code=201)
def create_activity(body: s.ActivityCreate, stay: AdminStay, db: DB, actor: AdminActorDep) -> Activity:
    _check_activity_date(body, stay)
    activity = Activity(stay_id=stay.id, **body.model_dump(exclude={"invite_all"}))
    db.add(activity)
    db.flush()
    invited = _invite_all(db, activity) if body.invite_all else []
    text = f"a créé l'activité {j.activity_label(activity)}"
    if invited:
        text += f" et inscrit {len(invited)} {j.plural(len(invited), 'personne', 'personnes')} : {j.people_label(db, invited)}"
    j.record(db, stay, actor, text, invited)
    db.commit()
    return activity


@router.post("/activities/{activity_id}/signups/all", response_model=s.InvitedOut)
def invite_all(activity_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> dict:
    """« Inscrire tout le monde » : les présents du jour qui manquent (chacun peut ensuite se retirer)."""
    activity = owned(db, Activity, activity_id, stay)
    added = _invite_all(db, activity)
    if added:
        text = f"a inscrit tout le monde à {j.activity_label(activity)} — {len(added)} {j.plural(len(added), 'personne ajoutée', 'personnes ajoutées')} : {j.people_label(db, added)}"
        j.record(db, stay, actor, text, added)
    db.commit()
    return {"added": len(added)}


@router.patch("/activities/{activity_id}", response_model=s.ActivityOut)
def update_activity(activity_id: int, body: s.ActivityIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Activity:
    _check_activity_date(body, stay)
    activity = owned(db, Activity, activity_id, stay)
    label = j.activity_label(activity)
    before = {key: getattr(activity, key) for key in body.model_dump()}
    for key, value in body.model_dump().items():
        setattr(activity, key, value)
    if changes := _activity_changes(before, activity):
        signed = db.scalars(select(Signup.person_id).where(Signup.activity_id == activity.id)).all()
        j.record(db, stay, actor, f"a modifié l'activité {label} — {' ; '.join(changes)}", signed)
    db.commit()
    return activity


@router.delete("/activities/{activity_id}", status_code=204)
def delete_activity(activity_id: int, stay: AdminStay, db: DB, actor: AdminActorDep) -> None:
    activity = owned(db, Activity, activity_id, stay)
    signed = db.scalars(select(Signup.person_id).where(Signup.activity_id == activity.id)).all()
    detail = [f"Inscrits : {j.people_label(db, signed)}"] if signed else []
    j.record(db, stay, actor, f"a supprimé l'activité {j.activity_label(activity)}", signed, detail)
    db.delete(activity)
    db.commit()


def _hours(v: dict) -> str:
    return "–".join(t for t in (v["start_time"], v["end_time"]) if t) or "sans horaire"


def _activity_changes(before: dict, activity: Activity) -> list[str]:
    after = {key: getattr(activity, key) for key in before}
    changes = []
    if before["name"] != after["name"]:
        changes.append(f"nom : {j.quoted(before['name'])} → {j.quoted(after['name'])}")
    if before["date"] != after["date"]:
        changes.append(f"date : {short_day(before['date'])} → {short_day(after['date'])}")
    if _hours(before) != _hours(after):
        changes.append(f"horaire : {_hours(before)} → {_hours(after)}")
    if before["location"] != after["location"]:
        changes.append(f"lieu : {j.quoted(before['location']) if before['location'] else 'aucun'} → "
                       f"{j.quoted(after['location']) if after['location'] else 'aucun'}")
    if before["description"] != after["description"]:
        changes.append("description modifiée")
    return changes


# --- Menus -------------------------------------------------------------------


@router.put("/menus", response_model=s.MenuOut)
def set_menu(body: s.MenuIn, stay: AdminStay, db: DB, actor: AdminActorDep) -> Menu:
    if (body.date, body.meal) not in set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)):
        raise HTTPException(422, "Repas hors du séjour")
    menu = db.scalar(select(Menu).where(Menu.stay_id == stay.id, Menu.date == body.date, Menu.meal == body.meal))
    if menu is None:
        menu = Menu(stay_id=stay.id, date=body.date, meal=body.meal, dishes="", notes="")
        db.add(menu)
    if (menu.dishes, menu.notes) != (body.dishes.strip(), body.notes.strip()):
        j.record(db, stay, actor, f"a modifié le menu du {MEAL_LABELS[body.meal]} du {short_day(body.date)}")
    menu.dishes, menu.notes = body.dishes.strip(), body.notes.strip()
    db.commit()
    return menu


# --- Journal -----------------------------------------------------------------


@router.get("/journal", response_model=s.JournalAdminOut)
def journal(stay: AdminStay, db: DB, query: Annotated[s.JournalQuery, Query()]) -> dict:
    """Le journal du séjour, avec le détail des gestes de masse (avant / après)."""
    rows, more = j.entries(db, stay, query.limit, query.before, query.persons)
    return {"entries": rows, "more": more}
