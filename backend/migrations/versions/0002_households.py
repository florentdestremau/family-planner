"""Foyers : chaque personne appartient à un foyer ; le « référent » d'un enfant disparaît.

Regroupement des données existantes : un adulte, son conjoint et les enfants rattachés à l'un
d'eux forment un foyer ; toute autre personne forme son propre foyer.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _groups(rows: list[tuple[int, int, int | None, int | None]]) -> dict[int, int]:
    """(id, stay_id, guardian_id, partner_id) → {id: représentant du foyer} (union-find)."""
    parent = {pid: pid for pid, *_ in rows}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for pid, _stay, guardian, partner in rows:
        for other in (guardian, partner):
            if other in parent:
                parent[find(pid)] = find(other)
    return {pid: find(pid) for pid in parent}


def upgrade() -> None:
    op.create_table(
        "households",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stay_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_households_stay_id", "households", ["stay_id"])
    with op.batch_alter_table("persons") as batch:
        batch.add_column(sa.Column("household_id", sa.Integer(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, stay_id, guardian_id, partner_id FROM persons ORDER BY id")).all()
    stay_of = {pid: stay for pid, stay, *_ in rows}
    household_of_root: dict[int, int] = {}
    for pid, root in sorted(_groups([tuple(r) for r in rows]).items()):
        if root not in household_of_root:
            result = bind.execute(sa.text("INSERT INTO households (stay_id, name) VALUES (:s, '')"), {"s": stay_of[root]})
            household_of_root[root] = result.lastrowid
        bind.execute(sa.text("UPDATE persons SET household_id = :h WHERE id = :p"), {"h": household_of_root[root], "p": pid})

    with op.batch_alter_table("persons") as batch:
        batch.alter_column("household_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key("fk_persons_household_id", "households", ["household_id"], ["id"], ondelete="CASCADE")
        batch.create_index("ix_persons_household_id", ["household_id"])
        batch.drop_column("guardian_id")


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
