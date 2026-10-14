# Pitch — Lieu et informations pratiques du séjour

## Le problème

L'application sait tout de l'organisation d'un séjour (qui vient, qui mange, qui dort où, qui fait la vaisselle) sauf où il se passe et comment on y entre. Ces informations voyagent donc à côté, dans des messages vite noyés :

- **Vendredi, 19 h, sur l'autoroute.** Une tante demande l'adresse dans le groupe familial. L'organisateur est au volant, le message d'il y a trois semaines est introuvable, et le GPS la mène à l'entrée de service du hameau d'à côté.
- **Arrivée de nuit.** Le portail est fermé, personne n'a le code, il faut réveiller Mamie au téléphone. Une fois entré, personne ne sait où garer les voitures sans bloquer le tracteur du voisin.
- **Samedi matin.** On demande le code du wifi pour la quatrième fois, et un foyer est venu sans draps parce que « il faut apporter ses draps » figurait dans un mail que personne n'a relu.

L'organisateur finit par tout répéter de vive voix, et la famille ne sait jamais où se trouve la dernière version.

## La proposition

Le séjour porte son adresse, un lien Google Maps prêt à ouvrir et un bloc d'informations pratiques rédigé par l'organisateur. Ce bloc s'affiche en tête de l'onglet « Moi » et peut s'imprimer sur une fiche dédiée.

## User stories

**Organisateur**

1. En tant qu'organisateur, je veux saisir l'adresse du lieu, afin que chacun trouve son chemin sans me la redemander.
   *Critère : un lien « Ouvrir dans Google Maps » est créé automatiquement à partir de l'adresse.*
2. En tant qu'organisateur, je veux pouvoir coller un lien Google Maps vers un point précis, afin de corriger une adresse que Maps place mal.
   *Critère : le lien collé remplace le lien créé à partir de l'adresse ; un lien qui n'est pas un lien Google Maps est refusé.*
3. En tant qu'organisateur, je veux écrire les consignes pratiques en texte libre (code du portail, parking, heure d'arrivée conseillée, ce qu'il faut apporter, wifi), afin de tout réunir au même endroit.
   *Critère : le champ est précédé d'un avertissement qui rappelle que ces informations sont visibles par toute personne qui ouvre l'application.*
4. En tant qu'organisateur, je veux pouvoir modifier ces informations pendant le séjour, afin que tout le monde voie aussitôt la dernière version (le code a changé, le parking est déplacé).
   *Critère : la mention « Mis à jour le … à … » reste visible même quand les consignes sont repliées.*

**Participant**

5. En tant que participant, je veux trouver l'adresse et le bouton de carte en tête de « Moi », juste sous l'image de couverture, afin de les avoir sous la main en arrivant.
   *Critère : ils sont visibles même avant d'avoir choisi son nom dans la liste ; les consignes sont repliées et s'ouvrent d'un geste.*
6. En tant que participant sur la route, je veux lancer l'itinéraire en un geste depuis mon téléphone, afin de ne pas recopier l'adresse dans mon GPS.
   *Critère : sur mobile, le lien ouvre l'application Google Maps si elle est installée.*
7. En tant que participant, je veux copier l'adresse, afin de l'envoyer à quelqu'un qui me rejoint ou à un livreur.
8. En tant que participant, je veux pouvoir toucher les liens et les numéros de téléphone écrits dans les consignes, afin d'appeler directement le voisin qui garde les clés.

**Adulte du foyer**

9. En tant qu'adulte du foyer, je veux voir clairement ce qu'il faut apporter, afin de préparer les sacs de toute la famille avant de partir.
   *Critère : les retours à la ligne et les tirets tapés par l'organisateur s'affichent tels quels.*

**Sur place**

10. En tant qu'organisateur, je veux imprimer une fiche « Infos pratiques », afin de l'afficher à l'entrée ou sur le frigo pour ceux qui n'ont pas de téléphone, ou pas de réseau.
    *Critère : la fiche donne l'adresse, le lien de carte en clair et les consignes.*

## Hors périmètre

- Une carte affichée dans l'application, le calcul d'itinéraire ou du temps de trajet.
- Les liens vers d'autres services de cartes (Waze, Apple Plans, OpenStreetMap).
- Plusieurs lieux par séjour (les activités ont déjà leur propre champ « lieu »).
- Des consignes différentes selon le foyer ou la personne.
- Toute protection des consignes : elles sont aussi publiques que le reste du séjour.
- Une mise en forme riche (gras, titres, Markdown).
- Un QR code sur la fiche imprimée.
- Le lieu sur la carte du séjour, à l'accueil.
- Les consignes dans l'assistant IA, pour l'instant.
- Une alerte envoyée quand les consignes changent (les notifications sont déjà hors périmètre).
- Des pièces jointes : plan d'accès en PDF, photo du portail.
- Le covoiturage (étudié et écarté en octobre 2026).

## Décisions (grill-me du 15/10/2026)

1. **Visibilité** : les consignes sont publiques, comme tout le séjour. L'aide à la saisie le dit clairement ; aucune zone protégée.
2. **Lien de carte** : l'adresse en clair fabrique le lien ; un lien collé, facultatif, passe devant.
3. **Lien collé** : seuls les liens Google Maps sont acceptés ; le bouton s'appelle toujours « Ouvrir dans Google Maps ». Un lien sans adresse est accepté.
4. **Consignes** : un seul texte libre, guidé par un exemple en filigrane (portail, parking, arrivée, à apporter, wifi).
5. **Rendu** : texte brut qui garde les retours à la ligne, avec les liens `https://` et les numéros de téléphone rendus cliquables, sans dépendance nouvelle.
6. **Emplacement** : en tête de « Moi », sous l'image de couverture, avant la liste « qui es-tu ? » comme avant le tableau de bord. Pas de nouvel onglet.
7. **Repli** : l'adresse et le bouton de carte sont toujours visibles ; les consignes sont toujours repliées par défaut, derrière « Voir les infos pratiques ».
8. **Impression** : une fiche dédiée « Infos pratiques » dans l'onglet Imprimer ; aucun rappel sur les autres fiches.
9. **QR code** : aucun.
10. **Longueurs** : consignes limitées à environ 2 000 caractères, adresse à 300, lien à 500.
11. **Accueil** : rien ne change sur la carte du séjour.
12. **Assistant IA** : non concerné pour l'instant. Il sera renforcé plus tard, et les consignes en seront une source naturelle.
13. **Changements** : la mention « Mis à jour le … à … » reste visible même quand les consignes sont repliées.
14. **Saisie** : une section « 📍 Lieu et infos pratiques » dans Organisation, entre « Image de couverture » et « Dates du séjour », avec son propre bouton Enregistrer.

## Pistes notées pour plus tard

- Un QR code du lien famille sur une fiche imprimée, pour rejoindre l'application depuis le frigo.
- Un champ wifi à part, qui permettrait un QR wifi.
- Le même rendu cliquable pour les descriptions d'activités et les notes de chambres.
- Un assistant IA qui répond aux questions pratiques à partir des consignes.

## Taille

**Petit.** Il s'agit de quelques informations de plus sur le séjour, d'un bloc d'affichage repliable, d'une section de saisie et d'une fiche à imprimer, sans nouvelle règle métier. Les choix faits (texte brut, Google Maps seulement, pas de protection) écartent tout ce qui aurait pu grossir le travail.
