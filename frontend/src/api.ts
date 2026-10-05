export type Meal = "breakfast" | "lunch" | "dinner";
export type Moment = Meal | "day";
export type PersonKind = "adult" | "child";
export type BedKind = "double" | "single" | "bunk" | "extra";

export interface Stay {
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  first_meal: Meal;
  last_meal: Meal;
  separate_couples: boolean;
}

export interface Household {
  id: number;
  /** Vide : on affiche les prénoms des adultes. */
  name: string;
}

export interface Person {
  id: number;
  name: string;
  kind: PersonKind;
  does_chores: boolean;
  does_activities: boolean;
  household_id: number;
  partner_id: number | null;
  bed_id: number | null;
}

export interface Slot {
  date: string;
  meal: Meal;
}

export interface Presence extends Slot {
  person_id: number;
}

export interface Bed {
  id: number;
  room_id: number;
  kind: BedKind;
  label: string;
}

export interface Room {
  id: number;
  name: string;
  notes: string;
  beds: Bed[];
}

export interface ChoreType {
  id: number;
  name: string;
  moments: Moment[];
  people_needed: number;
  every_n_days: number;
}

export interface ChoreAssignment {
  chore_type_id: number;
  date: string;
  moment: Moment;
  person_id: number;
}

export interface Activity {
  id: number;
  name: string;
  description: string;
  location: string;
  date: string;
  start_time: string;
  end_time: string;
  optional: boolean;
}

export interface Signup {
  activity_id: number;
  person_id: number;
}

export interface Menu extends Slot {
  dishes: string;
  notes: string;
}

export interface Snapshot {
  stay: Stay;
  days: string[];
  slots: Slot[];
  households: Household[];
  persons: Person[];
  presences: Presence[];
  rooms: Room[];
  chore_types: ChoreType[];
  chore_assignments: ChoreAssignment[];
  activities: Activity[];
  signups: Signup[];
  menus: Menu[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  adminKey?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (adminKey) headers["X-Admin-Key"] = adminKey;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((d: { msg: string }) => d.msg).join(", ")
            : message;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
