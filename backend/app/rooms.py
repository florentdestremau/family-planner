"""Proposition automatique de couchages pour les personnes non logées, nuit par nuit.

Couples dans un lit double, enfants puis adultes seuls ; chacun de préférence dans la chambre
où dort déjà quelqu'un de son foyer. D'une nuit à l'autre, chacun garde son lit s'il est libre.
"""

from datetime import date

from .slots import BED_PLACES


def auto_assign(
    people: list[dict],  # {id, kind, partner_id, household_id, bed_id}
    beds: list[dict],  # {id, room_id, kind}
) -> dict[int, int]:
    """Retourne {person_id: bed_id} pour les personnes sans lit."""
    free = {b["id"]: BED_PLACES[b["kind"]] for b in beds}
    bed_by_id = {b["id"]: b for b in beds}
    for p in people:
        if p["bed_id"] in free:
            free[p["bed_id"]] -= 1

    assigned: dict[int, int] = {}
    by_id = {p["id"]: p for p in people}
    todo = [p for p in people if p["bed_id"] is None]

    def household_room(p: dict) -> int | None:
        for other in people:
            if other["household_id"] == p["household_id"]:
                bed = assigned.get(other["id"]) or other["bed_id"]
                if bed in bed_by_id:
                    return bed_by_id[bed]["room_id"]
        return None

    def find(kinds: list[str], room_id: int | None, places: int = 1, empty_only: bool = False) -> int | None:
        for kind in kinds:
            for bid, left in free.items():
                bed = bed_by_id[bid]
                if bed["kind"] != kind or left < places:
                    continue
                if room_id is not None and bed["room_id"] != room_id:
                    continue
                if empty_only and left < BED_PLACES[kind]:
                    continue
                return bid
        return None

    def place(group: list[dict], kinds: list[str], empty_only: bool = False) -> bool:
        """Place le groupe dans un même lit : chambre du foyer d'abord, puis n'importe où."""
        room = household_room(group[0])
        bid = (room is not None and find(kinds, room, len(group), empty_only)) or find(kinds, None, len(group), empty_only)
        if not bid:
            return False
        for p in group:
            free[bid] -= 1
            assigned[p["id"]] = bid
        return True

    done: set[int] = set()
    # 1. Couples : un lit double ensemble.
    for p in todo:
        partner = by_id.get(p["partner_id"]) if p["partner_id"] else None
        if p["id"] in done or not partner or partner["bed_id"] is not None:
            continue
        if place([p, partner], ["double"]):
            done |= {p["id"], partner["id"]}

    # 2. Enfants.
    for p in todo:
        if p["id"] not in done and p["kind"] == "child" and place([p], ["bunk", "single", "extra", "double"]):
            done.add(p["id"])

    # 3. Adultes seuls : lits simples d'abord, double vide ensuite, double partagé en dernier recours.
    for p in todo:
        if p["id"] in done or p["kind"] != "adult":
            continue
        if place([p], ["single", "extra", "bunk"]) or place([p], ["double"], empty_only=True) or place([p], ["double"]):
            done.add(p["id"])
    return assigned


def auto_assign_nights(
    people: list[dict],  # {id, kind, partner_id, household_id}
    beds: list[dict],  # {id, room_id, kind}
    nights: list[dict],  # {person_id, date, bed_id}
) -> dict[tuple[int, date], int]:
    """Retourne {(person_id, nuit): bed_id} pour les nuits sans lit.

    Nuit après nuit : d'abord la continuité (le lit de la nuit précédente, ou à défaut le premier
    lit déjà attribué à la personne, s'il reste de la place), puis auto_assign pour les autres
    dormeurs de la nuit, avec l'occupation de cette nuit-là.
    """
    by_id = {p["id"]: p for p in people}
    places = {b["id"]: BED_PLACES[b["kind"]] for b in beds}
    by_night: dict[date, dict[int, int | None]] = {}
    for x in sorted(nights, key=lambda x: x["date"]):
        by_night.setdefault(x["date"], {})[x["person_id"]] = x["bed_id"]
    last: dict[int, int] = {}
    for night in sorted(by_night, reverse=True):  # à défaut de veille : premier lit connu
        last.update((pid, bed) for pid, bed in by_night[night].items() if bed is not None)

    result: dict[tuple[int, date], int] = {}
    for night in sorted(by_night):
        sleepers = by_night[night]
        free = dict(places)
        for bed in sleepers.values():
            if bed is not None:
                free[bed] -= 1
        for pid in sorted(sleepers):
            bed = last.get(pid)
            if sleepers[pid] is None and free.get(bed, 0) > 0:
                free[bed] -= 1
                sleepers[pid] = result[(pid, night)] = bed
        tonight = [{**by_id[pid], "bed_id": bed} for pid, bed in sleepers.items()]
        for pid, bed in auto_assign(tonight, beds).items():
            sleepers[pid] = result[(pid, night)] = bed
        last.update((pid, bed) for pid, bed in sleepers.items() if bed is not None)
    return result
