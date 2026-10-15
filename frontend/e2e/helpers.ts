import { type APIRequestContext, type APIResponse, expect, type Page } from "@playwright/test";
import type { Person, Snapshot } from "../src/api";

export const SLOTS = [
  { date: "2026-10-30", meal: "dinner" },
  { date: "2026-10-31", meal: "breakfast" },
  { date: "2026-10-31", meal: "lunch" },
  { date: "2026-10-31", meal: "dinner" },
  { date: "2026-11-01", meal: "breakfast" },
  { date: "2026-11-01", meal: "lunch" },
];

/** Séjour créé par l'API, avec des raccourcis publics et organisateur. */
export const json = <T>(res: APIResponse): Promise<T> => res.json() as Promise<T>;

export async function createStay(request: APIRequestContext, stayName = "Toussaint e2e") {
  const res = await request.post("/api/stays", {
    data: { name: stayName, start_date: "2026-10-30", end_date: "2026-11-01", first_meal: "dinner", last_meal: "lunch" },
  });
  expect(res.status()).toBe(201);
  const { slug, admin_key: key } = await json<{ slug: string; admin_key: string }>(res);
  const base = `/api/stays/${slug}`;
  const call = async <T = unknown>(method: string, path: string, data?: unknown, admin = false): Promise<T> => {
    const r = await request.fetch(`${base}${admin ? "/admin" : ""}${path}`, {
      method,
      data,
      headers: admin ? { "X-Admin-Key": key } : {},
    });
    expect(r.ok(), `${method} ${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
    return r.status() === 204 ? (undefined as T) : json<T>(r);
  };
  const stay = {
    slug,
    key,
    url: `/s/${slug}`,
    adminUrl: `/s/${slug}/admin?key=${key}`,
    pub: <T = unknown>(method: string, path: string, data?: unknown) => call<T>(method, path, data),
    adm: <T = unknown>(method: string, path: string, data?: unknown) => call<T>(method, path, data, true),
    snap: () => call<Snapshot>("GET", ""),
    /** Crée une personne, dans son propre foyer ou dans celui de `extra.with`. */
    person: async (name: string, extra: Record<string, unknown> = {}) => {
      const { with: withId, ...rest } = extra;
      const body: Record<string, unknown> = { name, ...rest };
      if (withId !== undefined) {
        const snap = await call<Snapshot>("GET", "");
        body.household_id = snap.persons.find((p) => p.id === withId)?.household_id;
      }
      return (await call<Person>("POST", "/persons", body, true)).id;
    },
    present: (id: number, slots = SLOTS) => call("PUT", `/persons/${id}/presences`, { slots }),
  };
  return stay;
}

/** Bouton « c'est moi » d'une personne : initiale, prénom, puis éventuellement son foyer. */
export function whoButton(page: Page, name: string) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return page.getByRole("button", { name: new RegExp(`^. ${escaped}( Foyer .*)?$`, "u") });
}

/** Ouvre le séjour en tant que `name` (identité mémorisée localement). */
export async function loginAs(page: Page, url: string, name: string) {
  await page.goto(url);
  await whoButton(page, name).click();
  await expect(page.getByRole("heading", { name: `Bonjour ${name}` })).toBeVisible();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "défilement horizontal de la page").toBeLessThanOrEqual(0);
}

/** Ouvre l'espace organisateur par le lien avec clé, et attend que la clé soit mémorisée. */
export async function openAdmin(page: Page, slug: string, key: string, section?: string) {
  await page.goto(`/s/${slug}/admin?key=${key}`);
  await expect(page.getByRole("heading", { name: "Liens de partage" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/s/${slug}/admin$`, "u"));
  if (section) {
    await page.locator(".subtabs").getByRole("link", { name: section }).click();
  }
}
