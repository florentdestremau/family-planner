"""Heures d'arrivée et de départ des personnes, avec une note libre.

Les personnes existantes n'ont pas encore d'heure (champs vides).

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
    with op.batch_alter_table("persons") as batch:
        batch.add_column(sa.Column("arrival_time", sa.String(length=5), nullable=False, server_default=""))
        batch.add_column(sa.Column("departure_time", sa.String(length=5), nullable=False, server_default=""))
        batch.add_column(sa.Column("times_note", sa.String(length=200), nullable=False, server_default=""))
        batch.add_column(sa.Column("arrival_updated_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("departure_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
