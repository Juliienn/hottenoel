// Reprend les profils et listes de la première version du site (page
// claude.ai), exportés dans scripts/donnees/ancien-site.json.
// Les profils arrivent SANS mot de passe (absents de l'écran de connexion) :
// l'Hôte les active depuis l'Espace Hôte (« Gérer ce profil » → « Activer le
// profil »), ce qui lui laisse le contrôle de qui peut se connecter.
// Rejouable sans risque : un profil du même prénom n'est pas recréé.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { normalizeAvatar } from "../src/lib/avatar";

type OldItem = { title: string; price?: number | null; link?: string; note?: string; wish?: number };
type OldMember = { name: string; about?: string; avatar?: unknown; items?: OldItem[] };

async function main() {
  const file = process.argv[2] ?? join(__dirname, "donnees", "ancien-site.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as { members: OldMember[] };
  for (const m of data.members) {
    const exists = await prisma.user.findFirst({ where: { displayName: { equals: m.name, mode: "insensitive" } } });
    if (exists) { console.log(`Déjà importé : ${m.name}`); continue; }
    const user = await prisma.user.create({
      data: {
        displayName: m.name.slice(0, 40), about: (m.about ?? "").slice(0, 600), avatar: normalizeAvatar(m.avatar),
        role: "MEMBER", login: null, passwordHash: null, mustChangePassword: true,
        items: {
          create: (m.items ?? []).map((it) => ({
            title: it.title.slice(0, 120),
            priceCents: typeof it.price === "number" ? Math.round(it.price * 100) : null,
            link: it.link ?? "", note: it.note ?? "", wish: Math.min(3, Math.max(1, it.wish ?? 2)),
          })),
        },
      },
    });
    console.log(`Importé : ${user.displayName} (${m.items?.length ?? 0} cadeau(x)) — à activer dans l'Espace Hôte.`);
  }
}

main().finally(() => prisma.$disconnect());
