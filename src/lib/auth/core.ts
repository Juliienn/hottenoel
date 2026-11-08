// Sessions et connexion, sans dépendance à Next : testable directement contre
// la base (tests/*.test.ts). Les cookies sont gérés dans ./next.ts.
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "../prisma";
import { getDummyHash, verifyPassword } from "../password";

export const SESSION_COOKIE = "hotte_session";
export const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
  avatar: unknown;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** Relit le compte en base à chaque requête : un compte désactivé, un rôle
 * changé ou un mot de passe réinitialisé prennent effet immédiatement. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      id: true, expiresAt: true,
      user: { select: { id: true, displayName: true, role: true, mustChangePassword: true, avatar: true, active: true, passwordHash: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now() || !session.user.active || !session.user.passwordHash) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const { active: _a, passwordHash: _p, ...user } = session.user;
  return user;
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function deleteAllSessionsOf(userId: string, exceptToken?: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptToken ? { NOT: { id: hashToken(exceptToken) } } : {}) },
  });
}

// ---------- Connexion avec limitation des essais ----------

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILS_PER_LOGIN = 5;
export const MAX_FAILS_PER_IP = 20;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: SessionUser }
  | { ok: false; error: string };

/** Identifiant technique (cuid) reçu du formulaire : on refuse tout le reste
 * avant même d'interroger la base. */
const PROFILE_ID_RE = /^[a-z0-9]{8,40}$/i;

/** Connexion à un profil choisi dans la grille : son id technique + son mot
 * de passe. Cliquer sur un profil ne donne aucun accès : sans le bon mot de
 * passe, vérifié ici côté serveur, aucune session n'est créée. */
export async function login(profileId: string, password: string, ip: string): Promise<LoginResult> {
  const key = profileId.trim();
  if (!key || !PROFILE_ID_RE.test(key)) return { ok: false, error: "Choisis ton profil." };
  if (!password) return { ok: false, error: "Indique ton mot de passe." };

  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [failsProfile, failsIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { login: key, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (failsProfile >= MAX_FAILS_PER_LOGIN || failsIp >= MAX_FAILS_PER_IP) {
    return { ok: false, error: "Trop de tentatives ratées. Réessaie dans 15 minutes, ou demande à l'Hôte de réinitialiser ton mot de passe." };
  }

  const user = await prisma.user.findUnique({ where: { id: key } });
  // Toujours vérifier un hash, même sans compte : même durée de réponse.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  const success = !!user && !!user.passwordHash && user.active && ok;

  await prisma.loginAttempt.create({ data: { login: key, ip, success } });
  // Ménage : le journal ne sert que sur 15 minutes.
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });

  if (!success || !user) {
    // Même message pour un profil inconnu, désactivé ou un mauvais mot de passe.
    return { ok: false, error: "Mot de passe incorrect." };
  }
  await prisma.loginAttempt.deleteMany({ where: { login: key, success: false } });
  const { token, expiresAt } = await createSession(user.id);
  return {
    ok: true, token, expiresAt,
    user: { id: user.id, displayName: user.displayName, role: user.role, mustChangePassword: user.mustChangePassword, avatar: user.avatar },
  };
}
