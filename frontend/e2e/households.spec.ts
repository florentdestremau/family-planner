import { expect, test } from "@playwright/test";
import { createStay, expectNoHorizontalScroll, loginAs, openAdmin, SLOTS, whoButton } from "./helpers";

test("tout adulte du foyer agit pour tous ; mes présences valent pour tout le foyer par défaut", async ({ page, request }) => {
  const stay = await createStay(request);
  const florent = await stay.person("Florent");
  await stay.person("Claire", { with: florent, partner_id: florent });
  await stay.person("Léo", { kind: "child", with: florent });
  await stay.person("Camille");
  const julien = await stay.person("Julien");
  await stay.person("Sophie", { with: julien, partner_id: julien });
  await stay.person("Mamie", { with: julien });

  await loginAs(page, stay.url, "Florent");
  const foyer = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Mon foyer" }) });
  await expect(foyer.locator(".chip")).toHaveText(["Florent", "Claire ♥", "Léo"]);

  // Mode « tout le foyer » actif par défaut : un clic coche le repas pour les trois.
  await expect(page.getByRole("checkbox", { name: "Tout le foyer a les mêmes présences" })).toBeChecked();
  await expect(page.getByText("Pour Florent, Claire, Léo.")).toBeVisible();
  await page.getByRole("button", { name: "Tout le séjour" }).click();
  await expect.poll(async () => (await stay.snap()).presences.length).toBe(18);

  // Décaler Léo : il n'arrive que samedi.
  await page.getByText("Tout le foyer a les mêmes présences").click();
  const leo = page.locator(".person-block").filter({ hasText: "Léo" });
  await leo.locator("summary").click();
  await leo.getByRole("button", { name: "Ven. 30 oct. Dîner" }).click();
  await expect(leo.locator("summary")).toContainText("5 repas");
  await expect.poll(async () => (await stay.snap()).presences.length).toBe(17);

  // Claire se connecte : elle voit le foyer, mode individuel (présences différentes).
  await page.getByRole("button", { name: "Je ne suis pas Florent" }).click();
  // Le choix rassemble les foyers : adultes à choisir, enfants pour reconnaître le foyer, puis les personnes seules.
  const famille = page.getByRole("region", { name: "Foyer Florent & Claire" });
  await expect(famille.locator(".who-pick")).toHaveText(["FFlorent", "CClaire"]);
  await expect(famille.locator(".who-children .chip")).toHaveText(["Léo"]);
  await expect(famille).toContainText("3 personnes");
  await expect(page.getByRole("region", { name: "Foyer Julien & Sophie & Mamie" }).locator(".who-pick")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Personnes seules" }).locator(".who-pick")).toHaveText(["CCamille"]);
  await expectNoHorizontalScroll(page);
  await whoButton(page, "Claire").click();
  await expect(page.getByRole("checkbox", { name: "Tout le foyer a les mêmes présences" })).not.toBeChecked();
  await expect(page.locator(".person-block")).toHaveCount(3);

  // Réactiver le mode copie mes présences (celles de Claire) à tout le foyer, après confirmation.
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Copier les présences de Claire à Florent, Léo ?");
    void d.accept();
  });
  await page.getByText("Tout le foyer a les mêmes présences").click();
  await expect.poll(async () => (await stay.snap()).presences.length).toBe(18);

  // Claire ajoute un enfant au foyer et le nomme.
  await page.getByLabel("Prénom du nouveau membre").fill("Emma");
  await page.getByLabel("Adulte ou enfant", { exact: true }).selectOption("child");
  await page.getByRole("button", { name: "Ajouter au foyer" }).click();
  await expect(foyer.locator(".chip")).toHaveText(["Claire", "Florent ♥", "Léo", "Emma"]);
  await page.getByLabel("Nom du foyer").fill("Famille Destremau");
  await page.getByLabel("Nom du foyer").blur();
  await expect.poll(async () => (await stay.snap()).households.map((h: { name: string }) => h.name).toSorted()).toEqual(["", "", "Famille Destremau"]);

  // Les présences du foyer pour les inscriptions et les corvées de chacun.
  await page.getByRole("link", { name: "Présences" }).click();
  await expect(page.locator(".row-household th")).toHaveText(["Foyer Camille", "Foyer Famille Destremau", "Foyer Julien & Sophie & Mamie"]);

  // Chez Julien, Sophie et Mamie, ajouter un adulte ne propose aucun couple.
  await page.getByRole("link", { name: "Moi" }).click();
  await page.getByRole("button", { name: "Je ne suis pas Claire" }).click();
  await whoButton(page, "Mamie").click();
  await page.getByLabel("Prénom du nouveau membre").fill("Oncle Paul");
  await expect(page.getByLabel(/En couple avec/u)).toHaveCount(0);
});

test("un nouveau venu crée son foyer et y ajoute son conjoint", async ({ page, request }) => {
  const stay = await createStay(request);
  await page.goto(stay.url);
  await page.getByLabel("Mon prénom", { exact: true }).fill("Paul");
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Paul" })).toBeVisible();
  await page.getByLabel("Prénom du nouveau membre").fill("Léa");
  await expect(page.getByLabel("En couple avec Paul")).toBeChecked();
  await page.getByRole("button", { name: "Ajouter au foyer" }).click();
  await expect.poll(async () => {
    const snap = await stay.snap();
    return snap.persons.map((p: { name: string; partner_id: number | null }) => [p.name, p.partner_id !== null]);
  }).toEqual([
    ["Léa", true],
    ["Paul", true],
  ]);
  // Un troisième adulte (Mamie) : plus de couple à proposer.
  await page.getByLabel("Prénom du nouveau membre").fill("Mamie");
  await expect(page.getByLabel(/En couple avec/u)).toHaveCount(0);
});

test("je m'ajoute d'abord, puis, si je le choisis, les membres de mon foyer", async ({ page, request }) => {
  const stay = await createStay(request);
  await stay.person("Mamie");
  await page.goto(stay.url);
  await expect(page.getByRole("heading", { name: "Je ne suis pas dans la liste" })).toBeVisible();
  await page.getByLabel("Mon prénom", { exact: true }).fill("Guillemette");
  // Les membres ne s'ouvrent qu'à la demande.
  await expect(page.getByLabel("Prénom du membre 1")).toHaveCount(0);
  await page.getByText("J'ajoute d'autres membres de mon foyer (conjoint, enfants…)").click();
  await expect(page.getByText(/Seulement les personnes qui viennent avec vous, Guillemette/u)).toBeVisible();

  // Se ressaisir parmi les membres : refusé, rien n'est créé.
  await page.getByLabel("Prénom du membre 1").fill("guillemette");
  await page.getByRole("button", { name: "Nous ajouter (2)" }).click();
  await expect(page.getByText("guillemette est saisi deux fois : vous ne vous ajoutez qu'une fois, dans « Mon prénom ».")).toBeVisible();
  expect((await stay.snap()).persons).toHaveLength(1);

  // Conjoint (adulte, en couple par défaut) puis deux enfants ; on en retire un.
  await page.getByLabel("Prénom du membre 1").fill("Arnaud");
  await expect(page.getByLabel("Membre 1 : adulte ou enfant")).toHaveValue("adult");
  await expect(page.getByLabel("En couple avec moi")).toBeChecked();
  await page.getByRole("button", { name: "+ Un autre membre" }).click();
  await page.getByLabel("Prénom du membre 2").fill("Rose");
  await expect(page.getByLabel("Membre 2 : adulte ou enfant")).toHaveValue("child");
  await page.getByRole("button", { name: "+ Un autre membre" }).click();
  await page.getByLabel("Prénom du membre 3").fill("Oubli");
  await page.getByRole("button", { name: "Retirer le membre 3" }).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Nous ajouter (3)" }).click();

  await expect(page.getByRole("heading", { name: "Bonjour Guillemette" })).toBeVisible();
  const foyer = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Mon foyer" }) });
  await expect(foyer.locator(".chip")).toHaveText(["Guillemette", "Arnaud ♥", "Rose"]);
  const snap = await stay.snap();
  const by = new Map(snap.persons.map((p) => [p.name, p]));
  expect(by.get("Arnaud")?.partner_id).toBe(by.get("Guillemette")?.id);
  expect(by.get("Rose")?.kind).toBe("child");
  expect(new Set(["Guillemette", "Arnaud", "Rose"].map((n) => by.get(n)?.household_id)).size).toBe(1);
  // Au journal, Guillemette est l'autrice des ajouts.
  const journal = await stay.pub<{ entries: { actor: string; text: string }[] }>("GET", "/journal");
  expect(journal.entries.slice(0, 3).map((e) => `${e.actor} ${e.text}`)).toEqual([
    "Guillemette a ajouté Rose (enfant) au foyer « Arnaud & Guillemette »",
    "Guillemette a ajouté Arnaud au foyer « Guillemette », en couple avec Guillemette",
    "Guillemette a rejoint le séjour",
  ]);
});

test("décocher « membres du foyer » n'ajoute que moi", async ({ page, request }) => {
  const stay = await createStay(request);
  await page.goto(stay.url);
  await expect(page.getByRole("heading", { name: "Je m'inscris" })).toBeVisible();
  await page.getByLabel("Mon prénom", { exact: true }).fill("Paul");
  await page.getByText("J'ajoute d'autres membres de mon foyer (conjoint, enfants…)").click();
  await page.getByLabel("Prénom du membre 1").fill("Léa");
  await page.getByText("J'ajoute d'autres membres de mon foyer (conjoint, enfants…)").click();
  await page.getByRole("button", { name: "M'ajouter" }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Paul" })).toBeVisible();
  expect((await stay.snap()).persons.map((p) => p.name)).toEqual(["Paul"]);
});

test("l'organisateur fusionne deux foyers puis déplace quelqu'un", async ({ page, request }) => {
  const stay = await createStay(request);
  const paul = await stay.person("Paul");
  const lea = await stay.person("Léa");
  const rose = await stay.person("Rose", { kind: "child", with: lea });
  await stay.present(rose, SLOTS.slice(0, 2));

  await openAdmin(page, stay.slug, stay.key, "Foyers");
  await expect(page.locator(".household-card")).toHaveCount(2);
  page.once("dialog", (d) => void d.accept());
  await page.getByLabel("Fusionner le foyer Léa").selectOption({ label: "Foyer Paul" });
  await expect(page.locator(".household-card")).toHaveCount(1);
  const card = page.locator(".household-card");
  await expect(card.getByLabel("Nom du foyer")).toHaveAttribute("placeholder", "Paul & Léa");
  await card.getByLabel("Couple de Paul").selectOption({ label: "♥ Léa" });
  await expect.poll(async () => (await stay.snap()).persons.find((p) => p.id === paul)?.partner_id).toBe(lea);
  expect((await stay.snap()).presences).toHaveLength(2);

  // Léa part dans un nouveau foyer : le couple est défait.
  await card.getByLabel("Déplacer Léa").selectOption("new");
  await expect(page.locator(".household-card")).toHaveCount(2);
  await expect.poll(async () => (await stay.snap()).persons.every((p: { partner_id: number | null }) => p.partner_id === null)).toBe(true);
});

test("des clics rapides ne perdent aucune présence, même si le réseau désordonne les envois", async ({ page, request }) => {
  const stay = await createStay(request);
  await stay.person("Alice");
  await loginAs(page, stay.url, "Alice");

  // Le premier envoi est ralenti : sans file d'attente, il arriverait après le second et l'écraserait.
  let first = true;
  await page.route("**/presences", async (route) => {
    if (first) {
      first = false;
      await new Promise((r) => {
        setTimeout(r, 800);
      });
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Ven. 30 oct. Dîner" }).click();
  await page.getByRole("button", { name: "Sam. 31 oct.", exact: true }).click();
  await page.getByRole("button", { name: "Dim. 1 nov. Petit-déj" }).click();
  await expect(page.getByText("5 repas sur 6")).toBeVisible();

  await expect.poll(async () => (await stay.snap()).presences.length, { timeout: 5000 }).toBe(5);
  await page.waitForTimeout(1000);
  expect((await stay.snap()).presences).toHaveLength(5);
  await page.reload();
  await expect(page.getByText("5 repas sur 6")).toBeVisible();
});

test("l'organisateur range les foyers, l'ordre est repris partout", async ({ page, request }) => {
  const stay = await createStay(request);
  for (const name of ["Anne", "Bruno", "Chloé"]) await stay.present(await stay.person(name), SLOTS.slice(0, 1));

  await openAdmin(page, stay.slug, stay.key, "Foyers");
  const order = page.locator(".household-order");
  await order.getByText("Ordre des foyers").click();
  // Sans ordre choisi : alphabétique.
  await expect(order.locator(".order-item strong")).toHaveText(["Foyer Anne", "Foyer Bruno", "Foyer Chloé"]);

  // Au clavier (comme à la souris ou au doigt, par la poignée) : Chloé remonte en tête.
  const handle = order.getByRole("button", { name: "Déplacer le foyer Chloé" });
  // La liste entière à l'écran (sur mobile, le dernier foyer est sinon sous la ligne de flottaison).
  await order.locator(".order-list").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(order.locator(".order-item-dragging")).toContainText("Chloé");
  // Une flèche par place gagnée, chacune annoncée avant la suivante.
  const live = page.locator("[id^=DndLiveRegion]");
  await page.keyboard.press("ArrowUp");
  await expect(live).toContainText("en position 2");
  await page.keyboard.press("ArrowUp");
  await expect(live).toContainText("en position 1");
  await page.keyboard.press("Space");
  await expect(order.locator(".order-item strong")).toHaveText(["Foyer Chloé", "Foyer Anne", "Foyer Bruno"]);
  await expect.poll(async () => (await stay.snap()).households.map((h: { position: number }) => h.position).toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
  await expect(page.locator(".household-card").first().getByLabel("Nom du foyer")).toHaveAttribute("placeholder", "Chloé");

  // Même ordre dans le tableau des présences.
  await page.goto(`${stay.url}/presences`);
  await expect(page.locator(".row-household th")).toHaveText(["Foyer Chloé", "Foyer Anne", "Foyer Bruno"]);
});
