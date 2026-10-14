"""Image de couverture d'un séjour.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("stays") as batch:
        batch.add_column(sa.Column("cover_version", sa.Integer(), nullable=True))
    op.create_table(
        "stay_covers",
        sa.Column("stay_id", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("stay_id"),
    )


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
