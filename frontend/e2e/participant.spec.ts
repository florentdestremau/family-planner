import { expect, test } from "@playwright/test";
import { createStay, loginAs, SLOTS } from "./helpers";

const signupKey = (s: { activity_id: number; person_id: number }) => `${s.activity_id}|${s.person_id}`;

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
  // Dîner du vendredi et petit-déj du samedi : la nuit du vendredi suit ; le samedi entier coche sa nuit.
  await expect(page.getByText("4 repas sur 6 · 2 nuits sur 2")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByText("4 repas sur 6 · 2 nuits sur 2")).toBeVisible();
  expect((await stay.snap()).presences).toHaveLength(4);
  expect((await stay.snap()).person_nights).toHaveLength(2);

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
  await page.getByPlaceholder(/Je ne suis pas dans la liste/u).fill("  Camille ");
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();
  await expect(page.locator(".who")).toHaveAttribute("title", "Changer de personne");
  await expect(page.locator(".who .avatar")).toHaveText("C");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();
});

test("choisir ses activités et celles de son foyer", async ({ page, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  const leo = await stay.person("Léo", { kind: "child", with: alice });
  const paul = await stay.person("Paul");
  await stay.present(alice);
  await stay.present(leo, SLOTS.filter((s) => s.date !== "2026-10-31"));
  await stay.present(paul);
  const kayak = await stay.adm<{ id: number }>("POST", "/activities", { name: "Kayak", date: "2026-10-31", start_time: "14:00" });
  const jeu = await stay.adm<{ id: number }>("POST", "/activities", { name: "Grand jeu", date: "2026-10-31", invite_all: true });

  // Accueil : seulement les activités où quelqu'un du foyer est inscrit.
  await loginAs(page, stay.url, "Alice");
  const mine = page.locator(".card").filter({ has: page.getByRole("heading", { name: "🎯 Mes activités" }) });
  await expect(mine.locator(".list-row")).toHaveCount(1);
  await expect(mine.locator(".list-row")).toContainText("Grand jeu");

  await mine.getByRole("link", { name: "Choisir mes activités →" }).click();
  const kayakItem = page.locator(".timeline-item").filter({ hasText: "Kayak" });
  await expect(kayakItem.getByText("0 inscrit")).toBeVisible();
  await expect(kayakItem.locator(".toggle").filter({ hasText: "Léo" })).toContainText("absent ce jour-là");
  await expect(kayakItem.locator(".toggle").filter({ hasText: "Alice" })).not.toContainText("absent");
  await kayakItem.locator(".toggle").filter({ hasText: "Léo" }).click();
  await expect(kayakItem.getByText("1 inscrit")).toBeVisible();
  await kayakItem.locator(".toggle").filter({ hasText: "Alice" }).click();
  await expect(kayakItem.getByText("2 inscrits")).toBeVisible();

  // Je me retire du grand jeu où l'organisateur a inscrit tout le monde.
  const jeuItem = page.locator(".timeline-item").filter({ hasText: "Grand jeu" });
  await expect(jeuItem.getByRole("checkbox", { name: "Alice" })).toBeChecked();
  await expect(jeuItem.getByText("2 inscrits")).toBeVisible();
  await jeuItem.locator(".toggle").filter({ hasText: "Alice" }).click();
  await expect(jeuItem.getByText("1 inscrit")).toBeVisible();

  await expect
    .poll(async () => (await stay.snap()).signups.map(signupKey).toSorted())
    .toEqual([`${kayak.id}|${alice}`, `${kayak.id}|${leo}`, `${jeu.id}|${paul}`].toSorted());

  // L'accueil suit : le kayak, avec Alice et Léo.
  await page.getByRole("link", { name: "🏠 Moi" }).click();
  await expect(mine.locator(".list-row")).toHaveCount(1);
  await expect(mine.locator(".list-row")).toContainText("Kayak");
  await expect(mine.locator(".chip")).toHaveText(["Alice", "Léo"]);
});
