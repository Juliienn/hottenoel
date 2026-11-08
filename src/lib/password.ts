import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt (inclus dans Node, aucune dépendance native à compiler sur Vercel).
// N = 2^15 : ~100 ms par essai sur un serveur, assez lent pour décourager
// une attaque hors ligne si la base fuyait, assez rapide pour une connexion.
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Hash factice : quand l'identifiant n'existe pas, on vérifie quand même un
// mot de passe pour que le temps de réponse ne révèle pas quels comptes existent.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  return dummyHash;
}

export const PASSWORD_MIN_LENGTH = 8;

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (pw.length > 200) return "Le mot de passe est trop long.";
  return null;
}

// Mot de passe provisoire généré côté serveur, facile à taper depuis un SMS :
// trois mots de Noël et un nombre (« sapin-givre-lutin-42 »). 40 mots → 40³ × 90
// ≈ 5,8 millions de possibilités (≈ 22 bits) : avec la limite de 5 essais par
// quart d'heure et par profil, plus de 1 000 ans en moyenne pour le deviner,
// et il ne sert que jusqu'à la première connexion.
const WORDS = [
  "sapin", "renne", "flocon", "etoile", "houx", "lutin", "biche", "neige", "boule", "cadeau",
  "bougie", "givre", "traineau", "hotte", "guirlande", "cannelle", "clochette", "chocolat", "marron", "buche",
  "noisette", "pain-epice", "mitaine", "bonnet", "echarpe", "chalet", "sucre", "orange", "lanterne", "ruban",
  "papillote", "gui", "pomme", "luge", "igloo", "ours", "hibou", "vanille", "noel", "cheminee",
];

export function generateTempPassword(): string {
  const w = () => WORDS[randomInt(WORDS.length)];
  return `${w()}-${w()}-${w()}-${randomInt(10, 100)}`;
}
