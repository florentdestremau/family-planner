import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, apiUpload, coverUrl } from "./api";

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

describe("apiUpload", () => {
  const file = new File(["data"], "cover.png", { type: "image/png" });

  it("envoie le fichier en multipart avec la clé organisateur", async () => {
    const fetchMock = mockFetch(200, { cover_image: "cover-abc.png" });
    await expect(apiUpload("POST", "/stays/x/admin/stay/cover", file, "secret")).resolves.toEqual({
      cover_image: "cover-abc.png",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/api/stays/x/admin/stay/cover");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers).toEqual({ "X-Admin-Key": "secret" });
    expect(call[1].body).toBeInstanceOf(FormData);
    expect((call[1].body as FormData).get("file")).toBe(file);
  });

  it("n'envoie pas la clé quand elle est absente", async () => {
    const fetchMock = mockFetch(200, { ok: 1 });
    await apiUpload("POST", "/x", file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].headers).toEqual({});
  });

  it("204 : pas de corps", async () => {
    mockFetch(204, undefined);
    await expect(apiUpload("POST", "/x", file)).resolves.toBeUndefined();
  });

  it.each([
    [{ detail: "Format non accepté" }, "Format non accepté"],
    [{ detail: 123 }, "Erreur"],
    ["<html>proxy</html>", "Erreur"],
  ])("erreur %j → message « %s »", async (body, message) => {
    mockFetch(422, body);
    const error = (await apiUpload("POST", "/x", file).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.message).toBe(message);
  });
});

describe("coverUrl", () => {
  it("retourne l'URL quand un fichier est présent", () => {
    expect(coverUrl("abc", "cover-123.png")).toBe("/uploads/abc/cover-123.png");
  });

  it("retourne null sans fichier", () => {
    expect(coverUrl("abc", null)).toBeNull();
  });
});
