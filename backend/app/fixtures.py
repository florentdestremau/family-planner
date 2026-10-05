"""Jeux de données : chargés au démarrage des environnements de PR (FIXTURES=true) ou à la main.

    uv run python -m app.fixtures            # charge les séjours absents
    uv run python -m app.fixtures --reset    # les supprime puis les recharge

Chaque séjour a un slug fixe et la clé organisateur « demo » ; en production, en choisir une
autre avec DEMO_ADMIN_KEY (la clé « demo » est publique).
"""

import argparse
import os
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas as s
from .db import SessionLocal
from .models import Stay
from .routers import admin, public
from .slots import stay_slots


Meal = tuple[int, str]  # (jour du séjour, à partir de 0 ; repas)


@dataclass
class Family:
    """Un foyer. Les deux premiers adultes forment un couple, sauf couple=False.

    Présences : du repas `arrive` au repas `leave` inclus (par défaut tout le séjour) ; `members`
    décale une personne (arrivée, départ) ; `away` retire des repas (dîner au restaurant…).
    """

    adults: list[str]
    children: list[str] = field(default_factory=list)
    couple: bool = True
    arrive: Meal | None = None
    leave: Meal | None = None
    members: dict[str, tuple[Meal | None, Meal | None]] = field(default_factory=dict)
    away: dict[str, list[Meal]] = field(default_factory=dict)
    teens: list[str] = field(default_factory=list)  # enfants qui participent aux corvées
    no_chores: list[str] = field(default_factory=list)


@dataclass
class Fixture:
    slug: str
    name: str
    start_in_days: int  # à partir d'aujourd'hui
    days: int
    first_meal: str
    last_meal: str
    families: list[Family]
    rooms: list[tuple[str, list[str]]]
    activities: list[dict]  # day (index), name, start_time…, optional, signups
    menus: list[tuple[int, str, str, str]]  # (jour, repas, plats, notes)


def _next_weekday(weekday: int) -> int:
    today = date.today().weekday()
    return (weekday - today) % 7 or 7


FIXTURES = [
    Fixture(
        slug="demo",
        name="Grand week-end chez Mamie",
        start_in_days=_next_weekday(3),  # jeudi soir → dimanche soir
        days=4,
        first_meal="dinner",
        last_meal="dinner",
        families=[
            # Florent et Claire dînent au restaurant samedi soir ; les enfants restent.
            Family(["Florent", "Claire"], ["Léo", "Emma"], leave=(3, "lunch"), away={"Florent": [(2, "dinner")], "Claire": [(2, "dinner")]}),
            # Mamie reçoit : son foyer est là tout le temps, sauf Julien (arrive vendredi soir, il
            # travaille) et Zoé (match de hand samedi matin).
            Family(
                ["Julien", "Sophie", "Mamie"],
                ["Hugo", "Zoé (15 ans)"],
                teens=["Zoé (15 ans)"],
                no_chores=["Mamie"],
                members={"Julien": ((1, "dinner"), None), "Zoé (15 ans)": ((2, "lunch"), None)},
            ),
            Family(["Marc", "Anne"], ["Lina"], arrive=(1, "lunch"), leave=(2, "breakfast")),  # aller-retour
            Family(["Thomas"], arrive=(2, "lunch"), leave=(3, "breakfast")),
            Family(["Camille"], arrive=(2, "dinner"), leave=(3, "breakfast")),  # célibataire, pour la soirée
        ],
        rooms=[
            ("Chambre de Mamie", ["single"]),
            ("Chambre bleue", ["double", "extra"]),
            ("Chambre verte", ["double", "single"]),
            ("Grenier", ["bunk", "bunk"]),
            ("Salon", ["double", "extra"]),
        ],
        activities=[
            dict(day=0, name="Apéro d'arrivée", start_time="19:30", location="Terrasse"),
            dict(day=1, name="Marché du village", start_time="09:30", end_time="11:30", optional=True,
                 signups=["Mamie", "Sophie", "Emma"]),
            dict(day=1, name="Construction de cabanes", start_time="15:00", end_time="17:30", location="Bois derrière la maison",
                 description="Prévoir des vêtements qui ne craignent rien"),
            dict(day=1, name="Loup-garou", start_time="21:00", optional=True, signups=["Florent", "Claire", "Hugo", "Léo", "Marc"]),
            dict(day=2, name="Rando au lac", start_time="09:30", end_time="13:00", location="Lac", optional=True,
                 signups=["Florent", "Léo", "Julien", "Hugo", "Thomas"]),
            dict(day=2, name="Grand jeu dans le jardin", start_time="15:30"),
            dict(day=3, name="Balade au village", start_time="10:30", optional=True, signups=["Mamie", "Julien", "Emma"]),
            dict(day=3, name="Photo de famille", start_time="14:30", location="Devant la maison"),
        ],
        menus=[
            (0, "dinner", "Soupe de potiron\nQuiche lorraine\nSalade verte", ""),
            (1, "lunch", "Taboulé\nPoulet froid", ""),
            (1, "dinner", "Raclette\nCharcuterie\nSalade", "Sans gluten pour Anne"),
            (2, "lunch", "Pique-nique de la rando : sandwiches, fruits", "Les autres : restes de raclette"),
            (2, "dinner", "Pâtes bolognaise\nCompote", "Soirée des enfants"),
            (3, "lunch", "Gigot\nFlageolets\nTarte aux pommes", ""),
        ],
    ),
    Fixture(
        slug="ete",
        name="Semaine des cousins à la mer",
        start_in_days=_next_weekday(5) + 14,  # un samedi dans trois semaines
        days=8,
        first_meal="dinner",
        last_meal="lunch",
        families=[
            # Montée en charge : grands-parents et Florent d'abord, pic en milieu de semaine, départs étalés.
            Family(["Florent", "Claire"], ["Léo", "Emma"], leave=(6, "lunch")),
            Family(["Julien", "Sophie"], ["Hugo", "Zoé"], teens=["Zoé"], arrive=(1, "dinner"), leave=(5, "breakfast")),
            # Jules part en colonie avant le reste de sa famille.
            Family(
                ["Marc", "Anne"],
                ["Lina", "Noé", "Jules (16 ans)"],
                teens=["Jules (16 ans)"],
                arrive=(1, "lunch"),
                leave=(4, "breakfast"),
                members={"Jules (16 ans)": (None, (2, "lunch"))},
            ),
            # Paul et Léa se sont inscrits chacun de leur côté : deux foyers à fusionner.
            Family(["Paul"], arrive=(2, "dinner")),
            Family(["Léa"], ["Rose"], arrive=(3, "lunch")),
            # Les grands-parents déjeunent chez des amis mercredi.
            Family(["Bertrand", "Odile"], no_chores=["Bertrand", "Odile"], away={"Bertrand": [(4, "lunch")], "Odile": [(4, "lunch")]}),
            Family(["Camille"], arrive=(1, "lunch"), leave=(2, "breakfast")),  # célibataire, une nuit
            Family(["Sarah"], ["Tom", "Jade"], arrive=(2, "lunch"), leave=(5, "lunch")),  # parent seul
            # Nicolas arrive le soir, Inès le lendemain midi.
            Family(["Nicolas", "Inès"], ["Adam", "Louise"], arrive=(3, "dinner"), members={"Inès": ((4, "lunch"), None)}),
        ],
        rooms=[
            ("Chambre des grands-parents", ["double"]),
            ("Chambre océan", ["double", "extra"]),
            ("Chambre dunes", ["double", "single"]),
            ("Chambre phare", ["double", "extra"]),
            ("Dortoir des cousins", ["bunk", "bunk", "bunk", "bunk", "single"]),
            ("Mezzanine", ["double", "single", "extra"]),
            ("Chambre des pins", ["double", "bunk"]),
        ],
        activities=[
            dict(day=1, name="Plage & châteaux de sable", start_time="10:00", location="Plage du centre"),
            dict(day=2, name="Sortie en kayak", start_time="14:00", end_time="17:00", optional=True,
                 signups=["Florent", "Julien", "Zoé", "Jules (16 ans)", "Hugo"]),
            dict(day=3, name="Marché du village", start_time="09:00", optional=True, signups=["Odile", "Claire", "Emma"]),
            dict(day=4, name="Tournoi de pétanque", start_time="17:00"),
            dict(day=5, name="Phare et pique-nique", start_time="11:00", location="Pointe du phare",
                 description="Prévoir chaussures de marche et gourdes"),
            dict(day=6, name="Spectacle des enfants", start_time="18:00"),
        ],
        menus=[
            (0, "dinner", "Pizzas maison\nSalade", ""),
            (1, "lunch", "Taboulé\nBrochettes\nPastèque", ""),
            (1, "dinner", "Moules-frites", "Allergie fruits de mer : Rose → jambon-frites"),
            (2, "lunch", "Pique-nique : sandwiches, chips, fruits", ""),
            (3, "dinner", "Barbecue\nSalade de pommes de terre\nGlaces", ""),
            (5, "dinner", "Paella", ""),
        ],
    ),
]


def load(db: Session, fx: Fixture) -> Stay:
    start = date.today() + timedelta(days=fx.start_in_days)
    end = start + timedelta(days=fx.days - 1)
    body = s.StayCreate(name=fx.name, start_date=start, end_date=end, first_meal=fx.first_meal, last_meal=fx.last_meal)
    stay = public.create_stay(body, db)
    stay.slug = fx.slug
    stay.admin_key = os.environ.get("DEMO_ADMIN_KEY", "demo")
    db.commit()

    slots = stay_slots(start, end, fx.first_meal, fx.last_meal)
    ids: dict[str, int] = {}
    for fam in fx.families:
        household_id = None
        for i, name in enumerate(fam.adults):
            partner = ids[fam.adults[0]] if i == 1 and fam.couple else None
            body = s.PersonCreate(name=name, household_id=household_id, partner_id=partner, does_chores=name not in fam.no_chores)
            created = admin.create_person(body, stay, db)
            ids[name], household_id = created.id, created.household_id
        for name in fam.children:
            body = s.PersonCreate(name=name, kind="child", household_id=household_id, does_chores=name in fam.teens)
            ids[name] = admin.create_person(body, stay, db).id
        index = {(d, m): i for i, (d, m) in enumerate(slots)}

        def position(meal: Meal | None, default: int) -> int:
            return default if meal is None else index[(start + timedelta(days=meal[0]), meal[1])]

        for name in [*fam.adults, *fam.children]:
            arrive, leave = fam.members.get(name, (None, None))
            first = position(arrive or fam.arrive, 0)
            last = position(leave or fam.leave, len(slots) - 1)
            away = {(start + timedelta(days=day), meal) for day, meal in fam.away.get(name, [])}
            present = [s.SlotIn(date=d, meal=m) for d, m in slots[first : last + 1] if (d, m) not in away]
            public.set_presences(ids[name], s.PresencesIn(slots=present), stay, db)

    for room_name, beds in fx.rooms:
        room = admin.create_room(s.RoomIn(name=room_name), stay, db)
        for kind in beds:
            admin.create_bed(room.id, s.BedIn(kind=kind), stay, db)
    admin.rooms_auto_assign(stay, db)
    admin.draw_chores(stay, db)

    for a in fx.activities:
        a = dict(a)
        signups = a.pop("signups", [])
        a["date"] = start + timedelta(days=a.pop("day"))
        activity = admin.create_activity(s.ActivityIn(**a), stay, db)
        for name in signups:
            public.sign_up(activity.id, ids[name], stay, db)
    for day, meal, dishes, notes in fx.menus:
        admin.set_menu(s.MenuIn(date=start + timedelta(days=day), meal=meal, dishes=dishes, notes=notes), stay, db)
    return stay


def load_all(reset: bool = False) -> list[str]:
    loaded = []
    with SessionLocal() as db:
        for fx in FIXTURES:
            existing = db.scalar(select(Stay).where(Stay.slug == fx.slug))
            if existing is not None and reset:
                db.delete(existing)
                db.commit()
                existing = None
            if existing is None:
                load(db, fx)
                loaded.append(fx.slug)
    return loaded


if __name__ == "__main__":
    from .migrate import migrate

    parser = argparse.ArgumentParser(description="Charge les séjours de démonstration.")
    parser.add_argument("--reset", action="store_true", help="supprime et recharge les séjours de démo")
    args = parser.parse_args()
    migrate()
    loaded = load_all(reset=args.reset)
    key = os.environ.get("DEMO_ADMIN_KEY", "demo")
    for fx in FIXTURES:
        status = "chargé" if fx.slug in loaded else "déjà présent"
        print(f"{fx.name} ({status}) : /s/{fx.slug}  —  organisateur : /s/{fx.slug}/admin?key={key}")
