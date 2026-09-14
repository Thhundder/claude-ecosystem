# Doctrine

La méthode de travail — statut des affirmations, hypothèse unique, proportion, forme des
réponses, règles du front — vit dans le style de sortie `rigueur`. Elle ne se répète pas ici.

Ce fichier ne porte que ce qui n'y est pas, et ce qu'aucun mécanisme n'applique déjà.

## Écriture

- **Aucun commentaire par défaut.** Un commentaire ne se justifie que si le *pourquoi* n'est
  pas lisible : contrainte cachée, invariant subtil, contournement d'un défaut précis. Jamais
  ce que fait le code — les noms le disent. Jamais une référence à la tâche en cours, au
  numéro d'un correctif, ou à l'appelant : ça pourrit. L'en-tête d'un fichier se conserve, y
  compris les blocs gérés par l'outillage. Un pointeur vers un ADR est admis ; le pourquoi
  durable va dans l'ADR quand le dépôt en tient.
- **Pas de couche de compatibilité** sauf demande explicite — sauf pour un schéma ou une
  collection partagés entre dépôts, compatibles ascendants par défaut.
- **Valider aux frontières seulement** — entrée utilisateur, réponse externe, contenu de
  fichier. Dans un système multi-tenant, chaque requête entrante, chaque lecture d'une
  collection partagée et chaque argument produit par un modèle sont des frontières. À
  l'intérieur, faire confiance aux contrats.
- **Chirurgical** : ne changer que ce que la tâche exige.
- **Une fonction se lit d'un coup.** C'est la seule mesure de taille.
- Ne jamais afficher la valeur d'un identifiant, seulement son existence.

## Plan, puis un agent par étape

Toute demande qui dépasse une retouche commence par `evan/PLAN.md` : étapes numérotées, une
ligne chacune, ce qui se parallélise, la condition de fin de chaque étape, les décisions
produit ouvertes marquées `?`. **Le tour se termine sur le plan posé : « plan écrit, j'attends
ton GO ». Jamais un plan et son lancement dans le même tour.**

Au GO : la loop de 60 s est armée comme filet — elle relance si la session meurt — mais elle
n'entre jamais dans les raisons de terminer un tour. Chaque étape est confiée à un agent neuf,
l'une après l'autre ; il reçoit le plan, son étape, ce qui a été fait avant ; la session
principale vérifie le résultat, coche, passe à la suivante. **Un tour ne se termine que sur une
étape `?`, un blocage écrit dans le plan avec ce qui manque, ou la fin du plan.** Pas de hook.
Si la session meurt, la loop la relance ; sinon `/reprendre`.

Chez Xeko, une gate est une étape `?`. Dans un cycle Xeko, le plan n'est pas un second
document : ce sont les phases du skill et ses artefacts (`SPEC.md`, `TEST_PLAN.md`,
`COVERAGE_MATRIX.md`) ; `PLAN.md` ne sert qu'au travail hors cycle. La granularité d'une étape
est celle du skill — une phase, pas un test : la boucle TDD reste dans un seul contexte, chaque
tranche répond à la précédente.

## Délégation

**Les agents ne se déclenchent jamais d'eux-mêmes.** Ils partent si l'utilisateur le demande,
et la demande peut rester vague : « lance des agents » suffit, le bon spécialiste est choisi.
Un skill que l'utilisateur invoque vaut demande pour les agents qu'il prescrit ; ultracode
actif vaut demande de workflow ; un workflow dans un dépôt Xeko suit les phases du skill ; un
skill chargé par le modèle ne lance pas d'agent sans confirmation.

Agents disponibles : ceux du plugin `xeko@xeko-engineering` quand il est actif — `axe-metier`,
`axe-backend`, `axe-frontend`, `axe-integration`, `reviewer-spec`, `reviewer-standards`,
`reviewer-adversarial`, `reviewer-security`. Aucun agent personnel n'est installé. Les agents
natifs `Explore` et `Plan` couvrent l'exploration et la planification.

Skills : le plugin `frontend-design` et, quand il est actif, les dix-huit skills xeko. Deux
commandes personnelles : `/sync-claude-config` et `/reprendre` (reprise d'une session sur
pièces, audit compris).

## Machine et appels payants

Deux agents en parallèle par défaut ; au-delà sur demande, RAM lue avant chaque lancement. Un
appel externe payant — modèle, PMS, API — est compté et plafonné avant d'être mis en boucle.
Dans un cycle Xeko, les quatre agents d'axe tournent deux par deux : l'indépendance exigée par
le plugin — aucun ne voit les conclusions des autres — tient tant que l'orchestrateur ne
transmet rien entre eux ; la simultanéité n'est que le moyen.

## Git

Pousser sur une branche est libre, au nom propre selon la convention du dépôt — chez Xeko
`feature/`, `fix/`, `audit/`, `harden/` — jamais un nom qui imite un environnement. `dev`
(staging) et `main` (prod) sur demande seulement. Un push par lot cohérent.

## Chercher vraiment

Quand on cherche une cause, on ne s'arrête pas au premier truc qui a l'air louche. Chaque piste
se teste : on déclenche le défaut avec elle, ou on la raye. Une cause, c'est une piste qui a été
déclenchée. Tout le reste s'appelle « pas prouvé ». Si rien n'a été déclenché, on dit « pas
trouvé » et on liste ce qui a été essayé — jamais « ça vient probablement de là ». Ce qui marche
est tenu pour marchant tant qu'on n'a pas montré le contraire. On reste dans le périmètre
donné ; pour l'élargir, on demande. Quand la cause reste introuvable, on pose les logs qui la
montreront la prochaine fois, et on l'écrit. Compatible avec `diagnose` : sa liste de 3 à 5
hypothèses classées se montre comme hypothèses, jamais comme cause.

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
   s'écrit avant la première suppression ; ce n'est pas un compte rendu. Elle couvre les quatre
   dépôts qui partagent la base Mongo : `xeko-app`, `xeko-plateforme`, `xeko-backend`,
   `xeko-mcp`.
2. **Écrire le plan de retrait**, en nommant ce qui doit rester intact.
3. Supprimer.
4. **Balayer les orphelins** : aides devenues sans appelant, imports morts, constantes,
   fixtures, tables, variables d'environnement, tâches planifiées, entrées de documentation,
   et les documents qui citaient la chose.
5. **Vérifier que rien d'autre n'a bougé.**

Une doctrine qui nomme un outil retiré est un orphelin comme un autre.

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

## Tout ce que Claude écrit pour l'utilisateur vit dans `evan/`

Journal, plan, feuilles d'essais, études, rapports, notes : dans `evan/` à la racine du dépôt
courant, ignoré par le gitignore global — aucun `.gitignore` de dépôt d'équipe n'est touché, et
ça vaut dans les worktrees. Ce qui est un livrable pour l'équipe — code, tests, `SPEC.md`,
matrice, docs du plugin, maquette validée en Gate A si l'équipe l'adopte — reste hors de
`evan/` et se versionne comme le plugin le dit. Un fichier déjà suivi ne devient pas ignoré :
il se retire du suivi d'abord.

## Ce qui est mécanisé, et n'a donc pas à être répété

| Mécanisme | Ce qu'il fait |
| --- | --- |
| `hooks/guard.sh` | fichiers d'identifiants, substitutions, git destructif, déploiements, branches partagées, effacement hors périmètre |
| `hooks/journal-hook.sh` | reprise depuis `evan/JOURNAL.md` ; refus de clore sans journal ; maquette ou atlas exigé avant une interface neuve, selon que le plugin xeko est actif |
| `hooks/contrat-hook.sh` | contrat de brief et lentille de complétude : refus sur Workflow, avertissement sur Agent |
| `hooks/veille-hook.sh` | signale un agent gelé ou un workflow arrêté |
| `bin/journal.sh` | bloc d'état du journal, généré et jamais saisi |
| `bin/ecran.mjs` | inventaire d'un écran, maquette contre rendu réel |
| `bin/atlas.py` | amorce l'atlas visuel d'un dépôt depuis ses jetons |
| `bin/veille-wf.py` | état des workflows |
| `bin/lire-secret.sh` | lit un fichier d'identifiants sans exposer les valeurs ; à distance : `ssh hôte bash -s -- <fichier> < ~/.claude/bin/lire-secret.sh` |
| `bin/remplacer.py` | substitution qui échoue si le motif manque ; à distance : `ssh hôte python3 - <args> < ~/.claude/bin/remplacer.py` |
| `bin/cout-vol.py` | coût d'un vol d'agents, par projet |
| `lentilles.md` | catalogue fixe des lentilles de vérification |
| `guard-db`, `guard-worktree` | les deux gardes du plugin xeko, quand il est actif |

## Dépôt d'outillage

`~/Documents/claude-ecosystem` — versionne cette configuration (`/sync-claude-config`).
Il ne contient que ce qui est chargé : la commande de sync, le miroir `config-claude/` et deux
scripts de mesure d'usage dans `scripts/`. Son dossier `evan/` porte les études et le journal ;
il est ignoré, comme partout. Tout le reste a été supprimé le 2026-09-09 ; l'état antérieur est
au tag `avant-tri-2026-09-09`. Pour restaurer une configuration entière :
`~/claude-backup-20260822T1613`.
