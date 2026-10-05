"""Tirage au sort des corvées.

Contraintes :
- dure : les deux membres d'un couple ne sont jamais sur la même corvée
  (si ``separate_couples``) ;
- souple : charge homogène, proportionnelle au temps de présence ;
- souple : éviter deux corvées au même moment pour une même personne ;
- souple : varier les binômes.

On fait plusieurs tirages gloutons aléatoires et on garde le meilleur.
"""

import random
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date


@dataclass
class Occurrence:
    chore_type_id: int
    date: date
    moment: str
    needed: int
    eligible: list[int]


@dataclass
class DrawResult:
    assignments: list[list[int]]  # même index que les occurrences
    unfilled: int
    score: float
    counts: dict[int, int] = field(default_factory=dict)


def build_occurrences(
    days: list[date],
    slots: set[tuple[date, str]],
    chore_types: list[tuple[int, list[str], int, int]],  # (id, moments, needed, every_n_days)
    chore_people: list[int],
    presences: set[tuple[int, date, str]],
) -> list[Occurrence]:
    """Génère les occurrences de corvées et leurs candidats (présents et « participe aux corvées »)."""
    present_days = {(pid, d) for pid, d, _ in presences}
    occurrences = []
    for chore_id, moments, needed, every_n in chore_types:
        for day_idx, day in enumerate(days):
            if day_idx % max(every_n, 1):
                continue
            for moment in moments:
                if moment == "day":
                    eligible = [p for p in chore_people if (p, day) in present_days]
                    anyone_there = any(d == day for _, d in present_days)
                else:
                    if (day, moment) not in slots:
                        continue
                    eligible = [p for p in chore_people if (p, day, moment) in presences]
                    anyone_there = any(d == day and m == moment for _, d, m in presences)
                if not anyone_there:
                    continue
                occurrences.append(Occurrence(chore_id, day, moment, needed, eligible))
    return occurrences


def _single_draw(occurrences: list[Occurrence], partners: dict[int, int], separate_couples: bool, rng: random.Random) -> DrawResult:
    # Charge « attendue » de chacun : somme des parts des occurrences où il est éligible.
    expected: dict[int, float] = defaultdict(float)
    for occ in occurrences:
        if occ.eligible:
            share = min(occ.needed, len(occ.eligible)) / len(occ.eligible)
            for p in occ.eligible:
                expected[p] += share

    counts: dict[int, int] = defaultdict(int)
    busy: set[tuple[int, date, str]] = set()
    pairs: dict[frozenset[int], int] = defaultdict(int)

    order = list(range(len(occurrences)))
    rng.shuffle(order)
    order.sort(key=lambda i: occurrences[i].date)

    result: list[list[int]] = [[] for _ in occurrences]
    unfilled = 0
    doubles = 0
    for i in order:
        occ = occurrences[i]
        chosen: list[int] = []
        for _ in range(occ.needed):
            candidates = [
                p
                for p in occ.eligible
                if p not in chosen and not (separate_couples and partners.get(p) in chosen)
            ]
            if not candidates:
                unfilled += occ.needed - len(chosen)
                break
            best = min(
                candidates,
                key=lambda p: (
                    (p, occ.date, occ.moment) in busy,
                    round(counts[p] / max(expected[p], 0.01), 2),
                    sum(pairs[frozenset((p, c))] for c in chosen),
                    rng.random(),
                ),
            )
            chosen.append(best)
        for p in chosen:
            if (p, occ.date, occ.moment) in busy:
                doubles += 1
            busy.add((p, occ.date, occ.moment))
            counts[p] += 1
        for a in chosen:
            for b in chosen:
                if a < b:
                    pairs[frozenset((a, b))] += 1
        result[i] = chosen

    deviation = sum((counts[p] - expected[p]) ** 2 for p in expected)
    repeats = sum(n - 1 for n in pairs.values() if n > 1)
    score = unfilled * 1_000_000 + doubles * 1_000 + deviation * 10 + repeats
    return DrawResult(result, unfilled, score, {p: n for p, n in counts.items() if n})


def draw(
    occurrences: list[Occurrence],
    partners: dict[int, int],
    separate_couples: bool = True,
    trials: int = 150,
    seed: int | None = None,
) -> DrawResult:
    rng = random.Random(seed)
    best: DrawResult | None = None
    for _ in range(trials):
        candidate = _single_draw(occurrences, partners, separate_couples, rng)
        if best is None or candidate.score < best.score:
            best = candidate
    return best or DrawResult([], 0, 0.0)
