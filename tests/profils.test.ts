// Profils sans identifiant, écran de sélection, téléphone et SMS, testés
// contre une vraie base. Les fournisseurs SMS sont simulés (fetch remplacé).
import { after, afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { freshIp, makeUser, prisma, resetDb } from "./helpers/db";
import { login } from "../src/lib/auth/core";
import { AppError } from "../src/lib/services/errors";
import { listLoginProfiles, updateMyProfile } from "../src/lib/services/account";
import { createMember, listMembers, resetMemberPassword, updateMember } from "../src/lib/services/members";
import { familyMembers } from "../src/lib/services/wishlist";
import { getSmsTemplate, resetSmsTemplate, saveSmsTemplate, sendMemberSms } from "../src/lib/services/sms";
import { DEFAULT_SMS_TEMPLATE, renderSms } from "../src/lib/smsTemplate";
import { formatPhone, normalizePhone } from "../src/lib/phone";
import { generateTempPassword, passwordProblem } from "../src/lib/password";

const rejectsWith = async (p: Promise<unknown>, code: AppError["code"]) => {
  await assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);
};

const SMS_ENV = ["SMS_PROVIDER", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_MESSAGING_SERVICE_SID", "BREVO_API_KEY", "BREVO_SMS_SENDER"];
const realFetch = globalThis.fetch;

beforeEach(async () => { await resetDb(); for (const k of SMS_ENV) delete process.env[k]; });
afterEach(() => { globalThis.fetch = realFetch; });
after(() => prisma.$disconnect());

describe("création de profil sans identifiant", () => {
  test("prénom + téléphone + avatar, mot de passe généré, connexion par le profil", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await createMember(host, { displayName: "  Tom  ", phone: "06 12 34 56 78", avatar: { sex: "h", hair: "herisse" } });
    assert.equal(m.displayName, "Tom");
    assert.equal(m.phone, "+33612345678");
    assert.equal(passwordProblem(m.password), null);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(row.login, null);
    assert.equal(row.mustChangePassword, true);
    assert.equal((row.avatar as { hair: string }).hair, "herisse");
    // Jamais en clair : le hash ne contient pas le mot de passe.
    assert.match(row.passwordHash!, /^scrypt\$/);
    assert.ok(!row.passwordHash!.includes(m.password));
    const r = await login(m.id, m.password, freshIp());
    assert.ok(r.ok && r.user.mustChangePassword);
  });

  test("deux profils ne peuvent pas porter le même prénom", async () => {
    const host = await makeUser("Hote", "HOST");
    await createMember(host, { displayName: "Tom", password: "un-mot-de-passe" });
    await rejectsWith(createMember(host, { displayName: "tom", password: "un-mot-de-passe" }), "CONFLICT");
    const julie = await createMember(host, { displayName: "Julie", password: "un-mot-de-passe" });
    await rejectsWith(updateMember(host, julie.id, { displayName: "TOM" }), "CONFLICT");
    const sam = await makeUser("Sam");
    await rejectsWith(updateMyProfile(sam, { displayName: "Julie", about: "", avatar: null }), "CONFLICT");
  });

  test("numéro invalide refusé, numéro modifiable et effaçable", async () => {
    const host = await makeUser("Hote", "HOST");
    await rejectsWith(createMember(host, { displayName: "Tom", phone: "06 12" }), "INVALID");
    await rejectsWith(createMember(host, { displayName: "Tom", phone: "appelle-moi" }), "INVALID");
    const m = await createMember(host, { displayName: "Tom" });
    await updateMember(host, m.id, { displayName: "Thomas", phone: "+32 470 12 34 56", avatar: { sex: "h", hair: "court" } });
    let row = await prisma.user.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(row.displayName, "Thomas");
    assert.equal(row.phone, "+32470123456");
    assert.equal((row.avatar as { hair: string }).hair, "court");
    await updateMember(host, m.id, { displayName: "Thomas", phone: "" });
    row = await prisma.user.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(row.phone, null);
    assert.equal((row.avatar as { hair: string }).hair, "court"); // avatar non envoyé : inchangé
  });

  test("réinitialisation : nouveau mot de passe généré, l'ancien ne marche plus", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await createMember(host, { displayName: "Tom", password: "premier-mdp-1" });
    const r = await resetMemberPassword(host, m.id);
    assert.notEqual(r.password, "premier-mdp-1");
    assert.equal((await login(m.id, "premier-mdp-1", freshIp())).ok, false);
    assert.equal((await login(m.id, r.password, freshIp())).ok, true);
    await rejectsWith(resetMemberPassword(host, host.id), "INVALID");
  });

  test("profil importé sans mot de passe : absent de la grille jusqu'à son activation", async () => {
    const host = await makeUser("Hote", "HOST");
    const imported = await prisma.user.create({ data: { displayName: "Louenn" } });
    assert.ok(!(await listLoginProfiles()).some((p) => p.id === imported.id));
    const r = await resetMemberPassword(host, imported.id);
    assert.ok((await listLoginProfiles()).some((p) => p.id === imported.id));
    assert.equal((await login(imported.id, r.password, freshIp())).ok, true);
  });
});

describe("écran de sélection des profils", () => {
  test("n'expose que prénom, avatar, Hôte ou non et l'id technique", async () => {
    const host = await makeUser("Hote", "HOST");
    await createMember(host, { displayName: "Tom", phone: "0612345678" });
    const profiles = await listLoginProfiles();
    assert.equal(profiles.length, 2);
    for (const p of profiles) assert.deepEqual(Object.keys(p).sort(), ["avatar", "displayName", "id", "isHost"]);
    assert.equal(profiles.find((p) => p.isHost)?.id, host.id);
  });

  test("le téléphone n'est visible que de l'Hôte", async () => {
    const host = await makeUser("Hote", "HOST");
    await createMember(host, { displayName: "Tom", phone: "0612345678" });
    const sam = await makeUser("Sam");
    assert.ok(!JSON.stringify(await familyMembers(sam)).includes("612345678"));
    await rejectsWith(listMembers(sam), "FORBIDDEN");
    assert.equal((await listMembers(host)).find((m) => m.displayName === "Tom")?.phone, "+33612345678");
    assert.ok(!JSON.stringify(await listMembers(host)).includes("scrypt"));
  });
});

describe("SMS", () => {
  test("modèle : rendu, ligne du mot de passe retirée en simple rappel", () => {
    const withPw = renderSms(DEFAULT_SMS_TEMPLATE, { prenom: "Tom", lien: "https://x/connexion", motdepasse: "sapin-42" });
    assert.match(withPw, /^Bonjour Tom !/);
    assert.match(withPw, /- Profil : Tom/);
    assert.match(withPw, /- Mot de passe : sapin-42/);
    const reminder = renderSms(DEFAULT_SMS_TEMPLATE, { prenom: "Tom", lien: "https://x/connexion" });
    assert.ok(!/Mot de passe/.test(reminder));
    assert.match(reminder, /https:\/\/x\/connexion/);
  });

  test("modèle personnalisable par l'Hôte seulement, {motdepasse} obligatoire", async () => {
    const host = await makeUser("Hote", "HOST");
    const sam = await makeUser("Sam");
    assert.equal(await getSmsTemplate(host), DEFAULT_SMS_TEMPLATE);
    await rejectsWith(saveSmsTemplate(host, "Coucou {prenom}"), "INVALID");
    await saveSmsTemplate(host, "Coucou {prenom}, ton mot de passe : {motdepasse}");
    assert.equal(await getSmsTemplate(host), "Coucou {prenom}, ton mot de passe : {motdepasse}");
    await rejectsWith(saveSmsTemplate(sam, "x {motdepasse}"), "FORBIDDEN");
    await rejectsWith(getSmsTemplate(sam), "FORBIDDEN");
    await resetSmsTemplate(host);
    assert.equal(await getSmsTemplate(host), DEFAULT_SMS_TEMPLATE);
  });

  test("sans fournisseur configuré, aucun envoi n'est prétendu", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await createMember(host, { displayName: "Tom", phone: "0612345678" });
    await rejectsWith(sendMemberSms(host, m.id, "Coucou"), "INVALID");
  });

  test("Twilio : envoi au numéro enregistré en base, réservé à l'Hôte", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: "+15550001111" });
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ sid: "SM42", status: "queued" }), { status: 201 });
    }) as typeof fetch;
    const host = await makeUser("Hote", "HOST");
    const sam = await makeUser("Sam");
    const m = await createMember(host, { displayName: "Tom", phone: "06 12 34 56 78" });
    await rejectsWith(sendMemberSms(sam, m.id, "Coucou"), "FORBIDDEN");
    const r = await sendMemberSms(host, m.id, "Coucou Tom 🎄");
    assert.deepEqual(r, { provider: "Twilio", reference: "SM42", status: "queued" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const body = new URLSearchParams(calls[0].body);
    assert.equal(body.get("To"), "+33612345678");
    assert.equal(body.get("From"), "+15550001111");
    assert.equal(body.get("Body"), "Coucou Tom 🎄");
    assert.equal(calls[0].auth, "Basic " + Buffer.from("AC123:secret").toString("base64"));
  });

  test("Brevo : refus du fournisseur remonté tel quel, pas de faux succès", async () => {
    Object.assign(process.env, { BREVO_API_KEY: "k", BREVO_SMS_SENDER: "Noel" });
    let sent: { recipient?: string } = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ message: "Not enough credits" }), { status: 402 });
    }) as typeof fetch;
    const host = await makeUser("Hote", "HOST");
    const m = await createMember(host, { displayName: "Tom", phone: "0612345678" });
    await assert.rejects(sendMemberSms(host, m.id, "Coucou"), (e: unknown) => e instanceof AppError && /Not enough credits/.test(e.message));
    assert.equal(sent.recipient, "33612345678");
  });

  test("profil sans numéro : envoi refusé", async () => {
    Object.assign(process.env, { BREVO_API_KEY: "k", BREVO_SMS_SENDER: "Noel" });
    globalThis.fetch = (async () => { throw new Error("ne doit pas être appelé"); }) as typeof fetch;
    const host = await makeUser("Hote", "HOST");
    const m = await createMember(host, { displayName: "Tom" });
    await rejectsWith(sendMemberSms(host, m.id, "Coucou"), "INVALID");
  });
});

describe("utilitaires", () => {
  test("téléphone : normalisation et affichage", () => {
    assert.equal(normalizePhone("06.12.34.56.78"), "+33612345678");
    assert.equal(normalizePhone("+33 (0)6 12 34 56 78"), "+33612345678");
    assert.equal(normalizePhone("0033612345678"), "+33612345678");
    assert.equal(normalizePhone(""), null);
    assert.throws(() => normalizePhone("12"));
    assert.equal(formatPhone("+33612345678"), "+33 6 12 34 56 78");
  });

  test("mots de passe provisoires : valides et variés", () => {
    const set = new Set(Array.from({ length: 200 }, generateTempPassword));
    assert.ok(set.size > 190);
    for (const p of set) assert.equal(passwordProblem(p), null);
  });
});
