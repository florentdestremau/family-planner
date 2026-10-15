# Week-end en famille

Organisation des séjours familiaux (week-end ou semaine) : présences par repas, menus, chambres, activités et corvées tirées au sort.

- **Back** : FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Front** : React + Vite + TypeScript (`frontend/`)
- **Déploiement** : un seul conteneur, FastAPI sert l'API (`/api`) et le front compilé.

## Lancer en local

```bash
# Terminal 1 — API sur :8000 (met la clé Anthropic dans backend/.env)
cd backend && uv run uvicorn app.main:app --reload --env-file .env

# Terminal 2 — front sur :5173 (proxy /api → :8000)
cd frontend && npm install && npm run dev
```

Sans clé (`ANTHROPIC_API_KEY` dans `backend/.env`, ignoré par git), l'assistant est désactivé et son bouton reste masqué. Pour le tester sans consommer de crédits : `ASSISTANT_STUB=true` sert des réponses déterministes (mode démo, aussi utilisé par les tests e2e).

### Tests

| Commande | Ce qui est vérifié |
| --- | --- |
| `cd backend && uv run pytest --cov` | API (droits sur chaque route organisateur, isolation entre séjours, validations, règles métier), propriétés du tirage et des couchages (Hypothesis), service du front, fixtures, script serveur `family-env` (faux `once`). Couverture lignes + branches exigée : 100 %. |
| `cd frontend && npm run typecheck` | Types TypeScript. |
| `cd frontend && npm run lint` | Lint strict du front avec oxlint, règles typées comprises (promesses oubliées, `any`, conditions non booléennes, hooks, accessibilité). Config commentée : `frontend/.oxlintrc.json`. |
| `cd frontend && npm run test:coverage` | Logique du front (`lib`, `storage`, `api`, `pwa`) avec vitest, couverture 100 %. |
| `cd frontend && npm run test:e2e` | Parcours complets dans Chromium, bureau et mobile, contre le vrai back (base jetable, fixtures). |

### Fixtures

Deux séjours de démonstration aux arrivées et départs très échelonnés (grand week-end de 4 jours `/s/demo`, semaine `/s/ete`),
clé organisateur `demo` :

```bash
cd backend && uv run python -m app.fixtures          # charge ceux qui manquent
cd backend && uv run python -m app.fixtures --reset  # les recharge
```

Avec `FIXTURES=true`, l'application les charge au démarrage (environnements de PR).

## Docker & déploiement once

L'image suit les conventions once : écoute sur le port 80, base SQLite sur le volume `/storage`,
sonde de santé `/up` branchée sur le `HEALTHCHECK`.

```bash
docker build -t family-planner .
docker run -p 8080:80 -v family-planner-data:/storage family-planner
```

### CI/CD et environnements éphémères (repris d'ardha-app)

`.github/workflows/ci.yml` : tests back, image construite et testée (`/up`, fixtures, front servi),
publiée sur `ghcr.io/florentdestremau/family-planner` (`sha-<7>` immuable, `pr-<n>` ou `master`), puis :

- **PR** → `https://family-planning-pr-<n>.once.florent.cc`, chargé avec les fixtures, base neuve à chaque
  push ; lien en commentaire de la PR ;
- **master** → production `https://family-planning.once.florent.cc` (sauvegardes automatiques once) ;
- **PR fermée** → environnement supprimé ; balayage nocturne des orphelins (`environments.yml`).

Côté serveur, `deploy/server/family-env` (`create | update [--reset-db] | remove | list | logs | sweep`)
pilote once ; au plus 4 environnements de PR. Depuis le poste : `bin/server sync` pour copier le
script, puis `bin/server list`, `bin/server logs production --tail 100`, etc.

**Mise en route** (faite le 05/10/2026) :

- clé SSH de la CI dans `~/.ssh/authorized_keys` du serveur, restreinte au script :
  `command="/home/ubuntu/family-planner/family-env ci",restrict ssh-ed25519 … family-planner-ci@github-actions` ;
- secrets du dépôt `ONCE_SSH_KEY` et `ONCE_KNOWN_HOSTS`, variable `DEPLOY_ONCE=true` (la passer à
  `false` coupe tous les déploiements automatiques) ;
- après une modification de `deploy/server/family-env` : `bin/server sync` ;
- clé de l'assistant IA dans `~/family-planner/secrets.env` du serveur (`ANTHROPIC_API_KEY=…`, chmod 600) :
  `family-env` la passe à la production et à chaque environnement de PR (prise en compte au déploiement
  suivant). Sans ce fichier, l'assistant reste désactivé.

⚠️ Pas d'authentification forte, et **la page d'accueil liste tous les séjours** (choix assumé :
instance familiale). Tout visiteur peut donc ouvrir un séjour, lire et modifier les présences ;
seule la clé organisateur protège la configuration.

## Fonctionnement

**Accès (modèle Tricount)** — pas de compte. L'accueil liste tous les séjours (en cours, à venir, passés). Chaque séjour a :
- un lien famille `/s/<slug>` : chacun choisit son nom dans la liste, mémorisé dans le navigateur ;
- un lien organisateur `/s/<slug>/admin?key=<clé>` : la clé est mémorisée puis retirée de l'URL. Les routes `/api/stays/<slug>/admin/*` exigent l'en-tête `X-Admin-Key`. L'espace organisateur demande d'abord « qui êtes-vous ? » (journal d'activité) ; un organisateur qui ne vient pas s'ajoute comme participant, sans présences.

**Image de couverture** — l'organisateur choisit une photo (JPEG, PNG ou WebP). Le navigateur la réduit à 1600 px (JPEG pour une photo, WebP pour garder la transparence d'un PNG ; une image déjà petite part telle quelle) et refuse d'emblée un fichier de plus de 5 Mo. Envoi en corps brut (`PUT …/admin/cover`), lu seulement après la clé organisateur et coupé au-delà de 5 Mo ; format reconnu aux premiers octets, puis image décodée (Pillow, 16 Mpx au plus) pour en tirer une vignette carrée WebP de 192 px. Image et vignette sont stockées dans la base SQLite (table `stay_covers`, donc sauvegardées avec elle). La couverture s'affiche en tête de l'onglet « Moi », la vignette sur l'accueil ; servies par `GET /api/stays/<slug>/cover?v=<version>` et `…/cover/thumb?v=<version>`, en cache d'un an seulement pour la version courante. La version est un horodatage en ms, toujours croissant : jamais reprise, même après un retrait.

**Journal d'activité** — chaque modification du séjour (présences et nuits, heures d'arrivée et de départ, lits, foyers et personnes, régimes, menus, corvées et tirage, activités et inscriptions, chambres, réglages, lieu, image de couverture) ajoute une phrase en français, écrite au moment de l'action avec les noms d'alors : « Marie a modifié les présences de Paul — repas retiré : sam. 31/10 (dîner) ». L'auteur est la personne désignée sur l'appareil, que le front déclare à chaque modification (en-tête `X-Actor`) : c'est déclaratif, rien ne le vérifie, comme le reste de l'application ; sans elle, « l'organisateur » ou « quelqu'un ». Les présences validées depuis l'assistant portent « via l'assistant » (`X-Via: assistant`). Les consultations ne sont pas notées. Une modification qui ne change rien n'ajoute pas de ligne. Chaque ligne garde les personnes concernées, pour les filtres « Me concerne » et « Mon foyer ». Visible par tous : aperçu « Activité récente » sur « Moi » et page « Activité du séjour » (`GET /api/stays/<slug>/journal`, paginée, filtrable par personne). L'organisateur a l'onglet « Journal » avec, en plus, le détail des gestes de masse (tirage relancé, proposition des lits, fusion ou suppression d'un foyer, d'une personne, d'une chambre, d'un lit, d'une activité, d'une corvée, dates raccourcies) : ce qu'ils ont remplacé ou supprimé, de quoi le refaire à la main (`GET …/admin/journal`). Pas d'annulation automatique. Les cases de régime apparaissent en clair, la précision libre jamais ; de même pour les heures, en clair, sans la note. Conservé toute la vie du séjour (supprimé avec lui) ; pas consultable hors ligne (non sauvegardé dans le cache). Pitch et décisions : `docs/pitches/journal-activite.md`.

**Lieu et infos pratiques** — l'organisateur saisit, dans « Organisation », l'adresse, un lien Google Maps facultatif et des consignes en texte libre (portail, parking, heure d'arrivée, ce qu'il faut apporter, wifi…), au plus 300, 500 et 2 000 caractères (`PATCH …/admin/stay`). Le lien de carte est celui qui a été collé (Google Maps seulement : `maps.app.goo.gl`, `goo.gl/maps`, `google.<pays>/maps`, en https), sinon une recherche Google Maps de l'adresse. En tête de l'onglet « Moi », sous la couverture et avant même d'avoir choisi son nom : l'adresse, « Ouvrir dans Google Maps », « Copier l'adresse », puis les consignes repliées ; les liens et les numéros de téléphone y sont cliquables (texte brut, jamais interprété comme du HTML). La mention « Mis à jour le … » change quand l'adresse, le lien ou les consignes changent. Ces informations sont **publiques comme tout le séjour** : l'aide à la saisie le rappelle. Fiche imprimable « Infos pratiques ». Pitch et décisions : `docs/pitches/lieu-infos-pratiques.md`.

**Foyers** — chaque personne appartient à un foyer (les personnes qui viennent ensemble) ; une nouvelle personne forme son propre foyer, un célibataire se crée donc en un geste. Tout adulte du foyer agit pour chacun : présences, inscriptions, corvées. Par défaut, « tout le foyer a les mêmes présences » : mes présences valent pour tous ; on décoche pour décaler quelqu'un. Le couple est un lien entre deux adultes du même foyer, proposé quand un célibataire ajoute un adulte. L'organisateur peut déplacer une personne, fusionner deux foyers (conjoints inscrits séparément) ou en supprimer un.

**Personnes** — adulte ou enfant (portions), « participe aux corvées » (défaut : oui pour un adulte, non pour un enfant).

**Régimes et allergies** — chaque adulte les déclare pour les membres de son foyer, depuis la carte « Régimes et allergies » de la page « Moi » (proposé aussi juste après l'ajout d'un membre) ; l'organisateur peut corriger depuis « Foyers ». Une courte liste comptée — végétarien ou végan (l'un ou l'autre), sans gluten, sans lactose, allergie arachides et fruits à coque, allergie poisson et fruits de mer — plus une précision libre, affichée mais non comptée (gravité, autre aliment, préférence). Chaque repas affiche les contraintes de ses présents en nombres (« 🌱 2 végétariens · ⚠️ 1 sans gluten »), dépliables sur les noms : page « Repas », corvées de repas de la page « Moi », menus de l'organisateur (avec un récapitulatif du séjour). La fiche menus imprimée donne les noms en entier ; l'export LLM, des nombres et les précisions, jamais de noms. Visibles par tous les participants (même modèle d'accès que le reste) ; l'application informe, elle ne vérifie pas les menus. Voir `docs/pitches/contraintes-alimentaires.md`.

**Présences** — par repas (petit-déj, déjeuner, dîner) entre le premier repas du premier jour et le dernier repas du dernier jour, et par nuit (nuit du jour J, de J à J+1 ; pas de nuit le dernier jour). Les couverts sont comptés adultes / enfants, les couchages par nuit. Les nuits suivent les repas sans deviner : dîner et petit-déj du lendemain → nuit cochée, ni l'un ni l'autre → décochée, un seul (arrivée après le dîner, nuit ailleurs) → on garde la case telle quelle. Détails : `docs/nuits.md`.

**Heures d'arrivée et de départ** — chaque personne a une heure d'arrivée, une heure de départ et une courte note (« nous aurons déjà dîné »), saisies sous la grille des présences de « Moi » par un adulte du foyer (« Même heure pour tout le foyer » recopie une ligne sur les autres membres), ou corrigées par l'organisateur depuis « Foyers », qui y voit aussi qui n'en a pas donné (`PUT …/households/<id>/times`). On ne choisit que l'heure, au quart d'heure, de 5 h à 23 h 45 puis « dans la nuit » jusqu'à 4 h (rattachée à la veille) ; le jour se déduit des présences : premier repas ou première nuit, dernier repas ou lendemain de la dernière nuit (un départ dans la nuit se rattache au dernier jour sur place). Aucun lien avec les repas : l'heure ne les vérifie ni ne les modifie. Tant qu'il manque une heure à un membre présent, une invitation reste affichée. Le planning (onglet Activités) mêle arrivées et départs aux activités, regroupés par heure, ceux sans heure en fin de jour, et affiche un jour dès qu'il a une activité, une arrivée ou un départ ; « Mis à jour à … » signale un changement de cette heure (ou de la note) fait le jour même. Le tableau des présences (écran et fiche imprimée) rappelle les heures sous chaque nom, et la fiche « Planning de présence » commence par les arrivées et départs. Pitch et décisions : `docs/pitches/heures-arrivee-depart.md`.

**Assistant (formulaires conversationnels)** — un bouton ✨ ouvre un panneau de discussion ; on décrit les présences du foyer en langue naturelle (« toute l'équipe au dîner du vendredi », « on arrive après le dîner ») ou à la voix (micro, si le navigateur le permet). L'assistant (modèle `claude-sonnet-5-5`, effort bas) propose des présences, vérifiées par les règles du foyer, et chaque proposition se valide ou s'ignore d'un clic — ce qui met à jour les présences comme la grille habituelle. Le panneau exige d'avoir choisi « qui je suis ». Limite : 30 demandes par séjour et par jour.

**Corvées** — chaque type a des moments (un ou plusieurs repas, ou « journée »), un nombre de personnes et un rythme (tous les N jours). Le tirage (`POST …/admin/chores/draw`) :
- ne retient que les personnes « corvées » présentes au créneau ;
- ne met jamais un couple sur la même corvée (contrainte dure, désactivable) — la place reste vide si c'est impossible ;
- équilibre la charge proportionnellement au temps de présence, évite deux corvées au même moment et varie les binômes ;
- garde le meilleur de 150 tirages aléatoires. « Re-répartir » écrase les ajustements manuels.

**Chambres** — lits doubles (2 places), simples (1), superposés (2), d'appoint (1). Le lit se choisit nuit par nuit (capacité vérifiée chaque nuit) : par défaut pour toutes les nuits de la personne, ou pour une nuit précise (une chambre qui sert à deux familles des nuits différentes). Une nuit ajoutée reprend le lit voisin. Coucher quelqu'un une nuit qu'il n'a pas déclarée l'ajoute, avec un avertissement. Proposition automatique nuit par nuit pour les non-logés (chacun garde son lit d'une nuit à l'autre, couples en lit double, enfants près de leur adulte référent).

**Activités** — toutes sur inscription. Depuis le planning, chacun inscrit ou retire les membres de son foyer, activité par activité (inscription possible même absent ce jour-là, avec un avertissement) ; l'accueil résume les activités du foyer. L'organisateur peut « inscrire tout le monde » : à la création (coché par défaut) ou plus tard d'un bouton, les personnes présentes ce jour-là qui manquent sont inscrites ; celles qui se sont retirées ne sont pas réinscrites. L'organisateur voit les inscrits de chaque activité et peut en retirer un d'un clic. Retirer une présence ou déplacer une activité ne touche pas aux inscriptions.

**Impressions** — arrivées, départs et présences, corvées par personne et jour par jour, menus avec couverts, régimes et allergies, chambres, activités, infos pratiques. Export texte menus × couverts (avec les régimes et allergies en nombres) à coller dans un LLM pour générer la liste de courses.

**Appli installable et hors ligne (PWA)** — un bouton 📲 « Installer l'appli » apparaît quand le navigateur le permet (Chrome, Edge, Android) ; sur iPhone et iPad, il explique l'ajout depuis Safari (Partager → Sur l'écran d'accueil). Sur mobile, un bandeau discret le suggère à partir de la 3ᵉ page vue ; « Plus tard » le masque (retour au plus tôt 14 jours et 3 pages après, 3 refus au plus). Hors ligne, **consultation seule** :
- l'interface est servie par un service worker (`vite-plugin-pwa`, cache de `index.html` et `/assets`) ;
- les données (liste des séjours, séjours déjà ouverts sur l'appareil) viennent du cache de React Query, sauvegardé dans le navigateur une semaine et vidé à chaque nouvelle version du front ;
- un bandeau indique l'heure des données ; inscriptions, présences, création de séjour et espace organisateur sont désactivés, l'assistant est masqué ; rien n'est mis en file pour plus tard.

Une nouvelle version déployée est proposée par « ✨ Nouvelle version disponible — Recharger » (vérification toutes les heures). Le back sert `index.html`, `sw.js` et le manifest en `no-cache`, `/assets` en `immutable`. Icônes : `cd frontend && node scripts/icons.mjs` les régénère dans `public/`.

## Limites v1 / pistes

- Migrations Alembic (`backend/migrations`), appliquées au démarrage ; une base créée avant Alembic est reconnue comme `0001`. Pas de retour arrière : restaurer une sauvegarde once. Nouvelle migration : `cd backend && uv run alembic revision -m "…"` (un test vérifie que modèles et migrations ne divergent pas).
- Hors périmètre : notifications push, modifications hors ligne synchronisées au retour du réseau, génération intégrée de la liste de courses par LLM, covoiturage (étudié en octobre 2026 : trop lourd pour le gain, le besoin se limitant aux voitures d'arrivée et de départ).
