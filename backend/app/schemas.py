from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Meal = Literal["breakfast", "lunch", "dinner"]
Moment = Literal["breakfast", "lunch", "dinner", "day"]
PersonKind = Literal["adult", "child"]
BedKind = Literal["double", "single", "bunk", "extra"]
Time = Field(default="", pattern=r"^(([01]\d|2[0-3]):[0-5]\d)?$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class In(BaseModel):
    """Entrées : espaces de début et de fin retirés avant validation (un nom « » est refusé)."""

    model_config = ConfigDict(str_strip_whitespace=True)


# --- Entrées -----------------------------------------------------------------


class StayCreate(In):
    name: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    first_meal: Meal = "dinner"
    last_meal: Meal = "lunch"


class StayUpdate(In):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    first_meal: Meal | None = None
    last_meal: Meal | None = None
    separate_couples: bool | None = None


class PersonCreate(In):
    name: str = Field(min_length=1, max_length=100)
    kind: PersonKind = "adult"
    household_id: int | None = None  # absent : la personne forme son propre foyer
    partner_id: int | None = None  # en couple avec un adulte du même foyer
    does_chores: bool | None = None  # défaut : oui pour un adulte, non pour un enfant


class PersonUpdate(In):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: PersonKind | None = None
    does_chores: bool | None = None


class HouseholdIn(In):
    name: str = Field(default="", max_length=100)


class MoveIn(In):
    household_id: int | None  # absent : nouveau foyer


class MergeIn(In):
    into_id: int


class MemberPresences(In):
    person_id: int
    slots: list["SlotIn"]
    nights: list[date] | None = None  # absent : déduites du changement de repas


class HouseholdPresencesIn(In):
    members: list[MemberPresences] = Field(min_length=1)


class PartnerIn(In):
    partner_id: int | None


class BedAssignIn(In):
    bed_id: int | None
    dates: list[date] | None = None  # nuits concernées ; absent : toutes celles de la personne


class SlotIn(In):
    date: date
    meal: Meal


class PresencesIn(In):
    slots: list[SlotIn]
    nights: list[date] | None = None  # absent : déduites du changement de repas


class RoomIn(In):
    name: str = Field(min_length=1, max_length=100)
    notes: str = ""


class BedIn(In):
    kind: BedKind
    label: str = ""


class ChoreTypeIn(In):
    name: str = Field(min_length=1, max_length=100)
    moments: list[Moment] = Field(min_length=1)
    people_needed: int = Field(default=1, ge=1, le=20)
    every_n_days: int = Field(default=1, ge=1, le=30)


class OccurrenceIn(In):
    chore_type_id: int
    date: date
    moment: Moment
    person_ids: list[int]


class ActivityIn(In):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    location: str = ""
    date: date
    start_time: str = Time
    end_time: str = Time

    @model_validator(mode="after")
    def _end_after_start(self) -> "ActivityIn":
        if self.start_time and self.end_time and self.end_time < self.start_time:
            raise ValueError("L'heure de fin doit suivre l'heure de début")
        return self


class ActivityCreate(ActivityIn):
    invite_all: bool = False  # inscrire d'emblée les personnes présentes ce jour-là


class MenuIn(In):
    date: date
    meal: Meal
    dishes: str = ""
    notes: str = ""


class AssistantIn(In):
    person_id: int
    message: str = Field(min_length=1, max_length=1000)
    history: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("history")
    @classmethod
    def _history(cls, v: list[str]) -> list[str]:
        if any(len(turn) > 2000 for turn in v):
            raise ValueError("Chaque message de l'historique est limité à 2000 caractères")
        if len(v) % 2:
            raise ValueError("L'historique alterne message utilisateur et réponse de l'assistant (longueur paire)")
        return v


# --- Sorties -----------------------------------------------------------------


class StayOut(ORM):
    slug: str
    name: str
    start_date: date
    end_date: date
    first_meal: Meal
    last_meal: Meal
    separate_couples: bool
    cover_version: int | None


class StaySummary(BaseModel):
    slug: str
    name: str
    start_date: date
    end_date: date
    cover_version: int | None
    households: int
    persons: int


class StayCreated(StayOut):
    admin_key: str


class HouseholdOut(ORM):
    id: int
    name: str


class PersonOut(ORM):
    id: int
    name: str
    kind: PersonKind
    does_chores: bool
    household_id: int
    partner_id: int | None


class PresenceOut(ORM):
    person_id: int
    date: date
    meal: Meal


class NightOut(ORM):
    person_id: int
    date: date
    bed_id: int | None


class BedAssignOut(BaseModel):
    warning: str | None = None


class AutoAssignOut(BaseModel):
    assigned: int  # nuitées attribuées
    unassigned: int  # nuitées encore sans lit
    undeclared: int  # personnes sans aucune nuit déclarée, donc pas couchées


class BedOut(ORM):
    id: int
    room_id: int
    kind: BedKind
    label: str


class RoomOut(ORM):
    id: int
    name: str
    notes: str
    beds: list[BedOut] = []


class ChoreTypeOut(ORM):
    id: int
    name: str
    moments: list[Moment]
    people_needed: int
    every_n_days: int

    @field_validator("moments", mode="before")
    @classmethod
    def _split(cls, v: str | list[str]) -> list[str]:
        return v.split(",") if isinstance(v, str) else v


class ChoreAssignmentOut(ORM):
    chore_type_id: int
    date: date
    moment: Moment
    person_id: int


class ActivityOut(ORM):
    id: int
    name: str
    description: str
    location: str
    date: date
    start_time: str
    end_time: str


class SignupOut(ORM):
    activity_id: int
    person_id: int


class MenuOut(ORM):
    date: date
    meal: Meal
    dishes: str
    notes: str


class SlotOut(BaseModel):
    date: date
    meal: Meal


class Snapshot(BaseModel):
    stay: StayOut
    days: list[date]
    slots: list[SlotOut]
    nights: list[date]  # nuits du séjour (nuit du jour J)
    households: list[HouseholdOut]
    persons: list[PersonOut]
    presences: list[PresenceOut]
    person_nights: list[NightOut]
    rooms: list[RoomOut]
    chore_types: list[ChoreTypeOut]
    chore_assignments: list[ChoreAssignmentOut]
    activities: list[ActivityOut]
    signups: list[SignupOut]
    menus: list[MenuOut]


class InvitedOut(BaseModel):
    added: int


class DrawOut(BaseModel):
    occurrences: int
    assigned: int
    unfilled: int


class AssistantStatus(BaseModel):
    enabled: bool


class AssistantAction(BaseModel):
    """Proposition de présences pour une personne du foyer (à valider ou ignorer)."""

    person_id: int
    name: str
    slots: list[SlotIn]
    nights: list[date]  # nuits qui en résultent, pour l'affichage
    # Nuits données par Claude ; sinon le front ne les renvoie pas, et le serveur les déduit des
    # repas au moment de la validation (pas d'une liste périmée).
    nights_explicit: bool


class AssistantOut(BaseModel):
    text: str
    actions: list[AssistantAction]
