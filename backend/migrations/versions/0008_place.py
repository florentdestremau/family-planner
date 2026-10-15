"""Lieu et infos pratiques du séjour : adresse, lien Google Maps, consignes en texte libre.

Les séjours existants n'ont ni adresse ni consignes (champs vides).

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("stays") as batch:
        batch.add_column(sa.Column("address", sa.String(length=300), nullable=False, server_default=""))
        batch.add_column(sa.Column("map_url", sa.String(length=500), nullable=False, server_default=""))
        batch.add_column(sa.Column("practical_info", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("info_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
