from datetime import date

from app.lottery import build_occurrences, draw
from app.slots import stay_days, stay_slots

START, END = date(2026, 10, 30), date(2026, 11, 2)
DAYS = stay_days(START, END)
SLOTS = set(stay_slots(START, END, "dinner", "lunch"))
PEOPLE = list(range(1, 11))
EVERYONE = {(p, d, m) for p in PEOPLE for d, m in SLOTS}
CHORES = [(1, ["lunch", "dinner"], 2, 1), (2, ["breakfast", "lunch", "dinner"], 2, 1), (3, ["day"], 2, 2)]


def test_slots_respect_first_and_last_meal() -> None:
    slots = stay_slots(START, END, "dinner", "lunch")
    assert slots[0] == (START, "dinner")
    assert slots[-1] == (END, "lunch")
    assert len(slots) == 1 + 3 * 2 + 2


def test_occurrences_only_for_present_people() -> None:
    presences = {(1, START, "dinner"), (2, START, "dinner")}
    occs = build_occurrences(DAYS, SLOTS, CHORES, PEOPLE, presences)
    # Seul le dîner du premier jour a des présents : cuisine, vaisselle, ménage.
    assert {(o.chore_type_id, o.date, o.moment) for o in occs} == {(1, START, "dinner"), (2, START, "dinner"), (3, START, "day")}
    assert all(set(o.eligible) == {1, 2} for o in occs)


def test_couples_never_together_and_load_is_even() -> None:
    partners = {1: 2, 2: 1, 3: 4, 4: 3, 5: 6, 6: 5}
    occs = build_occurrences(DAYS, SLOTS, CHORES, PEOPLE, EVERYONE)
    result = draw(occs, partners, separate_couples=True, seed=42)
    assert result.unfilled == 0
    for chosen in result.assignments:
        assert len(chosen) == len(set(chosen)) == 2
        for p in chosen:
            assert partners.get(p) not in chosen
    counts = [result.counts.get(p, 0) for p in PEOPLE]
    assert max(counts) - min(counts) <= 1


def test_couple_constraint_can_leave_slot_unfilled() -> None:
    occs = build_occurrences(DAYS, SLOTS, [(1, ["dinner"], 2, 1)], [1, 2], {(1, START, "dinner"), (2, START, "dinner")})
    assert draw(occs, {1: 2, 2: 1}, separate_couples=True, seed=1).unfilled == 1
    assert draw(occs, {1: 2, 2: 1}, separate_couples=False, seed=1).unfilled == 0


def test_partial_presence_gets_proportional_load() -> None:
    first_day = {(11, START, "dinner")}
    occs = build_occurrences(DAYS, SLOTS, CHORES, [*PEOPLE, 11], EVERYONE | first_day)
    result = draw(occs, {}, seed=3)
    assert result.counts.get(11, 0) <= 2
