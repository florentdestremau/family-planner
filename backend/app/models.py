from datetime import date, datetime, timezone

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Stay(Base):
    __tablename__ = "stays"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    admin_key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    start_date: Mapped[date]
    end_date: Mapped[date]
    # Premier repas du premier jour / dernier repas du dernier jour.
    first_meal: Mapped[str] = mapped_column(String(16), default="dinner")
    last_meal: Mapped[str] = mapped_column(String(16), default="lunch")
    separate_couples: Mapped[bool] = mapped_column(default=True)
    cover_image: Mapped[str | None] = mapped_column(String(255), default=None)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class Household(Base):
    """Foyer : les personnes qui viennent ensemble ; tout adulte du foyer agit pour chacun."""

    __tablename__ = "households"

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), default="")  # vide : noms des adultes


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(16), default="adult")  # adult | child
    does_chores: Mapped[bool] = mapped_column(default=True)
    does_activities: Mapped[bool] = mapped_column(default=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE", name="fk_persons_household_id"), index=True
    )
    # Lien de couple entre deux adultes du même foyer (symétrique, maintenu des deux côtés).
    partner_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id", ondelete="SET NULL"))
    bed_id: Mapped[int | None] = mapped_column(ForeignKey("beds.id", ondelete="SET NULL"))


class Presence(Base):
    """Présence d'une personne sur place à un repas (présent = mange)."""

    __tablename__ = "presences"
    __table_args__ = (UniqueConstraint("person_id", "date", "meal"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), index=True)
    date: Mapped[date]
    meal: Mapped[str] = mapped_column(String(16))


class Menu(Base):
    __tablename__ = "menus"
    __table_args__ = (UniqueConstraint("stay_id", "date", "meal"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    date: Mapped[date]
    meal: Mapped[str] = mapped_column(String(16))
    dishes: Mapped[str] = mapped_column(Text, default="")  # un plat par ligne
    notes: Mapped[str] = mapped_column(Text, default="")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    notes: Mapped[str] = mapped_column(Text, default="")


class Bed(Base):
    __tablename__ = "beds"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # double | single | bunk | extra
    label: Mapped[str] = mapped_column(String(100), default="")


class ChoreType(Base):
    __tablename__ = "chore_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    # Moments séparés par des virgules : breakfast, lunch, dinner, day.
    moments: Mapped[str] = mapped_column(String(64), default="dinner")
    people_needed: Mapped[int] = mapped_column(default=1)
    every_n_days: Mapped[int] = mapped_column(default=1)


class ChoreAssignment(Base):
    __tablename__ = "chore_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    chore_type_id: Mapped[int] = mapped_column(ForeignKey("chore_types.id", ondelete="CASCADE"))
    date: Mapped[date]
    moment: Mapped[str] = mapped_column(String(16))
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    stay_id: Mapped[int] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    date: Mapped[date]
    start_time: Mapped[str] = mapped_column(String(5), default="")  # HH:MM
    end_time: Mapped[str] = mapped_column(String(5), default="")
    optional: Mapped[bool] = mapped_column(default=False)


class Signup(Base):
    __tablename__ = "signups"
    __table_args__ = (UniqueConstraint("activity_id", "person_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))
