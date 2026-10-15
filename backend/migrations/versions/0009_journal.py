"""Journal d'activité du séjour : une ligne par modification, avec son auteur.

Les séjours existants commencent avec un journal vide : rien n'est reconstitué.

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "log_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stay_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("via_assistant", sa.Boolean(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("subjects", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_log_entries_stay_id", "log_entries", ["stay_id", "id"])


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
