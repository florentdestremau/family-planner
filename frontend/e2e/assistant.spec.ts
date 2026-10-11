import { expect, test } from "@playwright/test";
import { createStay, loginAs } from "./helpers";

test("l'assistant propose les présences du foyer, on les valide ou ignore", async ({ page, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  await stay.person("Bob", { with: alice });

  await loginAs(page, stay.url, "Alice");

  // Le bouton flottant n'apparaît que si l'assistant est activé (ici : mode démo ASSISTANT_STUB).
  await expect(page.getByRole("button", { name: "Ouvrir l'assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir l'assistant" }).click();

  await page.getByLabel("Message à l'assistant").fill("On mange tous le vendredi soir ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("Voici ma proposition")).toBeVisible();

  const aliceCard = page.locator(".assistant-card", { hasText: "Alice : ven. dîner" });
  const bobCard = page.locator(".assistant-card", { hasText: "Bob : ven. dîner" });
  await expect(aliceCard).toBeVisible();

  await aliceCard.getByRole("button", { name: "Valider Alice" }).click();
  await expect(page.getByText("Présences de Alice enregistrées")).toBeVisible();

  await expect(bobCard).toBeVisible();
  await bobCard.getByRole("button", { name: "Ignorer Bob" }).click();
  await expect(page.locator(".assistant-card")).toHaveCount(0);

  // Le toast n'apparaît qu'une fois les présences enregistrées : plus rien à attendre côté serveur.
  expect((await stay.snap()).presences).toEqual([{ person_id: alice, date: "2026-10-30", meal: "dinner" }]);
});

test("l'assistant reste hors de portée sans identité choisie", async ({ page, request }) => {
  const stay = await createStay(request);
  await stay.person("Alice");
  await page.goto(stay.url);
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir l'assistant" })).toHaveCount(0);
});