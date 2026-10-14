import { expect, type Page, test } from "@playwright/test";
import { createStay, loginAs } from "./helpers";

/** Attend que l'interface soit en cache (service worker actif) et que les données soient sauvegardées. */
async function readyForOffline(page: Page, slug?: string) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate((s) => (localStorage.getItem("fp:cache") ?? "").includes(s ?? '"stays"'), slug)).toBe(true);
}

test("l'appli est installable : manifest, icônes, service worker", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await request.get(href!);
  expect(res.headers()["content-type"]).toBe("application/manifest+json");
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "Week-end en famille", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);

  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe("activated");
});

test("hors ligne, un séjour déjà ouvert reste consultable, sans modification possible", async ({ page, context, request }) => {
  const stay = await createStay(request, "Séjour hors ligne");
  const alice = await stay.person("Alice");
  await stay.present(alice);

  await loginAs(page, stay.url, "Alice");
  await expect(page.getByText("6 repas sur 6")).toBeVisible();
  await readyForOffline(page, stay.slug);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bonjour Alice" })).toBeVisible();
  await expect(page.getByText(/Hors ligne · données à \d\d:\d\d · consultation seule/)).toBeVisible();
  await expect(page.getByText("6 repas sur 6")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aucun" })).toBeDisabled();
  await expect(page.getByLabel("Nom du foyer")).toBeDisabled();

  // Les autres onglets s'affichent aussi.
  await page.getByRole("link", { name: "Repas" }).click();
  await expect(page.locator(".meal").first()).toContainText("1 adulte");
  // L'espace organisateur attend le réseau.
  await page.goto(`${stay.url}/admin`);
  await expect(page.getByText("Hors ligne : l'organisation du séjour reviendra avec le réseau.")).toBeVisible();

  // Retour du réseau : bandeau retiré, modifications possibles.
  await context.setOffline(false);
  await page.getByRole("link", { name: "Moi" }).click();
  await expect(page.getByText(/Hors ligne/)).toHaveCount(0);
  await page.getByRole("button", { name: "Aucun" }).click();
  await expect(page.getByText("Aucune présence déclarée")).toBeVisible();
  await expect.poll(async () => (await stay.snap()).presences.length).toBe(0);
});

test("hors ligne, l'accueil garde la liste et ne crée pas de séjour", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Grand week-end chez Mamie/ })).toBeVisible();
  await readyForOffline(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("link", { name: /Grand week-end chez Mamie/ })).toBeVisible();
  await expect(page.getByText(/Hors ligne · données/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer le séjour" })).toBeDisabled();

  // Un séjour jamais ouvert sur cet appareil n'est pas disponible.
  await page.goto("/s/inconnu-hors-ligne");
  await expect(page.getByText("Hors ligne : ce séjour n'a pas encore été ouvert sur cet appareil.")).toBeVisible();
});

test("bouton « Installer l'appli » : rejoue l'invite du navigateur", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Week-end en famille" })).toBeVisible();
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
    e.prompt = async () => void ((window as unknown as Record<string, boolean>).prompted = true);
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  const install = page.getByRole("button", { name: "Installer l'appli" });
  await install.click();
  expect(await page.evaluate(() => (window as unknown as Record<string, boolean>).prompted)).toBe(true);
  await expect(install).toHaveCount(0);
});

test.describe("sur iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1" });

  test("le bouton explique l'ajout à l'écran d'accueil", async ({ page }) => {
    await page.goto("/s/demo");
    await page.getByRole("button", { name: "Installer l'appli" }).click();
    const help = page.getByRole("dialog", { name: "Installer l'appli" });
    await expect(help).toContainText("Sur l'écran d'accueil");
    await help.getByRole("button", { name: "Compris" }).click();
    await expect(help).toHaveCount(0);
  });
});

/** Simule l'invite d'installation du navigateur (Chromium) ; `window.prompted` passe à true au clic. */
async function fakeInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
    e.prompt = async () => void ((window as unknown as Record<string, boolean>).prompted = true);
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
}

/** Trois pages : l'accueil, un séjour, son onglet Repas (navigation dans l'appli, sans rechargement). */
async function browseThreePages(page: Page, { beforeLast, prompt = true }: { beforeLast?: () => Promise<void>; prompt?: boolean } = {}) {
  await page.goto("/");
  if (prompt) await fakeInstallPrompt(page);
  await page.getByRole("link", { name: /Grand week-end chez Mamie/ }).click();
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await beforeLast?.();
  await page.getByRole("link", { name: "Repas" }).click();
}

const nudge = (page: Page) => page.locator(".install-nudge");

test("suggestion d'installation : sur mobile, à la 3ᵉ page, « Plus tard » est mémorisé", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "mobile seulement");
  await browseThreePages(page, { beforeLast: () => expect(nudge(page)).toHaveCount(0) });
  await expect(nudge(page)).toContainText("L'appli, même hors ligne");

  await nudge(page).getByRole("button", { name: "Plus tard" }).click();
  await expect(nudge(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Corvées" }).click();
  await page.reload();
  await fakeInstallPrompt(page);
  await page.getByRole("link", { name: "Activités" }).click();
  await expect(page.getByRole("heading", { name: /Activités|Planning/ }).first()).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
});

test("suggestion d'installation : « Installer » ouvre l'invite du navigateur", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "mobile seulement");
  await browseThreePages(page);
  await nudge(page).getByRole("button", { name: "Installer" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, boolean>).prompted)).toBe(true);
  await expect(nudge(page)).toHaveCount(0);
});

test("suggestion d'installation : jamais sur ordinateur", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "ordinateur seulement");
  await browseThreePages(page);
  await page.getByRole("link", { name: "Corvées" }).click();
  await expect(page.getByRole("button", { name: "Installer l'appli" })).toBeVisible();
  await expect(nudge(page)).toHaveCount(0);
});

test.describe("suggestion sur iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1" });

  test("« Installer » explique l'ajout depuis Safari", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "mobile seulement");
    // Safari n'a pas d'invite d'installation.
    await browseThreePages(page, { prompt: false });
    await nudge(page).getByRole("button", { name: "Installer" }).click();
    const help = page.getByRole("dialog", { name: "Installer l'appli" });
    await expect(help).toContainText("Sur l'écran d'accueil");
    await help.getByRole("button", { name: "Compris" }).click();
    await expect(help).toHaveCount(0);
    await expect(nudge(page)).toHaveCount(0);
  });
});
