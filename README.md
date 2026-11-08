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

### Déploiement automatique

Le projet Vercel étant relié au dépôt GitHub, chaque mise à jour de `main` est
déployée automatiquement par Vercel. En parallèle, `.github/workflows/deploy.yml`
lance la vérification des types et les tests (sur une base Postgres jetable) :
s'il passe au rouge, revenir à la version précédente dans Vercel
(Deployments → Promote) puis corriger.

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

## Secret Santa : annonces et révélation

**Prévenir les participants.** Juste après la création d'un événement, puis
juste après le tirage, l'Hôte voit la question « Souhaites-tu prévenir les
participants ? » (« Envoyer un message » ou « Plus tard » ; les deux annonces
restent ensuite disponibles dans « Organisation »). Le message est prérempli
(nom, dates, budget, participants ; ou « le tirage a eu lieu ») et modifiable,
puis envoyé après confirmation :

- **sur le site, toujours** : bandeau « Nouveau message de l'Hôte » et
  rubrique « Messages de l'Hôte » sur la page de l'événement, visibles des
  seuls participants (rien à configurer) ;
- **par SMS automatique** si Twilio ou Brevo est configuré (cf. plus haut) :
  un SMS par participant ayant un numéro, compte rendu par personne ;
- **sinon**, un lien « Ouvrir l'app SMS » par participant (message prérempli,
  l'Hôte appuie sur Envoyer : l'envoi n'est pas confirmé par le site).

Destinataires relus en base : uniquement les participants de l'événement.
Le message de tirage est généré sans aucune donnée du tirage.

**Révélation animée.** Le destinataire n'est plus dans la page : le
participant clique sur « Découvrir mon Secret Santa », une animation plein
écran de ~12 s (neige, « Ho Ho Ho… », cadeau qui tremble puis s'ouvre,
confettis) révèle le prénom. Le serveur ne renvoie que le destinataire de
l'utilisateur connecté (le donneur n'est jamais un paramètre de la requête),
par simple lecture du tirage enregistré : « Revoir l'animation » rejoue tout,
avec exactement le même résultat. L'Hôte voit « A découvert son tirage »
quand l'animation a été lancée.

Musique : la chanson démarre au clic (donc autorisée par le navigateur) à
45 s, pour que l'ouverture du cadeau (8 s plus tard) tombe sur l'entrée de la
batterie, à **53 s** dans la vidéo officielle. Si ce n'est pas juste à
l'écoute, changer `SONG_DROP_S` dans
`src/app/(prive)/secret-santa/[id]/SantaReveal.tsx`. Bouton 🔊/🔇 (mémorisé),
« Passer », et animation sans musique si YouTube ne répond pas dans les 3,5 s.

## Écran d'accueil

À la première ouverture du site dans un onglet, une animation de ~5 s (nuit
étoilée, neige, guirlande, traîneau qui traverse le ciel, sapin, titre) se
superpose à la page, puis s'efface en la dévoilant (connexion ou liste). Elle
ne revient ni en changeant de page, ni en rechargeant l'onglet
(`sessionStorage`), seulement dans un nouvel onglet ou une nouvelle visite.
« Entrer » ou Échap la passent. Animations réduites si le système le demande ;
sans JavaScript, elle n'apparaît pas.

Musique : elle accompagne l'animation puis s'éteint en fondu quand l'accueil
s'efface ; le bouton « Musique » la relance ensuite à la demande. **Les
navigateurs interdisent le son tant que le visiteur n'a pas cliqué sur le
site** (règle de Chrome, Safari, Firefox, Edge ; aucun site ne peut la
contourner). L'accueil le détecte en quelques millisecondes : si le son est
permis (sites souvent visités dans Chrome, réglage « Autoriser le son »), la
musique part seule ; sinon l'animation attend un clic sur « Ouvrir avec la
musique » (qui relance l'animation en même temps que la chanson) ou « Entrer
sans musique ».

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
