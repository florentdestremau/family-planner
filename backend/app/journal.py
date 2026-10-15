"""Journal d'activité du séjour : chaque modification, son auteur et une phrase en français.

L'auteur est la personne désignée sur l'appareil (« qui suis-je ? ») : le front la déclare à chaque
modification (en-tête X-Actor). C'est déclaratif et rien ne le vérifie, comme le reste de
l'application ; X-Via: assistant signale des présences saisies par l'assistant IA.

La phrase s'écrit au moment de l'action, avec les noms de ce moment-là : elle reste juste quand une
personne est renommée ou supprimée ensuite. Le détail (avant / après des gestes de masse) est
réservé à l'organisateur. Les consultations ne sont pas notées : lire n'est pas agir.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import date
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .deps import DB, AdminStay, StayDep
from .models import (
    Activity,
    Bed,
    ChoreAssignment,
    ChoreType,
    Household,
    LogEntry,
    Night,
    Person,
    Presence,
    Room,
    Signup,
    Stay,
)
from .slots import MEAL_LABELS, MEALS, MOMENT_LABELS, short_day

ACTOR_ID = re.compile(r"\d{1,12}")

BED_NAMES = {"double": "lit double", "single": "lit simple", "bunk": "lits superposés", "extra": "lit d'appoint"}
BED_ARTICLES = {"double": "un lit double", "single": "un lit simple", "bunk": "des lits superposés", "extra": "un lit d'appoint"}
DIET_LABELS = {
    "vegetarian": "végétarien",
    "vegan": "végan",
    "gluten_free": "sans gluten",
    "lactose_free": "sans lactose",
    "nut_allergy": "allergie arachides et fruits à coque",
    "seafood_allergy": "allergie poisson et fruits de mer",
}


# --- Auteur ------------------------------------------------------------------


@dataclass(frozen=True)
class Actor:
    """Auteur d'une modification : la personne désignée sur l'appareil, si le front l'a déclarée."""

    id: int | None = None
    name: str = ""
    via_assistant: bool = False
    organizer: bool = False  # depuis l'espace organisateur

    def label(self) -> str:
        if self.name:
            return self.name
        return "l'organisateur" if self.organizer else "quelqu'un"


def _actor(db: Session, stay: Stay, x_actor: str, x_via: str, organizer: bool) -> Actor:
    found = db.get(Person, int(x_actor)) if ACTOR_ID.fullmatch(x_actor) else None
    if found is None or found.stay_id != stay.id:  # inconnue ou d'un autre séjour : ignorée
        return Actor(via_assistant=x_via == "assistant", organizer=organizer)
    return Actor(found.id, found.name, x_via == "assistant", organizer)


def get_actor(stay: StayDep, db: DB, x_actor: Annotated[str, Header()] = "", x_via: Annotated[str, Header()] = "") -> Actor:
    return _actor(db, stay, x_actor, x_via, organizer=False)


def get_admin_actor(
    stay: AdminStay, db: DB, x_actor: Annotated[str, Header()] = "", x_via: Annotated[str, Header()] = ""
) -> Actor:
    return _actor(db, stay, x_actor, x_via, organizer=True)


ActorDep = Annotated[Actor, Depends(get_actor)]
AdminActorDep = Annotated[Actor, Depends(get_admin_actor)]


def record(
    db: Session, stay: Stay, actor: Actor | None, text: str, subjects: Iterable[int] = (), detail: Iterable[str] = ()
) -> None:
    """Ajoute une ligne au journal, dans la transaction de la modification (enregistrées ensemble)."""
    ids = sorted(set(subjects))
    db.add(
        LogEntry(
            stay_id=stay.id,
            actor_id=actor.id if actor else None,
            actor=actor.label() if actor else "",
            via_assistant=actor.via_assistant if actor else False,
            text=text,
            detail="\n".join(detail),
            subjects=f",{','.join(map(str, ids))}," if ids else "",
        )
    )


def entries(db: Session, stay: Stay, limit: int, before: int | None, persons: list[int]) -> tuple[list[LogEntry], bool]:
    """Les plus récentes d'abord ; `persons` : seulement celles qui concernent l'une de ces personnes."""
    query = select(LogEntry).where(LogEntry.stay_id == stay.id)
    if before is not None:
        query = query.where(LogEntry.id < before)
    if persons:
        query = query.where(or_(*(LogEntry.subjects.contains(f",{pid},") for pid in persons)))
    rows = db.scalars(query.order_by(LogEntry.id.desc()).limit(limit + 1)).all()
    return list(rows[:limit]), len(rows) > limit


# --- Libellés ----------------------------------------------------------------


def quoted(text: str) -> str:
    return f"« {text} »"


def of(name: str) -> str:
    """« de Paul », « d'Anne », « d'Hélène »."""
    return f"d'{name}" if name[:1].lower() in "aeiouyhàâéèêëîïôöûü" else f"de {name}"


def join(items: Iterable[str]) -> str:
    """« Paul », « Paul et Marie », « Paul, Marie et Léo »."""
    items = list(items)
    return ", ".join(items[:-1]) + " et " + items[-1] if len(items) > 1 else "".join(items)


def plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def slots_label(slots: Iterable[tuple[date, str]]) -> str:
    """« ven. 30/10 (dîner), sam. 31/10 (petit-déjeuner, déjeuner) »."""
    by_day: dict[date, list[str]] = {}
    for d, meal in sorted(slots, key=lambda s: (s[0], MEALS.index(s[1]))):
        by_day.setdefault(d, []).append(MEAL_LABELS[meal])
    return ", ".join(f"{short_day(d)} ({', '.join(meals)})" for d, meals in by_day.items())


def days_label(days: Iterable[date]) -> str:
    return ", ".join(short_day(d) for d in sorted(days))


def moment_label(d: date, moment: str) -> str:
    return f"{short_day(d)} ({MOMENT_LABELS[moment]})"


def household_label(db: Session, household: Household) -> str:
    """Nom du foyer, ou à défaut les prénoms des adultes (comme à l'écran)."""
    if household.name:
        return household.name
    members = db.scalars(select(Person).where(Person.household_id == household.id).order_by(Person.name)).all()
    adults = [p for p in members if p.kind == "adult"]
    return " & ".join(p.name for p in adults or members)


def bed_label(db: Session, bed_id: int | None) -> str:
    bed = db.get(Bed, bed_id) if bed_id is not None else None
    if bed is None:
        return "sans lit"
    room = db.get(Room, bed.room_id)
    return f"{room.name} — {bed.label or BED_NAMES[bed.kind]}"


def activity_label(activity: Activity) -> str:
    when = short_day(activity.date) + (f" à {activity.start_time}" if activity.start_time else "")
    return f"{quoted(activity.name)} ({when})"


def names(db: Session, ids: Iterable[int]) -> list[str]:
    found = {p.id: p.name for p in db.scalars(select(Person).where(Person.id.in_(list(ids))))}
    return sorted(found.values())


def people_label(db: Session, ids: Iterable[int]) -> str:
    return join(names(db, ids)) or "personne"


# --- Présences ---------------------------------------------------------------


@dataclass(frozen=True)
class Presences:
    slots: frozenset[tuple[date, str]]
    nights: frozenset[date]


def presences_of(db: Session, person_id: int) -> Presences:
    slots = frozenset((p.date, p.meal) for p in db.scalars(select(Presence).where(Presence.person_id == person_id)))
    nights = frozenset(n.date for n in db.scalars(select(Night).where(Night.person_id == person_id)))
    return Presences(slots, nights)


def presence_changes(before: Presences, after: Presences) -> str:
    """« repas retirés : sam. 31/10 (dîner) ; nuit retirée : sam. 31/10 » ; vide si rien ne change."""
    parts = []
    for slots, word in ((after.slots - before.slots, "ajouté"), (before.slots - after.slots, "retiré")):
        if slots:
            parts.append(f"repas {word}{plural(len(slots), '', 's')} : {slots_label(slots)}")
    for nights, word in ((after.nights - before.nights, "ajoutée"), (before.nights - after.nights, "retirée")):
        if nights:
            parts.append(f"{plural(len(nights), 'nuit', 'nuits')} {word}{plural(len(nights), '', 's')} : {days_label(nights)}")
    return " ; ".join(parts)


def record_presences(db: Session, stay: Stay, actor: Actor, before: dict[int, Presences], persons: list[Person]) -> None:
    """Une phrase pour tout l'enregistrement ; les personnes aux mêmes changements sont regroupées."""
    groups: dict[str, list[Person]] = {}
    for p in persons:
        changes = presence_changes(before[p.id], presences_of(db, p.id))
        if changes:
            groups.setdefault(changes, []).append(p)
    if not groups:
        return
    if len(groups) == 1:
        [(changes, people)] = groups.items()
        text = f"a modifié les présences {of(join(p.name for p in people))} — {changes}"
    else:
        text = "a modifié les présences du foyer — " + " · ".join(
            f"{join(p.name for p in people)} : {changes}" for changes, people in groups.items()
        )
    record(db, stay, actor, text, [p.id for people in groups.values() for p in people])


# --- Personnes ---------------------------------------------------------------


def person_lines(db: Session, p: Person) -> list[str]:
    """Tout ce qu'il faut pour recréer une personne à la main, avant sa suppression."""
    household = db.get(Household, p.household_id)
    kind = "enfant" if p.kind == "child" else "adulte"
    lines = [f"{p.name} ({kind}, foyer {quoted(household_label(db, household))})"]
    if p.partner_id is not None:
        lines.append(f"  En couple avec {db.get(Person, p.partner_id).name}")
    slots = {(x.date, x.meal) for x in db.scalars(select(Presence).where(Presence.person_id == p.id))}
    if slots:
        lines.append(f"  Repas : {slots_label(slots)}")
    nights = db.scalars(select(Night).where(Night.person_id == p.id).order_by(Night.date)).all()
    if nights:
        lines.append("  Nuits : " + ", ".join(f"{short_day(n.date)} ({bed_label(db, n.bed_id)})" for n in nights))
    activities = db.scalars(
        select(Activity).join(Signup, Signup.activity_id == Activity.id).where(Signup.person_id == p.id).order_by(Activity.date)
    ).all()
    if activities:
        lines.append("  Activités : " + ", ".join(activity_label(a) for a in activities))
    chores = db.execute(
        select(ChoreType.name, ChoreAssignment.date, ChoreAssignment.moment)
        .join(ChoreType, ChoreType.id == ChoreAssignment.chore_type_id)
        .where(ChoreAssignment.person_id == p.id)
        .order_by(ChoreAssignment.date)
    ).all()
    if chores:
        lines.append("  Corvées : " + ", ".join(f"{name} {moment_label(d, m)}" for name, d, m in chores))
    if p.diets or p.diet_note:
        diets = [DIET_LABELS[d] for d in p.diets.split(",") if d in DIET_LABELS]
        lines.append("  Régimes et allergies : " + ", ".join([*diets, *([quoted(p.diet_note)] if p.diet_note else [])]))
    return lines


def record_person_added(db: Session, stay: Stay, actor: Actor, p: Person, household: str | None) -> None:
    """`household` : libellé du foyer rejoint, pris avant l'ajout ; None pour un nouveau foyer."""
    child = " (enfant)" if p.kind == "child" else ""
    partner = f", en couple avec {db.get(Person, p.partner_id).name}" if p.partner_id is not None else ""
    if household is None and actor.id is None and not actor.organizer:
        # Quelqu'un qui s'ajoute depuis « qui êtes-vous ? » n'est encore personne sur l'appareil.
        record(db, stay, replace(actor, id=p.id, name=p.name), "a rejoint le séjour", [p.id])
    elif household is None:
        record(db, stay, actor, f"a ajouté {p.name}{child}, dans un nouveau foyer", [p.id])
    else:
        record(db, stay, actor, f"a ajouté {p.name}{child} au foyer {quoted(household)}{partner}", [p.id])
