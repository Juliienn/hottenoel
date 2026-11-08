// Tests d'intégration : vraie base Postgres, jamais celle de développement.
// La commande `npm test` pointe DATABASE_URL vers TEST_DATABASE_URL.
import { prisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/password";
import { login, type SessionUser } from "../../src/lib/auth/core";

if (!/test/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Les tests d'intégration exigent une base dont le nom contient « test » (DATABASE_URL).");
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "SantaAssignment","SantaExclusion","SantaParticipant","SantaEvent","Claim","WishItem","Session","LoginAttempt","Setting","User" CASCADE`,
  );
}

let ipCounter = 0;
export const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

export const PASSWORD = "mot-de-passe-solide";

/** Crée un compte puis se connecte réellement : l'acteur obtenu est celui
 * que le serveur relit en base, rôle compris. */
export async function makeUser(name: string, role: "HOST" | "MEMBER" = "MEMBER"): Promise<SessionUser & { token: string }> {
  const u = await prisma.user.create({
    data: { displayName: name, role, passwordHash: await hashPassword(PASSWORD), mustChangePassword: false },
  });
  // Connexion comme dans l'écran de sélection : id du profil + mot de passe.
  const r = await login(u.id, PASSWORD, freshIp());
  if (!r.ok) throw new Error(r.error);
  return { ...r.user, token: r.token };
}

export { prisma };
