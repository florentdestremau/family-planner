---
name: ship
description: Livre la branche courante de family-planner. Ouvre la PR, attend l'environnement éphémère family-planning-pr-<n>, y lance des tests e2e de recette, puis fusionne et suit le déploiement en production si tout est vert et que la fusion est autorisée.
argument-hint: "[--merge]"
when_to_use: "Quand on demande d'ouvrir la PR, de tester sur l'environnement de PR ou de livrer en production."
disable-model-invocation: true
---

# Livrer une PR de family-planner

Circuit complet : branche à jour → PR → CI → environnement éphémère → recette e2e sur cet
environnement → fusion → déploiement en production.

**Principe :** on s'arrête au premier rouge et on fait un rapport. On ne fusionne que si l'utilisateur
l'a demandé dans sa requête, ou avec `--merge`. On ne contourne jamais une vérification
(`gh pr merge --admin`, push forcé sur `master`, test désactivé pour passer).

## 1. Branche à jour et vérifications locales

1. `git fetch origin`, puis rebase sur `origin/master`. Une branche partagée ou déjà poussée se
   fusionne au lieu de se rebaser.
2. **Migrations** : si `master` a ajouté des migrations, renuméroter celles de la branche à la suite :
   nom du fichier, `revision`, `down_revision`, et la version attendue dans
   `backend/tests/test_migrations.py`. Le test `test_fresh_database_matches_models` détecte une
   divergence entre modèles et migrations.
3. Vérifications, toutes au vert :
   - `cd backend && uv run pytest -q --cov` (couverture lignes et branches 100 %) ;
   - `cd frontend && npm run typecheck && npm run test:coverage` ;
   - `cd frontend && npm run test:e2e` (port 8123, base jetable `backend/e2e.db`).

## 2. La PR

1. `git push -u origin <branche>`.
2. `gh pr create --base master`, avec :
   - un titre en français, dans le style de l'historique (« Domaine : ce qui change ») ;
   - un corps : le pourquoi, ce qui change, les migrations et leur effet sur les données existantes,
     les tests, les points d'attention. Si la branche contient un `docs/<sujet>.md`, y renvoyer.
   - l'attribution demandée par la session.

## 3. CI et environnement éphémère

1. Vérifier d'abord `gh pr view <n> --json mergeable` : sur une PR en conflit (`CONFLICTING`), GitHub
   ne lance **aucune** CI, et `gh pr checks` rend la main avec « no checks reported ». `master` a pu
   bouger entre-temps (autres sessions) : fusionner `origin/master` dans la branche, résoudre, pousser.
2. `gh pr checks <n> --watch` : attendre `test` puis `deploy-pr`. Si un job échoue :
   `gh run view <run> --log-failed`, puis rapport, sans fusionner.
3. L'environnement est `https://family-planning-pr-<n>.once.florent.cc`. Sa base est neuve à chaque
   push et chargée avec les fixtures (`/s/demo`, `/s/ete`, clé organisateur `demo`).
4. Vérifier que c'est bien le dernier commit qui est déployé : le commentaire de la CI sur la PR
   indique l'image `sha-<7>` (`gh pr view <n> --comments`), à comparer à `git rev-parse --short=7 HEAD`.
   Puis `curl -sf <url>/up` doit répondre `OK`.

## 4. Recette e2e sur l'environnement

L'environnement tourne avec la vraie clé Anthropic, sans `ASSISTANT_STUB` : les tests de l'assistant
(qui attendent les réponses déterministes du mode démo) sont sautés automatiquement.

```bash
cd frontend && E2E_BASE_URL=https://family-planning-pr-<n>.once.florent.cc npx playwright test --workers=2
```

- Avec `E2E_BASE_URL`, Playwright ne lance pas de serveur local. Les tests créent leurs propres
  séjours dans la base de la PR, qui est jetable.
- `--workers=2` : l'environnement de PR a 256 Mo de mémoire.
- Un test qui échoue sur l'environnement mais passe en local : relancer ce seul test une fois. S'il
  échoue encore, c'est un vrai problème (configuration, proxy, données) : rapport, sans fusionner.
- **Recette ciblée** de ce qu'apporte la PR, en plus de la suite : ouvrir les écrans touchés sur
  l'environnement (bureau et mobile, Playwright ou captures), vérifier le cas nominal et les cas
  limites décrits dans la PR ou le `docs/<sujet>.md`, et l'absence de défilement horizontal sur mobile.

## 5. Fusion et production (seulement si autorisée)

1. `gh pr merge <n> --squash --delete-branch` (l'historique de `master` est en squash, « Titre (#n) »).
2. Suivre le push sur `master` : `gh run list --branch master --limit 1`, puis `gh run watch <run>`.
   Attendre `test` puis `deploy-production`.
3. Vérifier `curl -sf https://family-planning.once.florent.cc/up`, puis `bin/server logs production --tail 50` :
   les migrations ont tourné au démarrage, sans erreur.
4. En cas de problème en production : prévenir l'utilisateur immédiatement. La production a des
   sauvegardes automatiques once (`~/family-planner/backups/production` sur le serveur). Ne rien
   restaurer sans son accord.

## 6. Rapport

- Le lien de la PR et de l'environnement.
- Les résultats : CI, recette e2e (passés / sautés / échoués) et recette ciblée.
- Fusionné ou non, et pourquoi.
- L'état de la production.
- Ce qui reste à faire.
