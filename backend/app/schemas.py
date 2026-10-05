from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Meal = Literal["breakfast", "lunch", "dinner"]
Moment = Literal["breakfast", "lunch", "dinner", "day"]
PersonKind = Literal["adult", "child"]
BedKind = Literal["double", "single", "bunk", "extra"]
Time = Field(default="", pattern=r"^(\d{2}:\d{2})?$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Entrées -----------------------------------------------------------------


class StayCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    first_meal: Meal = "dinner"
    last_meal: Meal = "lunch"


class StayUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    first_meal: Meal | None = None
    last_meal: Meal | None = None
    separate_couples: bool | None = None


class PersonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: PersonKind = "adult"
    guardian_id: int | None = None
    does_chores: bool | None = None  # défaut : oui pour un adulte, non pour un enfant
    does_activities: bool = True


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: PersonKind | None = None
    guardian_id: int | None = None
    does_chores: bool | None = None
    does_activities: bool | None = None


class PartnerIn(BaseModel):
    partner_id: int | None


class BedAssignIn(BaseModel):
    bed_id: int | None


class SlotIn(BaseModel):
    date: date
    meal: Meal


class PresencesIn(BaseModel):
    slots: list[SlotIn]


class RoomIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    notes: str = ""


class BedIn(BaseModel):
    kind: BedKind
    label: str = ""


class ChoreTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    moments: list[Moment] = Field(min_length=1)
    people_needed: int = Field(default=1, ge=1, le=20)
    every_n_days: int = Field(default=1, ge=1, le=30)


class OccurrenceIn(BaseModel):
    chore_type_id: int
    date: date
    moment: Moment
    person_ids: list[int]


class ActivityIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    location: str = ""
    date: date
    start_time: str = Time
    end_time: str = Time
    optional: bool = False


class MenuIn(BaseModel):
    date: date
    meal: Meal
    dishes: str = ""
    notes: str = ""


# --- Sorties -----------------------------------------------------------------


class StayOut(ORM):
    slug: str
    name: str
    start_date: date
    end_date: date
    first_meal: Meal
    last_meal: Meal
    separate_couples: bool


class StayCreated(StayOut):
    admin_key: str


class PersonOut(ORM):
    id: int
    name: str
    kind: PersonKind
    does_chores: bool
    does_activities: bool
    guardian_id: int | None
    partner_id: int | None
    bed_id: int | None


class PresenceOut(ORM):
    person_id: int
    date: date
    meal: Meal


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
    optional: bool


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
    persons: list[PersonOut]
    presences: list[PresenceOut]
    rooms: list[RoomOut]
    chore_types: list[ChoreTypeOut]
    chore_assignments: list[ChoreAssignmentOut]
    activities: list[ActivityOut]
    signups: list[SignupOut]
    menus: list[MenuOut]


class DrawOut(BaseModel):
    occurrences: int
    assigned: int
    unfilled: int
