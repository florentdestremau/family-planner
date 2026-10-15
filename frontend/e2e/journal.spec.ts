import { expect, test } from "@playwright/test";
import type { JournalPage } from "../src/api";
import { createStay, expectNoHorizontalScroll, json, loginAs, openAdmin, SLOTS } from "./helpers";

test("chacun voit qui a changé quoi ; l'organisateur a le détail", async ({ page, request }) => {
  const stay = await createStay(request, "Journal e2e");
  const marie = await stay.person("Marie");
  const paul = await stay.person("Paul");
  await stay.present(marie);
  await stay.present(paul);

  // Marie retire son dîner du samedi depuis « Moi » : la ligne apparaît à son nom.
  await loginAs(page, stay.url, "Marie");
  await page.getByRole("button", { name: "Sam. 31 oct. Dîner" }).click();
  const recent = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Activité récente/u }) });
  const line = "Marie a modifié les présences de Marie — repas retiré : sam. 31/10 (dîner)";
  await expect(recent.locator(".journal-entry").first()).toContainText(line);
  await expect(recent.locator(".journal-entry").first()).toContainText("à l'instant");
  await expect(recent.locator(".journal-entry")).toHaveCount(5);

  // Page complète : « Me concerne » écarte ce qui ne touche que Paul et la création du séjour.
  await recent.getByRole("link", { name: "Tout voir →" }).click();
  await expect(page.getByRole("heading", { name: /Activité du séjour/u })).toBeVisible();
  await expect(page.getByText("Séjour « Journal e2e » créé")).toBeVisible();
  await page.getByRole("button", { name: "Me concerne" }).click();
  await expect(page.getByRole("button", { name: "Me concerne" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Séjour « Journal e2e » créé")).toHaveCount(0);
  await expect(page.locator(".journal-entry")).toHaveCount(3);
  await expect(page.locator(".journal-entry").filter({ hasText: "de Paul" })).toHaveCount(0);
  await expect(page.getByText("Détail")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // L'organisatrice (Marie, déjà désignée) tire au sort, vide un créneau à la main, puis relance le
  // tirage : il remplit ce créneau, et le détail garde l'équipe d'avant.
  await openAdmin(page, stay.slug, stay.key, "Corvées");
  await page.getByRole("button", { name: /Tirer au sort/u }).click();
  await expect(page.locator(".toast").last()).toContainText(/créneau/u);
  const first = (await stay.snap()).chore_assignments.at(0);
  if (first === undefined) throw new Error("tirage vide");
  await stay.adm("PUT", "/chores/occurrence", { chore_type_id: first.chore_type_id, date: first.date, moment: first.moment, person_ids: [] });
  await page.reload();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /Re-répartir/u }).click();
  await expect.poll(async () => (await adminJournal()).entries[0]?.text ?? "").toMatch(/^a relancé le tirage des corvées/u);
  await page.locator(".subtabs").getByRole("link", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: /Journal du séjour/u })).toBeVisible();
  const redraw = page.locator(".journal-entry").first();
  await expect(redraw).toContainText("Marie a relancé le tirage des corvées");
  await redraw.getByText("Détail").click();
  await expect(redraw.locator(".pre")).toContainText("personne → ");
  await expect(page.locator(".journal-entry").filter({ hasText: "a tiré au sort les corvées" })).toHaveCount(1);
  await expectNoHorizontalScroll(page);

  async function adminJournal() {
    return json<JournalPage>(await request.get(`/api/stays/${stay.slug}/admin/journal`, { headers: { "X-Admin-Key": stay.key } }));
  }
});

test("l'espace organisateur demande qui l'on est, et signe ses gestes", async ({ page, request }) => {
  const stay = await createStay(request, "Orga e2e");
  await stay.person("Alice");

  // Anne ne vient pas au séjour : elle s'ajoute quand même, sans présences.
  await page.goto(`${stay.url}/admin?key=${stay.key}`);
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liens de partage" })).toHaveCount(0);
  await page.getByPlaceholder("Je ne suis pas dans la liste : mon prénom").fill("Anne");
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Liens de partage" })).toBeVisible();
  await expect(page.locator(".who-name")).toHaveText("Anne");

  await page.locator(".subtabs").getByRole("link", { name: "Chambres" }).click();
  await page.getByPlaceholder("Nouvelle chambre").fill("Grenier");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.locator(".subtabs").getByRole("link", { name: "Journal" }).click();
  const entries = page.locator(".journal-entry");
  await expect(entries.nth(0)).toContainText("Anne a créé la chambre « Grenier »");
  await expect(entries.nth(1)).toContainText("Anne a rejoint le séjour");
  expect((await stay.snap()).presences).toEqual([]);
});

test("les présences saisies par l'assistant sont signées « via l'assistant »", async ({ page, request }) => {
  test.skip(!!process.env.E2E_BASE_URL, "assistant réel sur l'environnement distant");
  const stay = await createStay(request);
  await stay.person("Alice");
  await loginAs(page, stay.url, "Alice");
  await page.getByRole("button", { name: "Ouvrir l'assistant" }).click();
  await page.getByLabel("Message à l'assistant").fill("Je viens le vendredi soir");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await page.locator(".assistant-card").getByRole("button", { name: "Valider Alice" }).click();
  await expect(page.getByText("Présences de Alice enregistrées")).toBeVisible();
  await page.getByRole("button", { name: "Fermer le panneau" }).click();
  await expect(page.locator(".journal-entry").first()).toContainText(
    "Alice, via l'assistant, a modifié les présences d'Alice — repas ajouté : ven. 30/10 (dîner)",
  );
});

test("hors ligne, le journal attend le réseau", async ({ page, context, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  await stay.present(alice, SLOTS.slice(0, 1));
  await loginAs(page, stay.url, "Alice");
  const recent = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Activité récente/u }) });
  await expect(recent.locator(".journal-entry").first()).toBeVisible();

  await context.setOffline(true);
  await expect(recent.getByText("Le journal est disponible avec le réseau.")).toBeVisible();
  await recent.getByRole("link", { name: "Tout voir →" }).click();
  await expect(page.getByText("Le journal est disponible avec le réseau.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator(".journal-entry").first()).toBeVisible();
});
