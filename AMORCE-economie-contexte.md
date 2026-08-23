# AMORCE — éprouver les économies de contexte des vols de workflow

> À coller dans une session neuve, à la racine de `/home/thundder/Documents/Xeko/pms-ia`.
> Rien d'autre. Cette page contient tout ce qui a déjà été mesuré et tout ce qui manque.

---

## Ta mission

Déterminer **la meilleure façon d'économiser des jetons sur les vols de workflow du chantier
mailbox-v2, en minimisant le risque de perte de qualité.**

Un risque de perte est acceptable s'il est petit devant le gain. Mais **il doit être mesuré,
pas estimé** : une économie dont on ignore le coût en qualité n'est pas une économie, c'est un
pari. C'est exactement le défaut de la session qui te précède, et c'est ce que tu dois corriger.

**Tu rends un tableau comparatif** : chaque solution seule, puis les combinaisons qui tiennent
ensemble, avec pour chacune le gain en jetons, le risque mesuré, et ce qui l'a établi.

## La règle absolue

**Aucune affirmation sans une épreuve qui pouvait la contredire.** Pas d'estimation présentée
comme mesure. Pas de « probablement ». Si une chose n'a pas été testée, elle est annoncée
comme non testée, et tu dis ce qu'il faudrait pour la tester.

Quand une mesure coûte cher, **cherche d'abord une mesure approchée qui ne coûte rien** sur les
données déjà présentes. La session précédente a conclu « il faudrait payer un vol » sans avoir
cherché s'il existait une mesure sur les transcripts existants. C'est sa faute principale.

**Critère de succès** : chaque ligne de ton tableau final porte un gain chiffré et un risque
chiffré, chacun rattaché à une mesure que tu as exécutée et dont tu donnes la commande.
Une ligne sans risque mesuré est marquée « non éprouvé » en toutes lettres.

**Condition d'arrêt** : si une piste demande plus de deux heures de mesure ou l'exécution d'un
vol réel, tu t'arrêtes, tu écris ce que tu as, et tu décris le protocole qu'il faudrait.
Tu ne lances aucun vol de production.

---

## Le terrain

Le chantier `docs/mailbox-v2/` produit une étude comparée en 244 sous-points, par vols de
workflow. Chaque vol lance des dizaines d'agents en parallèle (concurrence 16). Le script est
`docs/mailbox-v2/outils/workflows/p1-etude.js`. Les transcripts d'agents vivent sous
`~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia/<session>/subagents/workflows/<vol>/`.

Un outil de décomposition existe déjà : `~/.claude/bin/cout-vol.py --projet <slug>`.

---

## Ce qui est DÉJÀ MESURÉ — reprends-le, vérifie-le, ne le refais pas à l'aveugle

Tous les chiffres ci-dessous portent sur **1 307 agents de workflow** de ce projet.
Pondération employée : sortie ×5, entrée neuve ×1, écriture de cache ×1,25, lecture de cache ×0,1.

| Fait établi | Valeur |
| --- | --- |
| Coût total pondéré des vols | **910 M unités** |
| Requêtes par agent | médiane **34**, p90 71 |
| Contexte au premier appel (système + schémas + brief) | médiane **33 238** jetons |
| Brief seul | médiane **1 668**, p90 36 979 |
| Écriture de cache au premier appel | **29 835** jetons par agent |
| Lecture de cache | 5 945 M bruts — **96 % du volume, 65 % du coût pondéré** |
| Écriture de cache | 233 M bruts — 3,8 % du volume, **32 % du coût** |
| Production utile des agents (sortie) | 4 M — **2,4 % du coût** |
| Résultats d'outils, sur 336 agents ≥ 8 requêtes | 14,4 M, imposant **414 M de relecture** |
| **Facteur de port** | **un jeton de résultat est relu 29 fois** |
| Origine des résultats | lecture de fichiers **44 %** (3 850 j/appel), extraction par plage 18 %, web 8 %, motif 12 % |

### Piège de méthode déjà rencontré — ne retombe pas dedans

Une réponse d'assistant contenant plusieurs blocs s'inscrit sur **plusieurs lignes du
transcript, chacune portant le même relevé `usage`**. Compter les lignes surcompte d'un facteur
**2,04**. Il faut dédoublonner par `requestId` (ou `message.id`) avant toute somme.
La session précédente a publié des chiffres doublés pendant trois tours à cause de ça.

---

## Les pistes, leur état

### A — Socle invariant en tête, partagé entre agents

Chaque agent d'un vol lit 10 288 jetons déjà en cache, et **en écrit ~29 835 qui lui sont
propres** — les constantes du brief (socle, doctrine, méthode d'édition). Sur quatorze agents
d'un même vol, seulement **trois valeurs distinctes** : les briefs sont quasi identiques,
l'écart tenant au sous-point injecté.

Si l'invariant était placé en tête **à l'octet près**, le premier agent l'écrirait et les
autres le liraient. Écrire coûte 12,5 fois lire.

**Gain mesuré : 45 M, soit 4,9 %. Risque : nul — seul l'ordre du texte change.**

À vérifier par toi : que l'invariant est bien invariant (le mesurer sur le script, pas le
supposer), et qu'aucune interpolation ne se glisse avant lui.

### B — Condensé à mi-parcours

L'agent écrit ce qu'il a compris dans un fichier, puis repart d'un contexte réduit à ce
condensé, cessant de relire la matière brute qui lui a servi à l'écrire.

**Gain mesuré : 98 M, soit 10,8 %** (simulé à 5 000 jetons de condensé ; paliers 2 000 et
10 000 également calculés, le gain varie peu).

**Risque : NON MESURÉ. C'est ta tâche principale.** Un condensé mal fait produit un angle mort
qui, par définition, ne se voit pas. Sur une cartographie exhaustive, c'est le défaut le plus
grave possible.

**Une mesure approchée existe probablement sur les données présentes.** Piste à éprouver, et à
contester si tu trouves mieux : prendre des agents terminés, reconstituer leur contexte,
identifier les affirmations de leur rapport final qui ne peuvent provenir **que** de matière
produite dans la première moitié du vol, et mesurer quelle fraction survivrait à un condensé
de 5 000 jetons. Un rapport dont 90 % des affirmations s'appuient sur la seconde moitié ne
risque rien ; l'inverse condamne l'idée.

### Écartées par la mesure — ne les reprends pas sans raison nouvelle

| Piste | Pourquoi écartée |
| --- | --- |
| Réduire le nombre d'appels (34 → 20) | Revient à produire moins. Refusé par l'utilisateur. |
| Lire par plage au lieu du fichier entier | Un agent qui lit une plage ignore ce qu'il n'a pas lu. Angle mort non mesurable a posteriori. |
| Découper un agent en plusieurs | Le socle se paie autant de fois qu'il y a d'agents. Simulé : 3 agents de 25 appels coûtent 67 % d'un agent de 74, pas 33 %. |
| Résultats d'outils obtenus deux fois | Mesuré : **5 doublons sur 39 865** résultats de plus de 200 jetons. Néant. |
| Expiration du cache sous forte concurrence | Mesuré : écart médian **2 secondes** avant une réécriture, 0,8 % au-delà de cinq minutes. Réfuté. |

---

## Pistes non explorées — à toi de les ouvrir ou de les fermer

- La part des requêtes d'un agent qui sert à **naviguer** (trouver un fichier, vérifier qu'il
  existe) plutôt qu'à produire. Cette part se supprime en la donnant dans le brief, sans rien
  perdre. Non mesurée.
- Le **découpage en étages** : un agent qui explore et rend une carte, puis un agent neuf qui
  produit à partir de la carte seule. Différent du découpage rejeté, parce que le second agent
  ne porte jamais la matière brute.
- La **taille des schémas d'outils** dans le socle de 33 238 jetons : combien d'outils un agent
  charge-t-il réellement, et combien lui servent ? Mesure de départ disponible : sur 200 agents,
  seuls 8 outils distincts ont été employés.
- Tout ce que tu trouveras et que personne n'a vu.

---

## Ce que tu rends

Un rapport unique, dans `docs/economie-contexte/RAPPORT.md` du dépôt d'outillage, contenant :

1. **Le tableau des solutions seules** : gain en jetons et en pourcentage, risque mesuré,
   commande qui l'établit.
2. **Le tableau des combinaisons** qui tiennent ensemble — en signalant celles qui
   s'annulent ou se recouvrent partiellement, avec le calcul du recouvrement.
3. **Ce que tu as réfuté**, avec la mesure qui l'a réfuté.
4. **Ce qui reste non éprouvé**, en toutes lettres, avec le protocole qu'il faudrait.

Aucune configuration n'est modifiée. Aucun vol de production n'est lancé.

**Ce qui a déjà été tenté et n'a rien donné** est listé plus haut : n'y retourne pas sans un
angle neuf, et dis lequel.
