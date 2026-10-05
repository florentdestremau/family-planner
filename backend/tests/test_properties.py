"""Propriétés du tirage des corvées et de la répartition des lits, sur des familles aléatoires."""

from collections import Counter
from datetime import date

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.lottery import build_occurrences, draw
from app.rooms import auto_assign
from app.slots import BED_PLACES, MEALS, MOMENTS, stay_days, stay_slots

START = date(2026, 10, 30)


@st.composite
def scenario(draw_):
    days = draw_(st.integers(1, 5))
    end = date.fromordinal(START.toordinal() + days - 1)
    first = draw_(st.sampled_from(MEALS))
    last = draw_(st.sampled_from(MEALS if days > 1 else MEALS[MEALS.index(first):]))
    slots = stay_slots(START, end, first, last)
    n = draw_(st.integers(1, 12))
    people = list(range(1, n + 1))
    # Couples disjoints.
    shuffled = draw_(st.permutations(people))
    n_couples = draw_(st.integers(0, n // 2))
    partners = {}
    for i in range(n_couples):
        a, b = shuffled[2 * i], shuffled[2 * i + 1]
        partners[a], partners[b] = b, a
    chore_people = [p for p in people if draw_(st.booleans()) or p == 1]
    presences = {(p, d, m) for p in people for d, m in slots if draw_(st.floats(0, 1)) < 0.8}
    chores = [
        (i, draw_(st.lists(st.sampled_from(MOMENTS), min_size=1, max_size=4, unique=True)), draw_(st.integers(1, 3)), draw_(st.integers(1, 3)))
        for i in range(1, draw_(st.integers(1, 4)) + 1)
    ]
    return {
        "days": stay_days(START, end),
        "slots": set(slots),
        "chores": chores,
        "chore_people": chore_people,
        "presences": presences,
        "partners": partners,
        "separate": draw_(st.booleans()),
        "seed": draw_(st.integers(0, 10_000)),
    }


def occurrences_of(sc):
    return build_occurrences(sc["days"], sc["slots"], sc["chores"], sc["chore_people"], sc["presences"])


FAST = settings(max_examples=300, deadline=None, suppress_health_check=[HealthCheck.too_slow])


@FAST
@given(scenario())
def test_occurrences_match_presences(sc) -> None:
    present_days = {(p, d) for p, d, _ in sc["presences"]}
    for occ in occurrences_of(sc):
        assert occ.moment == "day" or (occ.date, occ.moment) in sc["slots"]
        day_index = sc["days"].index(occ.date)
        every = next(c[3] for c in sc["chores"] if c[0] == occ.chore_type_id)
        assert day_index % every == 0
        for p in occ.eligible:
            assert p in sc["chore_people"]
            if occ.moment == "day":
                assert (p, occ.date) in present_days
            else:
                assert (p, occ.date, occ.moment) in sc["presences"]
        # Personne de présent : pas d'occurrence.
        if occ.moment == "day":
            assert any(d == occ.date for _, d in present_days)
        else:
            assert any(d == occ.date and m == occ.moment for _, d, m in sc["presences"])


@FAST
@given(scenario())
def test_draw_invariants(sc) -> None:
    occs = occurrences_of(sc)
    result = draw(occs, sc["partners"], sc["separate"], trials=5, seed=sc["seed"])
    assert len(result.assignments) == len(occs)
    unfilled = 0
    for occ, chosen in zip(occs, result.assignments):
        assert len(chosen) == len(set(chosen)) <= occ.needed
        assert set(chosen) <= set(occ.eligible)
        if sc["separate"]:
            assert not any(sc["partners"].get(p) in chosen for p in chosen)
            # Glouton maximal : s'il manque du monde, aucun candidat compatible n'a été oublié.
            if len(chosen) < occ.needed:
                assert all(p in chosen or sc["partners"].get(p) in chosen for p in occ.eligible)
        else:
            assert len(chosen) == min(occ.needed, len(occ.eligible))
        unfilled += occ.needed - len(chosen)
    assert result.unfilled == unfilled
    assert result.counts == {p: n for p, n in Counter(p for c in result.assignments for p in c).items()}


@FAST
@given(scenario())
def test_draw_is_reproducible_with_a_seed(sc) -> None:
    occs = occurrences_of(sc)
    a = draw(occs, sc["partners"], sc["separate"], trials=3, seed=sc["seed"])
    b = draw(occs, sc["partners"], sc["separate"], trials=3, seed=sc["seed"])
    assert a.assignments == b.assignments


@settings(max_examples=100, deadline=None)
@given(st.integers(2, 14), st.integers(1, 6), st.integers(0, 10_000))
def test_full_presence_load_is_even(n, days, seed) -> None:
    """Tout le monde présent tout le temps, sans couple : écart d'au plus une corvée."""
    end = date.fromordinal(START.toordinal() + days - 1)
    slots = stay_slots(START, end, "breakfast", "dinner")
    people = list(range(1, n + 1))
    presences = {(p, d, m) for p in people for d, m in slots}
    chores = [(1, ["lunch", "dinner"], 2, 1), (2, ["breakfast", "dinner"], 1, 1), (3, ["day"], 2, 2)]
    occs = build_occurrences(stay_days(START, end), set(slots), chores, people, presences)
    result = draw(occs, {}, seed=seed)
    counts = [result.counts.get(p, 0) for p in people]
    assert max(counts) - min(counts) <= 1, counts


@st.composite
def lodging(draw_):
    n = draw_(st.integers(0, 14))
    people = []
    for i in range(1, n + 1):
        kind = draw_(st.sampled_from(["adult", "adult", "child"]))
        people.append({"id": i, "kind": kind, "partner_id": None, "household_id": draw_(st.integers(1, 4)), "bed_id": None})
    adults = [p for p in people if p["kind"] == "adult"]
    for a, b in zip(adults[::2], adults[1::2]):
        if draw_(st.booleans()):
            a["partner_id"], b["partner_id"] = b["id"], a["id"]
            b["household_id"] = a["household_id"]
    beds = [
        {"id": 100 + i, "room_id": draw_(st.integers(1, 3)), "kind": draw_(st.sampled_from(list(BED_PLACES)))}
        for i in range(draw_(st.integers(0, 8)))
    ]
    # Quelques personnes déjà couchées, sans dépasser les capacités.
    free = {b["id"]: BED_PLACES[b["kind"]] for b in beds}
    for p in people:
        if beds and draw_(st.floats(0, 1)) < 0.3:
            bid = draw_(st.sampled_from(beds))["id"]
            if free[bid] > 0:
                free[bid] -= 1
                p["bed_id"] = bid
    return people, beds


@settings(max_examples=400, deadline=None)
@given(lodging())
def test_auto_assign_invariants(case) -> None:
    people, beds = case
    result = auto_assign(people, beds)
    already = {p["id"]: p["bed_id"] for p in people if p["bed_id"] is not None}
    assert not set(result) & set(already), "une personne déjà couchée n'est jamais déplacée"
    occupancy = Counter(already.values()) + Counter(result.values())
    kinds = {b["id"]: b["kind"] for b in beds}
    assert all(occupancy[b] <= BED_PLACES[kinds[b]] for b in occupancy), "lit surchargé"
    free = sum(BED_PLACES[b["kind"]] for b in beds) - len(already)
    unassigned = len(people) - len(already)
    assert len(result) == min(unassigned, free), "toute place libre est utilisée"
