"""Image de couverture du séjour.

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
    with op.batch_alter_table("stays") as batch:
        batch.add_column(sa.Column("cover_image", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("stays") as batch:
        batch.drop_column("cover_image")
