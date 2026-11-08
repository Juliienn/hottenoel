// Administration des comptes : réservé à l'Hôte, vérifié ici et nulle part ailleurs.
import { prisma } from "../prisma";
import { generateTempPassword, hashPassword } from "../password";
import { normalizeAvatar } from "../avatar";
import { normalizePhone } from "../phone";
import { deleteAllSessionsOf, type SessionUser } from "../auth/core";
import { AppError, invalid, notFound } from "./errors";
import { assertHost, assertReady } from "./guards";
import { assertNameFree, checkPassword, cleanDisplayName } from "./account";

export function cleanPhone(raw: string | undefined): string | null {
  try {
    return normalizePhone(raw ?? "");
  } catch (e) {
    throw invalid((e as Error).message);
  }
}

/** Mot de passe saisi par l'Hôte, ou généré côté serveur si le champ est vide. */
function initialPassword(raw: string | undefined): string {
  const pw = (raw ?? "").trim() === "" ? generateTempPassword() : (raw as string);
  return checkPassword(pw);
}

export async function listMembers(actor: SessionUser) {
  assertHost(actor); assertReady(actor);
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: {
      id: true, displayName: true, role: true, active: true, mustChangePassword: true, phone: true,
      avatar: true, createdAt: true, passwordHash: true, _count: { select: { items: true } },
    },
  });
  // Le hash ne sort jamais du serveur : on n'en garde que l'existence.
  return users.map(({ passwordHash, avatar, _count, ...u }) => ({
    ...u, hasPassword: !!passwordHash, avatar: normalizeAvatar(avatar), itemCount: _count.items,
  }));
}

/** Crée un profil. Aucun identifiant à inventer : l'id technique unique est
 * généré par la base, le prénom (unique) sert de nom affiché. Le mot de passe
 * initial, saisi ou généré, est renvoyé UNE fois à l'Hôte pour le SMS, puis
 * n'existe plus qu'à l'état haché. */
export async function createMember(actor: SessionUser, data: { displayName: string; password?: string; avatar?: unknown; phone?: string }) {
  assertHost(actor); assertReady(actor);
  const displayName = cleanDisplayName(data.displayName);
  const phone = cleanPhone(data.phone);
  const password = initialPassword(data.password);
  await assertNameFree(displayName);
  const user = await prisma.user.create({
    // Toujours MEMBER : aucun chemin ne crée un second Hôte.
    data: {
      displayName, phone, role: "MEMBER", avatar: normalizeAvatar(data.avatar),
      passwordHash: await hashPassword(password), mustChangePassword: true,
    },
    select: { id: true, displayName: true, phone: true },
  });
  return { ...user, password };
}

async function getTarget(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, displayName: true, phone: true } });
  if (!u) throw notFound("Membre");
  return u;
}

export async function updateMember(actor: SessionUser, id: string, data: { displayName: string; avatar?: unknown; phone?: string }) {
  assertHost(actor); assertReady(actor);
  await getTarget(id);
  const displayName = cleanDisplayName(data.displayName);
  const phone = cleanPhone(data.phone);
  await assertNameFree(displayName, id);
  await prisma.user.update({
    where: { id },
    data: { displayName, phone, ...(data.avatar !== undefined ? { avatar: normalizeAvatar(data.avatar) } : {}) },
  });
}

/** Nouveau mot de passe provisoire (saisi, ou généré si vide). Renvoyé une
 * seule fois à l'Hôte. Active aussi un profil importé qui n'en avait pas. */
export async function resetMemberPassword(actor: SessionUser, id: string, password?: string) {
  assertHost(actor); assertReady(actor);
  const target = await getTarget(id);
  if (target.id === actor.id) throw new AppError("INVALID", "Pour ton propre mot de passe, passe par « Mon compte ».");
  const pw = initialPassword(password);
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true } });
  // Toute session ouverte avec l'ancien mot de passe est fermée.
  await deleteAllSessionsOf(id);
  return { id: target.id, displayName: target.displayName, phone: target.phone, password: pw };
}

export async function setMemberActive(actor: SessionUser, id: string, active: boolean) {
  assertHost(actor); assertReady(actor);
  const target = await getTarget(id);
  if (target.role === "HOST") throw new AppError("INVALID", "Le compte Hôte ne peut pas être désactivé.");
  await prisma.user.update({ where: { id }, data: { active } });
  if (!active) await deleteAllSessionsOf(id);
}

export async function deleteMember(actor: SessionUser, id: string) {
  assertHost(actor); assertReady(actor);
  const target = await getTarget(id);
  if (target.role === "HOST") throw new AppError("INVALID", "Le compte Hôte ne peut pas être supprimé.");
  const drawn = await prisma.santaAssignment.findFirst({
    where: { OR: [{ giverId: id }, { receiverId: id }] },
    select: { event: { select: { name: true } } },
  });
  if (drawn) {
    throw new AppError("CONFLICT", `Ce membre fait partie du tirage déjà effectué « ${drawn.event.name} » : le supprimer fausserait le résultat des autres. Désactive plutôt son compte.`);
  }
  // Supprime aussi sa liste, ses réservations et ses sessions (cascade).
  await prisma.user.delete({ where: { id } });
}
