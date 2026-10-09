# Week-end en famille

Organisation des séjours familiaux (week-end ou semaine) : présences par repas, menus, chambres, activités et corvées tirées au sort.

- **Back** : FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Front** : React + Vite + TypeScript (`frontend/`)
- **Déploiement** : un seul conteneur, FastAPI sert l'API (`/api`) et le front compilé.

## Lancer en local

```bash
# Terminal 1 — API sur :8000
cd backend && uv run uvicorn app.main:app --reload

# Terminal 2 — front sur :5173 (proxy /api → :8000)
cd frontend && npm install && npm run dev
```

### Tests

| Commande | Ce qui est vérifié |
| --- | --- |
| `cd backend && uv run pytest --cov` | API (droits sur chaque route organisateur, isolation entre séjours, validations, règles métier), propriétés du tirage et des couchages (Hypothesis), service du front, fixtures, script serveur `family-env` (faux `once`). Couverture lignes + branches exigée : 100 %. |
| `cd frontend && npm run typecheck` | Types TypeScript. |
| `cd frontend && npm run test:coverage` | Logique du front (`lib`, `storage`, `api`) avec vitest, couverture 100 %. |
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
- après une modification de `deploy/server/family-env` : `bin/server sync`.

⚠️ Pas d'authentification forte, et **la page d'accueil liste tous les séjours** (choix assumé :
instance familiale). Tout visiteur peut donc ouvrir un séjour, lire et modifier les présences ;
seule la clé organisateur protège la configuration.

## Fonctionnement

**Accès (modèle Tricount)** — pas de compte. L'accueil liste tous les séjours (en cours, à venir, passés). Chaque séjour a :
- un lien famille `/s/<slug>` : chacun choisit son nom dans la liste, mémorisé dans le navigateur ;
- un lien organisateur `/s/<slug>/admin?key=<clé>` : la clé est mémorisée puis retirée de l'URL. Les routes `/api/stays/<slug>/admin/*` exigent l'en-tête `X-Admin-Key`.

**Image de couverture** — l'organisateur choisit une photo (JPEG, PNG ou WebP), réduite dans le navigateur à 1600 px en JPEG avant l'envoi (`PUT …/admin/cover`, corps brut, 5 Mo au plus, format reconnu aux premiers octets). Elle est stockée dans la base SQLite (table `stay_covers`, donc sauvegardée avec elle), affichée en tête de l'onglet « Moi » et en vignette sur l'accueil, et servie par `GET /api/stays/<slug>/cover?v=<version>` avec un cache long (la version change à chaque envoi).

**Foyers** — chaque personne appartient à un foyer (les personnes qui viennent ensemble) ; une nouvelle personne forme son propre foyer, un célibataire se crée donc en un geste. Tout adulte du foyer agit pour chacun : présences, inscriptions, corvées. Par défaut, « tout le foyer a les mêmes présences » : mes présences valent pour tous ; on décoche pour décaler quelqu'un. Le couple est un lien entre deux adultes du même foyer, proposé quand un célibataire ajoute un adulte. L'organisateur peut déplacer une personne, fusionner deux foyers (conjoints inscrits séparément) ou en supprimer un.

**Personnes** — adulte ou enfant (portions), « participe aux corvées » (défaut : oui pour un adulte, non pour un enfant), « participe aux activités ».

**Présences** — par repas (petit-déj, déjeuner, dîner) entre le premier repas du premier jour et le dernier repas du dernier jour. Présent sur place = présent au repas ; les couverts sont comptés adultes / enfants.

**Corvées** — chaque type a des moments (un ou plusieurs repas, ou « journée »), un nombre de personnes et un rythme (tous les N jours). Le tirage (`POST …/admin/chores/draw`) :
- ne retient que les personnes « corvées » présentes au créneau ;
- ne met jamais un couple sur la même corvée (contrainte dure, désactivable) — la place reste vide si c'est impossible ;
- équilibre la charge proportionnellement au temps de présence, évite deux corvées au même moment et varie les binômes ;
- garde le meilleur de 150 tirages aléatoires. « Re-répartir » écrase les ajustements manuels.

**Chambres** — lits doubles (2 places), simples (1), superposés (2), d'appoint (1). Affectation manuelle, ou proposition automatique pour les non-logés (couples en lit double, enfants près de leur adulte référent).

**Activités** — par défaut tout le monde (personnes « activités » présentes ce jour-là) ; une activité facultative demande une inscription.

**Impressions** — présences, corvées par personne et jour par jour, menus avec couverts, chambres, activités. Export texte menus × couverts à coller dans un LLM pour générer la liste de courses.

## Limites v1 / pistes

- Migrations Alembic (`backend/migrations`), appliquées au démarrage ; une base créée avant Alembic est reconnue comme `0001`. Pas de retour arrière : restaurer une sauvegarde once. Nouvelle migration : `cd backend && uv run alembic revision -m "…"` (un test vérifie que modèles et migrations ne divergent pas).
- Couchage fixe pour tout le séjour (pas de lit par nuit).
- Hors périmètre : covoiturage, notifications push, génération intégrée de la liste de courses par LLM.
