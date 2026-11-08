// Comptes, sessions et autorisations, testés contre une vraie base.
// Les services sont appelés directement, comme le ferait une requête forgée
// qui contournerait l'interface : chaque refus vient donc bien du serveur.
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { freshIp, makeUser, PASSWORD, prisma, resetDb } from "./helpers/db";
import { hashPassword } from "../src/lib/password";
import { deleteSession, login, validateSessionToken, MAX_FAILS_PER_LOGIN } from "../src/lib/auth/core";
import { AppError } from "../src/lib/services/errors";
import { changeMyPassword, listLoginProfiles, setupHost, updateMyProfile } from "../src/lib/services/account";
import { createMember, deleteMember, listMembers, resetMemberPassword, setMemberActive, updateMember } from "../src/lib/services/members";
import { addItem, claimItem, deleteItem, familyMembers, memberList, myGifts, myItems, unclaimItem } from "../src/lib/services/wishlist";
import { createEvent, getEventAdmin, revealAssignments, runDraw } from "../src/lib/services/santa";

const rejectsWith = async (p: Promise<unknown>, code: AppError["code"]) => {
  await assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);
};

beforeEach(resetDb);
after(() => prisma.$disconnect());

describe("compte Hôte", () => {
  test("ne s'obtient qu'avec le jeton d'installation, et une seule fois", async () => {
    process.env.SETUP_TOKEN = "jeton-de-test-tres-long-123";
    await rejectsWith(setupHost("mauvais-jeton", { displayName: "Pirate", password: PASSWORD }), "FORBIDDEN");
    await setupHost("jeton-de-test-tres-long-123", { displayName: "Julien", password: PASSWORD });
    await rejectsWith(setupHost("jeton-de-test-tres-long-123", { displayName: "Autre", password: PASSWORD }), "CONFLICT");
    assert.equal(await prisma.user.count({ where: { role: "HOST" } }), 1);
  });

  test("installation fermée si SETUP_TOKEN est absent ou trop court", async () => {
    process.env.SETUP_TOKEN = "court";
    await rejectsWith(setupHost("court", { displayName: "X", password: PASSWORD }), "FORBIDDEN");
  });

  test("la base refuse un second Hôte même en écriture directe", async () => {
    await makeUser("Hote", "HOST");
    await assert.rejects(prisma.user.create({ data: { displayName: "Bis", login: "bis", role: "HOST" } }));
  });
});

describe("connexion et sessions", () => {
  test("connexion, session valide, puis déconnexion", async () => {
    const m = await makeUser("Sam");
    assert.equal((await validateSessionToken(m.token))?.id, m.id);
    await deleteSession(m.token);
    assert.equal(await validateSessionToken(m.token), null);
  });

  test("mauvais mot de passe et profil inconnu donnent le même message", async () => {
    const sam = await makeUser("Sam");
    const a = await login(sam.id, "faux-mot-de-passe", freshIp());
    const b = await login("cinconnu0000000000000000", "faux-mot-de-passe", freshIp());
    assert.ok(!a.ok && !b.ok);
    assert.equal(!a.ok && a.error, !b.ok && b.error);
    assert.equal(!a.ok && a.error, "Mot de passe incorrect.");
  });

  test("choisir un profil sans son mot de passe ne connecte pas", async () => {
    const sam = await makeUser("Sam");
    const r = await login(sam.id, "", freshIp());
    assert.equal(r.ok, false);
    assert.equal(await prisma.session.count({ where: { userId: sam.id } }), 1); // celle de makeUser seulement
  });

  test("un bon mot de passe ouvre le bon profil, et pas un autre", async () => {
    const sam = await makeUser("Sam");
    const julie = await makeUser("Julie");
    // Le mot de passe est commun dans ces tests : on vérifie que la session
    // créée est bien celle du profil choisi.
    const r = await login(julie.id, PASSWORD, freshIp());
    assert.ok(r.ok);
    if (r.ok) assert.equal((await validateSessionToken(r.token))?.id, julie.id);
    assert.notEqual(sam.id, julie.id);
  });

  test("un id de profil mal formé est refusé sans interroger le compte", async () => {
    const r = await login("' OR 1=1 --", PASSWORD, freshIp());
    assert.ok(!r.ok);
  });

  test("ancien compte avec identifiant : il se connecte toujours, par son profil", async () => {
    const u = await prisma.user.create({ data: { displayName: "Ancien", login: "ancien.login", passwordHash: await hashPassword(PASSWORD), mustChangePassword: false } });
    const r = await login(u.id, PASSWORD, freshIp());
    assert.ok(r.ok);
    assert.ok((await listLoginProfiles()).some((p) => p.id === u.id));
  });

  test("blocage après trop d'essais ratés, même avec le bon mot de passe ensuite", async () => {
    const sam = await makeUser("Sam");
    for (let i = 0; i < MAX_FAILS_PER_LOGIN; i++) await login(sam.id, "faux", freshIp());
    const r = await login(sam.id, PASSWORD, freshIp());
    assert.ok(!r.ok && /Trop de tentatives/.test(r.error));
  });

  test("blocage par adresse IP qui essaie plusieurs comptes", async () => {
    const sam = await makeUser("Sam");
    const ip = freshIp();
    for (let i = 0; i < 20; i++) await login(`compte0000000${i}`, "faux", ip);
    const r = await login(sam.id, PASSWORD, ip);
    assert.ok(!r.ok && /Trop de tentatives/.test(r.error));
  });

  test("un jeton inventé ou un cookie trafiqué ne donne aucune session", async () => {
    await makeUser("Sam");
    assert.equal(await validateSessionToken("n-importe-quoi"), null);
    assert.equal(await validateSessionToken(""), null);
  });

  test("compte désactivé : sessions fermées et connexion refusée", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await makeUser("Sam");
    await setMemberActive(host, m.id, false);
    assert.equal(await validateSessionToken(m.token), null);
    assert.equal((await login(m.id, PASSWORD, freshIp())).ok, false);
    assert.ok(!(await listLoginProfiles()).some((p) => p.id === m.id));
  });

  test("réinitialisation par l'Hôte : ancien mot de passe et sessions invalidés, changement imposé", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await makeUser("Sam");
    await resetMemberPassword(host, m.id, "provisoire-123");
    assert.equal(await validateSessionToken(m.token), null);
    assert.equal((await login(m.id, PASSWORD, freshIp())).ok, false);
    const r = await login(m.id, "provisoire-123", freshIp());
    assert.ok(r.ok && r.user.mustChangePassword);
    // Tant que le mot de passe n'est pas changé, aucun service n'est accessible.
    if (r.ok) {
      await rejectsWith(myItems(r.user), "FORBIDDEN");
      await changeMyPassword(r.user, "provisoire-123", "mon-propre-mdp", r.token);
      const after = await validateSessionToken(r.token);
      assert.equal(after?.mustChangePassword, false);
      assert.deepEqual(await myItems(after!), []);
    }
  });
});

describe("droits d'administration vérifiés côté serveur", () => {
  test("un membre ne peut ni créer, ni lister, ni modifier, ni supprimer de compte", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await makeUser("Sam");
    const other = await makeUser("Julie");
    await rejectsWith(createMember(m, { displayName: "Faux", password: PASSWORD }), "FORBIDDEN");
    await rejectsWith(listMembers(m), "FORBIDDEN");
    await rejectsWith(updateMember(m, other.id, { displayName: "X", phone: "0611223344" }), "FORBIDDEN");
    await rejectsWith(resetMemberPassword(m, other.id, "pirate-1234"), "FORBIDDEN");
    await rejectsWith(setMemberActive(m, other.id, false), "FORBIDDEN");
    await rejectsWith(deleteMember(m, other.id), "FORBIDDEN");
    assert.equal(await prisma.user.count(), 3);
    // L'Hôte, lui, peut.
    const created = await createMember(host, { displayName: "Mamie", password: PASSWORD });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).role, "MEMBER");
  });

  test("un membre ne peut pas se donner le rôle Hôte en modifiant son profil", async () => {
    const m = await makeUser("Sam");
    await updateMyProfile(m, { displayName: "Sam", about: "", avatar: null, role: "HOST", login: "admin" } as never);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: m.id } });
    assert.equal(u.role, "MEMBER");
    assert.equal(u.login, null);
  });

  test("un membre ne peut ni créer, ni tirer, ni voir l'administration d'un Secret Santa", async () => {
    const host = await makeUser("Hote", "HOST");
    const m = await makeUser("Sam");
    const ev = await createEvent(host, { name: "Noël", giftDate: "2099-12-25", drawDate: "2000-01-01", budget: "", budgetKind: "MAX" }, [host.id, m.id]);
    await rejectsWith(createEvent(m, { name: "Faux", giftDate: "2099-12-25", drawDate: "2099-12-01", budget: "", budgetKind: "MAX" }), "FORBIDDEN");
    await rejectsWith(runDraw(m, ev.id), "FORBIDDEN");
    await rejectsWith(getEventAdmin(m, ev.id), "FORBIDDEN");
    await rejectsWith(revealAssignments(m, ev.id), "FORBIDDEN");
  });

  test("le compte Hôte ne peut être ni désactivé ni supprimé", async () => {
    const host = await makeUser("Hote", "HOST");
    await rejectsWith(setMemberActive(host, host.id, false), "INVALID");
    await rejectsWith(deleteMember(host, host.id), "INVALID");
  });
});

describe("confidentialité des listes", () => {
  test("le propriétaire ne reçoit jamais l'état de réservation de ses cadeaux", async () => {
    const sam = await makeUser("Sam");
    const julie = await makeUser("Julie");
    await addItem(sam, { title: "Livre", price: "20", link: "", note: "", wish: "2" });
    const [item] = await myItems(sam);
    await claimItem(julie, item.id);
    const mine = await myItems(sam);
    assert.deepEqual(Object.keys(mine[0]).sort(), ["createdAt", "id", "link", "note", "priceCents", "title", "wish"]);
    await rejectsWith(memberList(sam, sam.id), "FORBIDDEN");
    // Suppression d'un cadeau réservé : rien ne change pour le propriétaire,
    // l'acheteur voit « retiré de la liste ».
    await deleteItem(sam, item.id);
    assert.deepEqual(await myItems(sam), []);
    const gifts = await myGifts(julie);
    assert.equal(gifts[0].lines[0].removed, true);
  });

  test("pas de doublon : un cadeau ne peut être réservé qu'une fois, même en simultané", async () => {
    const sam = await makeUser("Sam");
    const julie = await makeUser("Julie");
    const tom = await makeUser("Tom");
    await addItem(sam, { title: "Écharpe", price: "", link: "", note: "", wish: "3" });
    const [item] = await myItems(sam);
    const results = await Promise.allSettled([claimItem(julie, item.id), claimItem(tom, item.id)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.claim.count(), 1);
  });

  test("on ne réserve pas son propre cadeau, on n'annule pas la réservation d'un autre", async () => {
    const sam = await makeUser("Sam");
    const julie = await makeUser("Julie");
    const tom = await makeUser("Tom");
    await addItem(sam, { title: "Gants", price: "15", link: "", note: "", wish: "1" });
    const [item] = await myItems(sam);
    await rejectsWith(claimItem(sam, item.id), "FORBIDDEN");
    await claimItem(julie, item.id);
    await rejectsWith(unclaimItem(tom, item.id), "NOT_FOUND");
    const view = await memberList(tom, sam.id);
    assert.deepEqual(view.items[0].state, { kind: "taken", by: "Julie" });
  });

  test("un membre ne peut ni modifier ni supprimer le cadeau d'un autre", async () => {
    const sam = await makeUser("Sam");
    const julie = await makeUser("Julie");
    await addItem(sam, { title: "Montre", price: "50", link: "", note: "", wish: "2" });
    const [item] = await myItems(sam);
    await rejectsWith(deleteItem(julie, item.id), "NOT_FOUND");
    assert.equal(await prisma.wishItem.count(), 1);
  });

  test("la liste de la famille n'expose aucune donnée de compte", async () => {
    const sam = await makeUser("Sam");
    await makeUser("Julie");
    const fam = await familyMembers(sam);
    assert.deepEqual(Object.keys(fam[0]).sort(), ["avatar", "displayName", "id", "itemCount"]);
  });

  test("un lien javascript: est refusé", async () => {
    const sam = await makeUser("Sam");
    await rejectsWith(addItem(sam, { title: "X", price: "", link: "javascript:alert(1)", note: "", wish: "2" }), "INVALID");
  });
});

describe("suppression de membre", () => {
  test("refusée si le membre fait partie d'un tirage effectué", async () => {
    const host = await makeUser("Hote", "HOST");
    const a = await makeUser("Anne"); const b = await makeUser("Bob");
    const ev = await createEvent(host, { name: "Noël", giftDate: "2099-12-25", drawDate: "2000-01-01", budget: "30", budgetKind: "MAX" }, [host.id, a.id, b.id]);
    await runDraw(host, ev.id);
    await rejectsWith(deleteMember(host, a.id), "CONFLICT");
    await setMemberActive(host, a.id, false);
  });
});
