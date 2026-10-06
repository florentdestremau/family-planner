import { expect, test } from "@playwright/test";

test("l'accueil liste tous les séjours, par période", async ({ page }) => {
  await page.goto("/");
  const list = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Séjours", exact: true }) });
  const upcoming = list.locator(".stay-group").filter({ has: page.getByRole("heading", { name: "À venir" }) });
  await expect(upcoming.getByRole("link", { name: /Grand week-end chez Mamie/ })).toContainText(/5 foyers · 14 personnes/);
  await expect(upcoming.getByRole("link", { name: /Semaine des cousins à la mer/ })).toBeVisible();

  await upcoming.getByRole("link", { name: /Grand week-end chez Mamie/ }).click();
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await expect(page.locator(".stay-name")).toHaveText("Grand week-end chez Mamie");
});

test("un séjour créé apparaît sur l'accueil, marqué organisateur pour son créateur", async ({ page, browser }) => {
  await page.goto("/");
  const name = `Pâques ${Date.now()}`;
  await page.getByLabel("Nom du séjour").fill(name);
  await page.getByRole("button", { name: "Créer le séjour" }).click();
  await expect(page.getByRole("heading", { name: "Liens de partage" })).toBeVisible();

  await page.goto("/");
  const mine = page.getByRole("link", { name: new RegExp(name) });
  await expect(mine).toContainText("organisateur");
  await expect(mine).toContainText("0 foyer · 0 personne");

  // Un autre visiteur voit le séjour, sans le badge.
  const other = await browser.newPage();
  await other.goto("/");
  await expect(other.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(other.getByRole("link", { name: new RegExp(name) })).not.toContainText("organisateur");
  await other.close();
});
