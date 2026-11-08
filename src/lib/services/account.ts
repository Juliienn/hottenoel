import { timingSafeEqual, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword, passwordProblem, verifyPassword } from "../password";
import { normalizeAvatar } from "../avatar";
import { deleteAllSessionsOf, normalizeLogin, type SessionUser } from "../auth/core";
import { AppError, invalid } from "./errors";
import { assertReady } from "./guards";

export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const LOGIN_RULES = "3 à 30 caractères : lettres minuscules sans accent, chiffres, point, tiret ou tiret bas.";

export function cleanDisplayName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw invalid("Indique un prénom ou un surnom.");
  if (name.length > 40) throw invalid("Le prénom fait au plus 40 caractères.");
  return name;
}

export function cleanLogin(raw: string): string {
  const login = normalizeLogin(raw);
  if (!LOGIN_RE.test(login)) throw invalid(`Identifiant invalide : ${LOGIN_RULES}`);
  return login;
}

export function checkPassword(pw: string): string {
  const problem = passwordProblem(pw);
  if (problem) throw invalid(problem);
  return pw;
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
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
export async function setupHost(setupToken: string, data: { displayName: string; login: string; password: string }) {
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 16) throw new AppError("FORBIDDEN", "L'installation est désactivée : la variable SETUP_TOKEN n'est pas configurée (16 caractères minimum).");
  if (!sameSecret(setupToken, expected)) throw new AppError("FORBIDDEN", "Jeton d'installation incorrect.");
  if (await hostExists()) throw new AppError("CONFLICT", "Le compte Hôte existe déjà.");
  const displayName = cleanDisplayName(data.displayName);
  const login = cleanLogin(data.login);
  checkPassword(data.password);
  try {
    return await prisma.user.create({
      data: { displayName, login, role: "HOST", passwordHash: await hashPassword(data.password), mustChangePassword: false },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "Le compte Hôte existe déjà, ou cet identifiant est pris.");
    throw e;
  }
}

// ---------- Mon compte ----------

export async function getMyAccount(actor: SessionUser) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { id: true, login: true, displayName: true, about: true, avatar: true, role: true },
  });
  return { ...u, avatar: normalizeAvatar(u.avatar) };
}

export async function updateMyProfile(actor: SessionUser, data: { displayName: string; about: string; avatar: unknown }) {
  assertReady(actor);
  const about = data.about.trim();
  if (about.length > 600) throw invalid("La présentation fait au plus 600 caractères.");
  await prisma.user.update({
    where: { id: actor.id },
    // Le rôle, l'identifiant et l'état du compte ne sont jamais modifiables ici.
    data: { displayName: cleanDisplayName(data.displayName), about, avatar: normalizeAvatar(data.avatar) },
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
