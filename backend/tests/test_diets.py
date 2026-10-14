"""Régimes et allergies : liste fermée plus précision libre, saisis depuis l'espace participant."""

import pytest


def diet_of(api, person_id: int) -> tuple[list[str], str]:
    p = api.persons()[person_id]
    return p["diets"], p["diet_note"]


def test_a_new_person_has_no_constraint(api) -> None:
    assert diet_of(api, api.person("Alice")) == ([], "")


def test_an_adult_declares_for_a_child_of_the_household(api) -> None:
    alice = api.person("Alice")
    leo = api.person("Léo", "child", alice)
    body = {"diets": ["seafood_allergy", "gluten_free"], "diet_note": "  Allergie grave :\n  stylo d'adrénaline  "}
    out = api.pub("PUT", f"/persons/{leo}/diet", body, status=200).json()
    # Ordre d'affichage, précision sur une ligne, espaces superflus retirés.
    assert out["diets"] == ["gluten_free", "seafood_allergy"]
    assert out["diet_note"] == "Allergie grave : stylo d'adrénaline"
    assert diet_of(api, leo) == (out["diets"], out["diet_note"])
    assert diet_of(api, alice) == ([], "")


def test_declaration_is_replaced_as_a_whole(api) -> None:
    alice = api.person("Alice")
    api.pub("PUT", f"/persons/{alice}/diet", {"diets": ["vegan", "lactose_free"], "diet_note": "Pas de miel"}, status=200)
    api.pub("PUT", f"/persons/{alice}/diet", {"diets": ["vegetarian"]}, status=200)
    assert diet_of(api, alice) == (["vegetarian"], "")
    api.pub("PUT", f"/persons/{alice}/diet", {}, status=200)
    assert diet_of(api, alice) == ([], "")


def test_duplicates_are_merged(api) -> None:
    alice = api.person("Alice")
    api.pub("PUT", f"/persons/{alice}/diet", {"diets": ["nut_allergy", "nut_allergy"]}, status=200)
    assert diet_of(api, alice) == (["nut_allergy"], "")


@pytest.mark.parametrize(
    "body",
    [
        {"diets": ["vegetarian", "vegan"]},  # l'un ou l'autre
        {"diets": ["halal"]},  # hors liste : dans la précision
        {"diets": "vegan"},
        {"diets": ["vegetarian"] * 7},
        {"diet_note": "x" * 201},
    ],
)
def test_invalid_declaration(api, body) -> None:
    alice = api.person("Alice")
    api.pub("PUT", f"/persons/{alice}/diet", {"diets": ["gluten_free"]}, status=200)
    api.pub("PUT", f"/persons/{alice}/diet", body, status=422)
    assert diet_of(api, alice) == (["gluten_free"], "")


def test_unknown_person(api) -> None:
    api.pub("PUT", "/persons/999999/diet", {"diets": []}, status=404)


def test_diet_survives_household_changes(api) -> None:
    alice, bob = api.person("Alice"), api.person("Bob")
    api.pub("PUT", f"/persons/{bob}/diet", {"diets": ["vegetarian"]}, status=200)
    api.adm("PUT", f"/persons/{bob}/household", {"household_id": api.household_of(alice)}, status=200)
    api.adm("PATCH", f"/persons/{bob}", {"name": "Robert", "kind": "child"}, status=200)
    assert diet_of(api, bob) == (["vegetarian"], "")
