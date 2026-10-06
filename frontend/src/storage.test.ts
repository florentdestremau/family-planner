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

  it("résiste à un contenu corrompu", () => {
    localStorage.setItem("fp:me:a", "{pas du json");
    expect(storage.me("a")).toBeNull();
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
    expect(storage.adminKey("a")).toBeNull();
  });
});
