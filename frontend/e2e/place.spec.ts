import { expect, test } from "@playwright/test";
import { createStay, expectNoHorizontalScroll, openAdmin, whoButton } from "./helpers";

const ADDRESS = "Les Granges, 12 chemin des Vignes, 26110 Nyons";
const INFO = "Portail : code 1984\nClés chez Gérard : 06 12 34 56 78\nMétéo : https://meteofrance.com.";

test("l'organisateur renseigne le lieu, la famille le retrouve en tête de « Moi » et l'imprime", async ({ page, request }) => {
  const stay = await createStay(request, "Lieu e2e");
  await stay.person("Alice");

  // Sans rien de saisi : pas de bloc vide.
  await page.goto(stay.url);
  await expect(whoButton(page, "Alice")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lieu et infos pratiques" })).toHaveCount(0);

  await openAdmin(page, stay.slug, stay.key);
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Lieu et infos pratiques/ }) });
  await expect(card.getByText(/Visible par toute personne qui ouvre l'application/)).toBeVisible();
  await card.getByLabel("Adresse", { exact: true }).fill(ADDRESS);
  await card.getByLabel("Infos pratiques").fill(INFO);
  await expect(card.getByText(`${INFO.length} / 2000`)).toBeVisible();
  // Un lien qui n'est pas Google Maps est refusé, et rien n'est enregistré.
  await card.getByLabel("Lien Google Maps").fill("https://waze.com/ul?q=Nyons");
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Le lien de carte doit être un lien Google Maps/)).toBeVisible();
  expect((await stay.snap()).stay.address).toBe("");

  await card.getByLabel("Lien Google Maps").fill("");
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Infos pratiques enregistrées 📍")).toBeVisible();
  expect((await stay.snap()).stay).toMatchObject({ address: ADDRESS, practical_info: INFO, map_url: "" });

  // Côté famille, avant même d'avoir choisi son nom.
  await page.goto(stay.url);
  const place = page.getByRole("region", { name: "Lieu et infos pratiques" });
  await expect(place.getByText(`📍 ${ADDRESS}`)).toBeVisible();
  const map = place.getByRole("link", { name: /Ouvrir dans Google Maps/ });
  await expect(map).toHaveAttribute("href", `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`);
  await expect(map).toHaveAttribute("target", "_blank");
  await expect(place.getByRole("button", { name: "Copier l'adresse" })).toBeVisible();
  await expect(place.getByText(/^Mis à jour le \d\d\/\d\d à \d\d:\d\d$/)).toBeVisible();

  // Consignes repliées ; une fois ouvertes, numéro et lien sont cliquables.
  await expect(place.getByText("Portail : code 1984")).toBeHidden();
  await place.getByText("Voir les infos pratiques").click();
  await expect(place.getByText(/Portail : code 1984/)).toBeVisible();
  await expect(place.getByRole("link", { name: "06 12 34 56 78" })).toHaveAttribute("href", "tel:0612345678");
  const weather = place.getByRole("link", { name: "https://meteofrance.com" });
  await expect(weather).toHaveAttribute("href", "https://meteofrance.com");
  await expect(weather).toHaveAttribute("rel", "noopener noreferrer");
  await expectNoHorizontalScroll(page);

  // Toujours là une fois son nom choisi.
  await whoButton(page, "Alice").click();
  await expect(page.getByRole("heading", { name: "Bonjour Alice" })).toBeVisible();
  await expect(place.getByText(`📍 ${ADDRESS}`)).toBeVisible();

  // Un lien collé passe devant le lien tiré de l'adresse.
  await stay.adm("PATCH", "/stay", { map_url: "https://maps.app.goo.gl/AbCdEf123" });
  await page.reload();
  await expect(place.getByRole("link", { name: /Ouvrir dans Google Maps/ })).toHaveAttribute("href", "https://maps.app.goo.gl/AbCdEf123");

  // Fiche à imprimer : adresse, lien collé en clair, consignes.
  await page.goto(`${stay.url}/imprimer`);
  await page.getByRole("link", { name: /Infos pratiques/ }).click();
  await expect(page.getByRole("heading", { name: "Infos pratiques" })).toBeVisible();
  await expect(page.getByText(`📍 ${ADDRESS}`)).toBeVisible();
  await expect(page.getByText("Carte : https://maps.app.goo.gl/AbCdEf123")).toBeVisible();
  await expect(page.getByText(/Clés chez Gérard/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("une fiche sans infos pratiques le dit", async ({ page, request }) => {
  const stay = await createStay(request, "Lieu vide e2e");
  await page.goto(`${stay.url}/imprimer/infos`);
  await expect(page.getByText("Aucune info pratique pour l'instant.")).toBeVisible();
});

test("enregistrer un formulaire du séjour ne vide pas la saisie en cours de l'autre", async ({ page, request }) => {
  const stay = await createStay(request, "Brouillons e2e");
  await openAdmin(page, stay.slug, stay.key);
  const place = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Lieu et infos pratiques/ }) });
  const dates = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Dates du séjour" }) });

  // Consignes en cours de saisie, puis le nom du séjour enregistré à côté.
  await place.getByLabel("Infos pratiques").fill("Portail : code 1984");
  await dates.getByLabel("Nom").fill("Toussaint renommée");
  await dates.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".stay-name")).toHaveText("Toussaint renommée");
  await expect(place.getByLabel("Infos pratiques")).toHaveValue("Portail : code 1984");

  // Et l'inverse : le nom en cours de saisie survit à l'enregistrement du lieu.
  await dates.getByLabel("Nom").fill("Nom pas encore enregistré");
  await place.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Infos pratiques enregistrées 📍")).toBeVisible();
  await expect(dates.getByLabel("Nom")).toHaveValue("Nom pas encore enregistré");
});
