import { expect, test } from "@playwright/test";
import { createStay, expectNoHorizontalScroll, forgetMe, openAdmin } from "./helpers";

test("pas de doublon : double tap sur « M'ajouter », soi-même ajouté au foyer, homonyme à confirmer", async ({ page, request }) => {
  const stay = await createStay(request);
  const names = async () => (await stay.snap()).persons.map((p) => p.name).toSorted();

  // Florent touche deux fois « M'ajouter » : une seule personne.
  await page.goto(stay.url);
  await page.getByLabel("Mon prénom", { exact: true }).fill("Florent");
  await page.getByRole("button", { name: "M'ajouter" }).dblclick();
  await expect(page.getByRole("heading", { name: "Bonjour Florent" })).toBeVisible();
  await expect.poll(names).toEqual(["Florent"]);

  // Guillemette, à peine inscrite, saisit son propre prénom dans « Ajouter au foyer » : refusé.
  await forgetMe(page);
  await page.getByLabel("Mon prénom", { exact: true }).fill("Guillemette");
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Guillemette" })).toBeVisible();
  await expect(page.getByLabel("Prénom du nouveau membre")).toHaveAttribute("autocomplete", "off");
  await page.getByLabel("Prénom du nouveau membre").fill("guillemette");
  await page.getByRole("button", { name: "Ajouter au foyer" }).click();
  await expect(page.getByText("Guillemette fait déjà partie du foyer : saisissez le prénom de la personne à ajouter.")).toBeVisible();
  await expect.poll(names).toEqual(["Florent", "Guillemette"]);

  // Quelqu'un tape « florent » au lieu de choisir son nom : on le lui signale ; il renonce.
  await forgetMe(page);
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Déjà dans le séjour : « Florent » (foyer Florent).\n\nSi c'est vous, choisissez votre nom dans la liste. Ajouter quand même ?");
    void d.dismiss();
  });
  await page.getByLabel("Mon prénom", { exact: true }).fill("florent");
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  expect(await names()).toEqual(["Florent", "Guillemette"]);

  // Un vrai homonyme (un cousin), confirmé : ajouté.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Bonjour florent" })).toBeVisible();
  await expect.poll(names).toEqual(["Florent", "Guillemette", "florent"]);
});

test("l'organisateur retire les doublons sans perdre de présences", async ({ page, request }) => {
  const stay = await createStay(request);
  const florent = await stay.person("Florent");
  await stay.person("Carole", { with: florent, partner_id: florent });
  await stay.present(florent);
  // Les deux cas vus en production : un Florent ajouté deux fois, une Guillemette en couple avec elle-même.
  const twin = await stay.person("Florent", { allow_same_name: true });
  await stay.present(twin, [{ date: "2026-10-30", meal: "dinner" }]);
  const g1 = await stay.person("Guillemette");
  const g2 = await stay.person("Guillemette bis", { with: g1, partner_id: g1 });
  await stay.adm("PATCH", `/persons/${g2}`, { name: "Guillemette" });

  await openAdmin(page, stay.slug, stay.key, "Foyers", "Carole");
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "👯 Doublons possibles" }) });
  await expect(card.locator("li")).toHaveText([
    "Florent · foyer Florent & Carole · 6 repas, 2 nuits — gardé",
    "Florent · foyer Florent · 1 repas, 0 nuit Retirer ce doublon",
    "Guillemette · foyer Guillemette & Guillemette · aucune présence — gardé",
    "Guillemette · foyer Guillemette & Guillemette · aucune présence Retirer ce doublon",
  ]);
  await expectNoHorizontalScroll(page);

  page.once("dialog", (d) => {
    expect(d.message()).toContain("Retirer le doublon Florent · foyer Florent · 1 repas, 0 nuit ?");
    void d.accept();
  });
  await card.getByRole("button", { name: "Retirer le doublon Florent · foyer Florent · 1 repas, 0 nuit" }).click();
  await expect(card.locator("li")).toHaveCount(2);

  page.once("dialog", (d) => void d.accept());
  await card.getByRole("button", { name: /Retirer le doublon Guillemette/u }).click();
  await expect(card).toHaveCount(0);

  const snap = await stay.snap();
  expect(snap.persons.map((p) => p.name).toSorted()).toEqual(["Carole", "Florent", "Guillemette"]);
  expect(snap.households).toHaveLength(2);
  expect(snap.presences.filter((p) => p.person_id === florent)).toHaveLength(6);
  expect(snap.persons.find((p) => p.id === g1)?.partner_id).toBeNull();

  // Au journal, le geste et ce que le doublon avait.
  await page.locator(".subtabs").getByRole("link", { name: "Journal" }).click();
  await expect(page.getByText("a fusionné le doublon Florent (foyer « Florent ») dans Florent (foyer « Carole & Florent »)")).toBeVisible();
});

test("un doublon au prénom différent se fusionne depuis sa ligne", async ({ page, request }) => {
  const stay = await createStay(request);
  const florent = await stay.person("Florent");
  const flo = await stay.person("Flo");
  await stay.present(flo);
  await openAdmin(page, stay.slug, stay.key, "Foyers", "Florent");
  page.once("dialog", (d) => void d.accept());
  await page.getByLabel("Flo est un doublon de…").selectOption({ label: "Florent" });
  await expect.poll(async () => (await stay.snap()).persons.map((p) => p.id)).toEqual([florent]);
  expect((await stay.snap()).presences).toHaveLength(6);
});
