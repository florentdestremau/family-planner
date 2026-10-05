import { expect, test } from "@playwright/test";
import { openAdmin } from "./helpers";

test("créer un séjour puis le configurer comme organisateur", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByLabel("Nom du séjour").fill("Noël chez Papi");
  await page.getByLabel("Arrivée").fill("2026-12-24");
  await page.getByLabel("Départ").fill("2026-12-26");
  await page.getByRole("button", { name: "Créer le séjour" }).click();

  // Arrivée sur l'espace organisateur, clé mémorisée.
  await expect(page.getByRole("heading", { name: "Liens de partage" })).toBeVisible();
  await expect(page.locator(".stay-name")).toHaveText("Noël chez Papi");
  const publicLink = await page.locator(".share code").first().textContent();
  expect(publicLink).toMatch(/\/s\/[\w-]{12}$/);

  // Foyers : Florent ajouté seul (nouveau foyer), puis Claire en couple et Léo dans son foyer.
  await page.locator(".subtabs").getByRole("link", { name: "Foyers" }).click();
  await page.getByPlaceholder("Prénom").first().fill("Florent");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  const foyer = page.locator(".household-card");
  await expect(foyer).toHaveCount(1);
  await expect(foyer.getByLabel("Nom du foyer")).toHaveAttribute("placeholder", "Florent");
  await foyer.getByLabel("Prénom du nouveau membre").fill("Claire");
  await expect(foyer.getByLabel("En couple avec Florent")).toBeChecked();
  await foyer.getByRole("button", { name: "Ajouter au foyer" }).click();
  await expect(foyer.getByLabel("Nom du foyer")).toHaveAttribute("placeholder", "Florent & Claire");
  await expect(foyer.getByLabel("Couple de Florent")).toHaveValue(/\d+/);
  await foyer.getByLabel("Prénom du nouveau membre").fill("Léo");
  await foyer.getByLabel("Adulte ou enfant", { exact: true }).selectOption("child");
  await foyer.getByRole("button", { name: "Ajouter au foyer" }).click();
  await expect(foyer.locator(".person-admin")).toHaveCount(3);
  const leo = foyer.locator(".person-admin").filter({ has: page.locator('[value="Léo"]') });
  await expect(leo.getByRole("checkbox", { name: "Corvées" })).not.toBeChecked();

  // Chambres : une chambre, un lit double et un d'appoint, répartition proposée.
  await page.locator(".subtabs").getByRole("link", { name: "Chambres" }).click();
  await page.getByPlaceholder("Nouvelle chambre").fill("Chambre bleue");
  await page.getByRole("button", { name: "Ajouter" }).click();
  const room = page.locator(".card").filter({ has: page.locator('[value="Chambre bleue"]') });
  // Attendre chaque lit : la répartition se fait côté serveur, avec les lits déjà créés.
  await room.getByRole("button", { name: "+ Lit" }).click();
  await expect(room.locator(".bed")).toHaveCount(1);
  await room.locator(".inline-form select").selectOption("extra");
  await room.getByRole("button", { name: "+ Lit" }).click();
  await expect(room.locator(".bed")).toHaveCount(2);
  await page.getByRole("button", { name: /Proposer une répartition/ }).click();
  await expect(page.getByText("Tout le monde a un lit.")).toBeVisible();
  await expect(room.locator(".bed").first()).toContainText("Florent");
  await expect(room.locator(".bed").first()).toContainText("Claire");
  await expect(room.locator(".bed").nth(1)).toContainText("Léo");

  // Activité facultative.
  await page.locator(".subtabs").getByRole("link", { name: "Activités" }).click();
  await page.getByRole("button", { name: "+ Activité" }).click();
  await page.getByLabel("Nom").fill("Messe de minuit");
  await page.getByLabel("Début").fill("23:30");
  await page.getByText("Facultative (inscription individuelle)").click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Messe de minuit")).toBeVisible();
  await expect(page.locator(".badge-accent")).toHaveText("facultatif");

  // Menu, enregistré en quittant le champ.
  await page.locator(".subtabs").getByRole("link", { name: "Menus" }).click();
  const dinner = page.locator(".meal").first();
  await dinner.locator("textarea").fill("Huîtres\nDinde aux marrons");
  await dinner.locator("input").click();
  await page.waitForResponse((r) => r.url().endsWith("/admin/menus") && r.ok());
  await page.reload();
  await expect(page.locator(".meal").first().locator("textarea")).toHaveValue("Huîtres\nDinde aux marrons");
});

test("l'espace organisateur exige la clé", async ({ page, request }) => {
  const res = await request.post("/api/stays", {
    data: { name: "Privé", start_date: "2026-10-30", end_date: "2026-10-31" },
  });
  const { slug, admin_key } = await res.json();

  await page.goto(`/s/${slug}/admin`);
  await expect(page.getByPlaceholder("Clé organisateur")).toBeVisible();
  await expect(page.getByRole("link", { name: /Organisation/ })).toHaveCount(0);

  await page.getByPlaceholder("Clé organisateur").fill("mauvaise");
  await page.getByRole("button", { name: "Entrer" }).click();
  await expect(page.getByPlaceholder("Clé organisateur")).toBeVisible();

  // Lien organisateur : la clé est mémorisée puis retirée de l'URL.
  await page.goto(`/s/${slug}/admin?key=${admin_key}`);
  await expect(page.getByRole("heading", { name: "Liens de partage" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/s/${slug}/admin$`));
  await page.goto(`/s/${slug}/admin/foyers`);
  await expect(page.getByRole("heading", { name: "Ajouter une personne" })).toBeVisible();
});

test("séjour inconnu", async ({ page }) => {
  await page.goto("/s/nexistepas");
  await expect(page.getByText("Ce séjour n'existe pas.")).toBeVisible();
  await page.getByRole("link", { name: "Accueil" }).click();
  await expect(page.getByRole("heading", { name: "Week-end en famille" })).toBeVisible();
});

test("une erreur de l'API s'affiche", async ({ page, request }) => {
  const res = await request.post("/api/stays", {
    data: { name: "Erreurs", start_date: "2026-10-30", end_date: "2026-10-31" },
  });
  const { slug, admin_key } = await res.json();
  await openAdmin(page, slug, admin_key, "Activités");
  await page.getByRole("button", { name: "+ Activité" }).click();
  await page.getByLabel("Nom").fill("À l'envers");
  await page.getByLabel("Début").fill("15:00");
  await page.getByLabel("Fin").fill("14:00");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".toast-error")).toContainText("L'heure de fin doit suivre l'heure de début");
});
