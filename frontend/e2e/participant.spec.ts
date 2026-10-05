import { expect, test } from "@playwright/test";
import { createStay, loginAs } from "./helpers";

test("un participant s'identifie et déclare ses présences", async ({ page, request }) => {
  const stay = await createStay(request);
  await stay.person("Alice");
  await stay.person("Bob");

  await page.goto(stay.url);
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await loginAs(page, stay.url, "Alice");

  // Seule dans son foyer : une grille simple, sans option « tout le foyer ».
  await expect(page.getByText("Tout le foyer a les mêmes présences")).toHaveCount(0);
  await page.getByRole("button", { name: "Ven. 30 oct. Dîner" }).click();
  await page.getByRole("button", { name: "Sam. 31 oct.", exact: true }).click();
  await expect(page.getByText("4 repas sur 6")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByText("4 repas sur 6")).toBeVisible();
  expect((await stay.snap()).presences).toHaveLength(4);

  await page.getByRole("button", { name: "Sam. 31 oct. Petit-déj" }).click();
  await expect(page.getByText("3 repas sur 6")).toBeVisible();
  await page.getByRole("button", { name: "Aucun" }).click();
  await expect(page.getByText("Aucune présence déclarée")).toBeVisible();
  await page.getByRole("button", { name: "Tout le séjour" }).click();
  await expect(page.getByText("6 repas sur 6")).toBeVisible();

  await page.getByRole("link", { name: "Repas" }).click();
  await expect(page.locator(".meal").first()).toContainText("1 adulte");

  // Changer d'identité.
  await page.getByRole("link", { name: "Moi" }).click();
  await page.getByRole("button", { name: "Je ne suis pas Alice" }).click();
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
});

test("un nouveau venu s'ajoute lui-même", async ({ page, request }) => {
  const stay = await createStay(request);
  await page.goto(stay.url);
  await page.getByPlaceholder(/Je ne suis pas dans la liste/).fill("  Camille ");
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();
  await expect(page.locator(".who")).toHaveAttribute("title", "Changer de personne");
  await expect(page.locator(".who .avatar")).toHaveText("C");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();
});

test("inscriptions aux activités facultatives pour soi et ses enfants", async ({ page, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  await stay.person("Léo", { kind: "child", with: alice });
  await stay.person("Paul", { does_activities: false });
  const kayak = await stay.adm("POST", "/activities", { name: "Kayak", date: "2026-10-31", start_time: "14:00", optional: true });
  await stay.adm("POST", "/activities", { name: "Grand jeu", date: "2026-10-31" });

  await loginAs(page, stay.url, "Alice");
  const card = page.locator(".list-row").filter({ hasText: "Kayak" });
  await card.getByText("Léo").click();
  await expect(card.getByRole("checkbox", { name: "Léo" })).toBeChecked();
  await expect.poll(async () => (await stay.snap()).signups.length).toBe(1);

  await page.getByRole("link", { name: "Activités" }).click();
  const item = page.locator(".timeline-item").filter({ hasText: "Kayak" });
  await expect(item.getByText("1 participant")).toBeVisible();
  await item.getByText("Alice").first().click();
  await expect(item.getByText("2 participants")).toBeVisible();
  await expect(page.locator(".timeline-item").filter({ hasText: "Grand jeu" }).locator(".badge")).toHaveText("tout le monde");

  // Désinscription.
  await item.getByText("Léo").first().click();
  await expect(item.getByText("1 participant")).toBeVisible();
  expect((await stay.snap()).signups).toEqual([{ activity_id: kayak.id, person_id: alice }]);
});
