import { expect, test } from "@playwright/test";
import { createStay, loginAs } from "./helpers";

test("un participant s'identifie, déclare ses présences et celles de son enfant", async ({ page, request }) => {
  const stay = await createStay(request);
  await stay.person("Alice");
  await stay.person("Bob");

  await page.goto(stay.url);
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await loginAs(page, stay.url, "Alice");

  // Premier repas puis journée de samedi entière, puis rechargement : tout est persisté.
  const grid = page.locator(".person-block[open]");
  await grid.getByRole("button", { name: "Ven. 30 oct. Dîner" }).click();
  await grid.getByRole("button", { name: "Sam. 31 oct.", exact: true }).click();
  await expect(grid.getByText("4 repas sur 6")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator(".person-block[open]").getByText("4 repas sur 6")).toBeVisible();
  const snap = await stay.snap();
  expect(snap.presences).toHaveLength(4);

  // Décocher un repas, « Aucun », « Tout le séjour ».
  await grid.getByRole("button", { name: "Sam. 31 oct. Petit-déj" }).click();
  await expect(grid.getByText("3 repas sur 6")).toBeVisible();
  await grid.getByRole("button", { name: "Aucun" }).click();
  await expect(grid.getByText("Aucune présence déclarée")).toBeVisible();
  await grid.getByRole("button", { name: "Tout le séjour" }).click();
  await expect(grid.getByText("6 repas sur 6")).toBeVisible();

  // Ajout d'un enfant, puis ses présences.
  await page.getByPlaceholder("Ajouter un enfant à ma charge").fill("Léo");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  const leo = page.locator(".person-block").filter({ hasText: "Léo" });
  await expect(leo.locator(".badge")).toHaveText("enfant");
  await leo.locator("summary").click();
  await leo.getByRole("button", { name: "Tout le séjour" }).click();
  await expect(leo.getByText("6 repas sur 6")).toBeVisible();

  // Les couverts en tiennent compte.
  await page.getByRole("link", { name: "Repas" }).click();
  await expect(page.locator(".meal").first()).toContainText("1 adulte · 1 enfant");

  // Changer d'identité.
  await page.getByRole("link", { name: "Moi" }).click();
  await page.getByRole("button", { name: "Je ne suis pas Alice" }).click();
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Léo" })).toHaveCount(0); // les enfants n'ont pas de compte
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
  await stay.person("Léo", { kind: "child", guardian_id: alice });
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
