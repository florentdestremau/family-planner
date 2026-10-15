# Pitch — Heures d'arrivée et de départ

## Le problème

L'application sait déjà quand chacun arrive et repart, mais seulement au repas près : « les Dupont arrivent pour le dîner de vendredi, repartent après le déjeuner de dimanche ». Entre « pour le dîner » et « à quelle heure », il y a tout ce qui se joue à la porte de la maison :

- **Vendredi, 17 h.** Mamie est arrivée la première pour ouvrir la maison. Elle sait que trois foyers viennent « pour le dîner », mais pas si c'est à 18 h ou à 21 h. Faut-il mettre le gratin au four, faire les lits de l'étage tout de suite, attendre tout le monde pour passer à table ? Elle envoie « vous êtes où ? » dans le groupe familial et reçoit trois réponses contradictoires.
- **Vendredi, 23 h 30.** Le cousin Paul, venu seul et plus tard que son foyer, trouve la maison éteinte et la porte fermée à clé. Personne n'avait noté qu'il arrivait si tard : il dormait « au dîner près » avec les autres.
- **Samedi, 16 h.** Les Martin avaient prévenu d'un retard d'une heure. Le message s'est perdu entre deux photos, l'organisateur était en cuisine, et le dîner a été servi sans eux.
- **Dimanche, 14 h.** L'organisateur avait prévu le grand rangement et la photo de famille à 15 h. Mais deux foyers « présents au déjeuner » sont partis dès le café. Personne ne savait qu'ils partaient si tôt.

À chaque séjour, l'organisateur demande les heures de vive voix, les note sur un papier, et ce papier n'est jamais à jour.

## La proposition

Chaque foyer indique, en plus de ses repas, vers quelle heure il arrive et vers quelle heure il repart, pour tout le foyer d'un coup ou personne par personne, et peut la changer jusqu'au dernier moment. Le séjour montre ensuite, jour par jour, qui arrive et qui part, dans l'ordre des heures.

## User stories

**Adulte du foyer**

1. En tant qu'adulte du foyer, je veux indiquer l'heure d'arrivée et l'heure de départ de tout mon foyer en une fois, afin que l'organisateur sache quand nous attendre.
   *Critère : la saisie se fait dans « Moi », à côté de la grille des présences ; le jour est celui du premier et du dernier repas (ou nuit) déclarés, on ne choisit que l'heure ; elle est facultative.*
2. En tant qu'adulte du foyer, je veux donner une autre heure à un membre de mon foyer, afin de signaler que le cousin nous rejoint plus tard.
   *Critère : même principe que « Tout le foyer a les mêmes présences » : une heure commune par défaut, qu'on décale pour une personne.*
3. En tant qu'adulte du foyer, je veux être prévenu quand mon heure ne colle pas avec mes repas, afin de ne pas compter un déjeuner que nous ne prendrons pas.
   *Critère : arriver à 15 h avec le déjeuner coché fait proposer de décocher le déjeuner ; rien ne change sans mon accord. Modifier les repas ne fabrique jamais d'heure.*
4. En tant qu'adulte du foyer, je veux ajouter une courte note à notre arrivée ou à notre départ, afin de dire ce que l'heure ne dit pas (« nous aurons déjà dîné », « ne nous attendez pas, laissez la porte ouverte »).
5. En tant qu'adulte du foyer, je veux modifier notre heure pendant le séjour, afin de prévenir d'un retard sans passer par le groupe familial.
   *Critère : la mention « mis à jour à … » est visible de tous à côté de l'heure.*
6. En tant qu'adulte du foyer, je veux pouvoir dire à l'assistant « on arrive vers 18 h vendredi, Paul nous rejoint vers 23 h » ou « on aura une heure de retard », afin de ne pas chercher où se règle l'heure.
   *Critère : comme pour les présences, l'assistant propose et je valide d'un clic.*

**Organisateur**

7. En tant qu'organisateur, je veux voir, pour chaque jour, qui arrive et qui part et à quelle heure, afin de préparer la maison, les lits et le dîner, et d'être là pour accueillir.
   *Critère : arrivées et départs sont rangés par heure, avec le nombre de personnes ; ceux qui n'ont pas donné d'heure apparaissent au repas près (« pour le dîner, heure non donnée »).*
8. En tant qu'organisateur, je veux voir qui n'a pas encore donné d'heure, afin de relancer les retardataires avant le départ.
9. En tant qu'organisateur, je veux pouvoir saisir ou corriger l'heure d'un foyer, afin de reporter ce qu'on m'a dit au téléphone.

**Participant**

10. En tant que participant, je veux voir les arrivées et les départs dans le planning du jour concerné, au milieu des activités, afin de savoir quand les cousins seront là (et de répondre aux enfants qui le demandent toutes les dix minutes).
11. En tant que participant, je veux être prévenu quand j'inscris quelqu'un à une activité qui commence avant son arrivée ou finit après son départ, afin de ne pas compter sur lui pour rien.
    *Critère : un avertissement discret, comme l'actuel « absent ce jour-là » ; l'inscription reste possible.*

**Sur place**

12. En tant qu'organisateur, je veux imprimer les arrivées et départs du séjour, afin de les afficher sur le frigo pour ceux qui accueillent sans regarder leur téléphone.

## Hors périmètre

- Le covoiturage, le moyen de transport, les gares et les trajets (sujet écarté en octobre 2026) : au plus, la note libre permet d'en dire un mot.
- Les alertes envoyées quand une heure change (les notifications sont hors périmètre de l'application).
- Le suivi en temps réel, la position des voitures ou l'heure d'arrivée estimée.
- Une heure d'arrivée conseillée ou un départ « au plus tard » fixés par l'organisateur : ils restent dans les infos pratiques, en texte libre.
- Les heures des repas réglables par séjour.
- La déduction automatique des repas à partir de l'heure, sans confirmation.
- La prise en compte des heures dans le tirage des corvées ou la répartition des chambres.

## Questions ouvertes pour le grill-me

1. **Granularité** : une heure par foyer ou par personne ? *Recommandation : par foyer, avec exception par personne. C'est déjà la règle des présences (« tout le foyer pareil », on décoche pour décaler quelqu'un), la plupart des foyers arrivent ensemble, et le cas du cousin qui arrive seul reste à un geste.*
2. **Précision** : heure pile, créneau (« fin d'après-midi ») ou texte libre ? *Recommandation : une heure approximative au quart d'heure, affichée « vers 18 h 30 », plus la note libre courte. Un créneau ferait doublon avec les repas, déjà connus ; un texte libre ne se range pas dans l'ordre des arrivées.*
3. **Cohérence avec les repas** : à partir de quelle heure considère-t-on qu'on « a » un repas, et que faire en cas de contradiction ? *Recommandation : des bornes simples et fixes pour tous les séjours (avant 12 h 30, on déjeune ; avant 19 h 30, on dîne…), une proposition d'ajuster les repas, jamais de changement silencieux, et des repas qui ne fabriquent jamais d'heure.*
4. **Changement de jour** : que devient l'heure quand le foyer change son premier ou son dernier repas de jour ? *Recommandation : elle est retirée, avec un message qui invite à la redonner ; garder « 18 h » sur un autre jour induirait en erreur.*
5. **Facultative ou demandée** : faut-il insister pour obtenir une heure ? *Recommandation : facultative, sans relance automatique, mais l'organisateur voit qui ne l'a pas donnée. Contrairement aux régimes, une heure absente se voit : la liste de ceux qui manquent est fiable.*
6. **Absences en cours de séjour** : une seule arrivée et un seul départ, ou une heure pour chaque aller-retour (parti samedi soir, revenu dimanche matin) ? *Recommandation : une seule arrivée et un seul départ par personne ; les absences du milieu restent au repas près.*
7. **Où afficher** : une vue réservée à l'organisateur ou visible de tous ? *Recommandation : visible de tous, comme le reste du séjour, dans le planning des jours d'arrivée et de départ, avec la ligne « heure non donnée » qui sert surtout à l'organisateur. Pas de nouvel onglet.*
8. **Impression** : une fiche dédiée ou une section dans une fiche existante ? *Recommandation : une courte section « Arrivées et départs » en tête de la fiche « Planning de présence », plutôt qu'une fiche de plus.*
9. **Assistant IA** : faut-il qu'il comprenne les heures dès la première version ? *Recommandation : oui. Il saisit déjà présences et nuits, et « on aura une heure de retard » est exactement la phrase qu'on a envie de lui dire sur place. À retirer si la taille grossit.*
10. **Activités** : avertir quand une activité tombe avant l'arrivée ou après le départ d'un inscrit ? *Recommandation : oui, avec le même avertissement discret que « absent ce jour-là », sans bloquer l'inscription.*

## Pistes notées pour plus tard

- Le nombre de personnes présentes heure par heure le jour d'arrivée (« qui est là à 20 h ? »).
- Une heure de libération de la maison fixée par l'organisateur, rappelée à ceux qui partent après.
- Des corvées d'accueil ou de départ (faire les lits, rangement final) tirées parmi les présents à l'heure dite.
- Les arrivées et départs du jour résumés sur l'accueil, à côté des activités du foyer.

## Taille

**Petit à moyen** : une heure facultative et une note par foyer ou par personne, affichées dans le planning et l'impression, mais la cohérence avec les repas et la compréhension par l'assistant demandent des règles claires et des tests de bout en bout.
