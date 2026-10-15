import { expect, test } from "@playwright/test";
import { createStay, loginAs, openAdmin, SLOTS } from "./helpers";

test("arrivée après le dîner : la nuit reste, et se décoche à part", async ({ page, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  await loginAs(page, stay.url, "Alice");

  await page.getByRole("button", { name: "Tout le séjour" }).click();
  await expect(page.getByText("6 repas sur 6 · 2 nuits sur 2")).toBeVisible();
  // Plus de dîner vendredi : le petit-déj du samedi ne dit pas où elle a dormi, la nuit reste cochée.
  await page.getByRole("button", { name: "Ven. 30 oct. Dîner" }).click();
  await expect(page.getByText("5 repas sur 6 · 2 nuits sur 2")).toBeVisible();
  // Nuit du samedi passée ailleurs : elle se décoche seule, sans toucher aux repas.
  await page.getByRole("button", { name: "Nuit du Sam. 31 oct." }).click();
  await expect(page.getByText("5 repas sur 6 · 1 nuit sur 2")).toBeVisible();
  await expect
    .poll(async () => (await stay.snap()).person_nights.map((n: { person_id: number; date: string }) => [n.person_id, n.date]))
    .toEqual([[alice, "2026-10-30"]]);
});

test("une chambre double sert à un couple vendredi et à un autre samedi", async ({ page, request }) => {
  const stay = await createStay(request);
  const [a, c] = [await stay.person("Alice"), await stay.person("Chloé")];
  const b = await stay.person("Bob", { with: a });
  const d = await stay.person("David", { with: c });
  await stay.adm("PUT", `/persons/${a}/partner`, { partner_id: b });
  await stay.adm("PUT", `/persons/${c}/partner`, { partner_id: d });
  for (const id of [a, b]) await stay.pub("PUT", `/persons/${id}/presences`, { slots: SLOTS.slice(0, 2), nights: ["2026-10-30"] });
  for (const id of [c, d]) await stay.pub("PUT", `/persons/${id}/presences`, { slots: SLOTS.slice(3), nights: ["2026-10-31"] });
  const eve = await stay.person("Eve");
  await stay.pub("PUT", `/persons/${eve}/presences`, { slots: [], nights: ["2026-10-30", "2026-10-31"] });
  const room = await stay.adm<{ id: number }>("POST", "/rooms", { name: "Chambre d'amis" });
  await stay.adm("POST", `/rooms/${room.id}/beds`, { kind: "double" });

  await openAdmin(page, stay.slug, stay.key, "Chambres");
  await expect(page.locator("p", { hasText: "Sans lit :" })).toContainText("Alice (ven. 30)");
  await page.getByRole("button", { name: /Proposer une répartition/u }).click();
  await expect(page.getByText("4 nuitée(s) attribuée(s)")).toBeVisible();
  const bed = page.locator(".bed").first();
  for (const name of ["Alice ven. 30", "Bob ven. 30", "Chloé sam. 31", "David sam. 31"]) await expect(bed).toContainText(name);
  // Eve dort là les deux nuits : le lit, plein chaque nuit, ne la propose pas (plus de 409 à la clé).
  await expect(page.locator("p", { hasText: "Sans lit :" })).toContainText("Eve");
  await expect(bed.locator(".add-select")).toHaveCount(0);

  // Nuit du vendredi seule : le premier couple.
  await page.getByRole("group", { name: "Nuit" }).getByRole("button", { name: "🌙 Ven. 30 oct." }).click();
  await expect(bed.locator(".chip")).toHaveCount(2);
  await expect(bed).toContainText("Alice");
  await expect(bed).not.toContainText("Chloé");
});
