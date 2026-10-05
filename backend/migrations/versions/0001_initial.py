"""Schéma initial, tel que créé en production par create_all (v1, avant les foyers).

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Copie exacte de sqlite_master en production (05/10/2026) : une base créée avant Alembic est
# simplement marquée « 0001 » au démarrage, sans rien exécuter.
SCHEMA = """
CREATE TABLE stays (
    id INTEGER NOT NULL, slug VARCHAR(32) NOT NULL, admin_key VARCHAR(64) NOT NULL, name VARCHAR(200) NOT NULL,
    start_date DATE NOT NULL, end_date DATE NOT NULL, first_meal VARCHAR(16) NOT NULL, last_meal VARCHAR(16) NOT NULL,
    separate_couples BOOLEAN NOT NULL, created_at DATETIME NOT NULL,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_stays_slug ON stays (slug);
CREATE TABLE rooms (
    id INTEGER NOT NULL, stay_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, notes TEXT NOT NULL,
    PRIMARY KEY (id), FOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE CASCADE
);
CREATE INDEX ix_rooms_stay_id ON rooms (stay_id);
CREATE TABLE beds (
    id INTEGER NOT NULL, room_id INTEGER NOT NULL, kind VARCHAR(16) NOT NULL, label VARCHAR(100) NOT NULL,
    PRIMARY KEY (id), FOREIGN KEY(room_id) REFERENCES rooms (id) ON DELETE CASCADE
);
CREATE INDEX ix_beds_room_id ON beds (room_id);
CREATE TABLE persons (
    id INTEGER NOT NULL, stay_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, kind VARCHAR(16) NOT NULL,
    does_chores BOOLEAN NOT NULL, does_activities BOOLEAN NOT NULL,
    guardian_id INTEGER, partner_id INTEGER, bed_id INTEGER,
    PRIMARY KEY (id),
    FOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE CASCADE,
    FOREIGN KEY(guardian_id) REFERENCES persons (id) ON DELETE SET NULL,
    FOREIGN KEY(partner_id) REFERENCES persons (id) ON DELETE SET NULL,
    FOREIGN KEY(bed_id) REFERENCES beds (id) ON DELETE SET NULL
);
CREATE INDEX ix_persons_stay_id ON persons (stay_id);
CREATE TABLE presences (
    id INTEGER NOT NULL, person_id INTEGER NOT NULL, date DATE NOT NULL, meal VARCHAR(16) NOT NULL,
    PRIMARY KEY (id), UNIQUE (person_id, date, meal),
    FOREIGN KEY(person_id) REFERENCES persons (id) ON DELETE CASCADE
);
CREATE INDEX ix_presences_person_id ON presences (person_id);
CREATE TABLE menus (
    id INTEGER NOT NULL, stay_id INTEGER NOT NULL, date DATE NOT NULL, meal VARCHAR(16) NOT NULL,
    dishes TEXT NOT NULL, notes TEXT NOT NULL,
    PRIMARY KEY (id), UNIQUE (stay_id, date, meal),
    FOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE CASCADE
);
CREATE INDEX ix_menus_stay_id ON menus (stay_id);
CREATE TABLE chore_types (
    id INTEGER NOT NULL, stay_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, moments VARCHAR(64) NOT NULL,
    people_needed INTEGER NOT NULL, every_n_days INTEGER NOT NULL,
    PRIMARY KEY (id), FOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE CASCADE
);
CREATE INDEX ix_chore_types_stay_id ON chore_types (stay_id);
CREATE TABLE chore_assignments (
    id INTEGER NOT NULL, stay_id INTEGER NOT NULL, chore_type_id INTEGER NOT NULL, date DATE NOT NULL,
    moment VARCHAR(16) NOT NULL, person_id INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE CASCADE,
    FOREIGN KEY(chore_type_id) REFERENCES chore_types (id) ON DELETE CASCADE,
    FOREIGN KEY(person_id) REFERENCES persons (id) ON DELETE CASCADE
);
CREATE INDEX ix_chore_assignments_stay_id ON chore_assignments (stay_id);
CREATE TABLE activities (
    id INTEGER NOT NULL, stay_id INTEGER NOT NULL, name VARCHAR(200) NOT NULL, description TEXT NOT NULL,
    location VARCHAR(200) NOT NULL, date DATE NOT NULL, start_time VARCHAR(5) NOT NULL, end_time VARCHAR(5) NOT NULL,
    optional BOOLEAN NOT NULL,
    PRIMARY KEY (id), FOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE CASCADE
);
CREATE INDEX ix_activities_stay_id ON activities (stay_id);
CREATE TABLE signups (
    id INTEGER NOT NULL, activity_id INTEGER NOT NULL, person_id INTEGER NOT NULL,
    PRIMARY KEY (id), UNIQUE (activity_id, person_id),
    FOREIGN KEY(activity_id) REFERENCES activities (id) ON DELETE CASCADE,
    FOREIGN KEY(person_id) REFERENCES persons (id) ON DELETE CASCADE
);
CREATE INDEX ix_signups_activity_id ON signups (activity_id);
"""

def upgrade() -> None:
    for statement in SCHEMA.split(";"):
        if statement.strip():
            op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Pas de retour arrière : restaurer une sauvegarde once.")
