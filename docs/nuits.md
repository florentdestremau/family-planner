# Nuits : distinguer les repas et les nuits

Proposition, et prototype sur la branche `nuits`.

## Le problème

Jusqu'ici, la présence se notait par repas (« présent sur place = présent au repas ») et chacun avait
un lit fixe pour tout le séjour. Trois cas réels, lors d'une cousinade du vendredi soir au dimanche midi :

1. **Arrivée après le dîner.** Un couple arrive vendredi après le dîner et dort sur place. On retire
   son dîner du vendredi, et plus rien ne dit qu'il dort là ce soir-là.
2. **Nuit passée ailleurs.** Une personne dîne et dort sur place vendredi, prend le petit-déj samedi,
   passe samedi midi et soir ailleurs **et y dort**, puis revient dimanche matin. Son petit-déj du
   dimanche laisse croire qu'elle a dormi là samedi : on ne peut pas déduire les nuits des repas à coup sûr.
3. **Chambre partagée entre deux nuits.** Une chambre double sert à un couple vendredi et à un autre
   samedi. Avec un lit fixe pour tout le séjour, c'est impossible à saisir.

## Recommandation

**Des nuitées explicites par personne, qui portent le lit.** Les cases se remplissent seules quand
la situation est claire, et restent à cocher à la main quand elle ne l'est pas.

- Une **nuit** = une personne dort sur place la nuit du jour J (de J à J+1). Un séjour du vendredi au
  dimanche a deux nuits, vendredi et samedi : il n'y a pas de nuit le dernier jour.
- **Le lit est rattaché à la nuit**, pas à la personne. On vérifie la capacité nuit par nuit.
- **Les nuits suivent les repas sans deviner** :
  - dîner J **et** petit-déj J+1 → la personne dort sur place ;
  - **ni l'un ni l'autre** → elle n'y dort pas ;
  - **un seul des deux** → on garde ce qui était coché.
- **Le cas courant reste simple** : « Tout le séjour » coche aussi les nuits. Un lit donné « toutes
  les nuits » vaut pour toutes celles de la personne. Une nuit ajoutée reprend le lit de la nuit voisine.

### Options écartées

- **Une 4ᵉ valeur `night` dans `presences`.** Moins de code au départ, mais les couverts, les corvées
  « journée » et les activités devraient filtrer partout, et le lit n'a pas où se ranger.
- **Ne garder que des nuits déduites.** Le cas 2 montre que la déduction est ambiguë. Il faut stocker la nuit.
- **Un lit habituel sur la personne, plus des exceptions par nuit.** Cela fait deux sources de vérité
  qui divergent (laquelle compte pour la capacité ?). L'héritage du lit voisin donne le même confort
  sans ce coût.

## Modèle

```
nights (id, person_id → persons ON DELETE CASCADE, date, bed_id → beds ON DELETE SET NULL NULL)
  UNIQUE (person_id, date) ; INDEX (bed_id, date)
```

- `date` est le soir de la nuit. Les nuits possibles vont de `start_date` à `end_date - 1`
  (`slots.stay_nights`).
- `persons.bed_id` disparaît.
- Les **présences aux repas ne changent pas**. Couverts, corvées (y compris « journée ») et activités
  restent calculés à partir des repas : quelqu'un qui dort sur place sans aucun repas ce jour-là n'est
  pas éligible aux corvées du jour.
- Le snapshot gagne `nights` (les nuits du séjour) et `person_nights` (`person_id`, `date`, `bed_id`).
  `PersonOut.bed_id` disparaît.

## Règle de déduction (`slots.follow_meals`, `lib.followMeals`)

La même fonction pure existe côté serveur et côté front. On ne revoit **que les nuits dont un repas
voisin a changé** (le dîner du soir, le petit-déj du lendemain) :

| Repas voisins après le changement | Nuit                            |
| --------------------------------- | ------------------------------- |
| dîner J et petit-déj J+1          | cochée                          |
| ni l'un ni l'autre                | décochée                        |
| un seul des deux                  | inchangée (le choix est gardé)  |

On n'a jamais à défaire une case cochée par erreur : la règle ne coche que quand c'est sûr. Les cas
ambigus (arrivée tardive, départ avant le petit-déj, nuit ailleurs) se règlent d'un clic.

Les nuits d'une personne ne bougent pas quand on touche à un repas qui ne les encadre pas, par exemple
un déjeuner. Une nuit décochée à la main pour quelqu'un qui dîne et déjeune sur place mais dort à
l'hôtel reste donc décochée.

## Saisie

- **Grille** : une colonne 🌙 « Nuit » après le dîner (case hachurée le dernier jour).
  - Le bouton du jour coche ou décoche aussi sa nuit, et « Tout le séjour » coche toutes les nuits.
  - Cocher une nuit seule ne touche pas aux repas.
  - Le compteur affiche « 5 repas sur 6 · 2 nuits sur 2 ».
- **Foyer** : les nuits sont des clés `date|night` dans le même ensemble que les repas. « Tout le foyer
  a les mêmes présences », la file d'enregistrement et la resynchronisation marchent sans modification.
- **API** : `PUT …/presences` (personne ou foyer) accepte un champ facultatif `nights: [date]`.
  - S'il est absent, le serveur applique `follow_meals` entre les anciens et les nouveaux repas : un
    ancien front reste compatible.
  - S'il est présent, les nuits sont exactement celles-là.
  - Une nuit hors du séjour donne un 422.
- **Assistant IA** :
  - l'outil `propose_household_presences` reçoit un `nights` facultatif ;
  - le prompt liste les nuits possibles et les nuits actuelles de chacun, et précise qu'« arriver
    après le dîner » veut dire dormir sur place, et que « dîner puis rentrer » veut dire ne pas y dormir ;
  - sans `nights`, la règle s'applique ;
  - chaque proposition renvoie ses nuits résolues, et le résumé les affiche
    (« Alice : ven. dîner → dim. déjeuner · nuits : ven. 30, sam. 31 ») ;
  - à la validation, le front ne renvoie les nuits que si Claude les a données explicitement
    (`nights_explicit`). Sinon le serveur les déduit des repas du moment, et une nuit décochée dans la
    grille entre-temps n'est pas écrasée par une liste périmée ;
  - le mode démo (`ASSISTANT_STUB`) déduit lui aussi les nuits au lieu de proposer « aucune », ce qui
    effaçait les lits du foyer à la validation.
- **Impression des présences** : une colonne « Nuit » (☾) par jour. La dernière ligne devient
  « Couverts · couchages » et compte les dormeurs pour les colonnes de nuit.

## Couchage par nuit

- **`PUT /admin/persons/{id}/bed {bed_id, dates?}`**
  - Sans `dates`, le lit vaut pour **toutes les nuits** de la personne (cas courant).
  - Avec `dates`, il ne vaut que pour ces nuits.
  - La capacité est vérifiée nuit par nuit. Le 409 cite les nuits pleines, par exemple « Ce lit est
    déjà complet la nuit du ven. 30/10 ».
  - Une date hors du séjour donne un 422.
  - **Pré-affectation, si on peut, avec un avertissement** : un lit donné pour une nuit non déclarée
    crée cette nuit. Sans `dates` et sans aucune nuit déclarée, cela crée toutes les nuits du séjour.
    La réponse `{warning}` le dit, et le front l'affiche dans un toast d'alerte : « Alice n'avait pas
    déclaré la nuit du ven. 30/10, sam. 31/10 : ajoutée à ses présences. »
  - `bed_id: null` retire le lit (des nuits demandées, ou de toutes) mais garde les nuits.
- **Nuit ajoutée par la personne** : elle reprend le lit de la nuit la plus proche (la veille en
  priorité) s'il reste de la place cette nuit-là ; sinon elle reste sans lit. Le cas « même lit tout le
  séjour » se maintient donc seul.
- **Proposition automatique** (`rooms.auto_assign_nights`) : les nuits sont traitées dans l'ordre.
  Pour chaque nuit :
  1. **continuité** : chacun reprend le lit de sa nuit précédente (ou, à défaut, le premier lit qu'on
     lui connaît) s'il est libre ;
  2. ensuite, l'algorithme existant (`auto_assign`) pour les autres dormeurs de la nuit : couples en
     lit double, enfants dans la chambre de leur foyer, adultes seuls en lit simple d'abord.

  Elle ne touche jamais aux nuits déjà attribuées, et ne traite que les nuits déclarées (personne
  n'est inventé). La réponse compte des **nuitées** (`assigned`, `unassigned`) et les personnes sans
  aucune nuit déclarée (`undeclared`), que le toast signale en alerte.
- **Écran Chambres de l'organisateur** :
  - un sélecteur « Toutes les nuits | 🌙 Ven. 30 oct. | 🌙 Sam. 31 oct. », affiché dès qu'il y a au
    moins deux nuits ;
  - en vue « toutes » :
    - chaque lit liste ses occupants, avec leurs nuits quand elles ne couvrent pas tout le séjour
      (« Alice ven. 30 · Chloé sam. 31 », avec le jour du mois pour qu'un long séjour reste lisible) ;
    - la charge affichée est le maximum sur les nuits (« 2/2 au plus ») ;
    - la liste d'un lit ne propose que les personnes dont les nuits **sans lit** tiennent toutes dans
      ce lit. Seules ces nuits sont envoyées : les nuits déjà couchées ailleurs ne bougent pas, et
      aucun choix ne mène à un 409 ;
    - les personnes sans aucune nuit apparaissent dans « Nuits non déclarées ». Elles restent
      proposées pour un lit libre toutes les nuits, avec l'avertissement décrit plus haut ;
    - le message de fin dit « Toutes les nuits déclarées ont un lit. » et non « Tout le monde a un
      lit. » tant que quelqu'un n'a rien déclaré ;
  - en vue d'une nuit, on ne voit et ne change que cette nuit-là : c'est là qu'on règle le cas 3 à la
    main.
- **Chambres (pour tous), Moi, impression des chambres** : même affichage annoté. Dans « Moi », par
  exemple : « Chambre verte — Lit simple (ven. 16) · Pas encore attribué (sam. 17) », ou « Ne dort pas
  sur place ». L'index du front (`buildIndex`) précalcule une fois les nuits par personne et par lit,
  et les dormeurs par lit et par nuit.

## Migration `0006` (données existantes)

Pour chaque personne, la nuit J est retenue si :

- elle dîne J **et** prend le petit-déj J+1 ;
- **ou** elle a un lit **et** dîne J **ou** prend le petit-déj J+1. Le lit montre qu'elle dort sur
  place : cela récupère le cas 1 (le dîner retiré) sans donner de nuit à un visiteur qui vient
  seulement dîner (qui n'a pas de lit).

Une personne qui a un lit mais aucune nuit déduite (présences pas encore saisies) dort **toutes** les
nuits du séjour : aucun lit n'est perdu.

Chaque nuit reprend l'ancien `bed_id`. Les capacités tiennent par construction, puisque ce lit valait
déjà pour tout le séjour. Ensuite `persons.bed_id` est supprimé.

Le test de migration couvre : un lit avec le seul dîner du vendredi, un lit sans aucun repas, une
personne sans lit qui manque le dernier petit-déj, et des repas isolés sans lit (aucune nuit).

## Les trois cas

| Cas | Ce qu'on fait |
| --- | --- |
| 1. Arrivée après le dîner | « Tout le séjour », puis on décoche le dîner du vendredi : la nuit reste (un seul repas voisin). Depuis une grille vide, on coche la nuit vendredi d'un clic. |
| 2. Nuit passée ailleurs | Décocher samedi midi et soir laisse la nuit du samedi (le petit-déj du dimanche l'encadre encore) : on la décoche d'un clic. Si on recoche ensuite le dîner du samedi, la nuit revient. |
| 3. Chambre partagée | Le couple A ne déclare que vendredi, le couple B que samedi. Les deux tiennent dans le même lit double, à la main ou par la proposition automatique. Un 5ᵉ dormeur est refusé (409) en nommant les nuits pleines. |

Les fixtures de démonstration (`/s/demo`) contiennent les trois cas : Antoine et Lucie (cas 1), Hélène
(cas 2), et des lits partagés entre nuits (cas 3, qui vient de la proposition automatique).

## Autres cas limites

- **Séjour d'un seul jour** : pas de nuit. Pas de colonne Nuit utile, et affecter un lit donne un 422.
- **Raccourcir le séjour** : les nuits sorties de la période sont supprimées, comme les repas.
- **Personne pré-affectée puis visiteuse de jour** : ses nuits restent cochées (aucun repas voisin n'a
  changé). C'est visible dans sa grille, et elle les décoche. Voir aussi les questions ouvertes.
- **Supprimer un lit ou une chambre** : les nuits restent, sans lit (`ON DELETE SET NULL`).
- **Couple** : la proposition automatique cherche un double nuit par nuit. Si les deux conjoints n'ont
  pas les mêmes nuits, chacun est traité seul les nuits où l'autre est absent.

## Covoiturage

Décidé : pas de lien avec le covoiturage. Les nuits ne dépendent d'aucune heure d'arrivée, et le
covoiturage n'écrit pas dans les présences.

## Prototype

Il est complet, back et front.

- **Back** :
  - `models.Night` et la migration `0006` ;
  - `slots.stay_nights`, `night_sides` et `follow_meals` ;
  - le module `nights.py` (résolution des nuits, héritage du lit, affectation avec avertissement) ;
  - `rooms.auto_assign_nights` ;
  - les routes présences, lit, proposition automatique et snapshot ;
  - l'assistant (outil, prompt, propositions) ;
  - les fixtures (cas 1 et 2, une chambre d'amis).
- **Front** :
  - la grille avec la colonne Nuit, les présences du foyer, l'assistant (envoi des nuits, exemples) ;
  - « Moi », Chambres, l'écran Chambres de l'organisateur avec son sélecteur de nuit ;
  - les impressions des présences et des chambres ;
  - le toast d'alerte.
- **Tests** :
  - `pytest --cov` : 366 tests (après rebase sur master), lignes et branches à 100 %. On y trouve `test_nights.py` (les trois
    cas et l'API des lits), la migration et les propriétés Hypothesis suivantes :
    - aucun lit surchargé sur aucune nuit ;
    - seules les nuits sans lit sont attribuées ;
    - min(dormeurs sans lit, places libres) par nuit ;
    - chacun garde le même lit quand tout le monde reste tout le séjour ;
    - `follow_meals` conforme à sa table et idempotente ;
  - `npm run typecheck` sans erreur ; `npm run test:coverage` : 45 tests, 100 % ;
  - `npm run test:e2e` : 56 tests passent (bureau et mobile), dont `e2e/nights.spec.ts` (cas 1 et 2,
    chambre partagée, sélecteur de nuit, lit plein qui ne propose plus personne). Le scénario organisateur passe désormais par la
    pré-affectation avec avertissement.

**Taille** : environ +720/−80 lignes côté back (dont environ 450 de tests) et +520/−130 côté front
(dont environ 200 de tests et d'e2e).

## Décisions (14/10/2026)

1. **Proposition automatique et nuits non déclarées** : on les ignore. Les personnes sans nuit ne sont
   pas couchées automatiquement, et le toast les signale en alerte. Seule l'affectation manuelle les
   couche, avec un avertissement.
2. **Personne pré-affectée** : on garde ses nuits. À sa première saisie, seules les nuits dont un repas
   voisin change sont revues ; un visiteur de jour pré-affecté décoche lui-même ses nuits.
3. **Qualité de la proposition** : on garde la continuité seule (chacun garde son lit d'une nuit à
   l'autre). L'organisateur ajuste à la main.
4. **Covoiturage** : pas de lien.
