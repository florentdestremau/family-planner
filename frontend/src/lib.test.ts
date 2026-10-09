import { describe, expect, it } from "vitest";
import {
  addDays,
  groupStays,
  shortRange,
  sameSets,
  slotsOf,
  toSlots,
  buildIndex,
  countLabel,
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

  it("participants : inscrits si facultative, sinon présents ce jour-là qui participent aux activités", () => {
    const [optional, mandatory] = snap.activities;
    expect(idx.activityParticipants(optional).map((p) => p.name)).toEqual(["Léo"]);
    // Mamie est présente le 31 mais ne participe pas aux activités ; Bob et Léo ne sont là que le 30.
    expect(idx.activityParticipants(mandatory).map((p) => p.name)).toEqual(["Alice"]);
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
  });
});

describe("présences en ensembles", () => {
  const snap = makeSnapshot();
  it("lit, compare et reconvertit les présences", () => {
    expect(slotsOf(snap, 1)).toEqual(new Set(["2026-10-30|dinner", "2026-10-31|lunch"]));
    expect(slotsOf(snap, 5)).toEqual(new Set());
    expect(sameSets([slotsOf(snap, 1), new Set(["2026-10-31|lunch", "2026-10-30|dinner"])])).toBe(true);
    expect(sameSets([slotsOf(snap, 1), slotsOf(snap, 2)])).toBe(false);
    expect(sameSets([new Set(["a"]), new Set(["b"])])).toBe(false);
    expect(sameSets([new Set(), new Set()])).toBe(true);
    expect(toSlots(snap, new Set(["2026-10-31|lunch", "2026-10-30|dinner", "hors|séjour"]))).toEqual([
      { date: "2026-10-30", meal: "dinner" },
      { date: "2026-10-31", meal: "lunch" },
    ]);
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
  });
});
