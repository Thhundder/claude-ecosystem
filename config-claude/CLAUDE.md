# Doctrine

La méthode de travail — statut des affirmations, hypothèse unique, proportion, forme des
réponses, règles du front — vit dans le style de sortie `rigueur`. Elle ne se répète pas ici.

Ce fichier ne porte que ce qui n'y est pas, et ce qu'aucun mécanisme n'applique déjà.

## Écriture

- **Aucun commentaire par défaut.** Un commentaire ne se justifie que si le *pourquoi* n'est
  pas lisible : contrainte cachée, invariant subtil, contournement d'un défaut précis. Jamais
  ce que fait le code — les noms le disent. Jamais une référence à la tâche en cours, au
  numéro d'un correctif, ou à l'appelant : ça pourrit.
- **Pas de couche de compatibilité** sauf demande explicite.
- **Valider aux frontières seulement** — entrée utilisateur, réponse externe, contenu de
  fichier. À l'intérieur, faire confiance aux contrats.
- **Chirurgical** : ne changer que ce que la tâche exige.
- Fichiers de 200 à 400 lignes, plafond 800. Fonctions sous 50 lignes.
- Ne jamais afficher la valeur d'un identifiant, seulement son existence.

## Délégation

**Les agents ne se déclenchent jamais d'eux-mêmes** — le programme l'interdit, ce n'est pas
une question de configuration. Ils partent uniquement si l'utilisateur le demande, et la
demande peut rester vague : « lance des agents » suffit, le bon spécialiste est choisi.

Agents disponibles : `security-reviewer`, `silent-failure-hunter`, `bug-validator`.
Les agents natifs `Explore` et `Plan` couvrent l'exploration et la planification.

Aucune skill n'est installée. Une seule commande : `/sync-claude-config`.

## Rien n'est validé sans une épreuve qui pouvait échouer

Un changement n'est annoncé fait qu'après un contrôle **qui aurait pu le contredire**. Mesurer
la taille d'un fichier après l'avoir modifié ne prouve rien : il faut relire ce qu'on s'attendait
à y trouver. Un contrôle qui ne peut pas échouer n'est pas un contrôle, c'est une formalité.

Les substitutions par motif passent par `bin/remplacer.py` : il échoue quand le motif est absent
ou présent un autre nombre de fois que prévu, et il relit le fichier après écriture. Un motif
introuvable laisse le fichier intact **et la commande en succès** — c'est ainsi qu'on annonce
un correctif qui n'existe pas.

## Retirer ou remplacer quelque chose

Toute suppression et tout remplacement suivent cet ordre, **dans un workflow comme en dehors** :

1. **Cartographier avant de couper** — ce qui touche la chose, et ce qu'elle touche. La carte
   s'écrit avant la première suppression ; ce n'est pas un compte rendu.
2. **Écrire le plan de retrait**, en nommant ce qui doit rester intact.
3. Supprimer.
4. **Balayer les orphelins** : aides devenues sans appelant, imports morts, constantes,
   fixtures, tables, variables d'environnement, tâches planifiées, entrées de documentation,
   et les documents qui citaient la chose.
5. **Vérifier que rien d'autre n'a bougé.**

Une doctrine qui nomme un outil retiré est un orphelin comme un autre.

## Condenser ce qui se relit

Quand une partie du code se relit plusieurs fois, écrire son condensé à côté d'elle : points
d'entrée, flux de données, interface publique, invariants, effets de bord, pièges — avec les
références fichier et ligne. Une session suivante charge le condensé au lieu du code.

## Le contrat vaut aussi hors des workflows

Le contrôle mécanique ne s'applique qu'aux briefs d'agents. Les trois mêmes exigences valent
pour le travail fait dans le fil principal : **à quoi on reconnaît que c'est réussi**, **quand
on renonce**, et **ce qui a déjà été tenté**. Rien ne les impose ici — c'est à tenir.

## Le coût d'un agent est ce qu'il relit, pas ce qu'il produit

Un agent relit **tout** son contexte à chaque tour. Un jeton placé en tête lui coûte environ
4,90 unités : 1,25 pour l'écrire, puis 0,10 à chacun des 37 tours. Mesuré sur 1 323 agents :
la relecture pèse 95 % des jetons, un jeton de résultat est relu 63 fois.

Deux conséquences, opposables dans tout brief d'agent.

- **Aucun appel d'écriture au-delà de 25 000 caractères.** Une génération plus longue dépasse
  la durée de vie du cache : le tour suivant réécrit tout le contexte à douze fois le prix.
  Écrire le même fichier en trois appels produit les mêmes octets — vérifié en vol sur
  185 670 caractères — et vaut 3,5 %.
- **Deux commandes qui ne dépendent pas l'une de l'autre partent dans le même tour.** Un tour
  coûte la relecture du contexte entier, que l'appel rende 20 jetons ou 20 000. Gain simulé au
  taux prudent : 13,6 %. Non-régression établie sur une tâche courte — deux inventaires
  identiques au caractère près — **mais non vérifiée sur une tâche longue.**

**Un vol se mesure, il ne se suppose pas.** Le coût par unité se prend sur le vol entier
précédent avant chaque lancement. Un dimensionnement fondé sur un coût six fois trop bas a
coûté 27 agents pour zéro ligne produite.

Mesure d'un vol : `bin/cout-vol.py --projet <slug>`.

## Ce qui est mécanisé, et n'a donc pas à être répété

| Mécanisme | Ce qu'il fait |
| --- | --- |
| `hooks/guard.sh` | branches partagées, déploiements, gestes irrattrapables, fichiers d'identifiants |
| `hooks/journal-hook.sh` | reprise à l'ouverture ; refus de clore sans journal ; pas d'interface neuve sans atlas |
| `hooks/contrat-hook.sh` | contrat de brief et lentille de complétude avant tout workflow |
| `hooks/veille-hook.sh` | signale un agent gelé ou un workflow arrêté |
| `bin/journal.sh` | bloc d'état du journal, généré et jamais saisi |
| `bin/ecran.mjs` | inventaire d'un écran, maquette contre rendu réel |
| `bin/atlas.py` | amorce l'atlas visuel d'un dépôt depuis ses jetons |
| `bin/veille-wf.py` | état des workflows |
| `bin/lire-secret.sh` | lit un fichier d'identifiants sans exposer les valeurs |
| `lentilles.md` | catalogue fixe des lentilles de vérification |

## Dépôt d'outillage

`~/Documents/claude-ecosystem` — versionne cette configuration (`/sync-claude-config`).
Il ne contient que ce qui est chargé : les trois agents ci-dessus, la commande de sync, le miroir
`config-claude/` et deux scripts de mesure d'usage dans `scripts/`. Tout le reste a été supprimé le
2026-09-09 ; l'état antérieur est au tag `avant-tri-2026-09-09`. Pour restaurer une configuration
entière : `~/claude-backup-20260822T1613`.
