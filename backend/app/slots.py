"""Calcul des créneaux (jour × repas) d'un séjour."""

from datetime import date, timedelta

MEALS = ["breakfast", "lunch", "dinner"]
MOMENTS = [*MEALS, "day"]
BED_PLACES = {"double": 2, "single": 1, "bunk": 2, "extra": 1}
MAX_STAY_DAYS = 60


def stay_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def stay_slots(start: date, end: date, first_meal: str, last_meal: str) -> list[tuple[date, str]]:
    first_idx, last_idx = MEALS.index(first_meal), MEALS.index(last_meal)
    slots = []
    for day in stay_days(start, end):
        for idx, meal in enumerate(MEALS):
            if day == start and idx < first_idx:
                continue
            if day == end and idx > last_idx:
                continue
            slots.append((day, meal))
    return slots
