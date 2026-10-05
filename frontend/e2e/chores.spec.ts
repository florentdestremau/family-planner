import { expect, test } from "@playwright/test";
import { createStay, loginAs, openAdmin } from "./helpers";

test("tirage au sort, visibilité pour chacun, ajustement manuel", async ({ page, request }) => {
  const stay = await createStay(request);
  const ids: Record<string, number> = {};
  for (const name of ["Alice", "Bob", "Chloé", "David", "Emma", "Fred"]) ids[name] = await stay.person(name);
  await stay.adm("PUT", `/persons/${ids.Alice}/partner`, { partner_id: ids.Bob });
  await stay.adm("PUT", `/persons/${ids.Chloé}/partner`, { partner_id: ids.David });
  for (const id of Object.values(ids)) await stay.present(id);

  await openAdmin(page, stay.slug, stay.key, "Corvées");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Tirer au sort/ }).click();
  await expect(page.locator(".toast")).toContainText("affectations");
  await expect(page.getByRole("button", { name: /Re-répartir/ })).toBeVisible();
  await expect(page.locator(".badge-warn")).toHaveCount(0);

  // Règles vérifiées sur les données.
  const snap = await stay.snap();
  const teams = new Map<string, number[]>();
  for (const a of snap.chore_assignments) {
    const key = `${a.chore_type_id}|${a.date}|${a.moment}`;
    teams.set(key, [...(teams.get(key) ?? []), a.person_id]);
  }
  for (const team of teams.values()) {
    expect(team.includes(ids.Alice) && team.includes(ids.Bob)).toBe(false);
    expect(team.includes(ids.Chloé) && team.includes(ids.David)).toBe(false);
  }
  const load = Object.values(ids).map((id) => snap.chore_assignments.filter((a: { person_id: number }) => a.person_id === id).length);
  expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(1);

  // Ajustement : retirer quelqu'un fait apparaître « manquant », le remplacer le fait disparaître.
  const row = page.locator(".card").filter({ hasText: "Vendredi 30 octobre" }).locator(".list-row").first();
  await row.locator(".chip-x").first().click();
  await expect(row.locator(".badge-warn")).toHaveText("1 manquant");
  await row.locator(".add-select").selectOption({ index: 1 }); // le mieux placé : jamais un conjoint
  await expect(row.locator(".badge-warn")).toHaveCount(0);

  // Chaque participant voit ses corvées.
  const mine = (await stay.snap()).chore_assignments.filter((a: { person_id: number }) => a.person_id === ids.Emma).length;
  await loginAs(page, stay.url, "Emma");
  await expect(page.locator(".card").filter({ hasText: "Corvées" }).locator(".list-row")).toHaveCount(mine);
  await page.getByRole("link", { name: "Corvées" }).click();
  await expect(page.locator(".chip-me").first()).toHaveText("Emma");
  await page.getByRole("button", { name: "Par personne" }).click();
  await expect(page.locator(".card-me .badge")).toHaveText(String(mine));
});

test("re-répartir demande confirmation", async ({ page, request }) => {
  const stay = await createStay(request);
  for (const name of ["A", "B", "C"]) await stay.present(await stay.person(name));
  await stay.adm("POST", "/chores/draw");
  const before = (await stay.snap()).chore_assignments;

  await openAdmin(page, stay.slug, stay.key, "Corvées");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: /Re-répartir/ }).click();
  await page.waitForTimeout(300);
  expect((await stay.snap()).chore_assignments).toEqual(before);
});

test("modifier les types de corvées", async ({ page, request }) => {
  const stay = await createStay(request);
  await openAdmin(page, stay.slug, stay.key, "Corvées");
  await page.getByRole("button", { name: "+ Corvée" }).click();
  await page.getByLabel("Nom").fill("Courses");
  await page.getByLabel("Dîner").uncheck();
  await page.getByLabel("Journée").check();
  await page.getByLabel("Tous les … jours").fill("2");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".list-row").filter({ hasText: "Courses" })).toContainText("Journée · 2 pers. · tous les 2 jours");

  page.once("dialog", (d) => d.accept());
  await page.locator(".list-row").filter({ hasText: "Courses" }).getByRole("button", { name: "×" }).click();
  await expect(page.locator(".list-row").filter({ hasText: "Courses" })).toHaveCount(0);
});

test("l'ajout manuel propose d'abord les moins chargés et signale les couples", async ({ page, request }) => {
  const stay = await createStay(request);
  const a = await stay.person("Alice");
  const b = await stay.person("Bob");
  const c = await stay.person("Chloé");
  await stay.adm("PUT", `/persons/${a}/partner`, { partner_id: b });
  for (const id of [a, b, c]) await stay.present(id);
  const chore = (await stay.snap()).chore_types[0].id;
  await stay.adm("PUT", "/chores/occurrence", { chore_type_id: chore, date: "2026-10-31", moment: "lunch", person_ids: [a] });
  await stay.adm("PUT", "/chores/occurrence", { chore_type_id: chore, date: "2026-10-31", moment: "dinner", person_ids: [c] });

  await openAdmin(page, stay.slug, stay.key, "Corvées");
  const row = page.locator(".card").filter({ hasText: "Samedi 31 octobre" }).locator(".list-row").filter({ hasText: "Cuisine" }).filter({ hasText: "Déjeuner" });
  const options = await row.locator(".add-select option").allTextContents();
  expect(options).toEqual(["+ Ajouter…", "Chloé — 1 corvée", "Bob — 0 corvée · ♥ en couple avec un inscrit"]);
});
