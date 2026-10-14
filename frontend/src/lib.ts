import type { Activity, AssistantAction, BedKind, Diet, Meal, Moment, Person, Snapshot, Slot, StaySummary } from "./api";

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

/** Régimes, puis allergies et intolérances, dans l'ordre d'affichage. */
export const REGIMES: Diet[] = ["vegetarian", "vegan"];
export const ALLERGIES: Diet[] = ["gluten_free", "lactose_free", "nut_allergy", "seafood_allergy"];
export const DIETS: Diet[] = [...REGIMES, ...ALLERGIES];

export const DIET_LABEL: Record<Diet, string> = {
  vegetarian: "Végétarien",
  vegan: "Végan",
  gluten_free: "Sans gluten",
  lactose_free: "Sans lactose",
  nut_allergy: "Allergie arachides et fruits à coque",
  seafood_allergy: "Allergie poisson et fruits de mer",
};

const plural = (n: number) => (n > 1 ? "s" : "");

/** Compteur d'une contrainte : « 2 végétariens », « 1 sans gluten ». */
const DIET_COUNT: Record<Diet, (n: number) => string> = {
  vegetarian: (n) => `${n} végétarien${plural(n)}`,
  vegan: (n) => `${n} végan${plural(n)}`,
  gluten_free: (n) => `${n} sans gluten`,
  lactose_free: (n) => `${n} sans lactose`,
  nut_allergy: (n) => `${n} allergie${plural(n)} fruits à coque`,
  seafood_allergy: (n) => `${n} allergie${plural(n)} fruits de mer`,
};

/** Une allergie est signalée d'une alerte, un régime d'une pousse. */
export const dietIcon = (diet: Diet) => (ALLERGIES.includes(diet) ? "⚠️" : "🌱");

/** Coche ou décoche une contrainte ; végétarien et végan s'excluent. */
export function toggleDiet(diets: Diet[], diet: Diet, on: boolean): Diet[] {
  const excluded = on && REGIMES.includes(diet) ? REGIMES : [diet];
  const kept = diets.filter((d) => !excluded.includes(d));
  return DIETS.filter((d) => kept.includes(d) || (on && d === diet));
}

/** Contraintes déclarées par une personne, en une ligne. */
export function dietLabel(p: Person): string {
  return [...p.diets.map((d) => DIET_LABEL[d]), p.diet_note].filter(Boolean).join(" · ") || "Aucune contrainte";
}

export interface DietGroups {
  /** Contraintes de la liste, dans l'ordre d'affichage, avec les personnes concernées. */
  byDiet: { diet: Diet; persons: Person[] }[];
  /** Personnes qui ont une précision libre. */
  notes: Person[];
}

export function dietGroups(persons: Person[]): DietGroups {
  return {
    byDiet: DIETS.map((diet) => ({ diet, persons: persons.filter((p) => p.diets.includes(diet)) })).filter((g) => g.persons.length),
    notes: persons.filter((p) => p.diet_note),
  };
}

/** « 🌱 2 végétariens · ⚠️ 1 sans gluten · 📝 1 précision » ; vide s'il n'y a rien. */
export function dietCountLabel({ byDiet, notes }: DietGroups): string {
  const parts = byDiet.map(({ diet, persons }) => `${dietIcon(diet)} ${DIET_COUNT[diet](persons.length)}`);
  if (notes.length) parts.push(`📝 ${notes.length} précision${plural(notes.length)}`);
  return parts.join(" · ");
}

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

  /** Personnes présentes à un repas. */
  const presentAt = (date: string, meal: Meal) => snap.persons.filter((p) => isPresent(p.id, date, meal));

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
    presentAt,
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

/**
 * Texte prêt à coller dans un LLM pour générer une liste de courses. Régimes et allergies y figurent
 * en nombres par repas, et les précisions libres à part : jamais de noms.
 */
export function llmExport(snap: Snapshot, idx: Index): string {
  const eating = snap.persons.filter((p) => snap.slots.some((s) => idx.isPresent(p.id, s.date, s.meal)));
  const constrained = eating.some((p) => p.diets.length);
  const lines = [
    `Voici les menus de notre séjour « ${snap.stay.name} » avec le nombre de couverts par repas`,
    "(compter environ une demi-portion par enfant).",
    "Génère une liste de courses consolidée, regroupée par rayon, avec les quantités totales.",
  ];
  if (constrained) {
    lines.push("Régimes et allergies indiqués par repas : prévois de quoi les respecter (produits de remplacement ou variante du plat).");
  }
  lines.push("");
  for (const slot of snap.slots) {
    const menu = idx.menuBySlot.get(`${slot.date}|${slot.meal}`);
    const count = idx.mealCount(slot.date, slot.meal);
    if (!count.total) continue;
    const dishes = menu?.dishes.split("\n").map((d) => d.trim()).filter(Boolean) ?? [];
    const diets = dietGroups(idx.presentAt(slot.date, slot.meal)).byDiet.map(({ diet, persons }) => DIET_COUNT[diet](persons.length));
    lines.push(
      `- ${dayLabel(slot.date)}, ${MOMENT_LABEL[slot.meal].toLowerCase()} — ${countLabel(count)}${
        diets.length ? `, dont ${diets.join(", ")}` : ""
      } : ${dishes.length ? dishes.join(" ; ") : "(menu non défini)"}${menu?.notes ? ` [${menu.notes}]` : ""}`,
    );
  }
  const notes = [...new Set(eating.map((p) => p.diet_note).filter(Boolean))];
  if (notes.length) lines.push("", `Autres précisions alimentaires : ${notes.join(" ; ")}`);
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

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Créneau court pour l'assistant : « ven. dîner », « dim. déjeuner ». */
export function slotShortLabel(slot: Slot): string {
  return `${WEEKDAYS[asDate(slot.date).getDay()]} ${MOMENT_LABEL[slot.meal].toLowerCase()}`;
}

/**
 * Résumé d'une proposition de l'assistant : « Alice : ven. dîner → dim. déjeuner », suivi des repas
 * manquants dans la fourchette (« sauf sam. dîner ») pour qu'un trou ne passe pas inaperçu.
 */
export function actionSummary(action: AssistantAction): string {
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
