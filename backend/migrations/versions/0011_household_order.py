"""Ordre des foyers, choisi par l'organisateur.

Les foyers existants sont à 0 : sans ordre choisi, l'affichage reste alphabétique.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("households") as batch:
        batch.add_column(sa.Column("position", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
