import { expect, test } from "@playwright/test";
import { createStay, expectNoHorizontalScroll, loginAs, openAdmin } from "./helpers";

test("un adulte déclare les régimes de son foyer, visibles à chaque repas", async ({ page, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  const leo = await stay.person("Léo", { kind: "child", with: alice });
  const paul = await stay.person("Paul");
  for (const id of [alice, leo, paul]) await stay.present(id);
  await stay.adm("POST", "/chores/draw");

  await loginAs(page, stay.url, "Alice");
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "🥗 Régimes et allergies" }) });
  await expect(card.getByText("Visible par tous les participants du séjour")).toBeVisible();
  await expect(card.locator(".diet-row")).toHaveCount(2);
  await expect(card.locator(".diet-row").filter({ hasText: "Léo" })).toContainText("Aucune contrainte");

  // Pour Léo, enfant du foyer : une allergie et une précision.
  await card.getByRole("button", { name: "Modifier les régimes et allergies de Léo" }).click();
  const leoForm = card.getByRole("form", { name: "Régimes et allergies de Léo" });
  await leoForm.getByLabel("Allergie poisson et fruits de mer").check();
  await leoForm.getByLabel("Précision pour Léo").fill("  Allergie grave : stylo d'adrénaline ");
  await leoForm.getByRole("button", { name: "Enregistrer" }).click();
  await expect(leoForm).toHaveCount(0);
  await expect(card.locator(".diet-row").filter({ hasText: "Léo" })).toContainText(
    "Allergie poisson et fruits de mer · Allergie grave : stylo d'adrénaline",
  );

  // Pour moi : végétarien puis végan, l'un exclut l'autre.
  await card.getByRole("button", { name: "Modifier les régimes et allergies de Alice" }).click();
  const aliceForm = card.getByRole("form", { name: "Régimes et allergies de Alice" });
  await aliceForm.getByLabel("Végétarien").check();
  await aliceForm.getByLabel("Végan").check();
  await expect(aliceForm.getByLabel("Végétarien")).not.toBeChecked();
  await aliceForm.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.locator(".diet-row").filter({ hasText: "Alice" })).toContainText("Végan");
  const diets = async () => (await stay.snap()).persons.map((p: { name: string; diets: string[]; diet_note: string }) => [p.name, p.diets, p.diet_note]);
  await expect
    .poll(diets)
    .toEqual([
      ["Alice", ["vegan"], ""],
      ["Léo", ["seafood_allergy"], "Allergie grave : stylo d'adrénaline"],
      ["Paul", [], ""],
    ]);

  // Annuler ne change rien.
  await card.getByRole("button", { name: "Modifier les régimes et allergies de Alice" }).click();
  await aliceForm.getByLabel("Sans gluten").check();
  await aliceForm.getByRole("button", { name: "Annuler" }).click();
  await expect(card.locator(".diet-row").filter({ hasText: "Alice" })).not.toContainText("Sans gluten");
  await expectNoHorizontalScroll(page);

  // Corvées : les contraintes du repas à côté de chaque corvée de repas, pas des corvées « journée ».
  const chores = page.locator(".card").filter({ has: page.getByRole("heading", { name: "🧹 Corvées" }) });
  await expect(chores.locator(".list-row").first()).toBeVisible();
  const mealChores = chores.locator(".list-row").filter({ hasNotText: "Journée" });
  expect(await mealChores.count()).toBeGreaterThan(0);
  await expect(mealChores.locator("details.diets")).toHaveCount(await mealChores.count());
  await expect(chores.locator(".list-row").filter({ hasText: "Journée" }).locator("details.diets")).toHaveCount(0);

  // Repas : des nombres, les noms en dépliant.
  await page.getByRole("link", { name: "Repas" }).click();
  const meal = page.locator(".meal").first();
  await expect(meal.locator(".diets summary")).toHaveText("🌱 1 végan · ⚠️ 1 allergie poisson et fruits de mer · 📝 1 précision");
  const note = meal.getByText("Léo : Allergie grave : stylo d'adrénaline");
  await expect(note).toBeHidden();
  await meal.locator(".diets summary").click();
  await expect(note).toBeVisible();
  await expect(meal.getByText("Végan : Alice")).toBeVisible();
});

test("après l'ajout d'un membre, on propose d'indiquer ses régimes", async ({ page, request }) => {
  const stay = await createStay(request);
  await stay.person("Alice");
  await loginAs(page, stay.url, "Alice");

  await page.getByLabel("Prénom du nouveau membre").fill("Rose");
  await page.getByLabel("Adulte ou enfant").selectOption("child");
  await page.getByRole("button", { name: "Ajouter au foyer" }).click();
  await page.getByText("Régime ou allergie pour Rose ?").getByRole("button", { name: "Indiquer" }).click();
  const form = page.getByRole("form", { name: "Régimes et allergies de Rose" });
  await form.getByLabel("Sans gluten").check();
  await form.getByRole("button", { name: "Enregistrer" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Régime ou allergie pour Rose ?")).toHaveCount(0);
  await expect(page.locator(".diet-row").filter({ hasText: "Rose" })).toContainText("Sans gluten");

  // « Plus tard » : l'invitation disparaît, rien n'est déclaré.
  await page.getByLabel("Prénom du nouveau membre").fill("Bob");
  await page.getByRole("button", { name: "Ajouter au foyer" }).click();
  await page.getByText("Régime ou allergie pour Bob ?").getByRole("button", { name: "Plus tard" }).click();
  await expect(page.getByText("Régime ou allergie pour Bob ?")).toHaveCount(0);
  await expect(page.locator(".diet-row").filter({ hasText: "Bob" })).toContainText("Aucune contrainte");
});

test("l'organisateur voit les contraintes du séjour, les corrige, les imprime et les exporte sans noms", async ({ page, request }) => {
  const stay = await createStay(request);
  const anne = await stay.person("Anne");
  const paul = await stay.person("Paul");
  for (const id of [anne, paul]) await stay.present(id);
  await stay.pub("PUT", `/persons/${anne}/diet`, { diets: ["gluten_free"], diet_note: "Cœliaque" });
  await stay.adm("PUT", "/menus", { date: "2026-10-30", meal: "dinner", dishes: "Raclette" });

  // Menus : récapitulatif du séjour avec les noms, compteur sur chaque repas.
  await openAdmin(page, stay.slug, stay.key, "Menus");
  const recap = page.locator(".card").filter({ has: page.getByRole("heading", { name: "🥗 Régimes et allergies du séjour" }) });
  await expect(recap.getByText("Sans gluten : Anne")).toBeVisible();
  await expect(recap.getByText("Anne : Cœliaque")).toBeVisible();
  await expect(page.locator(".meal").first().locator(".diets summary")).toHaveText("⚠️ 1 sans gluten · 📝 1 précision");
  await expect(page.getByPlaceholder("Notes (qui apporte quoi, variante…)").first()).toBeVisible();

  // Foyers : correction d'un oubli signalé de vive voix.
  await page.locator(".subtabs").getByRole("link", { name: "Foyers" }).click();
  await page.getByRole("button", { name: "Régimes et allergies de Paul" }).click();
  const form = page.getByRole("form", { name: "Régimes et allergies de Paul" });
  await form.getByLabel("Sans lactose").check();
  await form.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".person-admin").filter({ has: page.locator('[value="Paul"]') })).toContainText("🥗 Sans lactose");

  // Fiche cuisine : les noms en entier, sans rien déplier.
  await page.goto(`${stay.url}/imprimer/menus`);
  const first = page.locator(".print-block").first();
  await expect(first.getByText("Sans gluten : Anne")).toBeVisible();
  await expect(first.getByText("Sans lactose : Paul")).toBeVisible();

  // Export LLM : des nombres et la précision, aucun nom (le cache hors ligne peut s'afficher d'abord).
  await page.goto(`${stay.url}/imprimer`);
  const exported = page.locator("textarea.export");
  await expect(exported).toHaveValue(/Ven\. 30 oct\., dîner — 2 adultes, dont 1 sans gluten, 1 sans lactose : Raclette/);
  await expect(exported).toHaveValue(/Autres précisions alimentaires : Cœliaque$/);
  expect(await exported.inputValue()).not.toMatch(/Anne|Paul/);
});
