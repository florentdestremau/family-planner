import { expect, test } from "@playwright/test";
import { createStay, forgetMe, openAdmin, whoButton } from "./helpers";

// PNG 1×1 : déjà petit, il part tel quel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("l'organisateur ajoute, voit puis retire l'image de couverture", async ({ page, request }) => {
  const stay = await createStay(request, "Couverture e2e");
  await stay.person("Alice");
  await openAdmin(page, stay.slug, stay.key);

  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: /Image de couverture/u }) });
  // Le champ est atteignable au clavier, via son label.
  const picker = card.getByLabel(/Choisir une image/u);
  await picker.focus();
  await expect(picker).toBeFocused();
  await picker.setInputFiles({ name: "maison.png", mimeType: "image/png", buffer: PNG });
  await expect(card.getByRole("img", { name: "Couverture actuelle du séjour" })).toBeVisible();
  await expect(card.getByText("Changer l'image")).toBeVisible();

  const v1 = (await stay.snap()).stay.cover_version ?? 0;
  expect(v1).toBeGreaterThan(0);
  const image = await request.get(`/api/stays/${stay.slug}/cover?v=${v1}`);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["cache-control"]).toContain("immutable");

  // Un format que le navigateur ne décode pas part tel quel ; le serveur le refuse avec un message clair.
  await card.getByLabel(/Changer l'image/u).setInputFiles({ name: "photo.heic", mimeType: "image/heic", buffer: Buffer.from("ftypheic") });
  await expect(page.getByText("Format d'image non pris en charge (JPEG, PNG ou WebP)")).toBeVisible();
  // Trop lourd pour le serveur : refusé avant l'envoi.
  await card.getByLabel(/Changer l'image/u).setInputFiles({ name: "photo.heic", mimeType: "image/heic", buffer: Buffer.alloc(6_000_000) });
  await expect(page.getByText("Image trop lourde (au plus 5 Mo)")).toBeVisible();
  expect((await stay.snap()).stay.cover_version).toBe(v1);

  // Grande image avec transparence : réduite dans le navigateur et envoyée en WebP.
  const big = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 2400, height: 800 });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d indisponible");
    ctx.fillStyle = "rgba(200, 80, 40, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await card.getByLabel(/Changer l'image/u).setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.from(big, "base64") });
  await expect(card.getByRole("img", { name: "Couverture actuelle du séjour" })).not.toHaveAttribute("src", new RegExp(`v=${v1}$`, "u"));
  const v2 = (await stay.snap()).stay.cover_version ?? 0;
  expect(v2).toBeGreaterThan(v1);
  expect((await request.get(`/api/stays/${stay.slug}/cover?v=${v2}`)).headers()["content-type"]).toBe("image/webp");

  // En tête du séjour, avant comme après le choix de son nom.
  await page.goto(stay.url);
  await forgetMe(page); // l'organisateur s'était désigné
  const banner = page.locator("img.stay-cover");
  await expect(banner).toBeVisible();
  await whoButton(page, "Alice").click();
  await expect(banner).toBeVisible();

  // Vignette sur l'accueil : la petite image carrée, pas la couverture entière.
  await page.goto("/");
  const thumb = page.locator(`.stay-link[href*="${stay.slug}"] img.stay-thumb`);
  await expect(thumb).toBeVisible();
  await expect(thumb).toHaveAttribute("src", `/api/stays/${stay.slug}/cover/thumb?v=${v2}`);

  // Retrait, puis nouvelle image : jamais la version d'avant (le navigateur la garde en cache).
  await openAdmin(page, stay.slug, stay.key);
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Retirer" }).click();
  await expect(card.getByText("Choisir une image")).toBeVisible();
  expect((await stay.snap()).stay.cover_version).toBeNull();
  await card.getByLabel(/Choisir une image/u).setInputFiles({ name: "maison.png", mimeType: "image/png", buffer: PNG });
  await expect(card.getByText("Changer l'image")).toBeVisible();
  expect((await stay.snap()).stay.cover_version).toBeGreaterThan(v2);
});
