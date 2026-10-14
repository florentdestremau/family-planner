"""Nuits sur place et lits nuit par nuit.

Une nuit (nuit du jour J, de J à J+1) porte le lit occupé cette nuit-là ; la capacité d'un lit se
vérifie donc nuit par nuit. Pour que le cas courant reste simple (même lit tout le séjour), une
nuit ajoutée reprend le lit de la nuit la plus proche s'il reste de la place, et affecter un lit
sans préciser de nuit vaut pour toutes les nuits de la personne.
"""

from datetime import date

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Bed, Night, Person, Presence, Stay
from .slots import BED_PLACES, follow_meals, short_day, stay_nights


def nights_of(db: Session, person_id: int) -> dict[date, Night]:
    return {n.date: n for n in db.scalars(select(Night).where(Night.person_id == person_id))}


def occupancy(db: Session, bed_id: int, night: date, except_person: int | None = None) -> int:
    query = select(func.count(Night.id)).where(Night.bed_id == bed_id, Night.date == night)
    if except_person is not None:
        query = query.where(Night.person_id != except_person)
    return db.scalar(query)


def resolve(db: Session, stay: Stay, p: Person, meals: set[tuple[date, str]], nights: list[date] | None) -> set[date]:
    """Nuits données explicitement, ou à défaut déduites du changement de repas (follow_meals)."""
    if nights is not None:
        return set(nights)
    old_meals = {(pr.date, pr.meal) for pr in db.scalars(select(Presence).where(Presence.person_id == p.id))}
    return follow_meals(stay_nights(stay.start_date, stay.end_date), old_meals, meals, set(nights_of(db, p.id)))


def write(db: Session, p: Person, wanted: set[date]) -> None:
    """Remplace les nuits d'une personne en gardant le lit des nuits conservées.

    Une nouvelle nuit reprend le lit de la nuit la plus proche (la veille d'abord) s'il reste de la
    place cette nuit-là, sinon elle reste sans lit.
    """
    current = nights_of(db, p.id)
    for night in set(current) - wanted:
        db.delete(current.pop(night))
    db.flush()
    for night in sorted(wanted - set(current)):
        neighbours = sorted(current.values(), key=lambda n: (abs((n.date - night).days), n.date > night))
        bed = next(
            (
                n.bed_id
                for n in neighbours
                if n.bed_id is not None and occupancy(db, n.bed_id, night) < BED_PLACES[db.get(Bed, n.bed_id).kind]
            ),
            None,
        )
        current[night] = Night(person_id=p.id, date=night, bed_id=bed)
        db.add(current[night])
        db.flush()


def assign_bed(db: Session, stay: Stay, p: Person, bed: Bed | None, dates: list[date] | None) -> str | None:
    """Couche la personne dans un lit (ou l'en retire) pour ces nuits, par défaut toutes les siennes.

    Une nuit que la personne n'avait pas déclarée est ajoutée à ses présences ; l'avertissement
    renvoyé le signale à l'organisateur.
    """
    possible = stay_nights(stay.start_date, stay.end_date)
    mine = nights_of(db, p.id)
    if dates is not None and set(dates) - set(possible):
        raise HTTPException(422, "Nuit hors du séjour")
    if bed is None:
        for night in dates if dates is not None else mine:
            if night in mine:
                mine[night].bed_id = None
        db.commit()
        return None
    targets = sorted(set(dates)) if dates is not None else sorted(mine) or possible
    if not targets:
        raise HTTPException(422, "Aucune nuit à attribuer")
    full = [night for night in targets if occupancy(db, bed.id, night, p.id) >= BED_PLACES[bed.kind]]
    if full:
        raise HTTPException(409, f"Ce lit est déjà complet la nuit du {', '.join(short_day(n) for n in full)}")
    added = [night for night in targets if night not in mine]
    for night in targets:
        if night in mine:
            mine[night].bed_id = bed.id
        else:
            db.add(Night(person_id=p.id, date=night, bed_id=bed.id))
    db.commit()
    if not added:
        return None
    return f"{p.name} n'avait pas déclaré la nuit du {', '.join(short_day(n) for n in added)} : ajoutée à ses présences."
