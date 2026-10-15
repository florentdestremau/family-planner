import { afterEach, describe, expect, it, vi } from "vitest";
import { actorHeaders, api, ApiError, assistantAsk, assistantStatus } from "./api";

function mockFetch(status: number, body?: unknown, statusText = "Erreur") {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      typeof body === "string"
        ? new Response(body, { status, statusText })
        : new Response(body === undefined ? null : JSON.stringify(body), { status, statusText }),
    ),
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
    mockFetch(204);
    await expect(api("DELETE", "/x")).resolves.toBeUndefined();
  });

  it.each([
    [{ detail: "Ce lit est déjà complet" }, "Ce lit est déjà complet"],
    [{ detail: [{ msg: "champ requis" }, { msg: "trop long" }] }, "champ requis, trop long"],
    [{ autre: 1 }, "Erreur"],
    [{ detail: 5 }, "Erreur"],
    [{ detail: [{ msg: "a" }, 1, null, { msg: 2 }, {}] }, "a, ?, ?, ?, ?"],
    [null, "Erreur"],
    [42, "Erreur"],
    ["<html>proxy</html>", "Erreur"],
  ])("erreur %j → message « %s »", async (body, message) => {
    mockFetch(409, body);
    const error = (await api("PUT", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe(message);
  });
});

describe("api hors ligne", () => {
  it("refuse les modifications sans appeler le serveur", async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal("navigator", { onLine: false });
    const error = (await api("PUT", "/x", {}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe("Hors ligne : modification impossible.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("laisse passer les lectures (le cache prend le relais)", async () => {
    mockFetch(200, { ok: 1 });
    vi.stubGlobal("navigator", { onLine: false });
    await expect(api("GET", "/x")).resolves.toEqual({ ok: 1 });
  });

  it("réseau injoignable : message clair plutôt que « Failed to fetch »", async () => {
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>(() => Promise.reject(new TypeError("Failed to fetch"))));
    const error = (await api("PUT", "/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("Connexion impossible, réessayez.");
  });
});

describe("assistant", () => {
  it("interroge l'état de l'assistant", async () => {
    const fetchMock = mockFetch(200, { enabled: true });
    await expect(assistantStatus()).resolves.toEqual({ enabled: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant", { method: "GET", headers: {}, body: undefined });
  });

  it("envoie la demande au séjour", async () => {
    const fetchMock = mockFetch(200, { text: "Voilà", actions: [] });
    await expect(assistantAsk("voyage", 3, "On mange ?", ["Bonjour"])).resolves.toEqual({ text: "Voilà", actions: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/stays/voyage/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"person_id":3,"message":"On mange ?","history":["Bonjour"]}',
    });
  });
});

describe("auteur déclaré", () => {
  it("annonce la personne choisie et l'assistant", () => {
    expect(actorHeaders(null)).toEqual({});
    expect(actorHeaders(0)).toEqual({ "X-Actor": "0" });
    expect(actorHeaders(7, "assistant")).toEqual({ "X-Actor": "7", "X-Via": "assistant" });
  });

  it("ajoute ces en-têtes à l'appel", async () => {
    const fetchMock = mockFetch(204);
    await api("PUT", "/stays/x/persons/7/presences", { slots: [] }, null, actorHeaders(7));
    expect(fetchMock).toHaveBeenCalledWith("/api/stays/x/persons/7/presences", {
      method: "PUT",
      headers: { "X-Actor": "7", "Content-Type": "application/json" },
      body: '{"slots":[]}',
    });
  });
});
