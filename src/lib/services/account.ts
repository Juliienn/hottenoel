import { timingSafeEqual, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword, passwordProblem, verifyPassword } from "../password";
import { normalizeAvatar } from "../avatar";
import { deleteAllSessionsOf, type SessionUser } from "../auth/core";
import { AppError, invalid } from "./errors";
import { assertReady } from "./guards";

export function cleanDisplayName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw invalid("Indique un prénom ou un surnom.");
  if (name.length > 40) throw invalid("Le prénom fait au plus 40 caractères.");
  return name;
}

/** Le prénom est le seul repère visible dans l'écran de connexion : deux
 * profils ne peuvent pas porter le même (sans tenir compte des majuscules). */
export async function assertNameFree(displayName: string, exceptId?: string): Promise<void> {
  const clash = await prisma.user.findFirst({
    where: { displayName: { equals: displayName, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError("CONFLICT", `Un profil s'appelle déjà « ${displayName} ». Ajoute une initiale ou un surnom pour les distinguer.`);
}

export function checkPassword(pw: string): string {
  const problem = passwordProblem(pw);
  if (problem) throw invalid(problem);
  return pw;
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// ---------- Écran de connexion ----------

/** Profils proposés dans la grille de connexion, avant toute authentification.
 * Ne contient que ce qui s'affiche sur une vignette (prénom, avatar, Hôte ou
 * non) et l'id technique à renvoyer avec le mot de passe. Les profils
 * désactivés ou sans mot de passe (importés, pas encore activés) n'y sont pas. */
export async function listLoginProfiles() {
  const users = await prisma.user.findMany({
    where: { active: true, passwordHash: { not: null } },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: { id: true, displayName: true, avatar: true, role: true },
  });
  return users.map((u) => ({ id: u.id, displayName: u.displayName, avatar: normalizeAvatar(u.avatar), isHost: u.role === "HOST" }));
}

// ---------- Installation : création du compte Hôte ----------

export async function hostExists(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: "HOST" } })) > 0;
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Le compte Hôte ne peut naître qu'ici : il faut le jeton SETUP_TOKEN,
 * connu seulement de qui configure l'hébergement, et aucun Hôte ne doit
 * exister. Un index unique partiel en base interdit un second Hôte, même en
 * cas de deux installations simultanées. */
export async function setupHost(setupToken: string, data: { displayName: string; password: string; avatar?: unknown }) {
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 16) throw new AppError("FORBIDDEN", "L'installation est désactivée : la variable SETUP_TOKEN n'est pas configurée (16 caractères minimum).");
  if (!sameSecret(setupToken, expected)) throw new AppError("FORBIDDEN", "Jeton d'installation incorrect.");
  if (await hostExists()) throw new AppError("CONFLICT", "Le compte Hôte existe déjà.");
  const displayName = cleanDisplayName(data.displayName);
  checkPassword(data.password);
  await assertNameFree(displayName);
  try {
    return await prisma.user.create({
      data: { displayName, role: "HOST", avatar: normalizeAvatar(data.avatar), passwordHash: await hashPassword(data.password), mustChangePassword: false },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "Le compte Hôte existe déjà.");
    throw e;
  }
}

// ---------- Mon compte ----------

export async function getMyAccount(actor: SessionUser) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { id: true, displayName: true, about: true, avatar: true, role: true },
  });
  return { ...u, avatar: normalizeAvatar(u.avatar) };
}

export async function updateMyProfile(actor: SessionUser, data: { displayName: string; about: string; avatar: unknown }) {
  assertReady(actor);
  const about = data.about.trim();
  if (about.length > 600) throw invalid("La présentation fait au plus 600 caractères.");
  const displayName = cleanDisplayName(data.displayName);
  await assertNameFree(displayName, actor.id);
  await prisma.user.update({
    where: { id: actor.id },
    // Le rôle, le téléphone et l'état du compte ne sont jamais modifiables ici.
    data: { displayName, about, avatar: normalizeAvatar(data.avatar) },
  });
}

export async function changeMyPassword(actor: SessionUser, current: string, next: string, keepToken?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw invalid("Ton mot de passe actuel est incorrect.");
  checkPassword(next);
  if (next === current) throw invalid("Choisis un mot de passe différent de l'actuel.");
  await prisma.user.update({
    where: { id: actor.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  // Les autres appareils connectés sont déconnectés.
  await deleteAllSessionsOf(actor.id, keepToken);
}
