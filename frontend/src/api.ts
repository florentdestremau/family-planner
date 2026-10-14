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
  /** Incrémenté à chaque nouvelle image de couverture ; null : pas d'image. */
  cover_version: number | null;
}

export interface StaySummary {
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  cover_version: number | null;
  households: number;
  persons: number;
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
  household_id: number;
  partner_id: number | null;
}

export interface Slot {
  date: string;
  meal: Meal;
}

export interface Presence extends Slot {
  person_id: number;
}

/** Nuit passée sur place (nuit du jour `date`, de `date` au lendemain) et lit occupé cette nuit-là. */
export interface PersonNight {
  person_id: number;
  date: string;
  bed_id: number | null;
}

export interface BedAssignResult {
  /** Nuits que la personne n'avait pas déclarées, ajoutées par l'affectation. */
  warning: string | null;
}

export interface AutoAssignResult {
  /** Nuitées attribuées. */
  assigned: number;
  /** Nuitées encore sans lit. */
  unassigned: number;
  /** Personnes sans aucune nuit déclarée, donc pas couchées. */
  undeclared: number;
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
}

export interface Signup {
  activity_id: number;
  person_id: number;
}

export interface Menu extends Slot {
  dishes: string;
  notes: string;
}

export interface AssistantStatus {
  enabled: boolean;
}

export interface AssistantAction {
  person_id: number;
  name: string;
  slots: Slot[];
  /** Nuits sur place (date du soir). */
  nights: string[];
  /** Nuits données par Claude ; sinon on ne les renvoie pas, le serveur les déduit à la validation. */
  nights_explicit: boolean;
}

export interface AssistantReply {
  text: string;
  actions: AssistantAction[];
}

export interface Snapshot {
  stay: Stay;
  days: string[];
  slots: Slot[];
  /** Nuits du séjour (date du soir), sans le dernier jour. */
  nights: string[];
  households: Household[];
  persons: Person[];
  presences: Presence[];
  person_nights: PersonNight[];
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
  // Hors ligne, l'appli reste consultable (données en cache) mais rien ne s'enregistre.
  if (method !== "GET" && !navigator.onLine) throw new ApiError(0, "Hors ligne : modification impossible.");
  // Un Blob (image) part tel quel, avec son propre type ; le reste en JSON.
  const raw = body instanceof Blob;
  const headers: Record<string, string> = {};
  if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
  if (adminKey) headers["X-Admin-Key"] = adminKey;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Connexion impossible, réessayez.");
  }
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

export const assistantStatus = () => api<AssistantStatus>("GET", "/assistant");

export const assistantAsk = (slug: string, personId: number, message: string, history: string[]) =>
  api<AssistantReply>("POST", `/stays/${slug}/assistant`, { person_id: personId, message, history });
