// Secret Santa. Règles de confidentialité appliquées ici, côté serveur :
// - un membre ne lit que les événements dont il est participant ;
// - il ne reçoit que SA propre attribution, jamais la liste complète ;
// - seul l'Hôte crée, modifie, tire au sort, et peut (sur demande explicite)
//   afficher l'ensemble des attributions.
import { prisma } from "../prisma";
import { normalizeAvatar } from "../avatar";
import type { SessionUser } from "../auth/core";
import { daysBetween, isDayKey, parisDayKey } from "../parisTime";
import { draw, isValidDraw, MIN_PARTICIPANTS, type DrawFailure } from "../santaDraw";
import { AppError, invalid, notFound } from "./errors";
import { assertHost, assertReady } from "./guards";

export type EventInput = { name: string; giftDate: string; drawDate: string; budget: string; budgetKind: string };

function cleanEvent(input: EventInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw invalid("Donne un nom à l'événement.");
  if (name.length > 80) throw invalid("Le nom fait au plus 80 caractères.");
  if (!isDayKey(input.giftDate)) throw invalid("Indique la date de remise des cadeaux.");
  if (!isDayKey(input.drawDate)) throw invalid("Indique la date du tirage au sort.");
  if (daysBetween(input.drawDate, input.giftDate) < 0) throw invalid("Le tirage doit avoir lieu avant (ou le jour de) la remise des cadeaux.");
  const raw = input.budget.trim().replace(",", ".");
  let budgetCents: number | null = null;
  if (raw) {
    const b = Number(raw);
    if (!Number.isFinite(b) || b < 0 || b > 10_000) throw invalid("Le budget doit être un nombre entre 0 et 10 000 €.");
    budgetCents = Math.round(b * 100);
  }
  const budgetKind = input.budgetKind === "MAX" ? "MAX" as const : "INDICATIF" as const;
  return { name, giftDate: input.giftDate, drawDate: input.drawDate, budgetCents, budgetKind };
}

/** Un événement dont la date de remise est passée est archivé : lecture seule. */
export const isPast = (giftDate: string, today = parisDayKey()) => daysBetween(today, giftDate) < 0;

async function loadEvent(id: string) {
  const ev = await prisma.santaEvent.findUnique({ where: { id } });
  if (!ev) throw notFound("Événement");
  return ev;
}

function assertEditable(ev: { giftDate: string }) {
  if (isPast(ev.giftDate)) throw new AppError("CONFLICT", "Cet événement est terminé : il reste consultable mais ne peut plus être modifié.");
}

function assertOpen(ev: { status: string; giftDate: string }) {
  assertEditable(ev);
  if (ev.status !== "OPEN") throw new AppError("CONFLICT", "Le tirage a déjà eu lieu : les participants et les exclusions ne peuvent plus changer.");
}

async function assertEligibleMembers(ids: string[]) {
  const n = await prisma.user.count({ where: { id: { in: ids }, active: true, passwordHash: { not: null } } });
  if (n !== ids.length) throw invalid("Un des participants n'existe pas ou son compte est désactivé.");
}

// ---------- Lecture ----------

export async function listEvents(actor: SessionUser) {
  assertReady(actor);
  const events = await prisma.santaEvent.findMany({
    where: actor.role === "HOST" ? {} : { participants: { some: { userId: actor.id } } },
    select: {
      id: true, name: true, giftDate: true, drawDate: true, budgetCents: true, budgetKind: true, status: true,
      _count: { select: { participants: true } },
      participants: { where: { userId: actor.id }, select: { userId: true } },
    },
  });
  const today = parisDayKey();
  return events
    .map(({ _count, participants, ...e }) => ({ ...e, participantCount: _count.participants, isParticipant: participants.length > 0, past: isPast(e.giftDate, today) }))
    .sort((a, b) => Number(a.past) - Number(b.past) || (a.past ? b.giftDate.localeCompare(a.giftDate) : a.giftDate.localeCompare(b.giftDate)));
}

/** Vue d'un événement pour n'importe quel membre. Contient au plus UNE
 * attribution : celle dont l'utilisateur est le donneur. */
export async function getEvent(actor: SessionUser, id: string) {
  assertReady(actor);
  const ev = await prisma.santaEvent.findUnique({
    where: { id },
    select: {
      id: true, name: true, giftDate: true, drawDate: true, budgetCents: true, budgetKind: true, status: true, drawnAt: true,
      _count: { select: { participants: true } },
      participants: { where: { userId: actor.id }, select: { userId: true } },
    },
  });
  // Un membre non participant n'apprend même pas que l'événement existe.
  if (!ev || (actor.role !== "HOST" && ev.participants.length === 0)) throw notFound("Événement");
  const isParticipant = ev.participants.length > 0;

  // Le nom du destinataire n'est JAMAIS envoyé avec la page tant que le
  // participant ne l'a pas découvert (bouton + animation, cf. revealMyReceiver) :
  // impossible de le lire dans le code source de la page avant.
  let myDraw: { state: "none" } | { state: "hidden" } | { state: "seen"; receiver: Receiver } = { state: "none" };
  if (ev.status === "DRAWN" && isParticipant) {
    const a = await prisma.santaAssignment.findUnique({
      where: { eventId_giverId: { eventId: id, giverId: actor.id } },
      select: { viewedAt: true, receiver: { select: { id: true, displayName: true, avatar: true } } },
    });
    if (a) myDraw = a.viewedAt ? { state: "seen", receiver: toReceiver(a.receiver) } : { state: "hidden" };
  }
  const { _count, participants: _p, ...rest } = ev;
  return { ...rest, participantCount: _count.participants, isParticipant, past: isPast(ev.giftDate), myDraw };
}

type Receiver = { id: string; displayName: string; avatar: ReturnType<typeof normalizeAvatar> };
const toReceiver = (r: { id: string; displayName: string; avatar: unknown }): Receiver =>
  ({ id: r.id, displayName: r.displayName, avatar: normalizeAvatar(r.avatar) });

/** Destinataire de l'utilisateur connecté pour cet événement, et lui seul :
 * le donneur est TOUJOURS l'acteur authentifié, jamais un paramètre venu du
 * navigateur. Simple lecture du tirage enregistré : la rejouer ne retire
 * jamais au sort. Marque le tirage comme découvert (vu par l'Hôte). */
export async function revealMyReceiver(actor: SessionUser, eventId: string): Promise<Receiver> {
  assertReady(actor);
  const a = await prisma.santaAssignment.findUnique({
    where: { eventId_giverId: { eventId, giverId: actor.id } },
    select: { viewedAt: true, receiver: { select: { id: true, displayName: true, avatar: true } } },
  });
  // Non participant, tirage pas encore fait ou événement inventé : même réponse.
  if (!a) throw notFound("Tirage");
  if (!a.viewedAt) {
    await prisma.santaAssignment.update({ where: { eventId_giverId: { eventId, giverId: actor.id } }, data: { viewedAt: new Date() } });
  }
  return toReceiver(a.receiver);
}

/** Données d'administration (Hôte) : participants, exclusions, qui a consulté
 * son tirage — mais PAS les attributions elles-mêmes (cf. revealAssignments). */
export async function getEventAdmin(actor: SessionUser, id: string) {
  assertHost(actor); assertReady(actor);
  const ev = await prisma.santaEvent.findUnique({
    where: { id },
    select: {
      participants: { select: { user: { select: { id: true, displayName: true, avatar: true, active: true } } } },
      exclusions: { select: { id: true, giver: { select: { id: true, displayName: true } }, receiver: { select: { id: true, displayName: true } } } },
      assignments: { select: { giverId: true, viewedAt: true } },
    },
  });
  if (!ev) throw notFound("Événement");
  const viewed = new Map(ev.assignments.map((a) => [a.giverId, !!a.viewedAt]));
  const candidates = await prisma.user.findMany({
    where: { active: true, passwordHash: { not: null } },
    select: { id: true, displayName: true, avatar: true },
    orderBy: { displayName: "asc" },
  });
  return {
    participants: ev.participants
      .map((p) => ({ id: p.user.id, displayName: p.user.displayName, avatar: normalizeAvatar(p.user.avatar), active: p.user.active, viewed: viewed.get(p.user.id) ?? false }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr")),
    exclusions: ev.exclusions
      .map((x) => ({ id: x.id, giver: x.giver.displayName, receiver: x.receiver.displayName }))
      .sort((a, b) => a.giver.localeCompare(b.giver, "fr")),
    candidates: candidates.map((c) => ({ ...c, avatar: normalizeAvatar(c.avatar) })),
  };
}

// ---------- Écriture (Hôte) ----------

export async function createEvent(actor: SessionUser, input: EventInput, participantIds: string[] = []) {
  assertHost(actor); assertReady(actor);
  const data = cleanEvent(input);
  if (isPast(data.giftDate)) throw invalid("La date de remise des cadeaux est déjà passée.");
  const ids = [...new Set(participantIds)];
  if (ids.length) await assertEligibleMembers(ids);
  return prisma.santaEvent.create({
    data: { ...data, participants: { create: ids.map((userId) => ({ userId })) } },
    select: { id: true },
  });
}

export async function updateEvent(actor: SessionUser, id: string, input: EventInput) {
  assertHost(actor); assertReady(actor);
  const ev = await loadEvent(id);
  assertEditable(ev);
  const data = cleanEvent(input);
  if (isPast(data.giftDate)) throw invalid("La date de remise des cadeaux ne peut pas être dans le passé.");
  if (ev.status === "DRAWN" && data.drawDate !== ev.drawDate) throw invalid("Le tirage a déjà eu lieu : sa date ne peut plus changer.");
  await prisma.santaEvent.update({ where: { id }, data });
}

/** Supprime l'événement et tout ce qui en dépend (participants, exclusions,
 * messages et, s'il a eu lieu, le résultat du tirage). Après un tirage, la
 * suppression doit être confirmée explicitement (confirmDrawn) : une page
 * restée ouverte depuis avant le tirage ne peut pas l'effacer par mégarde. */
export async function deleteEvent(actor: SessionUser, id: string, confirmDrawn = false) {
  assertHost(actor); assertReady(actor);
  const ev = await loadEvent(id);
  if (ev.status === "DRAWN" && !confirmDrawn) {
    throw new AppError("CONFLICT", "Le tirage de cet événement a déjà eu lieu : confirme que tu veux aussi effacer son résultat.");
  }
  await prisma.santaEvent.delete({ where: { id } });
}

export async function setParticipants(actor: SessionUser, id: string, userIds: string[]) {
  assertHost(actor); assertReady(actor);
  const ev = await loadEvent(id);
  assertOpen(ev);
  const ids = [...new Set(userIds)];
  await assertEligibleMembers(ids);
  await prisma.$transaction([
    prisma.santaParticipant.deleteMany({ where: { eventId: id, userId: { notIn: ids } } }),
    prisma.santaParticipant.createMany({ data: ids.map((userId) => ({ eventId: id, userId })), skipDuplicates: true }),
    // Une exclusion qui touche un ancien participant n'a plus de sens.
    prisma.santaExclusion.deleteMany({ where: { eventId: id, OR: [{ giverId: { notIn: ids } }, { receiverId: { notIn: ids } }] } }),
  ]);
}

export async function addExclusion(actor: SessionUser, id: string, giverId: string, receiverId: string, bothWays: boolean) {
  assertHost(actor); assertReady(actor);
  const ev = await loadEvent(id);
  assertOpen(ev);
  if (giverId === receiverId) throw invalid("Choisis deux personnes différentes (personne ne se tire de toute façon soi-même).");
  const n = await prisma.santaParticipant.count({ where: { eventId: id, userId: { in: [giverId, receiverId] } } });
  if (n !== 2) throw invalid("Les deux personnes doivent faire partie des participants.");
  const pairs = bothWays ? [[giverId, receiverId], [receiverId, giverId]] : [[giverId, receiverId]];
  await prisma.santaExclusion.createMany({ data: pairs.map(([g, r]) => ({ eventId: id, giverId: g, receiverId: r })), skipDuplicates: true });
}

export async function removeExclusion(actor: SessionUser, eventId: string, exclusionId: string) {
  assertHost(actor); assertReady(actor);
  const ev = await loadEvent(eventId);
  assertOpen(ev);
  const { count } = await prisma.santaExclusion.deleteMany({ where: { id: exclusionId, eventId } });
  if (!count) throw notFound("Exclusion");
}

function explainFailure(f: DrawFailure, names: Map<string, string>): string {
  const list = (ids: string[]) => {
    const n = ids.map((i) => names.get(i) ?? "?");
    return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} et ${n[n.length - 1]}`;
  };
  switch (f.kind) {
    case "too_few":
      return `Il faut au moins ${f.min} participants pour un tirage.`;
    case "no_receiver":
      return `Tirage impossible : avec les exclusions actuelles, ${list(f.givers)} ne ${f.givers.length > 1 ? "peuvent" : "peut"} offrir de cadeau à personne. Retire une exclusion ou ajoute un participant.`;
    case "no_giver":
      return `Tirage impossible : avec les exclusions actuelles, personne ne peut offrir de cadeau à ${list(f.receivers)}. Retire une exclusion ou ajoute un participant.`;
    case "blocked_group":
      return `Tirage impossible : ${list(f.givers)} (${f.givers.length} personnes) ne peuvent offrir qu'à ${list(f.receivers)} (${f.receivers.length} ${f.receivers.length > 1 ? "personnes" : "personne"}). Il manque des destinataires possibles : retire une exclusion qui les concerne ou ajoute un participant.`;
  }
}

export async function runDraw(actor: SessionUser, id: string) {
  assertHost(actor); assertReady(actor);
  const ev = await prisma.santaEvent.findUnique({
    where: { id },
    include: {
      participants: { select: { user: { select: { id: true, displayName: true, active: true } } } },
      exclusions: { select: { giverId: true, receiverId: true } },
    },
  });
  if (!ev) throw notFound("Événement");
  assertOpen(ev);
  const today = parisDayKey();
  if (daysBetween(today, ev.drawDate) > 0) {
    throw new AppError("CONFLICT", "La date du tirage n'est pas encore arrivée. Si tu veux tirer au sort maintenant, avance d'abord la date du tirage.");
  }
  const inactive = ev.participants.filter((p) => !p.user.active);
  if (inactive.length) throw invalid(`Retire d'abord les participants dont le compte est désactivé : ${inactive.map((p) => p.user.displayName).join(", ")}.`);

  const ids = ev.participants.map((p) => p.user.id);
  const exclusions = ev.exclusions.map((x) => [x.giverId, x.receiverId] as [string, string]);
  const result = draw(ids, exclusions);
  if (!result.ok) throw new AppError("INVALID", explainFailure(result.failure, new Map(ev.participants.map((p) => [p.user.id, p.user.displayName]))));
  if (!isValidDraw(ids, exclusions, result.pairs)) throw new Error("Tirage incohérent : refusé avant enregistrement.");

  await prisma.$transaction(async (tx) => {
    // Le passage OPEN → DRAWN ne réussit qu'une fois : deux clics simultanés
    // ne peuvent pas produire deux tirages (le second trouve DRAWN).
    const { count } = await tx.santaEvent.updateMany({ where: { id, status: "OPEN" }, data: { status: "DRAWN", drawnAt: new Date() } });
    if (count !== 1) throw new AppError("CONFLICT", "Le tirage vient déjà d'être effectué.");
    await tx.santaAssignment.createMany({ data: [...result.pairs].map(([giverId, receiverId]) => ({ eventId: id, giverId, receiverId })) });
  });
}

/** Liste complète des attributions : Hôte uniquement, et seulement sur demande
 * explicite dans l'interface (elle gâche la surprise de l'Hôte s'il participe). */
export async function revealAssignments(actor: SessionUser, id: string) {
  assertHost(actor); assertReady(actor);
  const rows = await prisma.santaAssignment.findMany({
    where: { eventId: id },
    select: { giver: { select: { displayName: true } }, receiver: { select: { displayName: true } } },
  });
  return rows.map((r) => ({ giver: r.giver.displayName, receiver: r.receiver.displayName }))
    .sort((a, b) => a.giver.localeCompare(b.giver, "fr"));
}

export { MIN_PARTICIPANTS };
