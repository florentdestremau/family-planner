"""Calcul des créneaux (jour × repas) d'un séjour."""

from datetime import date, timedelta

MEALS = ["breakfast", "lunch", "dinner"]
MOMENTS = [*MEALS, "day"]
BED_PLACES = {"double": 2, "single": 1, "bunk": 2, "extra": 1}
MAX_STAY_DAYS = 60
MEAL_LABELS = {"breakfast": "petit-déjeuner", "lunch": "déjeuner", "dinner": "dîner"}
MOMENT_LABELS = {**MEAL_LABELS, "day": "journée"}
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


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


def short_day(d: date) -> str:
    """« ven. 30/10 »."""
    return f"{WEEKDAYS[d.weekday()][:3]}. {d.strftime('%d/%m')}"


def stay_nights(start: date, end: date) -> list[date]:
    """Nuits du séjour : la nuit du jour J va de J à J+1, il n'y en a pas le dernier jour."""
    return [start + timedelta(days=i) for i in range((end - start).days)]


def night_sides(night: date) -> tuple[tuple[date, str], tuple[date, str]]:
    """Repas qui encadrent une nuit : le dîner du soir et le petit-déjeuner du lendemain."""
    return (night, "dinner"), (night + timedelta(days=1), "breakfast")


def follow_meals(
    nights: list[date], old_meals: set[tuple[date, str]], new_meals: set[tuple[date, str]], old_nights: set[date]
) -> set[date]:
    """Nuits qui suivent les repas, sans ambiguïté.

    Seules les nuits dont un repas voisin a changé sont revues : dîner et petit-déjeuner du lendemain
    → la personne dort sur place ; ni l'un ni l'autre → elle n'y dort pas ; un seul des deux
    (arrivée après le dîner, départ avant le petit-déjeuner…) → la nuit reste comme elle était.
    """
    result = set(old_nights)
    for night in nights:
        sides = night_sides(night)
        if all((side in old_meals) == (side in new_meals) for side in sides):
            continue
        present = [side in new_meals for side in sides]
        if all(present):
            result.add(night)
        elif not any(present):
            result.discard(night)
    return result
