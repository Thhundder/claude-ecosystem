# Les lentilles de vérification

Catalogue fixe. **Il ne se réinvente pas à chaque workflow** : c'est ce qui a permis à un
audit d'être cadré par l'audité, et au défaut le plus grave de n'avoir aucune lentille pour
être vu. Chaque lentille vient d'un défaut réellement constaté, pas d'une théorie.

Un vérificateur reçoit **l'artefact et l'exigence d'origine**. Jamais le résumé du producteur :
un résumé transporte les angles morts de celui qui l'a écrit.

---

## L1 — Complétude · OBLIGATOIRE

Qu'est-ce qui n'a **aucune** lentille ? Quelle modalité n'a pas été lancée, quelle affirmation
n'a pas été éprouvée, quelle source n'a pas été lue, quelle partie du périmètre n'a pas été
ouverte ?

*Origine : un audit à cinq lentilles n'a pas vu son défaut le plus grave, parce qu'aucune des
cinq ne regardait de ce côté.*

## L2 — Statut des affirmations

Chaque « mesuré » correspond-il à une exécution réelle ? Chaque « vérifié » à une lecture ?
Une pièce classée comme preuve contient-elle une mesure, ou seulement un raisonnement ?

*Origine : une preuve sans aucune mesure, et un « mesuré trois fois » dont la troisième n'était
pas une mesure — inflation recopiée ensuite dans deux documents d'exploitation.*

## L3 — Livraison réelle

Ce qui est annoncé comme fait est-il dans l'historique, visible en revue ? Ou dans un dossier
ignoré, un fichier non suivi, un réglage jamais montré ?

*Origine : un correctif vivant dans un répertoire exclu de git, présenté au tableau des
livrables à côté de fichiers enregistrés. Et trente règles de permission ajoutées sans être
listées, dans un fichier hors revue.*

## L4 — Demande contre réponse

Qu'est-ce qui a été demandé et n'a pas été fait ? Un refus motivé en bas de page compte comme
non fait tant qu'il n'est pas au premier plan. La question posée a-t-elle reçu une réponse, ou
a-t-elle été renvoyée à plus tard ?

*Origine : une relance de session déclinée en bas de page, et la question du budget renvoyée
au backlog alors qu'elle était la question posée.*

## L5 — Capacité structurelle

La valeur affichée peut-elle prendre une autre valeur ? Le champ lu est-il écrit quelque part ?
Le correctif reste-t-il actif à l'étape suivante ?

*Origine : deux lignes d'état incapables d'afficher autre chose que « aucune », un compteur
calculé sur un ensemble où il vaut toujours zéro, et un correctif qui s'éteint au passage en
phase 2.*

## L6 — Doctrine contre code

Le document décrit-il le code tel qu'il est aujourd'hui ? Une règle nomme-t-elle un outil,
un fichier ou une commande qui existe réellement ?

*Origine : une fiche affirmant qu'un fichier n'est plus lu pour le champ qui gouverne tout, une
doctrine désignant une maquette absente de la machine, une compétence jamais écrite citée deux
fois, et une méthode de revue citée mais installée nulle part.*

---

## Règle de composition

- **L1 est obligatoire** dès qu'un workflow comporte une étape de vérification.
- Les autres se choisissent selon l'enjeu, mais elles se choisissent **avant** que les
  producteurs ne tournent, et elles sont écrites dans le script.
- Une lentille inventée pour l'occasion s'ajoute au catalogue si elle a trouvé quelque chose.
