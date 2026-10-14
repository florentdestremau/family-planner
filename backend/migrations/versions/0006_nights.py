"""Nuits : chaque personne note les nuits où elle dort sur place, le lit se choisit nuit par nuit.

Déduction des nuits existantes à partir des repas : la nuit du jour J est retenue si la personne
dîne le soir J et prend le petit-déjeuner le lendemain, ou si elle a un lit et l'un des deux
(arrivée après le dîner, départ avant le petit-déjeuner). Une personne qui a un lit sans aucune
nuit déduite (présences pas encore saisies) dort toutes les nuits du séjour : aucun lit n'est perdu.
Chaque nuit reprend le lit de la personne ; les capacités tiennent, puisque ce lit valait déjà pour
tout le séjour.

Revision ID: 0006
Revises: 0005
"""

from datetime import date, timedelta

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def deduce(nights: list[date], meals: set[tuple[date, str]], has_bed: bool) -> list[date]:
    kept = []
    for night in nights:
        sides = [(night, "dinner") in meals, (night + timedelta(days=1), "breakfast") in meals]
        if all(sides) or (has_bed and any(sides)):
            kept.append(night)
    return kept if kept or not has_bed else nights


def upgrade() -> None:
    op.create_table(
        "nights",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("bed_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["bed_id"], ["beds.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_id", "date"),
    )
    op.create_index("ix_nights_person_id", "nights", ["person_id"])
    op.create_index("ix_nights_bed_date", "nights", ["bed_id", "date"])

    bind = op.get_bind()
    meals: dict[int, set[tuple[date, str]]] = {}
    for person_id, day, meal in bind.execute(sa.text("SELECT person_id, date, meal FROM presences")):
        meals.setdefault(person_id, set()).add((date.fromisoformat(day), meal))
    people = bind.execute(
        sa.text("SELECT p.id, p.bed_id, s.start_date, s.end_date FROM persons p JOIN stays s ON s.id = p.stay_id ORDER BY p.id")
    ).all()
    for person_id, bed_id, start, end in people:
        start, end = date.fromisoformat(start), date.fromisoformat(end)
        stay_nights = [start + timedelta(days=i) for i in range((end - start).days)]
        for night in deduce(stay_nights, meals.get(person_id, set()), bed_id is not None):
            bind.execute(
                sa.text("INSERT INTO nights (person_id, date, bed_id) VALUES (:p, :d, :b)"),
                {"p": person_id, "d": night.isoformat(), "b": bed_id},
            )

    with op.batch_alter_table("persons") as batch:
        batch.drop_column("bed_id")


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
