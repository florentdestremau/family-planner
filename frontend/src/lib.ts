import type { Activity, AssistantAction, BedKind, Meal, Moment, Person, PersonNight, Snapshot, Slot, StaySummary } from "./api";

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

/** URL de l'image de couverture ; la version change à chaque envoi (cache navigateur long). */
export const coverUrl = (slug: string, version: number) => `/api/stays/${slug}/cover?v=${version}`;
/** Vignette carrée de la couverture, pour l'accueil. */
export const coverThumbUrl = (slug: string, version: number) => `/api/stays/${slug}/cover/thumb?v=${version}`;
/** Taille maximale acceptée par le serveur. */
export const MAX_COVER_BYTES = 5_000_000;

export const presenceKey = (personId: number, date: string, meal: Meal) => `${personId}|${date}|${meal}`;
/** Nuit dans un ensemble de présences, à côté des clés « date|repas ». */
export const nightKey = (date: string) => `${date}|night`;

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Nuits courtes, triées, avec le jour du mois (sans ambiguïté sur un long séjour) : « ven. 30, sam. 31 ». */
export function nightsLabel(dates: string[]): string {
  return [...dates]
    .sort()
    .map((d) => `${WEEKDAYS[asDate(d).getDay()]} ${asDate(d).getDate()}`)
    .join(", ");
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/**
 * Nuits qui suivent les repas, sans ambiguïté (même règle que le serveur). Seules les nuits dont un
 * repas voisin a changé entre `before` et `after` sont revues : dîner et petit-déj du lendemain →
 * la personne dort sur place ; ni l'un ni l'autre → elle n'y dort pas ; un seul des deux (arrivée
 * après le dîner…) → la nuit reste comme dans `after`.
 */
export function followMeals(nights: string[], before: Set<string>, after: Set<string>): Set<string> {
  const next = new Set(after);
  for (const night of nights) {
    const sides = [`${night}|dinner`, `${addDays(night, 1)}|breakfast`];
    if (sides.every((k) => before.has(k) === after.has(k))) continue;
    const present = sides.filter((k) => after.has(k)).length;
    if (present === 2) next.add(nightKey(night));
    if (present === 0) next.delete(nightKey(night));
  }
  return next;
}

export interface Lodging {
  person: Person;
  /** Nuits concernées (dans ce lit, ou sans lit), triées. */
  nights: string[];
}
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
  // Nuits indexées une fois, dans l'ordre chronologique : par personne, par lit (null : sans lit)
  // puis par personne, et nombre de dormeurs par lit et par nuit.
  const nightsByPerson = new Map<number, PersonNight[]>();
  const byBed = new Map<number | null, Map<number, string[]>>();
  const perBedNight = new Map<string, number>();
  for (const n of [...snap.person_nights].sort((a, b) => a.date.localeCompare(b.date))) {
    push(nightsByPerson, n.person_id, n);
    const persons = byBed.get(n.bed_id) ?? new Map<number, string[]>();
    byBed.set(n.bed_id, persons);
    push(persons, n.person_id, n.date);
    perBedNight.set(`${n.bed_id}|${n.date}`, (perBedNight.get(`${n.bed_id}|${n.date}`) ?? 0) + 1);
  }
  const nightsOf = (personId: number): PersonNight[] => nightsByPerson.get(personId) ?? [];

  const occurrences = new Map<string, number[]>();
  for (const a of snap.chore_assignments) {
    const key = occurrenceKey(a.chore_type_id, a.date, a.moment);
    occurrences.set(key, [...(occurrences.get(key) ?? []), a.person_id]);
  }

  const name = (id: number | null | undefined) => (id != null ? (personById.get(id)?.name ?? "?") : "");

  const isPresent = (personId: number, date: string, meal: Meal) => presence.has(presenceKey(personId, date, meal));
  const sleepsOn = (personId: number, date: string) => nightsOf(personId).some((n) => n.date === date);

  const count = (keep: (p: Person) => boolean) => {
    let adults = 0;
    let children = 0;
    for (const p of snap.persons) {
      if (!keep(p)) continue;
      if (p.kind === "adult") adults++;
      else children++;
    }
    return { adults, children, total: adults + children };
  };
  const mealCount = (date: string, meal: Meal) => count((p) => isPresent(p.id, date, meal));
  /** Personnes qui dorment sur place cette nuit-là (couchages). */
  const nightCount = (date: string) => count((p) => sleepsOn(p.id, date));

  /** Personnes d'un lit (null : sans lit) avec leurs nuits, une nuit donnée ou toutes si `night` est nul. */
  const lodgings = (bedId: number | null, night: string | null): Lodging[] => {
    const persons = byBed.get(bedId);
    if (!persons) return [];
    return snap.persons.flatMap((person) => {
      const nights = (persons.get(person.id) ?? []).filter((d) => night === null || d === night);
      return nights.length ? [{ person, nights }] : [];
    });
  };
  /** Occupants d'un lit, une nuit donnée ou toutes nuits confondues. */
  const occupants = (bedId: number, night: string | null) => lodgings(bedId, night);
  /** Personnes qui dorment sur place sans lit, une nuit donnée ou toutes nuits confondues. */
  const unbedded = (night: string | null) => lodgings(null, night);
  /** Nombre de dormeurs dans un lit une nuit donnée. */
  const bedCount = (bedId: number, night: string) => perBedNight.get(`${bedId}|${night}`) ?? 0;
  /** Occupation la plus forte d'un lit sur l'ensemble des nuits. */
  const bedLoad = (bedId: number) => Math.max(0, ...snap.nights.map((d) => bedCount(bedId, d)));
  /** Le lit a-t-il une place libre chacune de ces nuits ? */
  const hasRoom = (bedId: number, nights: string[]) => {
    const bed = bedById.get(bedId);
    return bed !== undefined && nights.every((d) => bedCount(bedId, d) < BED_PLACES[bed.kind]);
  };
  /** Nuits à préciser quand elles ne couvrent pas tout le séjour : « ven. 30 », sinon rien. */
  const nightsNote = (nights: string[]) => (nights.length === snap.nights.length ? "" : nightsLabel(nights));
  /** « (ven. 30) » après un nom quand les nuits ne couvrent pas le séjour (ou toujours si `always`). */
  const nightsSuffix = (nights: string[], always = false) => {
    const label = always ? nightsLabel(nights) : nightsNote(nights);
    return label ? ` (${label})` : "";
  };
  /** Couchage d'une personne : ses lits (undefined : sans lit), chacun avec ses nuits, dans l'ordre. */
  const bedPlan = (personId: number) => {
    const plan = new Map<number | null, string[]>();
    for (const n of nightsOf(personId)) push(plan, n.bed_id, n.date);
    return [...plan].map(([bedId, nights]) => ({ bed: bedId === null ? undefined : bedById.get(bedId), nights }));
  };

  /** Inscrits à une activité (toutes les activités sont sur inscription). */
  const activityParticipants = (activity: Activity): Person[] =>
    snap.persons.filter((p) => signups.has(`${activity.id}|${p.id}`));

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
    nightCount,
    nightsOf,
    sleepsOn,
    occupants,
    unbedded,
    bedCount,
    bedLoad,
    hasRoom,
    nightsNote,
    nightsSuffix,
    bedPlan,
    /** Personnes qui n'ont déclaré aucune nuit. */
    withoutNights: () => snap.persons.filter((p) => nightsOf(p.id).length === 0),
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

/** Présences d'une personne, en clés « date|repas » et « date|night ». */
export function slotsOf(snap: Snapshot, personId: number): Set<string> {
  return new Set([
    ...snap.presences.filter((p) => p.person_id === personId).map((p) => `${p.date}|${p.meal}`),
    ...snap.person_nights.filter((n) => n.person_id === personId).map((n) => nightKey(n.date)),
  ]);
}

export function sameSets(sets: Set<string>[]): boolean {
  return sets.every((s) => s.size === sets[0].size && [...s].every((k) => sets[0].has(k)));
}

/** Clés « date|repas » → créneaux de l'API, dans l'ordre du séjour. */
export function toSlots(snap: Snapshot, keys: Set<string>) {
  return snap.slots.filter((s) => keys.has(`${s.date}|${s.meal}`)).map(({ date, meal }) => ({ date, meal }));
}

/** Clés « date|night » → nuits de l'API, dans l'ordre du séjour. */
export function toNights(snap: Snapshot, keys: Set<string>): string[] {
  return snap.nights.filter((d) => keys.has(nightKey(d)));
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

/** Séjours de l'accueil : en cours et à venir dans l'ordre chronologique, passés du plus récent au plus ancien. */
export function groupStays(stays: StaySummary[], today: string) {
  const byStart = [...stays].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name));
  return {
    current: byStart.filter((s) => s.start_date <= today && today <= s.end_date),
    upcoming: byStart.filter((s) => s.start_date > today),
    past: byStart.filter((s) => s.end_date < today).reverse(),
  };
}

export function shortRange(start: string, end: string): string {
  return start === end ? dayLabel(start) : `${dayLabel(start)} → ${dayLabel(end)}`;
}

/** Créneau court pour l'assistant : « ven. dîner », « dim. déjeuner ». */
export function slotShortLabel(slot: Slot): string {
  return `${WEEKDAYS[asDate(slot.date).getDay()]} ${MOMENT_LABEL[slot.meal].toLowerCase()}`;
}

/**
 * Résumé d'une proposition de l'assistant : « Alice : ven. dîner → dim. déjeuner », suivi des repas
 * manquants dans la fourchette (« sauf sam. dîner ») pour qu'un trou ne passe pas inaperçu.
 */
export function actionSummary(action: AssistantAction): string {
  const nights = action.nights.length ? ` · nuits : ${nightsLabel(action.nights)}` : " · aucune nuit sur place";
  return mealsSummary(action) + nights;
}

function mealsSummary(action: AssistantAction): string {
  const ordered = [...action.slots].sort((a, b) => a.date.localeCompare(b.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  if (ordered.length === 0) return `${action.name} : aucun repas`;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const label = `${action.name} : ${slotShortLabel(first)}`;
  if (ordered.length === 1) return label;
  const taken = new Set(ordered.map((slot) => `${slot.date}|${slot.meal}`));
  const missing: Slot[] = [];
  for (let date = first.date; date <= last.date; date = addDays(date, 1)) {
    for (const meal of MEALS) {
      const afterFirst = date > first.date || MEALS.indexOf(meal) > MEALS.indexOf(first.meal);
      const beforeLast = date < last.date || MEALS.indexOf(meal) < MEALS.indexOf(last.meal);
      if (afterFirst && beforeLast && !taken.has(`${date}|${meal}`)) missing.push({ date, meal });
    }
  }
  const range = `${label} → ${slotShortLabel(last)}`;
  return missing.length ? `${range}, sauf ${missing.map(slotShortLabel).join(", ")}` : range;
}
