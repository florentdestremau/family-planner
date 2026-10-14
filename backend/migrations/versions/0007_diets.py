"""Régimes et allergies des personnes : codes de la liste fermée et précision libre.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("persons") as batch:
        batch.add_column(sa.Column("diets", sa.String(length=128), nullable=False, server_default=""))
        batch.add_column(sa.Column("diet_note", sa.String(length=200), nullable=False, server_default=""))


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
