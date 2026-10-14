"""Activités : toutes sur inscription ; « facultative » et « participe aux activités » disparaissent.

Les désistements (`activity_declines`) sont mémorisés : « inscrire tout le monde » les respecte.

Conversion des données existantes : chaque activité « tout le monde » inscrit les personnes qui y
participaient jusque-là (« participe aux activités », présentes ce jour-là), pour que la liste des
participants ne change pas au déploiement.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_declines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", "person_id"),
    )
    op.create_index("ix_activity_declines_activity_id", "activity_declines", ["activity_id"])
    op.execute(
        """
        INSERT INTO signups (activity_id, person_id)
        SELECT a.id, p.id FROM activities a JOIN persons p ON p.stay_id = a.stay_id
        WHERE NOT a.optional AND p.does_activities
          AND EXISTS (SELECT 1 FROM presences pr WHERE pr.person_id = p.id AND pr.date = a.date)
          AND NOT EXISTS (SELECT 1 FROM signups s WHERE s.activity_id = a.id AND s.person_id = p.id)
        ORDER BY a.id, p.id
        """
    )
    with op.batch_alter_table("activities") as batch:
        batch.drop_column("optional")
    with op.batch_alter_table("persons") as batch:
        batch.drop_column("does_activities")


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
