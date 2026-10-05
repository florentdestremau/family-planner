import { describe, expect, it } from "vitest";
import {
  addDays,
  buildIndex,
  countLabel,
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

  it("foyer : soi-même puis ses enfants", () => {
    expect(idx.household(undefined)).toEqual([]);
    expect(idx.household(snap.persons[0]).map((p) => p.name)).toEqual(["Alice", "Léo"]);
    expect(idx.household(snap.persons[1]).map((p) => p.name)).toEqual(["Bob"]);
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
