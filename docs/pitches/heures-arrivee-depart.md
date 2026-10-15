# Pitch — Heures d'arrivée et de départ

## Le problème

L'application sait déjà quand chacun arrive et repart, mais seulement au repas près : « les Dupont arrivent pour le dîner de vendredi, repartent après le déjeuner de dimanche ». Entre « pour le dîner » et « à quelle heure », il y a tout ce qui se joue à la porte de la maison :

- **Vendredi, 17 h.** Mamie est arrivée la première pour ouvrir la maison. Elle sait que trois foyers viennent « pour le dîner », mais pas si c'est à 18 h ou à 21 h. Faut-il mettre le gratin au four, faire les lits de l'étage tout de suite, attendre tout le monde pour passer à table ? Elle envoie « vous êtes où ? » dans le groupe familial et reçoit trois réponses contradictoires.
- **Vendredi, 23 h 30.** Le cousin Paul, venu seul et plus tard que son foyer, trouve la maison éteinte et la porte fermée à clé. Personne n'avait noté qu'il arrivait si tard : il dormait « au dîner près » avec les autres.
- **Samedi, 16 h.** Les Martin avaient prévenu d'un retard d'une heure. Le message s'est perdu entre deux photos, l'organisateur était en cuisine, et le dîner a été servi sans eux.
- **Dimanche, 14 h.** L'organisateur avait prévu le grand rangement et la photo de famille à 15 h. Mais deux foyers « présents au déjeuner » sont partis dès le café. Personne ne savait qu'ils partaient si tôt.

À chaque séjour, l'organisateur demande les heures de vive voix, les note sur un papier, et ce papier n'est jamais à jour.

## La proposition

Chaque personne a une heure d'arrivée et une heure de départ, saisies d'un bloc pour tout le foyer par un adulte, avec une courte note, et modifiables jusqu'au dernier moment. Le planning montre, jour par jour et dans l'ordre des heures, qui arrive et qui part.

## User stories

**Adulte du foyer**

1. En tant qu'adulte du foyer, je veux indiquer vers quelle heure arrive et repart chaque membre de mon foyer, afin que l'organisateur sache quand nous attendre.
   *Critère : sous la grille de la carte « ✅ Présences » de « Moi », une ligne par membre (arrivée, départ, note) ; on ne saisit que l'heure, au quart d'heure, affichée « vers 18 h 30 ». Le jour est déduit des présences : celui du premier repas ou de la première nuit pour l'arrivée, celui du dernier repas ou le lendemain de la dernière nuit pour le départ. Sans présence déclarée, pas d'heure possible.*
2. En tant qu'adulte du foyer, je veux recopier une ligne sur tout mon foyer en un geste, afin de ne pas tout saisir quatre fois quand nous arrivons ensemble.
   *Critère : un bouton « Même heure pour tout le foyer » recopie l'arrivée, le départ et la note ; on corrige ensuite le cousin qui arrive plus tard.*
3. En tant qu'adulte du foyer, je veux qu'on me demande notre heure tant que je ne l'ai pas donnée, afin de ne pas l'oublier.
   *Critère : l'invitation « À quelle heure arrivez-vous ? » reste visible dans la carte Présences tant qu'un membre présent n'a pas son heure d'arrivée ou de départ ; elle disparaît dès que tout est rempli et ne se masque pas autrement.*
4. En tant qu'adulte du foyer, je veux ajouter une courte note pour chaque personne, afin de dire ce que l'heure ne dit pas (« nous aurons déjà dîné », « ne nous attendez pas, laissez la porte ouverte »).
   *Critère : une note par personne, environ 200 caractères, valable pour l'arrivée comme pour le départ, visible de tous.*
5. En tant qu'adulte du foyer, je veux modifier notre heure pendant le séjour, afin de prévenir d'un retard sans passer par le groupe familial.
   *Critère : quand une heure change le jour même, « mis à jour à 16 h 12 » s'affiche à côté.*
6. En tant qu'adulte du foyer arrivant tard dans la nuit, je veux pouvoir saisir une heure après minuit, afin de prévenir que nous arriverons à 1 h du matin.
   *Critère : on peut saisir jusqu'à 4 h du matin ; l'heure reste rattachée à la veille et s'affiche « vendredi, vers 1 h (dans la nuit) ».*

**Organisateur**

7. En tant qu'organisateur, je veux voir qui n'a pas encore donné d'heure, afin de relancer de vive voix avant le départ.
   *Critère : dans l'écran « Foyers » de l'espace organisateur.*
8. En tant qu'organisateur, je veux saisir ou corriger l'heure d'une personne depuis « Foyers », afin de reporter ce qu'on m'a dit au téléphone.

**Tout le monde**

9. En tant que participant ou organisateur, je veux voir les arrivées et les départs dans le planning du jour concerné, au milieu des activités et dans l'ordre des heures, afin de préparer la maison, les lits et le dîner, et de savoir quand les cousins seront là.
   *Critère : les personnes d'une même heure sont regroupées sur une ligne (« vers 18 h · Arrivée : Claire, Hugo, Léo »), notes dépliables ; ceux qui n'ont pas donné d'heure figurent en fin de jour, « heure non donnée ». Un jour s'affiche dès qu'il a une activité, une arrivée ou un départ ; « Aucune activité prévue » ne s'affiche que s'il n'y a ni l'un ni l'autre.*

**Sur place**

10. En tant qu'organisateur, je veux imprimer les arrivées et départs du séjour, afin de les afficher sur le frigo pour ceux qui accueillent sans regarder leur téléphone.
    *Critère : une courte section « Arrivées et départs », jour par jour et par heure, en tête de la fiche « Planning de présence ».*

## Hors périmètre

- Le covoiturage, le moyen de transport, les gares et les trajets (sujet écarté en octobre 2026) : au plus, la note libre permet d'en dire un mot.
- Tout lien entre l'heure et les repas : aucun contrôle de cohérence, aucune déduction dans un sens ou dans l'autre.
- Une heure pour chaque absence en cours de séjour : seules la première arrivée et le dernier départ ont une heure.
- Le choix du jour d'arrivée ou de départ : il découle toujours des présences.
- La saisie des heures par l'assistant IA.
- Un avertissement sur les activités qui commencent avant l'arrivée ou finissent après le départ d'un inscrit, et toute prise en compte des heures dans « inscrire tout le monde ».
- Un historique des changements ou l'ancienne heure barrée.
- Les alertes envoyées quand une heure change (les notifications sont hors périmètre de l'application).
- Le suivi en temps réel, la position des voitures ou l'heure d'arrivée estimée.
- Une heure d'arrivée conseillée ou un départ « au plus tard » fixés par l'organisateur : ils restent dans les infos pratiques, en texte libre.
- La prise en compte des heures dans le tirage des corvées ou la répartition des chambres.

## Décisions (grill-me du 15/10/2026)

1. **Granularité** : l'heure appartient à chaque personne ; la saisie du foyer reste d'un bloc grâce à la recopie.
2. **Précision** : une heure au quart d'heure, affichée « vers … », plus une note libre courte ; ni créneau, ni texte libre.
3. **Repas** : aucun lien. L'heure ne contrôle ni ne modifie les repas, les repas ne fabriquent pas d'heure.
4. **Jour** : implicite, déduit du premier et du dernier repas ou nuit ; si les présences changent de jour, l'heure suit sans message.
5. **Saisie du foyer** : une ligne par membre et un bouton « Même heure pour tout le foyer ».
6. **Allers-retours** : une seule arrivée et un seul départ par personne ; les absences du milieu restent au repas près.
7. **Obligation** : facultative, mais une invitation non masquable reste dans la carte Présences tant qu'il manque une heure à un membre présent, et l'organisateur voit les manquants dans « Foyers ».
8. **Affichage** : dans le planning, visible de tous, mêlé aux activités et rangé par heure ; pas de nouvel onglet ni de vue réservée.
9. **Regroupement** : une ligne par heure qui réunit les personnes concernées.
10. **Jours sans activité** : affichés dès qu'ils ont une arrivée ou un départ.
11. **Impression** : une section en tête de la fiche « Planning de présence », pas de fiche nouvelle.
12. **Assistant IA** : non concerné en v1.
13. **Activités** : rien ne change en v1.
14. **Changements** : modifiables à tout moment ; « mis à jour à … » quand l'heure change le jour même ; pas d'historique.
15. **Organisateur** : il saisit et corrige depuis « Foyers ».
16. **Note** : une par personne, environ 200 caractères, recopiée avec l'heure.
17. **Après minuit** : jusqu'à 4 h du matin, rattaché à la veille.

## Pistes notées pour plus tard

- L'assistant IA qui comprend « on arrive vers 18 h, Paul vers 23 h » et « on aura une heure de retard ».
- Un avertissement discret sur les activités qui tombent avant l'arrivée ou après le départ d'un inscrit.
- Le nombre de personnes présentes heure par heure le jour d'arrivée (« qui est là à 20 h ? »).
- Une heure de libération de la maison fixée par l'organisateur, rappelée à ceux qui partent après.
- Des corvées d'accueil ou de départ (faire les lits, rangement final) tirées parmi les présents à l'heure dite.
- Les arrivées et départs du jour résumés sur l'accueil, à côté des activités du foyer.

## Taille

**Petit** : deux heures et une note par personne, une saisie sous la grille des présences, l'affichage dans le planning, « Foyers » et une section imprimée, sans règle métier avec les repas ni assistant.
