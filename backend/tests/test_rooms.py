from app.rooms import auto_assign


def test_couple_in_double_and_child_near_household() -> None:
    people = [
        {"id": 1, "kind": "adult", "partner_id": 2, "household_id": 1, "bed_id": None},
        {"id": 2, "kind": "adult", "partner_id": 1, "household_id": 1, "bed_id": None},
        {"id": 3, "kind": "child", "partner_id": None, "household_id": 1, "bed_id": None},
        {"id": 4, "kind": "adult", "partner_id": None, "household_id": 2, "bed_id": None},
    ]
    beds = [
        {"id": 10, "room_id": 100, "kind": "single"},
        {"id": 11, "room_id": 101, "kind": "double"},
        {"id": 12, "room_id": 101, "kind": "extra"},
        {"id": 13, "room_id": 100, "kind": "bunk"},
    ]
    result = auto_assign(people, beds)
    assert result[1] == result[2] == 11
    assert result[3] == 12  # même chambre que son foyer
    assert result[4] == 10


def test_household_sleeps_in_the_same_room_when_possible() -> None:
    people = [
        {"id": 1, "kind": "adult", "partner_id": None, "household_id": 1, "bed_id": 10},
        {"id": 2, "kind": "adult", "partner_id": None, "household_id": 1, "bed_id": None},
        {"id": 3, "kind": "adult", "partner_id": None, "household_id": 2, "bed_id": None},
    ]
    beds = [
        {"id": 10, "room_id": 1, "kind": "single"},
        {"id": 20, "room_id": 2, "kind": "single"},
        {"id": 11, "room_id": 1, "kind": "single"},
    ]
    assert auto_assign(people, beds) == {2: 11, 3: 20}
