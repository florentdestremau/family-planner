from app.rooms import auto_assign


def test_couple_in_double_and_child_near_guardian() -> None:
    people = [
        {"id": 1, "kind": "adult", "partner_id": 2, "guardian_id": None, "bed_id": None},
        {"id": 2, "kind": "adult", "partner_id": 1, "guardian_id": None, "bed_id": None},
        {"id": 3, "kind": "child", "partner_id": None, "guardian_id": 1, "bed_id": None},
        {"id": 4, "kind": "adult", "partner_id": None, "guardian_id": None, "bed_id": None},
    ]
    beds = [
        {"id": 10, "room_id": 100, "kind": "single"},
        {"id": 11, "room_id": 101, "kind": "double"},
        {"id": 12, "room_id": 101, "kind": "extra"},
        {"id": 13, "room_id": 100, "kind": "bunk"},
    ]
    result = auto_assign(people, beds)
    assert result[1] == result[2] == 11
    assert result[3] == 12  # même chambre que son référent
    assert result[4] == 10
