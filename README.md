# La Hotte familiale

Site privé de listes de Noël pour la famille : chacun écrit sa liste, les autres
réservent ce qu'ils offrent (sans doublon et sans que le destinataire le sache),
et l'Hôte organise des Secret Santa.

Pile : Next.js 15 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL.

## Sécurité, en bref

- **Pas d'inscription.** Le compte **Hôte** se crée une seule fois sur
  `/installation`, avec le jeton secret `SETUP_TOKEN` (variable d'hébergement).
  Un index unique partiel en base interdit tout second Hôte. Ensuite, seul
  l'Hôte crée les profils des membres.
- **Mots de passe** hachés avec scrypt (sel aléatoire, jamais stockés en clair).
  Le mot de passe initial donné par l'Hôte doit être changé à la première connexion.
- **Sessions** : jeton aléatoire dans un cookie `httpOnly`, `SameSite=Lax`,
  `Secure` en production ; seule son empreinte sha256 est stockée en base.
  Le compte est relu en base à chaque requête : désactivation ou
  réinitialisation prennent effet immédiatement.
- **Essais répétés** : blocage 15 min après 5 échecs sur un identifiant ou
  20 échecs depuis une même adresse IP. Message identique que l'identifiant
  existe ou non.
- **Autorisations vérifiées côté serveur**, dans `src/lib/services/*` : chaque
  fonction reçoit l'utilisateur authentifié et vérifie elle-même ses droits.
  L'interface ne fait que masquer ce que le serveur refuserait de toute façon.
- **Confidentialité** : le propriétaire d'une liste ne reçoit jamais l'état de
  réservation de ses cadeaux ; un membre ne reçoit que **son** destinataire du
  Secret Santa ; un non-participant ne voit pas l'événement (404).

## Lancer en local

Prérequis : Node 20+ et une base PostgreSQL.

```bash
npm install
cp .env.example .env          # puis renseigner DATABASE_URL, DIRECT_URL, SETUP_TOKEN
npx prisma migrate dev
npm run dev
```

Ouvrir http://localhost:3000/installation pour créer le compte Hôte.

## Déployer (Vercel + Neon, offres gratuites)

1. **Base** : créer un projet sur neon.tech. Copier l'URL « pooled » dans
   `DATABASE_URL` et l'URL directe (sans `-pooler`) dans `DIRECT_URL`.
2. **Vercel** : importer ce dépôt GitHub, puis ajouter les variables
   d'environnement `DATABASE_URL`, `DIRECT_URL` et `SETUP_TOKEN` (une longue
   phrase secrète, au moins 16 caractères).
3. Déployer. `npm run build` applique les migrations (`prisma migrate deploy`)
   à chaque déploiement, sans toucher aux données.
4. Ouvrir `https://<ton-site>/installation`, saisir le jeton et créer le
   compte Hôte. La page se ferme définitivement ensuite.
5. Depuis l'**Espace Hôte**, créer les profils et envoyer les identifiants par SMS.

### Reprendre les données de la première version

La première version (page claude.ai) contenait un profil : « Louenn »
(« Pointure 38 », aucun cadeau). Pour le reprendre, avec `DATABASE_URL` pointant
vers la base de production :

```bash
npm run importer-ancien-site
```

Le profil arrive sans identifiant ni mot de passe ; l'Hôte l'active depuis
l'Espace Hôte (« Gérer ce profil » : identifiant, puis mot de passe provisoire).
Le script est rejouable sans créer de doublon.

## Musique

« All I Want for Christmas Is You » est lue via le lecteur intégré de YouTube
(clip officiel) : c'est le seul moyen légal de diffuser ce titre sans en détenir
les droits. Le lecteur ne démarre qu'après un clic (exigence des navigateurs),
reste affiché en petit en bas à droite (exigence de YouTube) et continue sans
se relancer quand on change de page. Si l'ayant droit bloque la lecture
intégrée, le panneau propose un lien vers YouTube.

## Tests

```bash
npm test          # algorithme de tirage + sécurité et Secret Santa sur une vraie base
npm run test:e2e  # parcours complets dans Chromium (build de production)
```

`npm test` utilise la base de `.env.test` (son nom doit contenir « test »,
cf. `.env.test.example`) ; la créer une fois avec `npm run test:db`.
Les tests E2E utilisent une base `hotte_e2e`, vidée à chaque lancement
(cf. `playwright.config.ts`), et exigent `npx next build` au préalable.
