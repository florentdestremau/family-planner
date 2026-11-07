"""Règles des foyers et des couples, partagées par l'espace participant et l'espace organisateur."""

import unicodedata
from datetime import date, datetime, timezone
from typing import NamedTuple

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from . import nights as n
from . import schemas as s
from .deps import owned, person
from .models import ChoreAssignment, Decline, Household, LogEntry, Person, Presence, Signup, Stay
from .slots import stay_nights, stay_slots


class Member(NamedTuple):
    """Présences demandées pour une personne : repas, et nuits (None : déduites des repas)."""

    person: Person
    slots: list[s.SlotIn]
    nights: list[date] | None = None


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
    )
    db.add(p)
    db.flush()
    check_homonyms(db, stay, p, body.allow_same_name)
    if body.partner_id is not None:
        link_partners(db, p, person(db, body.partner_id, stay))
    db.flush()
    return p


def name_key(name: str) -> str:
    """Prénom comparé sans casse, accents ni espaces superflus : « Aliénor » = « alienor »."""
    plain = "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))
    return " ".join(plain.casefold().split())


def check_homonyms(db: Session, stay: Stay, p: Person, allowed: bool) -> None:
    """Refuse un doublon : le même prénom dans le même foyer, ou ailleurs dans le séjour sans
    confirmation (un homonyme existe, mais c'est le plus souvent la même personne ajoutée deux fois).

    Vérifié une fois `p` écrit : SQLite n'admet qu'un écrivain à la fois, si bien que deux ajouts
    simultanés (formulaire envoyé deux fois) se voient l'un l'autre et que le second est refusé.
    """
    key = name_key(p.name)
    for other in db.scalars(select(Person).where(Person.stay_id == stay.id, Person.id != p.id).order_by(Person.id)):
        if name_key(other.name) != key:
            continue
        if other.household_id == p.household_id:
            raise HTTPException(409, f"{other.name} fait déjà partie de ce foyer")
        if not allowed:
            raise HTTPException(
                409,
                f"« {other.name} » est déjà dans le séjour : si c'est vous, choisissez ce nom dans la liste ;"
                f" sinon, précisez le prénom (« {other.name} D. »)",
            )


def merge_duplicate(db: Session, dup: Person, keep: Person) -> None:
    """Retire un doublon : ce qu'il avait en plus passe à la personne gardée, puis il disparaît.

    Repas, nuits, inscriptions et corvées : l'union des deux (une nuit gardée sans lit prend celui
    du doublon). Régimes et heures : ceux de la personne gardée, ou à défaut ceux du doublon. Le
    couple du doublon passe à la personne gardée si elle n'en a pas et qu'ils sont du même foyer.
    """
    if dup.id == keep.id:
        raise HTTPException(422, "Une personne ne peut pas être son propre doublon")
    meals = {(x.date, x.meal) for x in db.scalars(select(Presence).where(Presence.person_id == keep.id))}
    for x in db.scalars(select(Presence).where(Presence.person_id == dup.id)).all():
        if (x.date, x.meal) not in meals:
            x.person_id = keep.id
    kept_nights = n.nights_of(db, keep.id)
    for night in n.nights_of(db, dup.id).values():
        kept = kept_nights.get(night.date)
        if kept is None:
            night.person_id = keep.id
        elif kept.bed_id is None:
            kept.bed_id = night.bed_id
    signed = set(db.scalars(select(Signup.activity_id).where(Signup.person_id == keep.id)))
    declined = set(db.scalars(select(Decline.activity_id).where(Decline.person_id == keep.id)))
    for signup in db.scalars(select(Signup).where(Signup.person_id == dup.id)).all():
        if signup.activity_id not in signed:
            signup.person_id = keep.id
            db.execute(delete(Decline).where(Decline.person_id == keep.id, Decline.activity_id == signup.activity_id))
            declined.discard(signup.activity_id)
            signed.add(signup.activity_id)
    for decline in db.scalars(select(Decline).where(Decline.person_id == dup.id)).all():
        if decline.activity_id not in signed | declined:
            decline.person_id = keep.id
    chores = {(a.chore_type_id, a.date, a.moment) for a in db.scalars(select(ChoreAssignment).where(ChoreAssignment.person_id == keep.id))}
    for a in db.scalars(select(ChoreAssignment).where(ChoreAssignment.person_id == dup.id)).all():
        if (a.chore_type_id, a.date, a.moment) not in chores:
            a.person_id = keep.id
    if not keep.diets and not keep.diet_note:
        keep.diets, keep.diet_note = dup.diets, dup.diet_note
    if not keep.arrival_time:
        keep.arrival_time, keep.arrival_updated_at = dup.arrival_time, dup.arrival_updated_at
    if not keep.departure_time:
        keep.departure_time, keep.departure_updated_at = dup.departure_time, dup.departure_updated_at
    if not keep.times_note:
        keep.times_note = dup.times_note
    partner = db.get(Person, dup.partner_id) if dup.partner_id not in (None, keep.id) else None
    unlink(db, dup)
    if partner is not None and keep.partner_id is None and keep.kind == "adult" and partner.household_id == keep.household_id:
        link_partners(db, keep, partner)
    # Le journal suit la personne gardée : « Me concerne » y retrouve les lignes du doublon.
    db.execute(
        update(LogEntry)
        .where(LogEntry.stay_id == keep.stay_id, LogEntry.subjects.contains(f",{dup.id},"))
        .values(subjects=func.replace(LogEntry.subjects, f",{dup.id},", f",{keep.id},"))
    )
    db.flush()
    household_id = dup.household_id
    db.delete(dup)
    drop_if_empty(db, household_id)


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
    return p


def merge(db: Session, stay: Stay, source_id: int, into_id: int) -> Household:
    source, into = household(db, source_id, stay), household(db, into_id, stay)
    if source.id == into.id:
        raise HTTPException(422, "Impossible de fusionner un foyer avec lui-même")
    for p in db.scalars(select(Person).where(Person.household_id == source.id)):
        p.household_id = into.id
    db.flush()
    db.delete(source)
    db.flush()
    return into


def household_members(db: Session, stay: Stay, household_id: int, body: s.HouseholdPresencesIn) -> list[Member]:
    """Présences d'un foyer, vérifiées sans rien écrire (route du foyer, propositions de l'assistant)."""
    found = household(db, household_id, stay)
    if len({m.person_id for m in body.members}) < len(body.members):
        raise HTTPException(422, "Une même personne apparaît deux fois")
    members = []
    for member in body.members:
        p = person(db, member.person_id, stay)
        if p.household_id != found.id:
            raise HTTPException(422, f"{p.name} n'appartient pas à ce foyer")
        members.append(Member(p, member.slots, member.nights))
    check_slots(stay, members)
    return members


def times_members(db: Session, stay: Stay, household_id: int, body: s.HouseholdTimesIn) -> list[tuple[Person, s.MemberTimes]]:
    """Heures d'un foyer, vérifiées sans rien écrire."""
    found = household(db, household_id, stay)
    if len({m.person_id for m in body.members}) < len(body.members):
        raise HTTPException(422, "Une même personne apparaît deux fois")
    members = []
    for member in body.members:
        p = person(db, member.person_id, stay)
        if p.household_id != found.id:
            raise HTTPException(422, f"{p.name} n'appartient pas à ce foyer")
        members.append((p, member))
    return members


def replace_times(members: list[tuple[Person, s.MemberTimes]]) -> None:
    """Heures d'arrivée et de départ de membres d'un foyer. L'heure du changement n'est notée que
    pour ce qui change vraiment : l'arrivée, le départ, ou les deux quand la note change."""
    now = datetime.now(timezone.utc)
    for p, member in members:
        note = member.times_note != p.times_note
        if note or member.arrival_time != p.arrival_time:
            p.arrival_updated_at = now
        if note or member.departure_time != p.departure_time:
            p.departure_updated_at = now
        p.arrival_time, p.departure_time, p.times_note = member.arrival_time, member.departure_time, member.times_note


def check_slots(stay: Stay, members: list[Member]) -> None:
    allowed: set[tuple[date, str]] = set(stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal))
    nights = set(stay_nights(stay.start_date, stay.end_date))
    for _, slots, wanted in members:
        if {(slot.date, slot.meal) for slot in slots} - allowed:
            raise HTTPException(422, "Créneau hors des dates du séjour")
        if set(wanted or []) - nights:
            raise HTTPException(422, "Nuit hors des dates du séjour")


def resolved_nights(db: Session, stay: Stay, member: Member) -> set[date]:
    return n.resolve(db, stay, member.person, {(slot.date, slot.meal) for slot in member.slots}, member.nights)


def replace_presences(db: Session, stay: Stay, members: list[Member]) -> None:
    check_slots(stay, members)
    # Nuits calculées avant d'effacer les repas : la déduction compare anciens et nouveaux repas.
    nights = [resolved_nights(db, stay, m) for m in members]
    for (p, slots, _), wanted in zip(members, nights):
        db.execute(delete(Presence).where(Presence.person_id == p.id))
        db.add_all(Presence(person_id=p.id, date=d, meal=m) for d, m in {(slot.date, slot.meal) for slot in slots})
        n.write(db, p, wanted)
    db.flush()
