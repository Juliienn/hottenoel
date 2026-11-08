# La Hotte familiale

Site privé de listes de Noël pour la famille : chacun écrit sa liste, les autres
réservent ce qu'ils offrent (sans doublon et sans que le destinataire le sache),
et l'Hôte organise des Secret Santa.

Pile : Next.js 15 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL.

## Sécurité, en bref

- **Connexion par profil, façon « qui regarde ? ».** L'écran de connexion
  affiche les vignettes (avatar + prénom) des profils actifs ; on choisit la
  sienne puis on tape **son** mot de passe, vérifié côté serveur. Cliquer sur
  une vignette ne donne aucun accès. Plus d'identifiant à saisir : chaque
  profil garde son identifiant technique unique (`User.id`), qui porte toutes
  les relations (listes, réservations, Secret Santa). Les prénoms sont uniques
  (sans tenir compte des majuscules). Conséquence assumée : quiconque connaît
  l'adresse du site voit les prénoms et avatars de la famille.
- **Pas d'inscription.** Le compte **Hôte** se crée une seule fois sur
  `/installation`, avec le jeton secret `SETUP_TOKEN` (variable d'hébergement).
  Un index unique partiel en base interdit tout second Hôte. Ensuite, seul
  l'Hôte crée les profils des membres.
- **Mots de passe** hachés avec scrypt (sel aléatoire, jamais stockés en clair,
  hash jamais envoyé au navigateur). Le mot de passe initial (saisi par l'Hôte
  ou généré : « sapin-givre-lutin-42 ») doit être changé à la première connexion.
  Il n'est montré qu'une fois à l'Hôte ; pour le renvoyer plus tard, l'Hôte en
  génère un nouveau (l'ancien cesse alors de fonctionner).
- **Sessions** : jeton aléatoire dans un cookie `httpOnly`, `SameSite=Lax`,
  `Secure` en production ; seule son empreinte sha256 est stockée en base.
  Le compte est relu en base à chaque requête : désactivation ou
  réinitialisation prennent effet immédiatement.
- **Essais répétés** : blocage 15 min après 5 échecs sur un profil ou
  20 échecs depuis une même adresse IP.
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

Ouvrir http://localhost:3000/installation pour créer le compte Hôte (prénom +
mot de passe). En ligne de commande : `npm run creer-hote -- "Prénom" "mot de passe"`
(avec `DATABASE_URL` dans l'environnement).

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
5. Depuis l'**Espace Hôte**, créer les profils (prénom, avatar, portable) et
   envoyer les accès par SMS.

La migration `20261108180000_profils_sans_identifiant` est purement additive
(colonne `User.phone`, table `Setting`) : aucun compte existant n'est modifié.
L'ancienne colonne `login` est conservée mais n'est plus utilisée ; les comptes
existants apparaissent directement dans la grille avec leur mot de passe actuel.

## Envoi des accès par SMS

Chaque ligne de l'Espace Hôte a un bouton **SMS**. Le mot de passe étant haché,
il n'est connu qu'au moment de sa création : juste après « Créer le profil »,
ou après « Générer un nouveau mot de passe provisoire » (confirmation demandée,
l'ancien cesse de fonctionner). Le mode « Simple rappel » envoie le lien et le
prénom sans mot de passe. Le texte est modifiable avant chaque envoi, et le
modèle par défaut se règle dans « Message SMS » (variables `{prenom}`,
`{motdepasse}`, `{lien}`).

Moyens d'envoi, avec un retour honnête sur ce qui s'est passé :

- **Ouvrir l'application SMS** (lien `sms:`) : sur smartphone (et sur Mac avec
  Messages), ouvre la messagerie avec le numéro et le texte préremplis. Le site
  indique si l'application s'est ouverte, mais **pas** si le SMS est parti :
  c'est l'Hôte qui appuie sur Envoyer.
- **Envoyer via Twilio / Brevo** (si configuré, cf. `.env.example`) : le serveur
  envoie le SMS au numéro enregistré en base (jamais à un numéro fourni par le
  navigateur). Le message affiché signifie « accepté par le fournisseur »,
  pas « reçu » : l'accusé de réception n'est pas suivi.
- **Copier le message**, partout.

Coût : le modèle contient des emojis, donc le SMS est encodé en Unicode
(70 caractères par segment) : le message par défaut fait 4 segments facturés.
Retirer les emojis du modèle le ramène à 2 segments.

### Reprendre les données de la première version

La première version (page claude.ai) contenait un profil : « Louenn »
(« Pointure 38 », aucun cadeau). Pour le reprendre, avec `DATABASE_URL` pointant
vers la base de production :

```bash
npm run importer-ancien-site
```

Le profil arrive sans mot de passe (donc absent de l'écran de connexion) ;
l'Hôte l'active depuis l'Espace Hôte (« Gérer ce profil » → « Activer le
profil », ou bouton SMS). Le script est rejouable sans créer de doublon.

## Écran d'accueil

À la première ouverture du site dans un onglet, une animation de ~5 s (nuit
étoilée, neige, guirlande, traîneau qui traverse le ciel, sapin, titre) se
superpose à la page, puis s'efface en la dévoilant (connexion ou liste). Elle
ne revient ni en changeant de page, ni en rechargeant l'onglet
(`sessionStorage`), seulement dans un nouvel onglet ou une nouvelle visite.
« Entrer » ou Échap la passent. Animations réduites si le système le demande ;
sans JavaScript, elle n'apparaît pas.

Musique : l'accueil tente de lancer le titre automatiquement. **La plupart des
navigateurs refusent le son sans clic préalable** sur le site : dans ce cas,
rien ne joue et un bouton « Activer la musique » apparaît ; le clic lance la
musique et relance l'animation pour qu'elles démarrent ensemble. Si le membre
a coupé la musique, l'accueil ne la relance plus d'office sur cet appareil.

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
