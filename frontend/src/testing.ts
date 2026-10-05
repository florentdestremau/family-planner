import type { Snapshot } from "./api";

/** Snapshot minimal et cohérent pour les tests : ven. dîner → dim. déjeuner. */
export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    stay: {
      slug: "abc",
      name: "Toussaint",
      start_date: "2026-10-30",
      end_date: "2026-11-01",
      first_meal: "dinner",
      last_meal: "lunch",
      separate_couples: true,
    },
    days: ["2026-10-30", "2026-10-31", "2026-11-01"],
    slots: [
      { date: "2026-10-30", meal: "dinner" },
      { date: "2026-10-31", meal: "breakfast" },
      { date: "2026-10-31", meal: "lunch" },
      { date: "2026-10-31", meal: "dinner" },
      { date: "2026-11-01", meal: "breakfast" },
      { date: "2026-11-01", meal: "lunch" },
    ],
    persons: [
      { id: 1, name: "Alice", kind: "adult", does_chores: true, does_activities: true, guardian_id: null, partner_id: 2, bed_id: 10 },
      { id: 2, name: "Bob", kind: "adult", does_chores: true, does_activities: true, guardian_id: null, partner_id: 1, bed_id: 10 },
      { id: 3, name: "Léo", kind: "child", does_chores: false, does_activities: true, guardian_id: 1, partner_id: null, bed_id: null },
      { id: 4, name: "Mamie", kind: "adult", does_chores: false, does_activities: false, guardian_id: null, partner_id: null, bed_id: null },
    ],
    presences: [
      { person_id: 1, date: "2026-10-30", meal: "dinner" },
      { person_id: 1, date: "2026-10-31", meal: "lunch" },
      { person_id: 2, date: "2026-10-30", meal: "dinner" },
      { person_id: 3, date: "2026-10-30", meal: "dinner" },
      { person_id: 4, date: "2026-10-31", meal: "lunch" },
    ],
    rooms: [{ id: 5, name: "Bleue", notes: "", beds: [{ id: 10, room_id: 5, kind: "double", label: "" }] }],
    chore_types: [{ id: 7, name: "Cuisine", moments: ["dinner"], people_needed: 2, every_n_days: 1 }],
    chore_assignments: [
      { chore_type_id: 7, date: "2026-10-30", moment: "dinner", person_id: 1 },
      { chore_type_id: 7, date: "2026-10-30", moment: "dinner", person_id: 4 },
    ],
    activities: [
      { id: 20, name: "Rando", description: "", location: "", date: "2026-10-31", start_time: "10:00", end_time: "", optional: true },
      { id: 21, name: "Jeux", description: "", location: "", date: "2026-10-31", start_time: "", end_time: "", optional: false },
    ],
    signups: [{ activity_id: 20, person_id: 3 }],
    menus: [{ date: "2026-10-30", meal: "dinner", dishes: "Soupe\n\n Gratin \n", notes: "Sans gluten" }],
    ...overrides,
  };
}
