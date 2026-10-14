import { describe, expect, it } from "vitest";
import type { Slot } from "./api";
import {
  actionSummary,
  followMeals,
  nightKey,
  nightsLabel,
  toNights,
  addDays,
  groupStays,
  shortRange,
  sameSets,
  slotShortLabel,
  slotsOf,
  toSlots,
  buildIndex,
  countLabel,
  DIETS,
  dietCountLabel,
  dietGroups,
  dietIcon,
  dietLabel,
  hasDiet,
  toggleDiet,
  coverThumbUrl,
  coverUrl,
  dayLabel,
  llmExport,
  occurrenceKey,
  presenceKey,
  rangeLabel,
  sortedMoments,
  toIso,
} from "./lib";
import { makeSnapshot } from "./testing";

describe("dates", () => {
  it("formate les jours en français, capitalisés", () => {
    expect(dayLabel("2026-10-30")).toBe("Ven. 30 oct.");
    expect(dayLabel("2026-10-30", true)).toBe("Vendredi 30 octobre");
    expect(rangeLabel("2026-10-30", "2026-11-01")).toBe("du vendredi 30 octobre au dimanche 1 novembre");
  });

  it("calcule les dates sans décalage de fuseau", () => {
    expect(toIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(addDays("2026-10-30", 2)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    // Changement d'heure (fin octobre en Europe).
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("clés et tri", () => {
  it("construit des clés stables", () => {
    expect(presenceKey(1, "2026-10-30", "dinner")).toBe("1|2026-10-30|dinner");
    expect(occurrenceKey(7, "2026-10-30", "day")).toBe("7|2026-10-30|day");
  });

  it("trie par date puis par moment de la journée", () => {
    const items = [
      { date: "2026-10-31", moment: "day" as const },
      { date: "2026-10-31", moment: "breakfast" as const },
      { date: "2026-10-30", moment: "dinner" as const },
      { date: "2026-10-31", moment: "dinner" as const },
    ];
    expect([...items].sort(sortedMoments)).toEqual([
      { date: "2026-10-30", moment: "dinner" },
      { date: "2026-10-31", moment: "breakfast" },
      { date: "2026-10-31", moment: "dinner" },
      { date: "2026-10-31", moment: "day" },
    ]);
  });
});

describe("countLabel", () => {
  it("accorde et omet les enfants absents", () => {
    expect(countLabel({ adults: 0, children: 0 })).toBe("0 adulte");
    expect(countLabel({ adults: 1, children: 0 })).toBe("1 adulte");
    expect(countLabel({ adults: 2, children: 1 })).toBe("2 adultes · 1 enfant");
    expect(countLabel({ adults: 3, children: 4 })).toBe("3 adultes · 4 enfants");
  });
});

describe("buildIndex", () => {
  const snap = makeSnapshot();
  const idx = buildIndex(snap);

  it("indexe personnes, lits, corvées et menus", () => {
    expect(idx.personById.get(3)?.name).toBe("Léo");
    expect(idx.bedById.get(10)?.room.name).toBe("Bleue");
    expect(idx.choreById.get(7)?.name).toBe("Cuisine");
    expect(idx.menuBySlot.get("2026-10-30|dinner")?.notes).toBe("Sans gluten");
    expect(idx.occurrences.get("7|2026-10-30|dinner")).toEqual([1, 4]);
  });

  it("résout les noms, y compris absents ou inconnus", () => {
    expect(idx.name(1)).toBe("Alice");
    expect(idx.name(999)).toBe("?");
    expect(idx.name(null)).toBe("");
    expect(idx.name(undefined)).toBe("");
  });

  it("présences par repas et par jour", () => {
    expect(idx.isPresent(1, "2026-10-31", "lunch")).toBe(true);
    expect(idx.isPresent(1, "2026-10-31", "dinner")).toBe(false);
    expect(idx.isPresentOnDay(4, "2026-10-31")).toBe(true);
    expect(idx.isPresentOnDay(4, "2026-10-30")).toBe(false);
    expect(idx.hasSlot("2026-10-30", "dinner")).toBe(true);
    expect(idx.hasSlot("2026-10-30", "lunch")).toBe(false);
  });

  it("compte les couverts adultes / enfants", () => {
    expect(idx.mealCount("2026-10-30", "dinner")).toEqual({ adults: 2, children: 1, total: 3 });
    expect(idx.mealCount("2026-10-31", "lunch")).toEqual({ adults: 2, children: 0, total: 2 });
    expect(idx.mealCount("2026-11-01", "lunch")).toEqual({ adults: 0, children: 0, total: 0 });
  });

  it("participants : les inscrits, présents ou non ce jour-là", () => {
    const [rando, jeux] = snap.activities;
    // Léo n'est là que le 30 : inscrit quand même à la rando du 31.
    expect(idx.activityParticipants(rando).map((p) => p.name)).toEqual(["Léo"]);
    expect(idx.activityParticipants(jeux).map((p) => p.name)).toEqual(["Alice", "Mamie"]);
  });

  it("foyer : soi-même d'abord, puis les adultes, puis les enfants", () => {
    expect(idx.household(undefined)).toEqual([]);
    expect(idx.household(snap.persons[0]).map((p) => p.name)).toEqual(["Alice", "Bob", "Léo"]);
    expect(idx.household(snap.persons[2]).map((p) => p.name)).toEqual(["Léo", "Alice", "Bob"]);
    expect(idx.members(50).map((p) => p.name)).toEqual(["Alice", "Bob", "Léo"]);
    expect(idx.members(999)).toEqual([]);
  });

  it("libellé du foyer : son nom, sinon les adultes, sinon les membres", () => {
    expect(idx.householdLabel(50)).toBe("Alice & Bob");
    expect(idx.householdLabel(51)).toBe("Mamie");
    expect(idx.householdLabel(52)).toBe("Nina");
    expect(idx.householdLabel(999)).toBe("");
    expect(idx.households().map((h) => [h.label, h.members.length])).toEqual([
      ["Alice & Bob", 3],
      ["Mamie", 1],
      ["Nina", 1],
    ]);
  });
});

describe("llmExport", () => {
  it("liste les repas avec couverts, plats nettoyés et notes ; ignore les repas vides", () => {
    const snap = makeSnapshot();
    const text = llmExport(snap, buildIndex(snap));
    expect(text).toContain("« Toussaint »");
    expect(text).toContain("- Ven. 30 oct., dîner — 2 adultes · 1 enfant : Soupe ; Gratin [Sans gluten]");
    expect(text).toContain("- Sam. 31 oct., déjeuner — 2 adultes : (menu non défini)");
    expect(text).not.toContain("petit-déj");
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(2);
    expect(text).not.toContain("Régimes");
    expect(text).not.toContain("précisions");
  });

  it("donne régimes et allergies en nombres par repas, les précisions à part, sans aucun nom", () => {
    const snap = withDiets();
    const text = llmExport(snap, buildIndex(snap));
    expect(text).toContain("Régimes et allergies indiqués par repas : prévois de quoi les respecter");
    expect(text).toContain(
      "- Ven. 30 oct., dîner — 2 adultes · 1 enfant, dont 1 végétarien, 1 végan, 1 sans gluten, 1 allergie arachides et fruits à coque : Soupe ; Gratin [Sans gluten]",
    );
    expect(text).toContain("- Sam. 31 oct., déjeuner — 2 adultes, dont 1 végétarien, 1 sans gluten : (menu non défini)");
    // Une même précision une seule fois ; Nina, jamais présente, n'y est pas.
    expect(text.endsWith("\n\nAutres précisions alimentaires : Pas de champignons ; Stylo d'adrénaline")).toBe(true);
    for (const p of snap.persons) expect(text).not.toContain(p.name);
  });
});

/** Alice végétarienne sans gluten, Bob végan, Léo allergique aux fruits à coque ; Nina jamais présente. */
function withDiets() {
  const base = makeSnapshot();
  const diets: Record<number, Partial<(typeof base.persons)[number]>> = {
    1: { diets: ["vegetarian", "gluten_free"] },
    2: { diets: ["vegan"], diet_note: "Pas de champignons" },
    3: { diets: ["nut_allergy"], diet_note: "Stylo d'adrénaline" },
    4: { diet_note: "Pas de champignons" },
    5: { diets: ["seafood_allergy"], diet_note: "Sans crevettes" },
  };
  return makeSnapshot({ persons: base.persons.map((p) => ({ ...p, ...diets[p.id] })) });
}

describe("régimes et allergies", () => {
  it("végétarien et végan s'excluent ; l'ordre d'affichage est conservé", () => {
    expect(toggleDiet([], "vegan", true)).toEqual(["vegan"]);
    expect(toggleDiet(["vegetarian", "gluten_free"], "vegan", true)).toEqual(["vegan", "gluten_free"]);
    expect(toggleDiet(["vegan"], "vegetarian", true)).toEqual(["vegetarian"]);
    expect(toggleDiet(["seafood_allergy"], "gluten_free", true)).toEqual(["gluten_free", "seafood_allergy"]);
    expect(toggleDiet(["vegan", "gluten_free"], "gluten_free", false)).toEqual(["vegan"]);
    expect(toggleDiet(["vegan", "gluten_free"], "vegan", false)).toEqual(["gluten_free"]);
    expect(toggleDiet(["gluten_free"], "gluten_free", true)).toEqual(["gluten_free"]);
  });

  it("signale les allergies d'une alerte, les régimes d'une pousse", () => {
    expect(DIETS.map(dietIcon)).toEqual(["🌱", "🌱", "⚠️", "⚠️", "⚠️", "⚠️"]);
  });

  it("résume les contraintes d'une personne", () => {
    const [alice, bob, , mamie] = withDiets().persons;
    expect(dietLabel(alice)).toBe("Végétarien · Sans gluten");
    expect(dietLabel(bob)).toBe("Végan · Pas de champignons");
    expect(dietLabel(mamie)).toBe("Pas de champignons");
    expect(dietLabel(makeSnapshot().persons[0])).toBe("Aucune contrainte");
    expect(withDiets().persons.map(hasDiet)).toEqual([true, true, true, true, true]);
    expect(makeSnapshot().persons.some(hasDiet)).toBe(false);
  });

  it("compte par repas les contraintes des seuls présents", () => {
    const snap = withDiets();
    const idx = buildIndex(snap);
    expect(idx.presentAt("2026-10-31", "lunch").map((p) => p.name)).toEqual(["Alice", "Mamie"]);
    const dinner = dietGroups(idx.presentAt("2026-10-30", "dinner"));
    expect(dinner.byDiet.map(({ diet, persons }) => [diet, persons.map((p) => p.name)])).toEqual([
      ["vegetarian", ["Alice"]],
      ["vegan", ["Bob"]],
      ["gluten_free", ["Alice"]],
      ["nut_allergy", ["Léo"]],
    ]);
    expect(dinner.notes.map((p) => p.name)).toEqual(["Bob", "Léo"]);
    expect(dietCountLabel(dinner)).toBe(
      "🌱 1 végétarien · 🌱 1 végan · ⚠️ 1 sans gluten · ⚠️ 1 allergie arachides et fruits à coque · 📝 2 précisions",
    );
    expect(dietCountLabel(dietGroups(idx.presentAt("2026-10-31", "lunch")))).toBe(
      "🌱 1 végétarien · ⚠️ 1 sans gluten · 📝 1 précision",
    );
    expect(dietCountLabel(dietGroups(idx.presentAt("2026-11-01", "lunch")))).toBe("");
  });

  it("accorde chaque compteur au pluriel", () => {
    const people = withDiets().persons.map((p) => ({ ...p, diets: [...DIETS] }));
    expect(dietCountLabel({ byDiet: dietGroups(people).byDiet, notes: [] })).toBe(
      "🌱 5 végétariens · 🌱 5 végans · ⚠️ 5 sans gluten · ⚠️ 5 sans lactose · ⚠️ 5 allergies arachides et fruits à coque · ⚠️ 5 allergies poisson et fruits de mer",
    );
    expect(dietCountLabel(dietGroups([people[1]]))).toContain("1 allergie poisson et fruits de mer");
  });
});

describe("présences en ensembles", () => {
  const snap = makeSnapshot();
  it("lit, compare et reconvertit les présences", () => {
    expect(slotsOf(snap, 1)).toEqual(new Set(["2026-10-30|dinner", "2026-10-31|lunch", "2026-10-30|night", "2026-10-31|night"]));
    expect(slotsOf(snap, 5)).toEqual(new Set());
    expect(sameSets([slotsOf(snap, 1), new Set(["2026-10-31|night", "2026-10-30|night", "2026-10-31|lunch", "2026-10-30|dinner"])])).toBe(
      true,
    );
    expect(sameSets([slotsOf(snap, 1), slotsOf(snap, 2)])).toBe(false);
    expect(sameSets([new Set(["a"]), new Set(["b"])])).toBe(false);
    expect(sameSets([new Set(), new Set()])).toBe(true);
    expect(toSlots(snap, new Set(["2026-10-31|lunch", "2026-10-30|dinner", "hors|séjour"]))).toEqual([
      { date: "2026-10-30", meal: "dinner" },
      { date: "2026-10-31", meal: "lunch" },
    ]);
    expect(toNights(snap, new Set(["2026-10-31|night", "2026-10-30|dinner", "2026-11-01|night", "2026-10-30|night"]))).toEqual([
      "2026-10-30",
      "2026-10-31",
    ]);
  });
});

describe("nuits", () => {
  const nights = ["2026-10-30", "2026-10-31"];
  const FRI_DINNER = "2026-10-30|dinner";
  const SAT_BREAKFAST = "2026-10-31|breakfast";
  const SAT_LUNCH = "2026-10-31|lunch";
  const SAT_DINNER = "2026-10-31|dinner";
  const SUN_BREAKFAST = "2026-11-01|breakfast";
  const FRI = nightKey("2026-10-30");
  const SAT = nightKey("2026-10-31");
  const follow = (before: string[], after: string[]) => [...followMeals(nights, new Set(before), new Set(after))].sort();

  it("libelle les nuits", () => {
    expect(FRI).toBe("2026-10-30|night");
    expect(nightsLabel(["2026-10-31", "2026-10-30"])).toBe("ven. 30, sam. 31");
    // Deux vendredis d'un long séjour restent distincts.
    expect(nightsLabel(["2026-10-30", "2026-11-06"])).toBe("ven. 30, ven. 6");
    expect(nightsLabel([])).toBe("");
  });

  it("coche la nuit quand le dîner et le petit-déj du lendemain sont là", () => {
    expect(follow([FRI_DINNER], [FRI_DINNER, SAT_BREAKFAST])).toEqual([FRI_DINNER, FRI, SAT_BREAKFAST].sort());
  });

  it("décoche la nuit quand ni l'un ni l'autre ne sont là", () => {
    expect(follow([FRI_DINNER, FRI], [FRI])).toEqual([]);
  });

  it("garde la nuit quand un seul repas l'encadre (arrivée après le dîner, nuit ailleurs)", () => {
    // Cas 1 : tout le séjour, puis plus de dîner vendredi.
    expect(follow([FRI_DINNER, SAT_BREAKFAST, FRI], [SAT_BREAKFAST, FRI])).toEqual([FRI, SAT_BREAKFAST].sort());
    // Cas 2 : plus de dîner samedi, la nuit du samedi reste à décocher à la main.
    expect(follow([SAT_DINNER, SUN_BREAKFAST, SAT], [SUN_BREAKFAST, SAT])).toEqual([SAT, SUN_BREAKFAST].sort());
    expect(follow([SUN_BREAKFAST], [SAT_DINNER, SUN_BREAKFAST])).toEqual([SAT, SAT_DINNER, SUN_BREAKFAST].sort());
  });

  it("ne touche pas aux nuits dont les repas voisins n'ont pas changé", () => {
    expect(follow([FRI_DINNER, SAT_BREAKFAST], [FRI_DINNER, SAT_BREAKFAST, SAT_LUNCH])).toEqual(
      [FRI_DINNER, SAT_BREAKFAST, SAT_LUNCH].sort(),
    );
    expect(follow([SAT], [SAT, SAT_LUNCH])).toEqual([SAT, SAT_LUNCH].sort());
  });
});

describe("couchages", () => {
  const idx = buildIndex(makeSnapshot());
  const alice = idx.personById.get(1);
  const leo = idx.personById.get(3);

  it("compte les dormeurs par nuit", () => {
    expect(idx.nightCount("2026-10-30")).toEqual({ adults: 2, children: 1, total: 3 });
    expect(idx.nightCount("2026-10-31")).toEqual({ adults: 2, children: 0, total: 2 });
    expect(idx.sleepsOn(3, "2026-10-30")).toBe(true);
    expect(idx.sleepsOn(3, "2026-10-31")).toBe(false);
    expect(idx.nightsOf(4)).toEqual([]);
    expect(idx.withoutNights().map((p) => p.name)).toEqual(["Mamie", "Nina"]);
  });

  it("occupants d'un lit et personnes sans lit, une nuit ou toutes", () => {
    expect(idx.occupants(10, null)).toEqual([
      { person: alice, nights: ["2026-10-30", "2026-10-31"] },
      { person: idx.personById.get(2), nights: ["2026-10-30", "2026-10-31"] },
    ]);
    expect(idx.occupants(10, "2026-10-31")).toHaveLength(2);
    expect(idx.unbedded(null)).toEqual([{ person: leo, nights: ["2026-10-30"] }]);
    expect(idx.unbedded("2026-10-31")).toEqual([]);
    expect(idx.bedLoad(10)).toBe(2);
    expect(idx.bedLoad(99)).toBe(0);
    expect(idx.bedCount(10, "2026-10-30")).toBe(2);
    expect(idx.occupants(99, null)).toEqual([]);
  });

  it("place libre d'un lit sur des nuits données", () => {
    const roomy = buildIndex(makeSnapshot({ person_nights: [{ person_id: 1, date: "2026-10-30", bed_id: 10 }] }));
    expect(roomy.hasRoom(10, ["2026-10-30", "2026-10-31"])).toBe(true);
    expect(idx.hasRoom(10, ["2026-10-31"])).toBe(false);
    expect(idx.hasRoom(99, ["2026-10-31"])).toBe(false);
  });

  it("précise les nuits seulement quand elles ne couvrent pas le séjour", () => {
    expect(idx.nightsNote(["2026-10-30", "2026-10-31"])).toBe("");
    expect(idx.nightsNote(["2026-10-31"])).toBe("sam. 31");
    expect(idx.nightsSuffix(["2026-10-31"])).toBe(" (sam. 31)");
    expect(idx.nightsSuffix(["2026-10-30", "2026-10-31"])).toBe("");
    expect(idx.nightsSuffix(["2026-10-30", "2026-10-31"], true)).toBe(" (ven. 30, sam. 31)");
  });

  it("plan de couchage d'une personne, lit par lit", () => {
    expect(idx.bedPlan(1)).toEqual([{ bed: idx.bedById.get(10), nights: ["2026-10-30", "2026-10-31"] }]);
    expect(idx.bedPlan(3)).toEqual([{ bed: undefined, nights: ["2026-10-30"] }]);
    expect(idx.bedPlan(4)).toEqual([]);
    const split = buildIndex(
      makeSnapshot({
        person_nights: [
          { person_id: 1, date: "2026-10-31", bed_id: null },
          { person_id: 1, date: "2026-10-30", bed_id: 10 },
        ],
      }),
    );
    expect(split.bedPlan(1).map((x) => x.nights)).toEqual([["2026-10-30"], ["2026-10-31"]]);
  });
});

describe("groupStays", () => {
  const stay = (name: string, start_date: string, end_date: string) => ({ slug: name, name, start_date, end_date, cover_version: null, households: 0, persons: 0 });
  it("sépare en cours, à venir et passés", () => {
    const stays = [
      stay("Noël", "2026-12-24", "2026-12-26"),
      stay("Été", "2026-07-01", "2026-07-08"),
      stay("Pâques", "2026-04-03", "2026-04-06"),
      stay("Aujourd'hui", "2026-10-06", "2026-10-06"),
      stay("Toussaint", "2026-10-30", "2026-11-01"),
      stay("En cours", "2026-10-04", "2026-10-08"),
      stay("Avant", "2026-10-30", "2026-11-02"),
    ];
    const { current, upcoming, past } = groupStays(stays, "2026-10-06");
    expect(current.map((s) => s.name)).toEqual(["En cours", "Aujourd'hui"]);
    expect(upcoming.map((s) => s.name)).toEqual(["Avant", "Toussaint", "Noël"]);
    expect(past.map((s) => s.name)).toEqual(["Été", "Pâques"]);
  });

  it("formate une période courte", () => {
    expect(shortRange("2026-10-30", "2026-11-01")).toBe("Ven. 30 oct. → Dim. 1 nov.");
    expect(shortRange("2026-10-30", "2026-10-30")).toBe("Ven. 30 oct.");
  });
});

describe("couverture", () => {
  it("met la version dans l'URL", () => {
    expect(coverUrl("abc", 3)).toBe("/api/stays/abc/cover?v=3");
    expect(coverThumbUrl("abc", 3)).toBe("/api/stays/abc/cover/thumb?v=3");
  });
});

describe("résumés de l'assistant", () => {
  const action = (name: string, slots: Slot[], nights: string[] = []) => ({ person_id: 1, name, slots, nights, nights_explicit: false });

  it("formate un créneau court", () => {
    expect(slotShortLabel({ date: "2026-10-30", meal: "dinner" })).toBe("ven. dîner");
    expect(slotShortLabel({ date: "2026-11-01", meal: "breakfast" })).toBe("dim. petit-déj");
    expect(slotShortLabel({ date: "2026-10-31", meal: "lunch" })).toBe("sam. déjeuner");
  });

  it("résume une proposition en fourchette, triée chronologiquement", () => {
    expect(actionSummary(action("Alice", []))).toBe("Alice : aucun repas · aucune nuit sur place");
    expect(actionSummary(action("Alice", [{ date: "2026-10-30", meal: "dinner" }]))).toBe("Alice : ven. dîner · aucune nuit sur place");
    expect(
      actionSummary(
        action("Alice", [
          { date: "2026-10-31", meal: "lunch" },
          { date: "2026-11-01", meal: "breakfast" },
          { date: "2026-10-30", meal: "dinner" },
        ]),
      ),
    ).toBe("Alice : ven. dîner → dim. petit-déj, sauf sam. petit-déj, sam. dîner · aucune nuit sur place");
    expect(
      actionSummary(
        action("Bob", [
          { date: "2026-10-31", meal: "lunch" },
          { date: "2026-10-31", meal: "dinner" },
        ]),
      ),
    ).toBe("Bob : sam. déjeuner → sam. dîner · aucune nuit sur place");
    const full = [
      { date: "2026-10-30", meal: "dinner" },
      { date: "2026-10-31", meal: "breakfast" },
      { date: "2026-10-31", meal: "lunch" },
      { date: "2026-11-01", meal: "breakfast" },
      { date: "2026-11-01", meal: "lunch" },
    ] as const;
    expect(actionSummary(action("Marie", [...full]))).toBe("Marie : ven. dîner → dim. déjeuner, sauf sam. dîner · aucune nuit sur place");
    expect(actionSummary(action("Marie", [...full, { date: "2026-10-31", meal: "dinner" }], ["2026-10-31", "2026-10-30"]))).toBe(
      "Marie : ven. dîner → dim. déjeuner · nuits : ven. 30, sam. 31",
    );
  });
});
