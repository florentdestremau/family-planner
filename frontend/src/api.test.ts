import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

function mockFetch(status: number, body: unknown, statusText = "Erreur") {
  const fetchMock = vi.fn(async () =>
    typeof body === "string"
      ? new Response(body, { status, statusText })
      : new Response(body === undefined ? null : JSON.stringify(body), { status, statusText }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("envoie le JSON et la clé organisateur", async () => {
    const fetchMock = mockFetch(200, { ok: 1 });
    await expect(api("POST", "/stays/x/admin/persons", { name: "A" }, "secret")).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/stays/x/admin/persons", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": "secret" },
      body: '{"name":"A"}',
    });
  });

  it("envoie un Blob tel quel, sans en-tête JSON", async () => {
    const fetchMock = mockFetch(200, { cover_version: 1 });
    const image = new Blob(["jpeg"], { type: "image/jpeg" });
    await api("PUT", "/stays/x/admin/cover", image, "secret");
    expect(fetchMock).toHaveBeenCalledWith("/api/stays/x/admin/cover", {
      method: "PUT",
      headers: { "X-Admin-Key": "secret" },
      body: image,
    });
  });

  it("n'envoie ni corps ni clé quand il n'y en a pas", async () => {
    const fetchMock = mockFetch(200, []);
    await api("GET", "/stays/x");
    expect(fetchMock).toHaveBeenCalledWith("/api/stays/x", { method: "GET", headers: {}, body: undefined });
  });

  it("204 : pas de corps", async () => {
    mockFetch(204, undefined);
    await expect(api("DELETE", "/x")).resolves.toBeUndefined();
  });

  it.each([
    [{ detail: "Ce lit est déjà complet" }, "Ce lit est déjà complet"],
    [{ detail: [{ msg: "champ requis" }, { msg: "trop long" }] }, "champ requis, trop long"],
    [{ autre: 1 }, "Erreur"],
    ["<html>proxy</html>", "Erreur"],
  ])("erreur %j → message « %s »", async (body, message) => {
    mockFetch(409, body);
    const error = (await api("PUT", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe(message);
  });
});
