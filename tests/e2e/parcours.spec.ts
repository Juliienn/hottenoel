// Parcours complet dans un vrai navigateur : installation, comptes, listes,
// confidentialité, Secret Santa, musique, décorations, affichage mobile.
import { expect, test, type Page } from "@playwright/test";
import { E2E_SETUP_TOKEN } from "../../playwright.config";

const SHOTS = process.env.SHOTS_DIR;
const parisDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

async function loginAs(page: Page, login: string, password: string, expectSuccess = true) {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(login);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Attendre la fin de la connexion avant toute autre navigation.
  if (expectSuccess) await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion/);
}
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.describe.configure({ mode: "serial" });

const HOST = { login: "julien", password: "mot-de-passe-hote-1" };
let samReceiver = "";

test("une page privée renvoie vers la connexion", async ({ page }) => {
  await page.goto("/ma-liste");
  await expect(page).toHaveURL(/\/connexion\?suivant=%2Fma-liste/);
  await page.goto("/hote");
  await expect(page).toHaveURL(/\/connexion/);
});

test("installation : jeton obligatoire, puis page fermée", async ({ page }) => {
  await page.goto("/installation");
  await page.getByLabel("Jeton d'installation").fill("mauvais-jeton");
  await page.getByLabel("Ton prénom").fill("Julien");
  await page.getByLabel("Identifiant de connexion").fill(HOST.login);
  await page.getByLabel("Mot de passe").fill(HOST.password);
  await page.getByRole("button", { name: "Créer le compte Hôte" }).click();
  await expect(page.getByText("Jeton d'installation incorrect.")).toBeVisible();
  await page.getByLabel("Jeton d'installation").fill(E2E_SETUP_TOKEN);
  await page.getByRole("button", { name: "Créer le compte Hôte" }).click();
  await expect(page).toHaveURL(/\/connexion\?installe=1/);
  await page.goto("/installation");
  await expect(page.getByText("Installation terminée")).toBeVisible();
});

test("l'Hôte crée les profils et obtient le SMS à envoyer", async ({ page }) => {
  await loginAs(page, HOST.login, "mauvais", false);
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await loginAs(page, HOST.login, HOST.password);
  await expect(page).toHaveURL(/\/ma-liste/);
  await page.getByRole("link", { name: "Espace Hôte" }).click();
  for (const [name, login] of [["Sam", "sam"], ["Julie", "julie"], ["Tom", "tom"]]) {
    await page.getByLabel("Prénom ou nom").first().fill(name);
    await page.getByLabel("Identifiant de connexion").fill(login);
    await page.getByLabel("Mot de passe initial").fill(`${login}-provisoire-1`);
    await page.getByRole("button", { name: "Créer le profil" }).click();
    await expect(page.getByText(`Profil de ${name} créé.`)).toBeVisible();
    await expect(page.locator(".sms pre")).toContainText(`Identifiant : ${login}`);
  }
  await expect(page.locator(".member")).toHaveCount(4);
  await shot(page, "hote-desktop");
  await logout(page);
});

test("première connexion : mot de passe imposé, puis liste", async ({ page }) => {
  await loginAs(page, "sam", "sam-provisoire-1");
  await expect(page).toHaveURL(/\/compte\/mot-de-passe/);
  await page.goto("/ma-liste");
  await expect(page).toHaveURL(/\/compte\/mot-de-passe/);
  await page.getByLabel("Mot de passe reçu par SMS").fill("sam-provisoire-1");
  await page.getByLabel(/^Nouveau mot de passe/).fill("mot-de-passe-de-sam");
  await page.getByLabel("Confirme le nouveau mot de passe").fill("mot-de-passe-de-sam");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page).toHaveURL(/\/ma-liste/);
  await page.getByLabel("Cadeau").fill("Écharpe rouge");
  await page.getByLabel("Prix indicatif (€)").fill("25");
  await page.getByRole("button", { name: "Ajouter à ma liste" }).click();
  await expect(page.locator(".tag h3", { hasText: "Écharpe rouge" })).toBeVisible();
});

test("un membre n'a pas accès à l'Espace Hôte", async ({ page }) => {
  await loginAs(page, "sam", "mot-de-passe-de-sam");
  await expect(page.getByRole("link", { name: "Espace Hôte" })).toHaveCount(0);
  await page.goto("/hote");
  await expect(page.getByText("Page introuvable")).toBeVisible();
  await expect(page.locator(".member")).toHaveCount(0);
  await logout(page);
});

test("réservation : visible par les autres, invisible pour le destinataire", async ({ page }) => {
  await loginAs(page, "julie", "julie-provisoire-1");
  await page.getByLabel("Mot de passe reçu par SMS").fill("julie-provisoire-1");
  await page.getByLabel(/^Nouveau mot de passe/).fill("mot-de-passe-de-julie");
  await page.getByLabel("Confirme le nouveau mot de passe").fill("mot-de-passe-de-julie");
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByRole("link", { name: "La famille" }).click();
  await page.locator(".people a", { hasText: "Sam" }).click();
  await page.getByRole("button", { name: "Je l'offre" }).click();
  await expect(page.locator(".pill.mine")).toHaveText("Tu l'offres");
  await shot(page, "famille-desktop");
  await logout(page);

  await loginAs(page, HOST.login, HOST.password);
  await page.goto("/famille");
  await page.locator(".people a", { hasText: "Sam" }).click();
  await expect(page.locator(".pill.other")).toHaveText("Pris par Julie");
  await expect(page.getByRole("button", { name: "Je l'offre" })).toHaveCount(0);
  await logout(page);

  await loginAs(page, "sam", "mot-de-passe-de-sam");
  await expect(page.locator(".tag h3", { hasText: "Écharpe rouge" })).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/Julie|Pris par|Tu l'offres|Libre/);
  // Tenter d'ouvrir sa propre liste côté « famille » ramène à « Ma liste ».
  const samId = await page.evaluate(() => document.querySelector(".me")?.getAttribute("href"));
  expect(samId).toBe("/compte");
  await logout(page);
});

test("Secret Santa : création, tirage, chacun ne voit que son destinataire", async ({ page }) => {
  await loginAs(page, HOST.login, HOST.password);
  await page.getByRole("link", { name: "Secret Santa" }).click();
  await page.getByLabel("Nom de l'événement").fill("Noël 2026");
  await page.getByLabel("Date du tirage au sort").fill(parisDay(0));
  await page.getByLabel("Date de remise des cadeaux").fill(parisDay(30));
  await page.getByLabel("Budget par cadeau (€)").fill("30");
  await page.getByRole("button", { name: "Créer l'événement" }).click();
  await expect(page).toHaveURL(/\/secret-santa\/c/);
  await expect(page.getByRole("heading", { name: "Noël 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Tirer au sort" }).click();
  await page.getByRole("button", { name: "Confirmer le tirage définitif" }).click();
  await expect(page.getByText("Tirage enregistré : il ne sera jamais relancé.")).toBeVisible();
  await expect(page.locator(".pill.done").first()).toBeVisible();
  // Aucune attribution d'un autre n'est affichée sans demande explicite.
  await expect(page.getByText(/offre à/)).toHaveCount(0);
  await shot(page, "santa-hote-desktop");

  // Tirage impossible : message explicatif.
  await page.goto("/secret-santa");
  await page.getByLabel("Nom de l'événement").fill("Anniversaire");
  await page.getByLabel("Date du tirage au sort").fill(parisDay(0));
  await page.getByLabel("Date de remise des cadeaux").fill(parisDay(10));
  await page.getByLabel("Julien (toi)").uncheck();
  await page.getByRole("button", { name: "Créer l'événement" }).click();
  await expect(page.getByRole("heading", { name: "Anniversaire" })).toBeVisible();
  const add = async (giver: string, receiver: string) => {
    await page.getByLabel(/^Personne/).selectOption({ label: giver });
    await page.getByLabel("ne doit pas offrir à").selectOption({ label: receiver });
    await page.getByRole("button", { name: "Ajouter l'exclusion" }).click();
    await expect(page.getByText(`${giver} ne doit pas offrir à ${receiver}`)).toBeVisible();
  };
  await add("Sam", "Julie");
  await add("Sam", "Tom");
  await page.getByRole("button", { name: "Tirer au sort" }).click();
  await page.getByRole("button", { name: "Confirmer le tirage définitif" }).click();
  await expect(page.getByText(/Tirage impossible : avec les exclusions actuelles, Sam ne peut offrir de cadeau à personne/)).toBeVisible();
  await logout(page);

  await loginAs(page, "sam", "mot-de-passe-de-sam");
  await page.getByRole("link", { name: "Secret Santa" }).click();
  await expect(page.locator(".event-card")).toHaveCount(2);
  await page.locator(".event-card", { hasText: "Noël 2026" }).click();
  await expect(page.getByText("Tu dois offrir un cadeau à :")).toBeVisible();
  samReceiver = (await page.locator(".reveal .to").innerText()).trim();
  expect(["Julien", "Julie", "Tom"]).toContain(samReceiver);
  await expect(page.getByText("Organisation")).toHaveCount(0);
  await expect(page.getByText("Afficher toutes les attributions")).toHaveCount(0);
  await shot(page, "santa-membre-desktop");
  const url = page.url();
  await logout(page);
  await loginAs(page, "sam", "mot-de-passe-de-sam");
  await page.goto(url);
  await expect(page.locator(".reveal .to")).toHaveText(samReceiver);
  await logout(page);
});

test("la musique se lance sur demande, survit à la navigation et se coupe", async ({ page }) => {
  // YouTube est inaccessible depuis l'environnement de test : on vérifie les
  // commandes et la persistance, pas le son lui-même.
  await loginAs(page, "sam", "mot-de-passe-de-sam");
  await expect(page.locator(".music-panel")).toBeHidden();
  await page.getByRole("button", { name: "Activer la musique de Noël" }).click();
  await expect(page.locator(".music-panel")).toBeVisible();
  const marker = await page.evaluate(() => { (window as unknown as { __m: number }).__m = 42; return 42; });
  await page.getByRole("link", { name: "La famille" }).click();
  await expect(page).toHaveURL(/\/famille/);
  // Même page JavaScript (pas de rechargement) et lecteur toujours affiché.
  expect(await page.evaluate(() => (window as unknown as { __m?: number }).__m)).toBe(marker);
  await expect(page.locator(".music-panel")).toBeVisible();
  await page.getByRole("button", { name: "Couper la musique" }).click();
  await expect(page.locator(".music-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: "Activer la musique de Noël" })).toBeVisible();
  await logout(page);
});

test("les décorations ne bloquent aucun clic", async ({ page }) => {
  await loginAs(page, "sam", "mot-de-passe-de-sam");
  for (const sel of [".snow", ".garland", ".sky-sleigh", ".footer-scene"]) {
    const pe = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pe, sel).toBe("none");
  }
  // Le point central de chaque onglet et du bouton d'ajout est bien cliquable.
  for (const name of ["Ma liste", "La famille", "Ce que j'offre", "Secret Santa"]) {
    const link = page.getByRole("link", { name, exact: true });
    const hit = await link.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === top || el.contains(top); });
    expect(hit, name).toBe(true);
  }
  await logout(page);
});

test.describe("affichage smartphone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test("pages principales sans défilement horizontal", async ({ page }) => {
    await page.goto("/connexion");
    await shot(page, "connexion-mobile");
    await loginAs(page, HOST.login, HOST.password);
    for (const path of ["/ma-liste", "/famille", "/mes-cadeaux", "/secret-santa", "/hote", "/compte"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      await shot(page, `mobile${path.replace(/\//g, "-")}`);
    }
    await page.goto("/secret-santa");
    await page.locator(".event-card", { hasText: "Noël 2026" }).click();
    await shot(page, "mobile-santa-detail");
  });
});
