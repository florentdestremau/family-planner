"""Assistant IA : appels par séjour, pour la limite de demandes (fenêtre glissante de 24 h).

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_calls",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stay_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_calls_stay_created", "assistant_calls", ["stay_id", "created_at"])


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")