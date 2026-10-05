import { afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "./storage";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("storage", () => {
  it("mémorise l'identité et la clé organisateur par séjour", () => {
    expect(storage.me("a")).toBeNull();
    storage.setMe("a", 3);
    storage.setAdminKey("a", "k");
    expect(storage.me("a")).toBe(3);
    expect(storage.me("b")).toBeNull();
    expect(storage.adminKey("a")).toBe("k");
    storage.setMe("a", null);
    expect(storage.me("a")).toBeNull();
    expect(localStorage.getItem("fp:me:a")).toBeNull();
  });

  it("garde les séjours connus, le plus récent d'abord, sans doublon, 20 au plus", () => {
    storage.rememberStay("a", "A");
    storage.rememberStay("b", "B");
    storage.rememberStay("a", "A renommé");
    expect(storage.knownStays()).toEqual([
      { slug: "a", name: "A renommé" },
      { slug: "b", name: "B" },
    ]);
    for (let i = 0; i < 30; i++) storage.rememberStay(`s${i}`, `S${i}`);
    expect(storage.knownStays()).toHaveLength(20);
    expect(storage.knownStays()[0].slug).toBe("s29");
  });

  it("résiste à un contenu corrompu", () => {
    localStorage.setItem("fp:stays", "{pas du json");
    expect(storage.knownStays()).toEqual([]);
  });

  it("résiste à un stockage indisponible (navigation privée, quota)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => storage.setMe("a", 1)).not.toThrow();
    expect(storage.me("a")).toBeNull();
    expect(storage.knownStays()).toEqual([]);
  });
});
