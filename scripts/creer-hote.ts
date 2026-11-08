// Alternative à la page /installation, pour qui a accès au serveur :
//   npm run creer-hote -- "Prénom" "mot de passe"
// Mêmes règles : impossible s'il existe déjà un Hôte.
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { assertNameFree, checkPassword, cleanDisplayName, hostExists } from "../src/lib/services/account";

async function main() {
  const [name, password] = process.argv.slice(2);
  if (!name || !password) throw new Error('Usage : npm run creer-hote -- "Prénom" "mot de passe"');
  if (await hostExists()) throw new Error("Un compte Hôte existe déjà.");
  checkPassword(password);
  const displayName = cleanDisplayName(name);
  await assertNameFree(displayName);
  await prisma.user.create({
    data: { displayName, role: "HOST", passwordHash: await hashPassword(password), mustChangePassword: false },
  });
  console.log("Compte Hôte créé.");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
