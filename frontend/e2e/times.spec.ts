import { expect, test } from "@playwright/test";
import type { Snapshot } from "../src/api";
import { createStay, expectNoHorizontalScroll, loginAs, openAdmin } from "./helpers";

const timesOf = (snap: Snapshot) => snap.persons.map((p) => [p.name, p.arrival_time, p.departure_time, p.times_note]);

test("un adulte donne les heures de son foyer, visibles dans le planning", async ({ page, request }) => {
  const stay = await createStay(request);
  const alice = await stay.person("Alice");
  const bob = await stay.person("Bob", { with: alice });
  const paul = await stay.person("Paul", { with: alice });
  const mamie = await stay.person("Mamie");
  await stay.person("Nina", { with: alice, kind: "child" }); // sans présence : pas d'heure possible
  for (const id of [alice, bob, paul, mamie]) await stay.present(id);

  await loginAs(page, stay.url, "Alice");
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "✅ Présences" }) });
  const invite = card.getByText("À quelle heure arrivez-vous ?");
  await expect(invite).toBeVisible();
  await expect(card.locator(".times-row")).toHaveCount(3);
  const row = (name: string) => card.getByRole("group", { name: `Heures de ${name}` });
  await expect(row("Alice")).toContainText("Arrivée · Ven. 30 oct.");
  await expect(row("Alice")).toContainText("Départ · Dim. 1 nov.");

  // Ma ligne, puis recopiée sur tout le foyer.
  await row("Alice").getByLabel("Heure d'arrivée de Alice").selectOption("18:30");
  await row("Alice").getByLabel("Heure de départ de Alice").selectOption("15:00");
  const note = row("Alice").getByLabel("Note d'arrivée et de départ de Alice");
  await note.fill("  Nous aurons déjà dîné ");
  await note.blur();
  await expect.poll(async () => timesOf(await stay.snap())[0]).toEqual(["Alice", "18:30", "15:00", "Nous aurons déjà dîné"]);
  await row("Alice").getByRole("button", { name: "Même heure pour tout le foyer" }).click();

  // Le cousin arrive plus tard, dans la nuit.
  await expect(row("Paul").getByLabel("Heure d'arrivée de Paul")).toHaveValue("18:30");
  await row("Paul").getByLabel("Heure d'arrivée de Paul").selectOption("00:30");
  await expect
    .poll(async () => timesOf(await stay.snap()))
    .toEqual([
      ["Alice", "18:30", "15:00", "Nous aurons déjà dîné"],
      ["Bob", "18:30", "15:00", "Nous aurons déjà dîné"],
      ["Mamie", "", "", ""],
      ["Nina", "", "", ""],
      ["Paul", "00:30", "15:00", "Nous aurons déjà dîné"],
    ]);
  await expect(invite).toHaveCount(0);

  // Recopier par-dessus une heure différente demande confirmation ; refuser ne change rien.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Recopier les heures de Alice à Paul ?");
    void dialog.dismiss();
  });
  await row("Alice").getByRole("button", { name: "Même heure pour tout le foyer" }).click();
  await expect(row("Paul").getByLabel("Heure d'arrivée de Paul")).toHaveValue("00:30");
  await expectNoHorizontalScroll(page);

  // Planning : un jour sans activité s'affiche quand même, les heures sont regroupées.
  await page.getByRole("link", { name: "Activités" }).click();
  const friday = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Vendredi 30 octobre" }) });
  const moves = friday.locator(".timeline-move");
  await expect(moves).toHaveCount(3);
  await expect(moves.nth(0)).toContainText("vers18:30");
  await expect(moves.nth(0)).toContainText("🏡 Arrivée · Alice, Bob");
  await expect(moves.nth(1)).toContainText("🏡 Arrivée · Paul");
  await expect(moves.nth(1)).toContainText("dans la nuit");
  await expect(moves.nth(2)).toContainText("🏡 Arrivée · Mamie");
  await expect(moves.nth(2)).toContainText("Heure non donnée");
  const notes = moves.nth(0).getByText("Alice, Bob : Nous aurons déjà dîné");
  await expect(notes).toBeHidden();
  await moves.nth(0).getByText("📝 1 note").click();
  await expect(notes).toBeVisible();
  const sunday = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Dimanche 1 novembre" }) });
  await expect(sunday.locator(".timeline-move").first()).toContainText("👋 Départ · Alice, Bob, Paul");
  await expectNoHorizontalScroll(page);
});

test("l'organisateur voit qui n'a pas donné d'heure, corrige et imprime", async ({ page, request }) => {
  const stay = await createStay(request);
  const anne = await stay.person("Anne");
  const marc = await stay.person("Marc");
  for (const id of [anne, marc]) await stay.present(id);
  const household = (await stay.snap()).persons.find((p) => p.id === anne)?.household_id;
  await stay.pub("PUT", `/households/${household}/times`, {
    members: [{ person_id: anne, arrival_time: "17:00", departure_time: "14:00", times_note: "Porte ouverte svp" }],
  });
  await stay.adm("POST", "/activities", { name: "Rando", date: "2026-10-31", start_time: "10:00" });

  await openAdmin(page, stay.slug, stay.key, "Foyers");
  await expect(page.getByText("Sans heure d'arrivée ou de départ : Marc")).toBeVisible();
  const anneRow = page.locator(".person-admin").filter({ has: page.locator('[value="Anne"]') });
  await expect(anneRow).toContainText("🕒 Arrivée ven. 30 oct. vers 17 h · Départ dim. 1 nov. vers 14 h");

  // Ce qu'on m'a dit au téléphone.
  const marcRow = page.locator(".person-admin").filter({ has: page.locator('[value="Marc"]') });
  await marcRow.getByRole("button", { name: "Heures d'arrivée et de départ de Marc" }).click();
  await marcRow.getByLabel("Heure d'arrivée de Marc").selectOption("20:00");
  await marcRow.getByLabel("Heure de départ de Marc").selectOption("11:00");
  await expect(page.getByText("Sans heure d'arrivée ou de départ")).toHaveCount(0);
  await marcRow.getByRole("button", { name: "Heures d'arrivée et de départ de Marc" }).click();
  await expect(marcRow).toContainText("🕒 Arrivée ven. 30 oct. vers 20 h · Départ dim. 1 nov. vers 11 h");
  await expectNoHorizontalScroll(page);

  // Fiche « Planning de présence » : les arrivées et départs en tête, notes comprises.
  await page.goto(`${stay.url}/imprimer/presences`);
  const section = page.locator(".print-moves");
  await expect(section.getByRole("heading", { name: "Arrivées et départs" })).toBeVisible();
  await expect(section.locator("li")).toHaveText([
    "vers 17 h — Arrivée : Anne📝 Anne : Porte ouverte svp",
    "vers 20 h — Arrivée : Marc",
    "vers 11 h — Départ : Marc",
    "vers 14 h — Départ : Anne📝 Anne : Porte ouverte svp",
  ]);
  await expect(page.locator(".grid-table")).toBeVisible();

  // Le planning mêle l'activité du samedi, jour sans arrivée ni départ.
  await page.goto(`${stay.url}/planning`);
  await expect(page.locator(".card h2")).toHaveText(["Vendredi 30 octobre", "Samedi 31 octobre", "Dimanche 1 novembre"]);
});
