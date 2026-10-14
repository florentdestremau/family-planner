---
name: dev
description: Développe une fonctionnalité de family-planner de bout en bout. Code, tests, commit, PR, environnement éphémère, recette e2e, code review et security review, puis arrêt en attente d'une revue humaine (pas de fusion).
argument-hint: "<fonctionnalité, pitch ou docs/<sujet>.md>"
when_to_use: "Quand on demande de coder une fonctionnalité jusqu'à une PR prête à relire."
disable-model-invocation: true
---

# Développer une fonctionnalité de family-planner

Circuit : comprendre → coder → vérifier en local → commit → PR → environnement éphémère → recette e2e
→ code review → security review → **attente d'une revue humaine**.

**Principes :**
- L'invocation de `/dev` autorise à modifier le code, commiter, pousser la branche et ouvrir la PR.
- Elle n'autorise **jamais** la fusion ni le déploiement en production : c'est `/ship --merge`, après la revue humaine.
- On s'arrête au premier rouge qu'on ne sait pas corriger, et on fait un rapport.
- On ne contourne aucune vérification (test désactivé, couverture abaissée, `--no-verify`, push forcé sur `master`).

## 1. Comprendre

1. Lire `README.md` (fonctionnement de référence) et, s'il y en a un, le pitch ou le `docs/<sujet>.md` de la fonctionnalité.
   Les décisions qui y sont écrites (grill-me) sont tranchées : ne pas les rouvrir.
2. Lire le code touché avant d'écrire : modèles, schémas, routes publiques et organisateur, pages, tests voisins.
   Suivre les conventions en place : textes en français, commentaires sobres, droits « clé organisateur »
   sur toute route `/admin`.
3. Une question qui change vraiment le résultat et que le code ne tranche pas : la poser avant de coder.
   Sinon, prendre l'option la plus simple et la signaler dans la PR.

## 2. Coder

- **Back** : modèle, migration Alembic à la suite de la dernière (`backend/migrations/versions/`), schémas,
  routes. Mettre à jour la version attendue dans `backend/tests/test_migrations.py`, et vérifier l'effet de
  la migration sur les données existantes.
- **Front** : la logique pure dans `src/lib.ts` (ou un module couvert par vitest), l'interface dans les composants et les pages.
  Penser au mobile et au mode hors ligne (`OfflineLock`).
- **Impacts transverses** à passer en revue : impressions, export LLM, assistant IA, fixtures (`app/fixtures.py`),
  accueil, PWA.
- **Tests** :
  - back : droits, isolation entre séjours, validations, règles métier ;
  - vitest : logique du front ;
  - au moins un parcours **e2e** Playwright, bureau et mobile, de la fonctionnalité.
- **Documentation** : section « Fonctionnement » du `README.md` ; pour un gros sujet, un `docs/<sujet>.md`.

## 3. Vérifier en local

Toutes au vert :
- `cd backend && uv run pytest -q --cov` (lignes et branches : 100 %) ;
- `cd frontend && npm ci` si `node_modules` manque, puis `npm run typecheck && npm run test:coverage` ;
- `cd frontend && npm run test:e2e`.

## 4. Commit et PR

1. `git fetch origin` et mise à jour sur `origin/master`, avec la renumérotation des migrations comme dans `/ship` (§ 1).
2. Commits en français, dans le style de l'historique, avec l'attribution demandée par la session.
3. `git push -u origin <branche>`, puis `gh pr create --base master` :
   - titre « Domaine : ce qui change » ;
   - corps : le pourquoi, ce qui change, les migrations et leur effet sur les données, les tests, les points d'attention, et le lien vers le pitch ou le `docs/<sujet>.md`.

## 5. Environnement éphémère et recette e2e

Suivre `/ship` § 3 et § 4 :
- vérifier que la PR n'est pas en conflit ;
- `gh pr checks <n> --watch` jusqu'à `deploy-pr` ;
- vérifier que l'image `sha-<7>` déployée est bien le dernier commit, et que `/up` répond ;
- `E2E_BASE_URL=https://family-planning-pr-<n>.once.florent.cc npx playwright test --workers=2` ;
- puis une **recette ciblée** des écrans touchés, sur bureau et sur mobile : cas nominal, cas limites, pas de défilement horizontal.

## 6. Code review et security review

1. Lancer le skill `code-review` (niveau `high`) sur la branche. Corriger chaque constat confirmé, et
   expliquer dans la PR ceux qu'on écarte.
2. Lancer le skill `security-review`. Points à surveiller dans ce projet :
   - routes `/admin` protégées par la clé ;
   - isolation entre séjours ;
   - texte libre rendu sans HTML ;
   - liens rendus cliquables (schémas autorisés) ;
   - limites de taille ;
   - données publiques par construction (l'accueil liste tous les séjours).
3. Après des corrections : relancer les vérifications locales, pousser, et attendre de nouveau le
   déploiement de la PR, avec une recette e2e rapide sur l'environnement.
4. Résumer les deux revues dans un commentaire de la PR (`gh pr comment`) : constats, corrections, points écartés.

## 7. Attendre la revue humaine

- Ne pas fusionner. Faire le rapport à l'utilisateur :
  - lien de la PR et de l'environnement ;
  - résultats des tests locaux, de la CI et de la recette e2e (passés / sautés / échoués) ;
  - constats des revues et ce qui a été corrigé ;
  - points d'attention pour le relecteur.
- Les commentaires de revue qui arrivent ensuite sont des demandes à traiter : corriger, pousser, répondre au
  commentaire, puis refaire § 3 et § 5.
- La fusion et la mise en production se font avec `/ship --merge`, à la demande de l'utilisateur.
