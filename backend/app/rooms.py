"""Proposition automatique de couchages pour les personnes non logées.

Couples dans un lit double, enfants puis adultes seuls ; chacun de préférence dans la chambre
où dort déjà quelqu'un de son foyer.
"""

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
