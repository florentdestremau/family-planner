"""Jeux de données : chargés au démarrage des environnements de PR (FIXTURES=true) ou à la main.

    uv run python -m app.fixtures            # charge les séjours absents
    uv run python -m app.fixtures --reset    # les supprime puis les recharge

Chaque séjour a un slug fixe et la clé organisateur « demo » (DEMO_ADMIN_KEY pour la changer) :
/s/demo/admin?key=demo, /s/ete/admin?key=demo.
"""

import argparse
import os
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas as s
from .db import SessionLocal
from .models import Base, Stay
from .routers import admin, public
from .slots import stay_slots


@dataclass
class Family:
    adults: list[str]  # deux adultes = un couple
    children: list[str] = field(default_factory=list)
    arrive: int = 0  # décalage en jours par rapport au début du séjour
    leave: int = 0  # jours avant la fin du séjour
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
        name="Week-end chez Mamie",
        start_in_days=_next_weekday(4),  # vendredi prochain
        days=4,
        first_meal="dinner",
        last_meal="lunch",
        families=[
            Family(["Florent", "Claire"], ["Léo", "Emma"]),
            Family(["Julien", "Sophie"], ["Hugo", "Zoé (15 ans)"], teens=["Zoé (15 ans)"]),
            Family(["Marc", "Anne"], ["Lina"], leave=1),
            Family(["Mamie"], no_chores=["Mamie"]),
            Family(["Thomas"], arrive=1),
        ],
        rooms=[
            ("Chambre bleue", ["double", "extra"]),
            ("Chambre verte", ["double", "single"]),
            ("Grenier", ["bunk", "bunk"]),
            ("Salon", ["double", "extra"]),
        ],
        activities=[
            dict(day=1, name="Rando au lac", start_time="10:00", end_time="13:00", location="Lac", optional=True,
                 signups=["Florent", "Léo", "Julien", "Hugo"]),
            dict(day=1, name="Grand jeu dans le jardin", start_time="15:30"),
            dict(day=2, name="Soirée crêpes & jeux", start_time="20:30"),
        ],
        menus=[
            (0, "dinner", "Soupe de potiron\nQuiche lorraine\nSalade verte", ""),
            (1, "lunch", "Raclette\nCharcuterie\nSalade", "Sans gluten pour Anne"),
            (1, "dinner", "Poulet rôti\nGratin dauphinois\nTarte aux pommes", ""),
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
            Family(["Florent", "Claire"], ["Léo", "Emma"]),
            Family(["Julien", "Sophie"], ["Hugo", "Zoé"], teens=["Zoé"]),
            Family(["Marc", "Anne"], ["Lina", "Noé", "Jules (16 ans)"], teens=["Jules (16 ans)"], leave=3),
            Family(["Paul", "Léa"], ["Rose"], arrive=2),
            Family(["Bertrand", "Odile"], no_chores=["Bertrand", "Odile"]),
            Family(["Camille"], arrive=1, leave=2),
            Family(["Nicolas", "Inès"], ["Adam", "Louise"], arrive=3),
        ],
        rooms=[
            ("Chambre des grands-parents", ["double"]),
            ("Chambre océan", ["double", "extra"]),
            ("Chambre dunes", ["double", "single"]),
            ("Chambre phare", ["double", "extra"]),
            ("Dortoir des cousins", ["bunk", "bunk", "bunk", "bunk", "single"]),
            ("Mezzanine", ["double", "single", "extra"]),
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
        members = []
        for name in fam.adults:
            ids[name] = admin.create_person(s.PersonCreate(name=name, does_chores=name not in fam.no_chores), stay, db).id
            members.append(ids[name])
        if len(fam.adults) == 2:
            admin.set_partner(ids[fam.adults[0]], s.PartnerIn(partner_id=ids[fam.adults[1]]), stay, db)
        for name in fam.children:
            body = s.PersonCreate(name=name, kind="child", guardian_id=ids[fam.adults[0]], does_chores=name in fam.teens)
            ids[name] = admin.create_person(body, stay, db).id
            members.append(ids[name])
        first, last = start + timedelta(days=fam.arrive), end - timedelta(days=fam.leave)
        present = [s.SlotIn(date=d, meal=m) for d, m in slots if first <= d <= last]
        for pid in members:
            public.set_presences(pid, s.PresencesIn(slots=present), stay, db)

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
    from .db import engine

    parser = argparse.ArgumentParser(description="Charge les séjours de démonstration.")
    parser.add_argument("--reset", action="store_true", help="supprime et recharge les séjours de démo")
    args = parser.parse_args()
    Base.metadata.create_all(engine)
    loaded = load_all(reset=args.reset)
    for fx in FIXTURES:
        status = "chargé" if fx.slug in loaded else "déjà présent"
        print(f"{fx.name} ({status}) : /s/{fx.slug}  —  organisateur : /s/{fx.slug}/admin?key=demo")
