// Parcours complet dans un vrai navigateur : installation, comptes, listes,
// confidentialité, Secret Santa, musique, décorations, affichage mobile.
import { expect, test, type Page } from "@playwright/test";
import { E2E_SETUP_TOKEN } from "../../playwright.config";

const SHOTS = process.env.SHOTS_DIR;
const parisDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

/** Connexion façon « qui regarde ? » : vignette du profil, puis mot de passe. */
async function loginAs(page: Page, name: string, password: string, expectSuccess = true) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: new RegExp(`^Profil de ${name}( \\(Hôte\\))?$`) }).click();
  await page.getByLabel(`Mot de passe de ${name}`).fill(password);
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

// L'écran d'accueil (5 s) est testé à part : ailleurs, on le marque comme déjà vu.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.startsWith("accueil")) await page.addInitScript(() => sessionStorage.setItem("hotte-intro", "1"));
});

const HOST = { login: "Julien", password: "mot-de-passe-hote-1" };
let tomPassword = "";
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
  await expect(page.getByLabel("Identifiant de connexion")).toHaveCount(0);
  await page.getByLabel("Mot de passe").fill(HOST.password);
  await page.getByRole("button", { name: "Créer le compte Hôte" }).click();
  await expect(page.getByText("Jeton d'installation incorrect.")).toBeVisible();
  await page.getByLabel("Jeton d'installation").fill(E2E_SETUP_TOKEN);
  await page.getByRole("button", { name: "Créer le compte Hôte" }).click();
  await expect(page).toHaveURL(/\/connexion\?installe=1/);
  await page.goto("/installation");
  await expect(page.getByText("Installation terminée")).toBeVisible();
});

test("écran de connexion : un mauvais mot de passe ne connecte pas", async ({ page }) => {
  await page.goto("/connexion");
  await expect(page.getByRole("heading", { name: "Qui ouvre sa hotte ?" })).toBeVisible();
  await expect(page.getByLabel(/Identifiant/)).toHaveCount(0);
  await expect(page.locator(".who-tile")).toHaveCount(1);
  await page.getByRole("button", { name: "Profil de Julien (Hôte)" }).click();
  // Cliquer sur le profil ne suffit pas : toujours sur la page de connexion.
  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByLabel("Mot de passe de Julien")).toBeFocused();
  await page.getByRole("button", { name: "Changer de profil" }).click();
  await expect(page.locator(".who-tile")).toHaveCount(1);
  await loginAs(page, HOST.login, "mauvais", false);
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
  await page.goto("/ma-liste");
  await expect(page).toHaveURL(/\/connexion/);
});

test("l'Hôte crée les profils sans identifiant et prépare le SMS", async ({ page }) => {
  await loginAs(page, HOST.login, HOST.password);
  await expect(page).toHaveURL(/\/ma-liste/);
  await page.getByRole("link", { name: "Espace Hôte" }).click();
  for (const [name, phone] of [["Sam", "06 11 22 33 44"], ["Julie", ""]]) {
    await page.getByLabel("Prénom").first().fill(name);
    await page.getByLabel("Portable").first().fill(phone);
    await page.getByLabel("Mot de passe initial").fill(`${name.toLowerCase()}-provisoire-1`);
    await page.getByRole("button", { name: "Créer le profil" }).click();
    await expect(page.getByText(`Profil de ${name} créé.`)).toBeVisible();
    const msg = page.locator(".box .sms textarea");
    await expect(msg).toHaveValue(new RegExp(`^Bonjour ${name} !`));
    await expect(msg).toHaveValue(new RegExp(`- Profil : ${name}\n- Mot de passe : ${name.toLowerCase()}-provisoire-1`));
    await expect(page.locator(".box .sms .status")).toContainText("Message préparé");
  }
  // Lien SMS : numéro et message préremplis, sans prétendre à un envoi.
  await page.getByLabel("Prénom").first().fill("Tom");
  await page.getByLabel("Portable").first().fill("+33 6 99 88 77 66");
  await page.getByRole("button", { name: "Avatar Garçon" }).first().click();
  await page.getByRole("button", { name: "Créer le profil" }).click();
  await expect(page.getByText("Profil de Tom créé.")).toBeVisible();
  const text = await page.locator(".box .sms textarea").inputValue();
  tomPassword = /Mot de passe : (\S+)/.exec(text)![1];
  expect(tomPassword).toMatch(/^[a-z-]+-\d{2}$/);
  const href = await page.getByRole("link", { name: "Ouvrir l'application SMS" }).getAttribute("href");
  expect(href).toMatch(/^sms:\+33699887766\?&body=/);
  expect(decodeURIComponent(href!.split("body=")[1])).toBe(text);
  await expect(page.getByRole("button", { name: /Envoyer via/ })).toHaveCount(0); // aucun fournisseur configuré
  // Doublon de prénom refusé.
  await page.getByLabel("Prénom").first().fill("sam");
  await page.getByRole("button", { name: "Créer le profil" }).click();
  await expect(page.getByText("Un profil s'appelle déjà « sam »", { exact: false })).toBeVisible();
  await expect(page.locator(".member")).toHaveCount(4);
  await expect(page.locator(".member", { hasText: "Sam" }).first()).toContainText("+33 6 11 22 33 44");
  await shot(page, "hote-desktop");
  await logout(page);
  await page.goto("/connexion");
  await expect(page.locator(".who-tile")).toHaveCount(4);
});

test("première connexion : mot de passe imposé, puis liste", async ({ page }) => {
  await loginAs(page, "Sam", "sam-provisoire-1");
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
  await loginAs(page, "Sam", "mot-de-passe-de-sam");
  await expect(page.getByRole("link", { name: "Espace Hôte" })).toHaveCount(0);
  await page.goto("/hote");
  await expect(page.getByText("Page introuvable")).toBeVisible();
  await expect(page.locator(".member")).toHaveCount(0);
  await logout(page);
});

test("réservation : visible par les autres, invisible pour le destinataire", async ({ page }) => {
  await loginAs(page, "Julie", "julie-provisoire-1");
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

  await loginAs(page, "Sam", "mot-de-passe-de-sam");
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

  await loginAs(page, "Sam", "mot-de-passe-de-sam");
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
  await loginAs(page, "Sam", "mot-de-passe-de-sam");
  await page.goto(url);
  await expect(page.locator(".reveal .to")).toHaveText(samReceiver);
  await logout(page);
});

test("l'Hôte modifie un profil, régénère un mot de passe depuis le bouton SMS", async ({ page }) => {
  await loginAs(page, "Tom", tomPassword);
  await expect(page).toHaveURL(/\/compte\/mot-de-passe/);
  await logout(page);
  await loginAs(page, HOST.login, HOST.password);
  await page.goto("/hote");
  const tom = page.locator(".member").filter({ has: page.locator(".name", { hasText: /^Tom$/ }) });
  await tom.getByText("Gérer ce profil").click();
  await tom.getByLabel("Prénom").fill("Tommy");
  await tom.getByLabel("Portable").fill("07 00 00 00 01");
  await tom.getByRole("button", { name: "Enregistrer" }).click();
  const tommy = page.locator(".member").filter({ has: page.locator(".name", { hasText: /^Tommy$/ }) });
  await expect(tommy.getByText("Profil mis à jour.")).toBeVisible();
  await expect(tommy).toContainText("+33 7 00 00 00 01");
  await tommy.getByRole("button", { name: "Envoyer ses accès par SMS à Tommy" }).click();
  await expect(tommy.getByText("stocké haché")).toBeVisible();
  await tommy.getByRole("button", { name: "Générer un nouveau mot de passe provisoire" }).click();
  await tommy.getByRole("button", { name: "Confirmer : remplacer son mot de passe" }).click();
  const msg = tommy.locator(".sms textarea");
  await expect(msg).toHaveValue(/- Profil : Tommy/);
  const fresh = /Mot de passe : (\S+)/.exec(await msg.inputValue())![1];
  expect(fresh).not.toBe(tomPassword);
  // Message personnalisable avant l'envoi.
  await msg.fill("Coucou Tommy, ton code : " + fresh);
  expect(decodeURIComponent((await tommy.getByRole("link", { name: "Ouvrir l'application SMS" }).getAttribute("href"))!.split("body=")[1])).toBe("Coucou Tommy, ton code : " + fresh);
  // Simple rappel : aucun mot de passe dans le message.
  await tommy.getByRole("radio", { name: "Simple rappel, sans mot de passe" }).click();
  await expect(msg).not.toHaveValue(/Mot de passe/);
  await shot(page, "hote-sms");
  await logout(page);
  await loginAs(page, "Tommy", tomPassword, false);
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
  await loginAs(page, "Tommy", fresh);
  await expect(page).toHaveURL(/\/compte\/mot-de-passe/);
});

// Le navigateur autorise-t-il le son sans clic ? On fixe la réponse (sinon
// elle dépend de la configuration de Chromium).
async function autoplay(page: Page, allowed: boolean) {
  await page.addInitScript((ok) => {
    HTMLMediaElement.prototype.play = function () {
      return ok ? Promise.resolve() : Promise.reject(new DOMException("bloqué", "NotAllowedError"));
    };
  }, allowed);
}

/** YouTube est injoignable ici : on sert une imitation de son API qui joue
 * « pour de faux » et note chaque commande dans window.__yt. */
async function fakeYouTube(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `window.__yt = [];
      window.YT = { Player: function (el, opts) {
        var self = this, log = function (x) { window.__yt.push(x); };
        self.setVolume = function (v) { log("volume:" + Math.round(v)); };
        self.playVideo = function () { log("play"); setTimeout(function () { opts.events.onStateChange({ data: 1 }); }, 300); };
        self.pauseVideo = function () { log("pause"); };
        self.getCurrentTime = function () { return 1; };
        self.destroy = function () { log("destroy"); };
        setTimeout(function () { opts.events.onReady({ target: self }); }, 100);
      } };
      setTimeout(function () { window.onYouTubeIframeAPIReady(); }, 0);`,
  }));
}
const ytLog = (page: Page) => page.evaluate(() => (window as unknown as { __yt?: string[] }).__yt ?? []);

test("accueil : son autorisé, la musique joue pendant l'animation puis s'arrête", async ({ page }) => {
  await autoplay(page, true);
  await fakeYouTube(page);
  await page.goto("/");
  const intro = page.locator(".intro");
  await expect(intro.getByRole("heading", { name: "La Hotte familiale" })).toBeVisible();
  await expect(intro.getByText("Mariah Carey — All I Want for Christmas Is You")).toBeVisible();
  expect(await ytLog(page)).toContain("play");
  await shot(page, "accueil-desktop");
  // Fin de l'accueil : fondu puis arrêt, la grille des profils apparaît.
  await expect(intro).toHaveCount(0, { timeout: 9000 });
  await expect(page.getByRole("heading", { name: "Qui ouvre sa hotte ?" })).toBeVisible();
  await expect.poll(() => ytLog(page)).toContain("destroy");
  expect(await ytLog(page)).toContain("volume:27"); // le volume a bien baissé progressivement
  await expect(page.locator(".music-panel")).toBeHidden();
  // Le bouton relance la musique à la demande.
  await page.getByRole("button", { name: "Activer la musique de Noël" }).click();
  await expect(page.locator(".music-panel")).toBeVisible();
  await page.getByRole("button", { name: "Couper la musique" }).click();
  // Plus d'accueil dans cet onglet, ni au rechargement ni en naviguant.
  await page.reload();
  await expect(page.locator(".intro")).toBeHidden();
  await loginAs(page, "Sam", "mot-de-passe-de-sam");
  await page.getByRole("link", { name: "La famille" }).click();
  await expect(page.locator(".intro")).toHaveCount(0);
});

test("accueil : son bloqué, l'accueil attend un clic pour s'ouvrir en musique", async ({ page }) => {
  await autoplay(page, false);
  await fakeYouTube(page);
  await page.goto("/connexion");
  const intro = page.locator(".intro");
  const open = intro.getByRole("button", { name: "Ouvrir avec la musique" });
  await expect(open).toBeVisible();
  expect(await ytLog(page)).toEqual([]); // rien n'a été lancé sans clic
  // Il ne s'efface pas en silence : il attend.
  await page.waitForTimeout(7000);
  await expect(open).toBeVisible();
  // force : le bouton pulse en continu, Playwright ne le juge jamais « immobile ».
  await open.click({ force: true });
  await expect(intro.getByText("Mariah Carey — All I Want for Christmas Is You")).toBeVisible();
  await expect(intro).toHaveCount(0, { timeout: 9000 });
  await expect.poll(() => ytLog(page)).toContain("destroy");
  await expect(page.locator(".music-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: /Profil de Sam/ })).toBeVisible();
});

test("accueil : « Entrer sans musique » passe directement aux profils", async ({ page }) => {
  await autoplay(page, false);
  await page.goto("/connexion");
  await page.locator(".intro").getByRole("button", { name: "Entrer sans musique" }).click();
  await expect(page.locator(".intro")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Profil de Sam/ })).toBeVisible();
  await expect(page.locator(".music-panel")).toBeHidden();
});

test("accueil : YouTube injoignable, l'accueil se termine quand même", async ({ page }) => {
  await autoplay(page, true);
  await page.goto("/");
  await expect(page.locator(".intro")).toHaveCount(0, { timeout: 12000 });
  await expect(page.getByRole("heading", { name: "Qui ouvre sa hotte ?" })).toBeVisible();
});

test("la musique se lance sur demande, survit à la navigation et se coupe", async ({ page }) => {
  // YouTube est inaccessible depuis l'environnement de test : on vérifie les
  // commandes et la persistance, pas le son lui-même.
  await loginAs(page, "Sam", "mot-de-passe-de-sam");
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
  await loginAs(page, "Sam", "mot-de-passe-de-sam");
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

  test("accueil sur smartphone", async ({ page }) => {
    await autoplay(page, false);
    await page.goto("/");
    await expect(page.locator(".intro")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(2500);
    await shot(page, "accueil-mobile");
    await page.locator(".intro").getByRole("button", { name: /Entrer/ }).click();
    await expect(page.locator(".intro")).toHaveCount(0);
  });

  test("pages principales sans défilement horizontal", async ({ page }) => {
    await page.goto("/connexion");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "/connexion").toBeLessThanOrEqual(0);
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
