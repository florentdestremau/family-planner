import { expect, test } from "@playwright/test";
import { createStay, openAdmin, whoButton } from "./helpers";

// PNG 1×1 : le navigateur le décode, le réduit et l'envoie en JPEG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("l'organisateur ajoute, voit puis retire l'image de couverture", async ({ page, request }) => {
  const stay = await createStay(request, "Couverture e2e");
  await stay.person("Alice");
  await openAdmin(page, stay.slug, stay.key);

  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Image de couverture/ }) });
  // Le champ est atteignable au clavier, via son label.
  const picker = card.getByLabel(/Choisir une image/);
  await picker.focus();
  await expect(picker).toBeFocused();
  await picker.setInputFiles({ name: "maison.png", mimeType: "image/png", buffer: PNG });
  await expect(card.getByRole("img", { name: "Image de couverture actuelle" })).toBeVisible();
  await expect(card.getByText("Changer l'image")).toBeVisible();

  const snap = await stay.snap();
  expect(snap.stay.cover_version).toBe(1);
  const image = await request.get(`/api/stays/${stay.slug}/cover?v=1`);
  expect(image.headers()["content-type"]).toBe("image/jpeg");

  // Un format que le navigateur ne décode pas part tel quel ; le serveur le refuse avec un message clair.
  await card.getByLabel(/Changer l'image/).setInputFiles({ name: "photo.heic", mimeType: "image/heic", buffer: Buffer.from("ftypheic") });
  await expect(page.getByText("Format d'image non pris en charge (JPEG, PNG ou WebP)")).toBeVisible();
  expect((await stay.snap()).stay.cover_version).toBe(1);

  // En tête du séjour, avant comme après le choix de son nom.
  await page.goto(stay.url);
  const banner = page.locator("img.stay-cover");
  await expect(banner).toBeVisible();
  await whoButton(page, "Alice").click();
  await expect(banner).toBeVisible();

  // Vignette sur l'accueil.
  await page.goto("/");
  const link = page.locator(".stay-link").filter({ hasText: "Couverture e2e" });
  await expect(link.locator("img.stay-thumb")).toBeVisible();

  // Retrait.
  await openAdmin(page, stay.slug, stay.key);
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Retirer" }).click();
  await expect(card.getByText("Choisir une image")).toBeVisible();
  expect((await stay.snap()).stay.cover_version).toBeNull();
});
