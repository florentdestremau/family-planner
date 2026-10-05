import type { Activity, BedKind, Meal, Moment, Person, Snapshot } from "./api";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
export const MOMENTS: Moment[] = [...MEALS, "day"];

export const MOMENT_LABEL: Record<Moment, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  dinner: "Dîner",
  day: "Journée",
};

export const BED_LABEL: Record<BedKind, string> = {
  double: "Lit double",
  single: "Lit simple",
  bunk: "Lits superposés",
  extra: "Lit d'appoint",
};

export const BED_PLACES: Record<BedKind, number> = { double: 2, single: 1, bunk: 2, extra: 1 };

const asDate = (iso: string) => new Date(`${iso}T12:00:00`);
const pad = (n: number) => String(n).padStart(2, "0");

/** Date locale au format ISO (sans décalage UTC). */
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(iso: string, n: number): string {
  const d = asDate(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

export function dayLabel(iso: string, long = false): string {
  const label = asDate(iso).toLocaleDateString("fr-FR", {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function rangeLabel(start: string, end: string): string {
  return `du ${dayLabel(start, true).toLowerCase()} au ${dayLabel(end, true).toLowerCase()}`;
}

export const presenceKey = (personId: number, date: string, meal: Meal) => `${personId}|${date}|${meal}`;
export const occurrenceKey = (choreId: number, date: string, moment: Moment) => `${choreId}|${date}|${moment}`;

export type Index = ReturnType<typeof buildIndex>;

/** Structures dérivées du snapshot, pour des recherches rapides. */
export function buildIndex(snap: Snapshot) {
  const personById = new Map(snap.persons.map((p) => [p.id, p]));
  const householdById = new Map(snap.households.map((h) => [h.id, h]));
  // Membres d'un foyer : adultes d'abord, puis enfants, dans l'ordre d'arrivée.
  const membersByHousehold = new Map<number, Person[]>();
  for (const p of [...snap.persons].sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === "adult" ? -1 : 1))) {
    membersByHousehold.set(p.household_id, [...(membersByHousehold.get(p.household_id) ?? []), p]);
  }
  const members = (householdId: number): Person[] => membersByHousehold.get(householdId) ?? [];
  const presence = new Set(snap.presences.map((p) => presenceKey(p.person_id, p.date, p.meal)));
  const presentDays = new Set(snap.presences.map((p) => `${p.person_id}|${p.date}`));
  const slotSet = new Set(snap.slots.map((s) => `${s.date}|${s.meal}`));
  const choreById = new Map(snap.chore_types.map((c) => [c.id, c]));
  const bedById = new Map(snap.rooms.flatMap((r) => r.beds.map((b) => [b.id, { ...b, room: r }] as const)));
  const signups = new Set(snap.signups.map((s) => `${s.activity_id}|${s.person_id}`));
  const menuBySlot = new Map(snap.menus.map((m) => [`${m.date}|${m.meal}`, m]));

  const occurrences = new Map<string, number[]>();
  for (const a of snap.chore_assignments) {
    const key = occurrenceKey(a.chore_type_id, a.date, a.moment);
    occurrences.set(key, [...(occurrences.get(key) ?? []), a.person_id]);
  }

  const name = (id: number | null | undefined) => (id != null ? (personById.get(id)?.name ?? "?") : "");

  const isPresent = (personId: number, date: string, meal: Meal) => presence.has(presenceKey(personId, date, meal));

  const mealCount = (date: string, meal: Meal) => {
    let adults = 0;
    let children = 0;
    for (const p of snap.persons) {
      if (!isPresent(p.id, date, meal)) continue;
      if (p.kind === "adult") adults++;
      else children++;
    }
    return { adults, children, total: adults + children };
  };

  const activityParticipants = (activity: Activity): Person[] =>
    snap.persons.filter((p) =>
      activity.optional
        ? signups.has(`${activity.id}|${p.id}`)
        : p.does_activities && presentDays.has(`${p.id}|${activity.date}`),
    );

  /** Mon foyer : moi d'abord, puis les autres membres. */
  const household = (me: Person | undefined): Person[] =>
    me ? [me, ...members(me.household_id).filter((p) => p.id !== me.id)] : [];

  /** Nom du foyer, ou à défaut les prénoms des adultes (des membres s'il n'y a que des enfants). */
  const householdLabel = (householdId: number): string => {
    const name = householdById.get(householdId)?.name;
    if (name) return name;
    const all = members(householdId);
    const adults = all.filter((p) => p.kind === "adult");
    return (adults.length ? adults : all).map((p) => p.name).join(" & ");
  };

  /** Foyers triés par libellé, avec leurs membres. */
  const households = () =>
    snap.households
      .map((h) => ({ ...h, label: householdLabel(h.id), members: members(h.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return {
    personById,
    householdById,
    members,
    householdLabel,
    households,
    slotSet,
    choreById,
    bedById,
    signups,
    menuBySlot,
    occurrences,
    name,
    isPresent,
    mealCount,
    activityParticipants,
    household,
    hasSlot: (date: string, meal: Meal) => slotSet.has(`${date}|${meal}`),
    isPresentOnDay: (personId: number, date: string) => presentDays.has(`${personId}|${date}`),
  };
}

export function countLabel({ adults, children }: { adults: number; children: number }): string {
  const parts = [`${adults} adulte${adults > 1 ? "s" : ""}`];
  if (children) parts.push(`${children} enfant${children > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** Toutes les occurrences de corvées triées chronologiquement (déjà tirées ou non). */
export function sortedMoments(a: { date: string; moment: Moment }, b: { date: string; moment: Moment }): number {
  return a.date.localeCompare(b.date) || MOMENTS.indexOf(a.moment) - MOMENTS.indexOf(b.moment);
}

/** Présences d'une personne, en clés « date|repas ». */
export function slotsOf(snap: Snapshot, personId: number): Set<string> {
  return new Set(snap.presences.filter((p) => p.person_id === personId).map((p) => `${p.date}|${p.meal}`));
}

export function sameSets(sets: Set<string>[]): boolean {
  return sets.every((s) => s.size === sets[0].size && [...s].every((k) => sets[0].has(k)));
}

/** Clés « date|repas » → créneaux de l'API, dans l'ordre du séjour. */
export function toSlots(snap: Snapshot, keys: Set<string>) {
  return snap.slots.filter((s) => keys.has(`${s.date}|${s.meal}`)).map(({ date, meal }) => ({ date, meal }));
}

/** Texte prêt à coller dans un LLM pour générer une liste de courses. */
export function llmExport(snap: Snapshot, idx: Index): string {
  const lines = [
    `Voici les menus de notre séjour « ${snap.stay.name} » avec le nombre de couverts par repas`,
    "(compter environ une demi-portion par enfant).",
    "Génère une liste de courses consolidée, regroupée par rayon, avec les quantités totales.",
    "",
  ];
  for (const slot of snap.slots) {
    const menu = idx.menuBySlot.get(`${slot.date}|${slot.meal}`);
    const count = idx.mealCount(slot.date, slot.meal);
    if (!count.total) continue;
    const dishes = menu?.dishes.split("\n").map((d) => d.trim()).filter(Boolean) ?? [];
    lines.push(
      `- ${dayLabel(slot.date)}, ${MOMENT_LABEL[slot.meal].toLowerCase()} — ${countLabel(count)} : ${
        dishes.length ? dishes.join(" ; ") : "(menu non défini)"
      }${menu?.notes ? ` [${menu.notes}]` : ""}`,
    );
  }
  return lines.join("\n");
}
