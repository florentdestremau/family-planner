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

Tests back : `cd backend && uv run pytest`

### Fixtures

Deux séjours de démonstration (week-end `/s/demo`, semaine avec arrivées échelonnées `/s/ete`),
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

- **PR** → `https://famille-pr-<n>.once.florent.cc`, chargé avec les fixtures, base neuve à chaque
  push ; lien en commentaire de la PR ;
- **master** → production `https://famille.once.florent.cc` (sauvegardes automatiques once) ;
- **PR fermée** → environnement supprimé ; balayage nocturne des orphelins (`environments.yml`).

Côté serveur, `deploy/server/family-env` (`create | update [--reset-db] | remove | list | logs | sweep`)
pilote once ; au plus 4 environnements de PR. Depuis le poste : `bin/server sync` pour copier le
script, puis `bin/server list`, `bin/server logs production --tail 100`, etc.

**Mise en route (une fois)** :

1. `bin/server sync`
2. Clé SSH dédiée à la CI, restreinte au script, dans `~/.ssh/authorized_keys` du serveur :
   `command="/home/ubuntu/family-planner/family-env ci",restrict ssh-ed25519 AAAA… family-planner-ci`
3. Secrets du dépôt `ONCE_SSH_KEY` (clé privée) et `ONCE_KNOWN_HOSTS`
   (`ssh-keyscan ssh.once.florent.cc`), puis variable `DEPLOY_ONCE=true`.
4. Paquet ghcr.io en public après le premier push (sinon, identifiants de registre pour once).
5. Production : `bin/server create production --image ghcr.io/florentdestremau/family-planner:sha-<7>`.

⚠️ Pas d'authentification forte : qui connaît le lien d'un séjour peut lire et modifier
les présences ; seule la clé organisateur protège la configuration.

## Fonctionnement

**Accès (modèle Tricount)** — pas de compte. Chaque séjour a :
- un lien famille `/s/<slug>` : chacun choisit son nom dans la liste, mémorisé dans le navigateur ;
- un lien organisateur `/s/<slug>/admin?key=<clé>` : la clé est mémorisée puis retirée de l'URL. Les routes `/api/stays/<slug>/admin/*` exigent l'en-tête `X-Admin-Key`.

**Personnes** — adulte ou enfant (portions), « participe aux corvées » (défaut : oui pour un adulte, non pour un enfant), « participe aux activités ». Un enfant est rattaché à un adulte qui gère ses présences et inscriptions. Le couple est un lien symétrique entre deux adultes.

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

- Pas de migrations (création des tables au démarrage) : ajouter Alembic avant de faire évoluer le schéma en production.
- Couchage fixe pour tout le séjour (pas de lit par nuit).
- Hors périmètre : covoiturage, notifications push, génération intégrée de la liste de courses par LLM.
