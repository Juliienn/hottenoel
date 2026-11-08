// Secret Santa contre une vraie base : confidentialité, persistance,
// isolation des événements, respect des exclusions.
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { freshIp, makeUser, PASSWORD, prisma, resetDb } from "./helpers/db";
import { login } from "../src/lib/auth/core";
import { AppError } from "../src/lib/services/errors";
import {
  addExclusion, createEvent, deleteEvent, getEvent, getEventAdmin, listEvents, revealAssignments, revealMyReceiver, runDraw, setParticipants, updateEvent,
} from "../src/lib/services/santa";

const rejectsWith = async (p: Promise<unknown>, code: AppError["code"], re?: RegExp) => {
  await assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code && (!re || re.test(e.message)));
};
const base = { giftDate: "2099-12-25", drawDate: "2000-01-01", budget: "30", budgetKind: "MAX" };

beforeEach(resetDb);
after(() => prisma.$disconnect());

async function family() {
  const host = await makeUser("Hote", "HOST");
  const tom = await makeUser("Tom"); const sam = await makeUser("Sam");
  const julie = await makeUser("Julie"); const thomas = await makeUser("Thomas");
  return { host, tom, sam, julie, thomas, all: [host, tom, sam, julie, thomas] };
}

describe("tirage", () => {
  test("chaque membre ne voit que son propre destinataire, jamais la liste", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël 2026", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    const seen = new Set<string>();
    for (const u of f.all) {
      // Avant la découverte, la page ne contient même pas le destinataire.
      const page = await getEvent(u, ev.id);
      assert.deepEqual(page.myDraw, { state: "hidden" });
      const mine = await revealMyReceiver(u, ev.id);
      assert.notEqual(mine.id, u.id);
      seen.add(mine.id);
      const view = await getEvent(u, ev.id);
      assert.ok(view.myDraw.state === "seen" && view.myDraw.receiver.id === mine.id);
      // La réponse ne contient aucune autre attribution.
      const json = JSON.stringify(view) + JSON.stringify(mine);
      assert.ok(!/assignments|giverId|receiverId/.test(json));
      const others = f.all.filter((o) => o.id !== u.id && o.id !== mine.id);
      // Aucun autre participant n'apparaît dans la réponse.
      for (const o of others) assert.ok(!json.includes(o.id), `${o.displayName} visible par ${u.displayName}`);
    }
    assert.equal(seen.size, f.all.length, "chacun reçoit exactement une fois");
  });

  test("les exclusions sont respectées dans le résultat enregistré (50 tirages)", async () => {
    for (let k = 0; k < 50; k++) {
      await resetDb();
      const f = await family();
      const ev = await createEvent(f.host, { name: "Noël", ...base }, f.all.map((u) => u.id));
      await addExclusion(f.host, ev.id, f.tom.id, f.sam.id, false);
      await addExclusion(f.host, ev.id, f.julie.id, f.thomas.id, true);
      await runDraw(f.host, ev.id);
      const rows = await prisma.santaAssignment.findMany({ where: { eventId: ev.id } });
      const pair = new Map(rows.map((r) => [r.giverId, r.receiverId]));
      assert.equal(rows.length, 5);
      assert.notEqual(pair.get(f.tom.id), f.sam.id);
      assert.notEqual(pair.get(f.julie.id), f.thomas.id);
      assert.notEqual(pair.get(f.thomas.id), f.julie.id);
      for (const r of rows) assert.notEqual(r.giverId, r.receiverId);
      assert.equal(new Set(rows.map((r) => r.receiverId)).size, 5);
    }
  });

  test("tirage impossible : message explicatif et rien n'est enregistré", async () => {
    const f = await family();
    const ids = [f.tom.id, f.sam.id, f.julie.id];
    const ev = await createEvent(f.host, { name: "Petit", ...base }, ids);
    await addExclusion(f.host, ev.id, f.tom.id, f.sam.id, false);
    await addExclusion(f.host, ev.id, f.tom.id, f.julie.id, false);
    await rejectsWith(runDraw(f.host, ev.id), "INVALID", /Tom ne peut offrir de cadeau à personne/);
    assert.equal(await prisma.santaAssignment.count(), 0);
    assert.equal((await prisma.santaEvent.findUniqueOrThrow({ where: { id: ev.id } })).status, "OPEN");
  });

  test("le résultat ne change pas après déconnexion et reconnexion, et ne peut pas être relancé", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    const before = (await revealMyReceiver(f.sam, ev.id)).id;
    const relog = await login(f.sam.id, PASSWORD, freshIp());
    assert.ok(relog.ok);
    if (relog.ok) assert.equal((await revealMyReceiver(relog.user, ev.id)).id, before);
    await rejectsWith(runDraw(f.host, ev.id), "CONFLICT");
    // Deux clics simultanés : un seul tirage.
    await prisma.santaAssignment.deleteMany(); await prisma.santaEvent.update({ where: { id: ev.id }, data: { status: "OPEN" } });
    const r = await Promise.allSettled([runDraw(f.host, ev.id), runDraw(f.host, ev.id)]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(await prisma.santaAssignment.count(), 5);
  });

  test("pas de tirage avant la date prévue", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël", giftDate: "2099-12-25", drawDate: "2099-12-01", budget: "", budgetKind: "MAX" }, f.all.map((u) => u.id));
    await rejectsWith(runDraw(f.host, ev.id), "CONFLICT", /pas encore arrivée/);
    const view = await getEvent(f.sam, ev.id);
    assert.deepEqual(view.myDraw, { state: "none" });
    assert.equal(view.status, "OPEN");
    await rejectsWith(revealMyReceiver(f.sam, ev.id), "NOT_FOUND");
  });

  test("après le tirage : participants et exclusions verrouillés, l'événement ne peut plus être supprimé", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    await rejectsWith(setParticipants(f.host, ev.id, [f.tom.id, f.sam.id, f.julie.id]), "CONFLICT");
    await rejectsWith(addExclusion(f.host, ev.id, f.tom.id, f.sam.id, false), "CONFLICT");
    await rejectsWith(deleteEvent(f.host, ev.id), "CONFLICT");
    await rejectsWith(updateEvent(f.host, ev.id, { name: "Noël", giftDate: "2099-12-25", drawDate: "2000-01-02", budget: "30", budgetKind: "MAX" }), "INVALID");
    await updateEvent(f.host, ev.id, { name: "Noël en famille", ...base, budget: "40" });
  });

  test("l'Hôte voit qui a consulté son tirage, et les attributions seulement sur demande", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    const admin1 = await getEventAdmin(f.host, ev.id);
    // Les données d'administration ne contiennent aucune attribution.
    assert.ok(admin1.participants.every((p) => !("receiver" in p) && !("receiverId" in p)));
    assert.equal(admin1.participants.find((p) => p.id === f.sam.id)!.viewed, false);
    // Ouvrir la page ne suffit pas : « consulté » = animation de découverte lancée.
    await getEvent(f.sam, ev.id);
    assert.equal((await getEventAdmin(f.host, ev.id)).participants.find((p) => p.id === f.sam.id)!.viewed, false);
    await revealMyReceiver(f.sam, ev.id);
    assert.equal((await getEventAdmin(f.host, ev.id)).participants.find((p) => p.id === f.sam.id)!.viewed, true);
    assert.equal((await revealAssignments(f.host, ev.id)).length, 5);
  });
});

describe("visibilité et événements multiples", () => {
  test("un non-participant ne voit pas l'événement, même avec son identifiant", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Secret Santa des cousins", ...base }, [f.host.id, f.tom.id, f.sam.id]);
    await rejectsWith(getEvent(f.julie, ev.id), "NOT_FOUND");
    assert.equal((await listEvents(f.julie)).length, 0);
    assert.equal((await listEvents(f.tom)).length, 1);
  });

  test("deux événements coexistent sans mélanger participants, exclusions ni résultats", async () => {
    const f = await family();
    const e1 = await createEvent(f.host, { name: "Noël 2026", ...base }, f.all.map((u) => u.id));
    const e2 = await createEvent(f.host, { name: "Anniversaire", ...base }, [f.tom.id, f.sam.id, f.julie.id]);
    await addExclusion(f.host, e2.id, f.tom.id, f.sam.id, false);
    await runDraw(f.host, e1.id);
    assert.deepEqual((await getEvent(f.tom, e2.id)).myDraw, { state: "none" }, "le tirage de e1 n'affecte pas e2");
    await runDraw(f.host, e2.id);
    assert.equal(await prisma.santaAssignment.count({ where: { eventId: e1.id } }), 5);
    assert.equal(await prisma.santaAssignment.count({ where: { eventId: e2.id } }), 3);
    assert.equal(await prisma.santaExclusion.count({ where: { eventId: e1.id } }), 0);
    const r2 = await revealMyReceiver(f.tom, e2.id);
    assert.notEqual(r2.id, f.sam.id);
    assert.ok([f.sam.id, f.julie.id].includes(r2.id));
  });

  test("un événement passé reste consultable mais n'est plus modifiable", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël 2025", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    await prisma.santaEvent.update({ where: { id: ev.id }, data: { giftDate: "2025-12-25", drawDate: "2025-12-01" } });
    const view = await getEvent(f.sam, ev.id);
    assert.equal(view.past, true);
    assert.ok(await revealMyReceiver(f.sam, ev.id));
    await rejectsWith(updateEvent(f.host, ev.id, { name: "Modifié", giftDate: "2099-12-25", drawDate: "2025-12-01", budget: "", budgetKind: "MAX" }), "CONFLICT");
  });
});

describe("révélation animée", () => {
  test("rejouer l'animation renvoie toujours le même destinataire, sans nouveau tirage", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    const snapshot = await prisma.santaAssignment.findMany({ orderBy: { giverId: "asc" }, select: { giverId: true, receiverId: true } });
    const first = await revealMyReceiver(f.tom, ev.id);
    for (let i = 0; i < 10; i++) assert.equal((await revealMyReceiver(f.tom, ev.id)).id, first.id);
    const after = await prisma.santaAssignment.findMany({ orderBy: { giverId: "asc" }, select: { giverId: true, receiverId: true } });
    assert.deepEqual(after, snapshot);
    assert.equal((await prisma.santaEvent.findUniqueOrThrow({ where: { id: ev.id } })).status, "DRAWN");
  });

  test("un non-participant, même l'Hôte, n'obtient aucun destinataire", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Cousins", ...base }, [f.tom.id, f.sam.id, f.julie.id]);
    await runDraw(f.host, ev.id);
    await rejectsWith(revealMyReceiver(f.thomas, ev.id), "NOT_FOUND");
    await rejectsWith(revealMyReceiver(f.host, ev.id), "NOT_FOUND");
    await rejectsWith(revealMyReceiver(f.tom, "evenement-invente"), "NOT_FOUND");
  });

  test("le destinataire de chacun est bien celui du tirage enregistré", async () => {
    const f = await family();
    const ev = await createEvent(f.host, { name: "Noël", ...base }, f.all.map((u) => u.id));
    await runDraw(f.host, ev.id);
    for (const u of f.all) {
      const row = await prisma.santaAssignment.findUniqueOrThrow({ where: { eventId_giverId: { eventId: ev.id, giverId: u.id } } });
      assert.equal((await revealMyReceiver(u, ev.id)).id, row.receiverId);
    }
  });
});
