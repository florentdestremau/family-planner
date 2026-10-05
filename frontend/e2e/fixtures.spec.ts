import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, loginAs, openAdmin } from "./helpers";

// Séjours des fixtures (FIXTURES=true) : lecture seule, aucune écriture dans ces tests.
const PAGES = ["", "/planning", "/repas", "/corvees", "/presences", "/chambres", "/imprimer"];
const ADMIN_PAGES = ["", "/personnes", "/chambres", "/corvees", "/activites", "/menus"];

for (const slug of ["demo", "ete"]) {
  test(`toutes les pages de « ${slug} » s'affichent sans erreur ni débordement`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await loginAs(page, `/s/${slug}`, "Florent");
    for (const path of PAGES) {
      await page.goto(`/s/${slug}${path}`);
      await expect(page.locator(".content h1, .content .empty").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await openAdmin(page, slug, "demo");
    for (const path of ADMIN_PAGES) {
      await page.goto(`/s/${slug}/admin${path}`);
      await expect(page.locator(".subtabs a.active")).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
}

test("impressions et export LLM", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/s/demo/imprimer");
  const exportText = await page.locator("textarea.export").inputValue();
  expect(exportText).toContain("« Week-end chez Mamie »");
  expect(exportText).toMatch(/dîner — \d+ adultes · \d+ enfants : Soupe de potiron ; Quiche lorraine ; Salade verte/);
  await page.getByRole("button", { name: "Copier" }).click();
  await expect(page.getByRole("button", { name: "Copié ✓" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exportText);

  for (const [kind, title] of [
    ["presences", "Planning de présence"],
    ["corvees", "Répartition des corvées"],
    ["menus", "Menus"],
    ["chambres", "Chambres"],
    ["activites", "Activités"],
  ]) {
    await page.goto(`/s/demo/imprimer/${kind}`);
    await expect(page.locator(".print-header h1")).toHaveText(title);
  }

  // En mode impression, la navigation disparaît.
  await page.goto("/s/demo/imprimer/menus");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".print-toolbar")).toBeHidden();
  await expect(page.locator(".print-block").first()).toContainText("couverts");
});

test("le tableau des présences totalise les couverts", async ({ page }) => {
  await page.goto("/s/demo/presences");
  const totals = page.locator("tfoot .row-total td");
  await expect(totals.first()).toHaveText(/^\d+$/);
  const adults = await page.locator("tfoot tr").nth(0).locator("td").allTextContents();
  const children = await page.locator("tfoot tr").nth(1).locator("td").allTextContents();
  const total = await totals.allTextContents();
  total.forEach((t, i) => expect(Number(t)).toBe(Number(adults[i]) + Number(children[i])));
});
