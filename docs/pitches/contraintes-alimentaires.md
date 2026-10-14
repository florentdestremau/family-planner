# Pitch : régimes et allergies

## 1. Le problème

Aujourd'hui, le séjour sait qui mange à chaque repas (adultes et enfants), mais pas **ce que chacun peut manger**. La seule place pour en parler est la note d'un menu, que l'organisateur doit réécrire à chaque repas.

- **Le dîner du samedi.** Anne ne mange pas de gluten. L'organisateur l'a noté sur le dîner raclette, mais pas sur le déjeuner. Le binôme tiré au sort pour la cuisine fait des pâtes pour quatorze personnes, et Anne se contente de salade.
- **L'arrivée de mercredi.** Léa arrive en milieu de semaine avec Rose, allergique aux fruits de mer. Des moules-frites sont prévues jeudi soir. Personne ne le sait avant que Léa le dise à table, la veille, et il faut improviser.
- **Les courses.** L'organisateur colle l'export menus × couverts dans un LLM pour obtenir la liste de courses. La liste ne contient ni pain sans gluten ni de quoi faire un plat végétarien, et il faut retourner au village. Pour l'éviter, l'organisateur demande sur WhatsApp, avant chaque séjour, « qui est végé, qui a des allergies ? » et recopie les réponses à la main.

## 2. La proposition

Chaque foyer déclare une fois les régimes et allergies de ses membres. Le séjour les affiche ensuite, repas par repas, à ceux qui composent les menus, font les courses et cuisinent. L'application informe ; elle ne vérifie pas les menus.

**Ce qu'on déclare** : 6 cases, plus une précision libre par personne.
- *Régimes* : végétarien, végan (l'un ou l'autre, jamais les deux).
- *Allergies et intolérances*, affichées avec un signe d'alerte : sans gluten, sans lactose, allergie arachides et fruits à coque, allergie poisson et fruits de mer.
- *Précision libre* : tout le reste (gravité, autres allergènes, halal ou casher, préférences comme « n'aime pas le poisson »). Elle est affichée avec le nom de la personne, mais n'est pas comptée.

## 3. User stories

**Adulte du foyer**
- Je veux déclarer les régimes et allergies de chaque membre de mon foyer, enfants compris, pour ne pas avoir à le répéter à chaque cuisinier.
  *Critère : sur la page « Moi », une carte « Régimes et allergies » sous « Mon foyer » montre une ligne par membre, avec un bouton pour modifier ses cases et sa précision ; une phrase dit que c'est visible par tous les participants.*
- Je veux qu'on me pose la question quand j'ajoute quelqu'un à mon foyer, pour ne pas l'oublier.
  *Critère : après « Ajouter au foyer », une invitation discrète (« Régime ou allergie pour Léo ? ») ouvre ses cases ; on peut l'ignorer.*

**Participant**
- Je veux voir, sur chaque repas de la page « Repas », les contraintes des présents, pour savoir à quoi faire attention quand j'aide ou que j'apporte un plat.
  *Critère : une ligne de nombres (« 2 végétariens · 1 végan · ⚠️ 1 sans gluten · 📝 1 précision ») ; un appui l'ouvre sur les noms et les précisions ; seules les personnes présentes à ce repas comptent.*

**Personne de corvée à un repas** (cuisine, table, vaisselle…)
- Je veux voir les contraintes du repas à côté de ma corvée sur ma page « Moi », pour m'organiser à l'avance.
  *Critère : affiché pour toute corvée rattachée à un repas, pas pour les corvées « journée ».*
- Je veux que la fiche menus imprimée et affichée en cuisine donne les contraintes de chaque repas avec les noms en entier, pour servir la bonne assiette à la bonne personne.

**Organisateur**
- Je veux voir les contraintes de tout le séjour en tête de l'écran « Menus », pour choisir d'emblée des plats compatibles plutôt que des variantes.
  *Critère : un récapitulatif du séjour par contrainte avec les noms, plus le compteur dépliable sur chaque repas ; le champ notes ne propose plus « allergies » comme exemple.*
- Je veux compléter ou corriger la déclaration d'un participant, pour réparer un oubli signalé de vive voix.
- Je veux que l'export pour la liste de courses donne les contraintes de chaque repas, pour que le LLM prévoie les produits de remplacement.
  *Critère : des nombres par repas, plus une ligne générale avec les précisions libres ; aucun nom.*

## 4. Hors périmètre

- Vérifier les menus : étiqueter les plats, signaler un repas sans option compatible.
- Suivre qui a répondu (« 4 foyers n'ont pas encore répondu ») : sans case cochée, une personne n'a pas de contrainte. À revoir si un oubli se produit.
- La saisie ou la lecture des contraintes par l'assistant IA : il reste centré sur les présences et ne reçoit aucune donnée de santé.
- Le tableau des présences (écran et impression « Planning de présence ») : il ne change pas.
- Une notion de « corvée de cuisine » : toutes les corvées rattachées à un repas affichent les contraintes.
- Des cases pour sans porc, halal, casher, œufs, soja, sésame… : on les écrit dans la précision libre.
- Reprendre les déclarations d'un séjour à l'autre, et tenir compte des contraintes dans le tirage des corvées ou la répartition des chambres.

## 5. Décisions prises en grill-me (15/10/2026)

1. Informer seulement, sans vérifier les menus.
2. Une liste fermée comptée, plus une précision libre non comptée.
3. Six cases : sans porc retiré ; arachides et fruits à coque fusionnés, ainsi que poisson et fruits de mer (la précision sert aux nuances).
4. Végétarien et végan s'excluent et sont comptés séparément.
5. Tout adulte du foyer saisit pour chacun de ses membres ; l'organisateur peut corriger. Comme pour les présences, cette restriction n'existe que dans l'interface.
6. Visible par tous les participants avec les noms, ce qui est cohérent avec l'instance familiale ; une phrase le dit au moment de la saisie.
7. À l'écran, des nombres et les noms en dépliant ; sur la fiche imprimée, les noms en entier.
8. Dans l'export LLM, des nombres et les précisions libres, sans aucun nom.
9. Pas de distinction entre « rien à signaler » et « pas encore répondu » en v1.
10. Écran « Menus » de l'organisateur : un récapitulatif du séjour et le compteur sur chaque repas.
11. Compteur affiché à côté de toutes les corvées rattachées à un repas.
12. Pas d'assistant IA en v1.
13. Saisie dans une carte dédiée de la page « Moi », et invitation après l'ajout d'un membre.
14. Le tableau des présences ne change pas.

## 6. Taille

**Moyen (bas de fourchette)** : l'information à saisir est simple (6 cases et une précision par personne), mais elle s'affiche à six endroits (carte du foyer, « Repas », corvées sur « Moi », « Menus » de l'organisateur, fiche imprimée, export) et chaque parcours doit être testé de bout en bout.
