// Administration des comptes : réservé à l'Hôte, vérifié ici et nulle part ailleurs.
import { prisma } from "../prisma";
import { hashPassword } from "../password";
import { normalizeAvatar } from "../avatar";
import { deleteAllSessionsOf, type SessionUser } from "../auth/core";
import { AppError, notFound } from "./errors";
import { assertHost, assertReady } from "./guards";
import { checkPassword, cleanDisplayName, cleanLogin, isUniqueViolation } from "./account";

export async function listMembers(actor: SessionUser) {
  assertHost(actor); assertReady(actor);
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: {
      id: true, login: true, displayName: true, role: true, active: true, mustChangePassword: true,
      avatar: true, createdAt: true, passwordHash: true, _count: { select: { items: true } },
    },
  });
  // Le hash ne sort jamais du serveur : on n'en garde que l'existence.
  return users.map(({ passwordHash, avatar, _count, ...u }) => ({
    ...u, hasPassword: !!passwordHash, avatar: normalizeAvatar(avatar), itemCount: _count.items,
  }));
}

export async function createMember(actor: SessionUser, data: { displayName: string; login: string; password: string }) {
  assertHost(actor); assertReady(actor);
  const displayName = cleanDisplayName(data.displayName);
  const login = cleanLogin(data.login);
  checkPassword(data.password);
  try {
    return await prisma.user.create({
      // Toujours MEMBER : aucun chemin ne crée un second Hôte.
      data: { displayName, login, role: "MEMBER", passwordHash: await hashPassword(data.password), mustChangePassword: true },
      select: { id: true, login: true, displayName: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", `L'identifiant « ${login} » est déjà utilisé.`);
    throw e;
  }
}

async function getTarget(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, login: true } });
  if (!u) throw notFound("Membre");
  return u;
}

export async function updateMember(actor: SessionUser, id: string, data: { displayName: string; login: string }) {
  assertHost(actor); assertReady(actor);
  await getTarget(id);
  const displayName = cleanDisplayName(data.displayName);
  const login = cleanLogin(data.login);
  try {
    await prisma.user.update({ where: { id }, data: { displayName, login } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", `L'identifiant « ${login} » est déjà utilisé.`);
    throw e;
  }
}

export async function resetMemberPassword(actor: SessionUser, id: string, password: string) {
  assertHost(actor); assertReady(actor);
  const target = await getTarget(id);
  if (target.id === actor.id) throw new AppError("INVALID", "Pour ton propre mot de passe, passe par « Mon compte ».");
  if (!target.login) throw new AppError("INVALID", "Donne d'abord un identifiant à ce profil.");
  checkPassword(password);
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } });
  // Toute session ouverte avec l'ancien mot de passe est fermée.
  await deleteAllSessionsOf(id);
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
