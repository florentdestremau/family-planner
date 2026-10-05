"""Proposition automatique de couchages pour les personnes non logées."""

from .slots import BED_PLACES


def auto_assign(
    people: list[dict],  # {id, kind, partner_id, guardian_id, bed_id}
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

    def bed_of(pid: int) -> int | None:
        return assigned.get(pid) or by_id[pid]["bed_id"]

    def take(pid: int, kinds: list[str], room_id: int | None = None, empty_only: bool = False) -> bool:
        for kind in kinds:
            for bid, places in free.items():
                bed = bed_by_id[bid]
                if bed["kind"] != kind or places <= 0:
                    continue
                if room_id is not None and bed["room_id"] != room_id:
                    continue
                if empty_only and places < BED_PLACES[kind]:
                    continue
                free[bid] -= 1
                assigned[pid] = bid
                return True
        return False

    # 1. Couples : un lit double ensemble.
    done: set[int] = set()
    for p in todo:
        partner = by_id.get(p["partner_id"]) if p["partner_id"] else None
        if p["kind"] != "adult" or not partner or partner["bed_id"] is not None or p["id"] in done:
            continue
        for bid, places in free.items():
            if bed_by_id[bid]["kind"] == "double" and places >= 2:
                free[bid] -= 2
                assigned[p["id"]] = assigned[partner["id"]] = bid
                done |= {p["id"], partner["id"]}
                break

    # 2. Enfants : de préférence dans la chambre de leur adulte référent.
    kid_kinds = ["bunk", "single", "extra", "double"]
    for p in todo:
        if p["id"] in done or p["kind"] != "child":
            continue
        room_id = None
        guardian = p["guardian_id"]
        if guardian and guardian in by_id and (gbed := bed_of(guardian)) in bed_by_id:
            room_id = bed_by_id[gbed]["room_id"]
        if (room_id is not None and take(p["id"], kid_kinds, room_id)) or take(p["id"], kid_kinds):
            done.add(p["id"])

    # 3. Adultes seuls : lits simples d'abord, double vide en dernier recours.
    for p in todo:
        if p["id"] in done or p["kind"] != "adult":
            continue
        if take(p["id"], ["single", "extra", "bunk"]) or take(p["id"], ["double"], empty_only=True) or take(p["id"], ["double"]):
            done.add(p["id"])
    return assigned
