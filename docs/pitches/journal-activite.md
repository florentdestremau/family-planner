# Pitch — Journal d'activité du séjour

## Le problème

Tout le monde peut modifier le séjour : chacun pour son foyer, l'organisateur pour le reste, l'assistant pour qui le lui demande. C'est ce qui fait la simplicité de l'application, mais quand quelque chose change sans qu'on s'y attende, personne ne peut savoir qui l'a fait, quand, ni ce qu'il y avait avant :

- **Samedi, 19 h.** Paul arrive pour le dîner, mais le binôme de cuisine n'a pas mis son couvert : il n'est plus compté. Il jure qu'il s'était inscrit. Était-ce Marie, qui a décalé les présences du foyer mardi ? L'assistant, qui a mal compris « on arrive après le dîner » ? Une fausse manipulation sur le téléphone de sa fille ? On ne le saura jamais, et on ne sait pas non plus s'il manquait à d'autres repas.
- **Le tirage relancé.** Deux sœurs se partagent le lien organisateur. L'une a passé la soirée à arranger les corvées à la main pour que les cousins échangent leur vaisselle ; le lendemain, l'autre relance le tirage pour une nouvelle personne et efface tout. Personne ne se souvient des échanges, il faut les renégocier à table.
- **Tante Odile a disparu.** Elle ne figure plus dans la liste. Supprimée ? Déplacée dans un autre foyer lors d'une fusion ? Et ses nuits, son lit dans la chambre bleue, ses inscriptions à la randonnée : que faut-il recréer, et à l'identique de quoi ?

À chaque fois, l'organisateur mène l'enquête sur le groupe familial, et la confiance dans l'application s'effrite : « je ne sais pas si ce qui est affiché est juste ».

## La proposition

Le séjour tient un journal de toutes les modifications, avec leur auteur et leur date, lisible en français par tous : « Marie a retiré Paul du dîner de samedi », « Claire, via l'assistant, a ajouté la nuit de vendredi pour son foyer ». De quoi comprendre ce qui s'est passé et le réparer à la main.

## User stories

**Participant**

1. En tant que participant, je veux consulter l'activité récente du séjour, afin de savoir ce qui a changé depuis mon dernier passage.
   *Critère : chaque ligne est une phrase en français avec l'auteur, l'action, la ou les personnes concernées et le moment (« il y a 2 h », « mardi à 21 h 14 »).*
2. En tant que participant, je veux savoir qui a modifié mes présences, mes nuits ou mes inscriptions, afin d'en parler avec la bonne personne plutôt que d'accuser l'application.
   *Critère : je peux n'afficher que ce qui me concerne, ou ce qui concerne mon foyer.*
3. En tant que participant, je veux que mes propres modifications portent mon nom, afin qu'on sache que c'est moi et pas un autre membre de la famille.
   *Critère : le journal note la personne qui s'est désignée sur l'appareil (« qui suis-je ? ») ; c'est déclaratif, comme le reste de l'application, et rien ne le vérifie.*

**Adulte du foyer**

4. En tant qu'adulte du foyer, je veux voir ce que les autres adultes de mon foyer ont changé pour nous, afin de ne pas défaire ce que mon conjoint a réglé la veille.
5. En tant qu'adulte du foyer, je veux voir ce qu'il y avait avant une modification, afin de la défaire moi-même si elle est fausse.
   *Critère : une ligne de présences dit ce qui a été retiré et ce qui a été ajouté ; il n'y a pas de bouton « Annuler ».*

**Personne qui utilise l'assistant**

6. En tant que personne qui fait saisir ses présences par l'assistant, je veux que ses modifications apparaissent à mon nom, avec la mention « via l'assistant », afin qu'on sache qu'elles viennent d'une demande en langue naturelle et pas d'une saisie à la main.

**Organisateur**

7. En tant qu'organisateur, je veux que mes actions de configuration figurent au journal (repas et menus, corvées et tirage au sort, activités, chambres et lits, foyers et personnes, régimes corrigés, réglages du séjour, lieu et infos pratiques, image de couverture), afin que les autres organisateurs et la famille sachent ce qui a bougé.
   *Critère : faute de nom choisi sur l'appareil, l'auteur est « l'organisateur ».*
8. En tant qu'organisateur, je veux retrouver l'état d'avant un geste de masse (tirage relancé, proposition automatique des lits, fusion ou suppression d'un foyer, suppression d'une personne), afin de reconstituer à la main ce qui a été écrasé.
   *Critère : la phrase résume le geste (« Anne a relancé le tirage des corvées : 3 ajustements manuels écrasés ») et le détail, réservé à l'organisateur, liste ce qui a changé.*
9. En tant qu'organisateur, je veux que le journal couvre toute la vie du séjour, de sa création à son dernier jour, afin de pouvoir remonter à une modification faite des semaines avant le départ.

## Hors périmètre

- Les consultations : ouvrir une page, imprimer une fiche ou parcourir le planning n'est pas agir, et n'est pas noté.
- L'annulation automatique (« Annuler cette modification ») : on comprend, puis on corrige soi-même.
- Une vraie identification des personnes (compte, mot de passe, appareil reconnu) : l'auteur reste celui qui s'est désigné.
- Modifier ou effacer des lignes du journal, y compris pour l'organisateur.
- Les alertes ou notifications quand quelque chose change (déjà hors périmètre de l'application).
- L'export du journal, et un journal qui suivrait la famille d'un séjour à l'autre.
- Les modifications faites avant la mise en service : le journal commence à cette date.
- L'interrogation du journal par l'assistant IA.

## Questions ouvertes pour le grill-me

1. **Qui voit le journal ?** *Recommandation :* tout le monde, sous forme d'une « Activité récente » en phrases françaises, comme le reste du séjour ; l'organisateur a en plus le détail des gestes de masse (avant et après).
2. **Comment nommer l'auteur ?** *Recommandation :* la personne désignée sur l'appareil ; « l'organisateur » pour un geste fait depuis l'espace organisateur sans nom choisi ; « quelqu'un » en dernier recours, ce qui ne devrait jamais arriver côté famille puisque la saisie exige déjà de s'être désigné.
3. **Comment écrire les actions de l'assistant ?** *Recommandation :* « Claire, via l'assistant, a… », une ligne par proposition validée, sans reprendre le texte de la demande.
4. **Quelle granularité ?** Décocher six repas, c'est six gestes. *Recommandation :* une phrase par modification enregistrée, qui regroupe tout ce qu'elle change (« Marie a modifié les présences de Paul : retiré des dîners de samedi et dimanche ») ; « tout le foyer » donne une phrase pour le foyer, pas une par personne.
5. **Où l'afficher ?** *Recommandation :* quelques lignes « Activité récente » sur la page « Moi » avec « Tout voir », une page complète filtrable (« me concerne », « mon foyer », tout), et la même page dans l'espace organisateur avec le détail.
6. **Combien de temps le garder ?** *Recommandation :* toute la vie du séjour, sans purge ; un séjour supprimé emporte son journal.
7. **Que montrer de l'état d'avant ?** *Recommandation :* assez pour refaire à la main : les repas et nuits retirés ou ajoutés, l'ancien et le nouveau lit, l'ancien foyer, l'ancienne valeur d'un réglage ; pour un texte long (consignes, menu), seulement « a modifié », sans comparaison mot à mot.
8. **Les données sensibles apparaissent-elles ?** *Recommandation :* le journal ne montre que ce que chacun voit déjà dans le séjour ; un régime corrigé s'écrit « a modifié les régimes et allergies de Rose », sans recopier la précision libre.
9. **Hors ligne ?** *Recommandation :* le journal se consulte hors ligne comme le reste, à la date des données affichée par le bandeau.

## Pistes notées pour plus tard

- Les analytics d'usage : fréquentation du séjour, installations de l'appli, consultations. Le journal en donnera une partie (qui agit, quand, depuis quel parcours) ; le reste demandera de mesurer aussi les lectures.
- « Ce qui a changé depuis ta dernière visite », mis en avant à l'ouverture.
- Un bouton « Annuler » pour les modifications simples (une présence, une inscription), une fois qu'on aura vu à l'usage lesquelles on défait.
- Un assistant qui répond à « qui m'a retiré du dîner ? » à partir du journal.

## Taille

**Moyen.** Chaque action est simple à noter, mais il y en a une vingtaine, réparties sur tout le séjour, et chacune doit produire une phrase juste et lisible, ce qui demande de les tester une à une.
