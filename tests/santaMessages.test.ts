// Messages de l'Hôte aux participants d'un Secret Santa, contre une vraie base.
// Le fournisseur SMS est simulé (fetch remplacé).
import { after, afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeUser, prisma, resetDb } from "./helpers/db";
import { AppError } from "../src/lib/services/errors";
import { createEvent, runDraw } from "../src/lib/services/santa";
import { eventMessages, messageRecipients, sendSantaMessage, unreadSantaMessages } from "../src/lib/services/santaMessages";
import { announceMessage, drawMessage } from "../src/lib/santaMessages";

const rejectsWith = async (p: Promise<unknown>, code: AppError["code"]) => {
  await assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);
};
const base = { giftDate: "2099-12-25", drawDate: "2000-01-01", budget: "30", budgetKind: "MAX" };
const SMS_ENV = ["SMS_PROVIDER", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_MESSAGING_SERVICE_SID", "BREVO_API_KEY", "BREVO_SMS_SENDER"];
const realFetch = globalThis.fetch;

beforeEach(async () => { await resetDb(); for (const k of SMS_ENV) delete process.env[k]; });
afterEach(() => { globalThis.fetch = realFetch; });
after(() => prisma.$disconnect());

async function setup() {
  const host = await makeUser("Hote", "HOST");
  const tom = await makeUser("Tom"); const sam = await makeUser("Sam"); const julie = await makeUser("Julie");
  const outsider = await makeUser("Cousin");
  await prisma.user.updateMany({ where: { id: { in: [host.id, tom.id, sam.id, outsider.id] } }, data: { phone: "+33600000000" } });
  await prisma.user.update({ where: { id: tom.id }, data: { phone: "+33611111111" } });
  await prisma.user.update({ where: { id: sam.id }, data: { phone: "+33622222222" } });
  await prisma.user.update({ where: { id: outsider.id }, data: { phone: "+33699999999" } });
  // Julie participe mais n'a pas de numéro ; Cousin a un numéro mais ne participe pas.
  const ev = await createEvent(host, { name: "Noël 2026", ...base }, [host.id, tom.id, sam.id, julie.id]);
  return { host, tom, sam, julie, outsider, ev };
}

describe("textes proposés", () => {
  test("annonce : nom, dates, budget et participants", () => {
    const t = announceMessage({ id: "e1", name: "Noël 2026", drawDate: "2026-12-01", giftDate: "2026-12-25", budgetCents: 3000, budgetKind: "MAX" }, ["Sam", "Tom"], "https://hotte.fr");
    assert.match(t, /^Ho Ho Ho ! 🎅🎄/);
    assert.match(t, /🎁 Événement : Noël 2026/);
    assert.match(t, /📅 Date du tirage : mardi 1 décembre 2026/);
    assert.match(t, /🎄 Date de remise des cadeaux : vendredi 25 décembre 2026/);
    assert.match(t, /💰 Budget : 30\s€ maximum/);
    assert.match(t, /Participants :\n• Sam\n• Tom/);
    assert.match(t, /https:\/\/hotte\.fr\/secret-santa\/e1/);
  });

  test("tirage : invite à se connecter, ne peut contenir aucune attribution", () => {
    const t = drawMessage({ id: "e1", name: "Noël 2026" }, "https://hotte.fr");
    assert.match(t, /Le tirage au sort du Secret Santa Noël 2026 vient d'être effectué/);
    assert.match(t, /secret-santa\/e1/);
    // La fonction ne reçoit aucun participant : aucun prénom ne peut y figurer.
    assert.equal(drawMessage.length, 2);
  });
});

describe("envoi aux participants", () => {
  test("réservé à l'Hôte", async () => {
    const { tom, ev } = await setup();
    await rejectsWith(sendSantaMessage(tom, ev.id, "ANNONCE", "Coucou", false), "FORBIDDEN");
    await rejectsWith(messageRecipients(tom, ev.id), "FORBIDDEN");
  });

  test("destinataires = participants de l'événement uniquement (Hôte exclu des SMS)", async () => {
    const { host, ev } = await setup();
    const names = (await messageRecipients(host, ev.id)).map((r) => r.displayName);
    assert.deepEqual(names, ["Julie", "Sam", "Tom"]);
  });

  test("publié sur le site : visible des participants, pas des autres membres", async () => {
    const { host, tom, outsider, ev } = await setup();
    await sendSantaMessage(host, ev.id, "ANNONCE", "Le Secret Santa est lancé !", false);
    assert.deepEqual((await unreadSantaMessages(tom)).map((m) => m.eventName), ["Noël 2026"]);
    assert.deepEqual(await unreadSantaMessages(outsider), []);
    assert.deepEqual(await unreadSantaMessages(host), [], "l'auteur n'a pas de bandeau pour son propre message");
    const msgs = await eventMessages(tom, ev.id);
    assert.equal(msgs[0].text, "Le Secret Santa est lancé !");
    assert.equal(msgs[0].isNew, true);
    // Lu : le bandeau disparaît.
    assert.deepEqual(await unreadSantaMessages(tom), []);
    assert.equal((await eventMessages(tom, ev.id))[0].isNew, false);
  });

  test("message vide ou annonce du tirage avant le tirage : refusés", async () => {
    const { host, ev } = await setup();
    await rejectsWith(sendSantaMessage(host, ev.id, "ANNONCE", "   ", false), "INVALID");
    await rejectsWith(sendSantaMessage(host, ev.id, "TIRAGE", "C'est fait !", false), "CONFLICT");
    await runDraw(host, ev.id);
    await sendSantaMessage(host, ev.id, "TIRAGE", "C'est fait !", false);
  });

  test("SMS : un par participant ayant un numéro, jamais aux non-participants", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+15550001111" });
    const to: string[] = [];
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      to.push(new URLSearchParams(String(init.body)).get("To")!);
      return new Response(JSON.stringify({ sid: "SM" + to.length, status: "queued" }), { status: 201 });
    }) as typeof fetch;
    const { host, ev } = await setup();
    await runDraw(host, ev.id);
    const r = await sendSantaMessage(host, ev.id, "TIRAGE", "Le tirage est fait, connectez-vous !", true);
    assert.deepEqual(to.sort(), ["+33611111111", "+33622222222"]);
    assert.deepEqual(r.sms.map((x) => `${x.name}:${x.status}`).sort(), ["Julie:no_phone", "Sam:sent", "Tom:sent"]);
  });

  test("SMS demandé sans fournisseur : refus explicite, rien n'est prétendu envoyé", async () => {
    const { host, ev } = await setup();
    await rejectsWith(sendSantaMessage(host, ev.id, "ANNONCE", "Coucou", true), "INVALID");
  });
});
