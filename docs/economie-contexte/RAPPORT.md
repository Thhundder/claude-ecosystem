# Économiser le contexte des vols de workflow — mesures, et ce qu'elles coûtent en qualité

Corpus : **1 323 agents de workflow** du projet `pms-ia`, 96 vols, 49 635 requêtes,
668 Mo de transcriptions. Pondération employée, identique à celle des travaux antérieurs :
sortie ×5, entrée neuve ×1, écriture de cache ×1,25, lecture de cache ×0,1.

Toutes les mesures sont reproductibles : `mesures/extraire.py agents.jsonl` construit le jeu
compact (4 s), les autres scripts s'exécutent dessus.

---

## 0. Ce qui était faux dans les mesures antérieures

Trois chiffres du dossier précédent ne tiennent pas. Ils sont corrigés ici avant tout le reste,
parce qu'ils servaient de dénominateur à toutes les économies annoncées.

| Affirmation antérieure | Mesure | Écart |
| --- | --- | --- |
| Coût total 910 M | **1 170 M** | +29 % |
| Production (sortie) 4 M, 2,4 % du coût | **54,1 M, 23,1 % du coût** | ×13 |
| Un jeton de résultat relu 29 fois | **63 fois** | ×2,2 |
| Piste A (invariant en tête) rapporte 45 M / 4,9 % | **2,1 M / 0,2 %** | ÷23 |
| Expiration du cache « réfutée » | **23,3 % des écritures de cache** | rétablie |

La sortie avait été comptée hors dédoublonnage inverse : le dossier annonçait 4 M là où les
relevés `usage`, dédoublonnés par `requestId` et pris au maximum par requête, donnent 54,1 M.
La sortie n'est pas un résidu de 2 % : c'est le **deuxième poste de coût**.
Commande : `mesures/base.py`, contre-épreuve indépendante `mesures/verif_sortie.py`
(le texte réellement écrit couvre 33 à 85 % des jetons déclarés — l'écart est le raisonnement
non retranscrit ; aucun facteur 13).

**Le facteur de conversion caractères/jetons est 2,54, pas 4.** Établi par régression du coût
d'écriture du premier appel sur la longueur du brief, sur 1 323 points (`mesures/socle.py`).
Toute mesure de volume faite en divisant des caractères par 4 sous-estime de 36 %.

---

## 1. Le modèle de coût, et il est vérifié

Le contexte d'une requête est directement observable : `entrée + écriture de cache + lecture de
cache`. La matière ajoutée à un tour est la différence de contexte entre deux tours consécutifs.
Reconstruire la lecture de cache à partir de ces seules quantités donne 6 533 M contre 6 027 M
observés — **8 % d'écart** (`mesures/modele.py`). Le modèle tient.

Il en découle une règle qui commande tout le reste :

> **Un jeton placé dans le socle coûte 4,90 unités pondérées** : 1,25 pour l'écrire une fois,
> puis 0,10 par tour de relecture — 37,5 tours en moyenne.
> **Un jeton économisé par partage n'en rend que 1,15** : le partage supprime l'écriture, jamais
> les relectures.

C'est cette règle qui effondre la piste A : mettre l'invariant en tête ne récupère que 23 % de
ce que coûte cet invariant. Le **retirer** récupère tout.

Décomposition du socle actuel (30 909 jetons médians) :

| Composant | Jetons/agent | Coût pondéré sur le corpus | Part |
| --- | --- | --- | --- |
| Segment partagé entre agents (lu, jamais réécrit) | 10 813 | — | — |
| Listing des skills | 3 617 (était 8 452) | 22,8 M | 2,0 % |
| Chaîne `CLAUDE.md` + `AGENTS.md` | 6 833 | 44,3 M | 3,8 % |
| Liste des outils différés | 1 093 | 6,9 M | 0,6 % |
| Brief d'une sonde | 3 071 | 19,9 M | 1,7 % |
| — dont partie invariante | 1 732 | 11,2 M | 1,0 % |

Commandes : `mesures/socle.py`, `mesures/cout_socle.py`, `mesures/briefs2.py`.

---

## 2. Le tableau des solutions seules

Rejoué sur le **régime actuel** — les 328 agents des vols des 22 et 23 août, seuls
représentatifs de ce qui partira demain. Coût de référence 355 M mesurés, 368 M simulés
(écart 3,9 %). Les pourcentages sont relatifs à la base simulée. Commande : `mesures/recent.py`.

| Levier | Gain | Risque mesuré | Ce qui l'établit |
| --- | --- | --- | --- |
| **Retirer le listing des skills** | **2,0 %** | **Nul, mesuré.** Zéro appel de `Skill` sur 60 661 appels d'outils, 1 323 agents. Le listing est injecté dans 1 286 d'entre eux. | `mesures/base.py` (recensement des 8 outils employés) + comptage des attachements `skill_listing` |
| **Découper la rédaction finale** | **5,3 %** | **Nul.** Les mêmes octets sont écrits, en trois appels au lieu d'un. | `mesures/ttl.py`, `mesures/lent.py`, `mesures/cause_write.py` |
| **Grouper les appels indépendants (25 %)** | **13,6 %** | **Borné, non nul, non mesuré directement.** Voir §5. | `mesures/indep.py`, `mesures/groupage.py` |
| **Grouper au plafond mesuré (53 %)** | **29,7 %** | idem, et le plafond est un majorant | idem |
| **Alléger la chaîne `CLAUDE.md`** | **3,9 %** de plus | **NON ÉPROUVÉ.** Ces instructions gouvernent le comportement des agents. | `mesures/recent.py` |
| **Condensé à mi-parcours (5 000 j)** | **20,0 %** | **36,6 % du livrable exposé.** Voir §4. | `mesures/provenance2.py` |
| **Piste A — invariant en tête** | **0,2 %** | Nul — seul l'ordre du texte change. | `mesures/pisteA.py` |

### Ce que chaque levier attaque

**Le listing des skills.** 21 469 caractères par agent jusqu'au 21 août, 9 188 depuis — vingt-sept
skills ont été retirées le 22 août, économie déjà encaissée de l'ordre de 2,6 %. Le reliquat de
19 skills coûte encore 3 617 jetons par agent, pour un outil qu'aucun agent n'a jamais appelé.

**La rédaction finale.** 93 % de la masse réécrite en cache tombe sur des tours dont l'écart au
tour précédent dépasse cinq minutes, contre 1 à 4 % en deçà. La bascule est nette : sous cinq
minutes 1 % des tours sont des réécritures, entre cinq et quinze minutes **97 %** le sont. Le
TTL de cinq minutes est donc la cause, et non une hypothèse.

Ce qui produit ces écarts, pour les cas les plus lourds : l'agent génère son fichier de sortie
en **un seul appel de 55 000 à 59 000 jetons**, ce qui prend dix minutes à 95 jetons/seconde.
Le cache écrit au début de cette requête a expiré quand la suivante arrive : elle réécrit
320 000 à 350 000 jetons de contexte à 1,25 au lieu de les lire à 0,10. **29,5 % de tous les
appels de `Write` sont dans ce cas, contre 0,07 % des appels de `Bash`.**

Le remède ne retire rien : écrire le fichier en trois appels au lieu d'un. Chaque génération
retombe sous trois minutes. Les deux tours supplémentaires coûtent environ 66 k pondérés par
agent concerné, contre 379 k récupérés.

**Le groupage.** Les agents émettent **1,25 appel d'outil par tour** — ils ne groupent
pratiquement jamais. Or un tour coûte la relecture de tout son contexte, quelle que soit la
taille de ce qu'il rapporte : **29 % des tours rendent moins de 200 jetons et consomment 27 %
du coût total**. Le coût d'un appel n'est pas son résultat, c'est le tour qu'il occupe.

---

## 3. Le tableau des combinaisons

Simulées **ensemble** sur les suites réelles, jamais additionnées : les leviers se recouvrent,
puisqu'ils attaquent tous la même somme de contextes relus.

| Combinaison | Gain simulé | Somme naïve | Recouvrement |
| --- | --- | --- | --- |
| skills + rédaction découpée | **7,2 %** | 7,3 % | quasi nul |
| skills + rédaction + groupage 25 % | **19,9 %** | 20,9 % | 1,0 point |
| les trois sans risque + condensé | **33,8 %** | 40,9 % | 7,1 points |
| skills + `CLAUDE.md` + rédaction + groupage 53 % | **36,6 %** | 40,9 % | 4,3 points |
| tout, condensé compris | **45,3 %** | 60,9 % | 15,6 points |

Lecture : **les trois leviers sans risque de fond rapportent ensemble 19,9 %.** Le condensé
n'ajoute que 13,9 points par-dessus, et non ses 20 % isolés — parce que le groupage a déjà
raccourci la somme qu'il attaque. C'est le seul point où deux leviers se mangent l'un l'autre
de façon marquée.

Le recouvrement entre le condensé et la rédaction découpée est de second ordre mais réel : un
contexte plus court rend chaque réécriture moins chère.

Commande : `mesures/recent.py`, section COMBINÉES.

---

## 4. Le condensé — le risque, enfin mesuré

C'était la tâche principale, et elle ne demandait pas de vol : la mesure existe sur les
transcriptions terminées.

**Protocole.** Sur 45 agents ayant rendu un rapport final de plus de 3 000 caractères et
comptant plus de 8 tours : extraction des ancres du rapport (chemins `dépôt@sha:fichier`,
RFC, URL, identifiants composés, constantes numériques), puis recherche de chaque ancre dans
les résultats d'outils de la **première** et de la **seconde** moitié du vol. Une ancre dont la
seule source est antérieure au point de remise à zéro disparaît avec le contexte, sauf si le
condensé la porte. La mesure porte ensuite sur les **paragraphes** du livrable, pas sur les
seules étiquettes : ce qui compte est la part du texte rendu qui s'appuie sur une telle ancre.

**Résultat**, sur 3 537 paragraphes et 1,86 Mcar de rapports (`mesures/provenance2.py`) :

| Provenance du paragraphe | Part des caractères du livrable |
| --- | --- |
| Appuyé sur une ancre **exclusivement** antérieure à la remise → **EN RISQUE** | **36,6 %** |
| Appuyé sur une ancre encore visible après la remise | 15,7 % |
| Sans ancre traçable à un résultat d'outil (brief, norme, rédaction propre) | 47,7 % |

Par agent : médiane 35,9 %, p10 16,4 %, **p90 58,4 %**, maximum 82,6 %.

**L'hypothèse encourageante du dossier était l'inverse de la réalité.** Il envisageait qu'un
rapport dont 90 % des affirmations s'appuient sur la seconde moitié ne risquerait rien. Mesure
faite : **plus du tiers du livrable repose sur une matière que la remise à zéro efface**, et sur
un agent sur dix, près de six dixièmes.

**Le taux de compression exigé.** Un agent lit 83 912 jetons de matière brute en médiane, dont
**61 735 dans la première moitié** (`mesures/pisteB_gain.py` et compte associé). Un condensé de
5 000 jetons doit donc comprimer **12 pour 1** — et cette matière porte 36,6 % du livrable.

**Ce que la mesure établit et ce qu'elle n'établit pas.** Elle établit une **exposition**, pas
une perte : un condensé qui capte ces faits ne perd rien. Elle établit que le condensé n'est pas
une opération marginale sur un résidu — il est sur le chemin critique de plus du tiers du
rendu. Elle n'établit pas le taux de perte réel, qui dépend de la qualité du condensé et ne se
mesure que par un vol comparatif (§6).

**Une attrition du même ordre est DÉJÀ tolérée en production, et personne ne l'a relevée.**
Mesure sur disque, 48 sous-points ayant à la fois leurs trois rapports de sonde et leur fichier
final (`mesures/attrition_strict.py`) : le synthétiseur ne reprend que **33 % des ancres
opposables** produites par les sondes (p10 0 %, p90 89 %). L'étape de synthèse qui tourne
aujourd'hui perd donc les deux tiers des ancres de sa matière, sur des fichiers qui passent le
portier à sept sections sur sept. Cela ne rend pas le condensé sûr — mais cela dit que le seuil
de qualité du chantier accommode déjà une compression lourde à cet endroit précis.

**CONSTAT, hors de mon mandat mais trouvé en chemin : 43 % des ancres opposables d'un fichier de
sous-point sont absentes des trois rapports de sonde dont il est issu** (médiane sur les mêmes
48 fichiers). Trois explications possibles et non départagées : reformatage d'URL, ancre
re-dérivée d'une source citée autrement, ou ancre fabriquée. **ESCALADE :** un comptage par
famille d'ancre (dépôt / RFC / URL) tranche en une mesure ; tant qu'il n'est pas fait, le chiffre
ne dit pas lequel des trois. Il ne remet pas en cause les économies de ce rapport.

**Un précédent existe, et il est favorable.** `p1-synthese.js` fait déjà travailler un agent sur
la sortie condensée d'autres agents plutôt que sur la matière brute : cinq fichiers de la
branche 12 écrits ainsi sont **tous plus gros** que les trois fichiers de la même branche issus
d'un vol complet, sept sections sur sept, pour 0,24 M l'unité contre 0,88. C'est un condensé
**écrit par un tiers pour un tiers**, avec une consigne de forme opposable — pas un agent qui
se résume à lui-même. La différence n'est pas anodine et interdit de transporter le résultat tel
quel.

---

## 5. Le groupage — ce qui est mesuré, et ce qui ne l'est pas

**Critère opératoire**, applicable et réfutable : le tour k+1 dépend du tour k si sa commande
réutilise un fragment d'au moins 12 caractères présent dans le résultat de k. Sur 60 agents et
2 658 paires de tours consécutifs (`mesures/indep.py`) : **53 % des paires ne réutilisent rien**.

**Le critère a été durci, parce qu'il pouvait manquer une dépendance silencieuse** : un agent peut
lire un résultat, changer de direction, sans en citer un mot — mais sa réflexion, elle, le dirait.
Le second passage classe dépendante toute paire dont la commande **ou le bloc de réflexion** du
tour k+1 reprend un fragment du résultat de k (`mesures/indep2.py`) :

| Paire de tours consécutifs | Part |
| --- | --- |
| Dépendante — la **commande** reprend le résultat précédent | 49 % |
| Dépendante — la **réflexion** le reprend | **0,1 %** (3 paires sur 2 527) |
| **Indépendante — groupable** | **51 %** |
| — dont **aucune réflexion écrite** entre les deux tours | **50 %** |

**Le durcissement n'a rien changé : 3 paires sur 2 527.** Et la moitié des paires sont des
enchaînements où l'agent n'a pas écrit un mot entre deux commandes — l'indépendance la plus sûre
qu'on puisse observer sans relire chaque cas à la main.

**Les 49 % dépendantes ne sont pas une perte : elles ne sont simplement pas groupées.** Le taux
prudent de 25 % retenu au §2 est la moitié de ce que la mesure autorise. Le majorant reste un
majorant — 29,7 % au taux de 53 % est un plafond, **13,6 % au taux de 25 % est le chiffre sur
lequel s'engager.**

**Ce que le groupage ne change pas** : la matière obtenue est identique — mêmes commandes,
mêmes octets. La seule faculté perdue est l'adaptation de la commande k+1 au résultat de k, et
le critère a précisément retenu les paires où elle n'a pas servi.

**Ce que la nature des tours interdit d'espérer.** L'idée de supprimer les tours de navigation
en donnant les chemins dans le brief est en grande partie **réfutée** : sur 791 commandes Bash
prises sur des tours à petit résultat (`mesures/cmds.py`), le test STOP imposé par le brief pèse
8,7 %, les inventaires (`ls`, `wc`) 5,4 % ; le reste sont de vraies extractions, des exécutions
du banc d'essai, des scripts d'analyse — qui ont simplement peu rendu. **Un agent ne peut pas
savoir d'avance qu'un `grep` ne trouvera rien.** Ce qui se supprime n'est pas le geste, c'est le
tour : d'où le groupage, et non l'élagage.

---

## 6. Ce qui est réfuté, avec la mesure qui l'a réfuté

| Piste | Réfutation |
| --- | --- |
| **La concurrence provoque des réécritures de cache** | Faux. Part de réécriture par palier de concurrence maximale du vol : 12,4 % à 1-4 agents, 26,7 % à 5-8, **20,5 % à 15+**. Baisser la concurrence ne rapporte rien. `mesures/concurrence.py` |
| **L'expiration du cache est négligeable** (dossier antérieur) | Faux — mais l'inverse de la façon annoncée. L'écart médian entre deux tours est bien de 2 secondes ; c'est sans rapport avec la masse. Les **241 tours** au-delà de cinq minutes, soit 0,5 %, portent **45,8 M, 23,3 % de toutes les écritures de cache**. `mesures/ttl.py` |
| **Le TTL a été allongé depuis** | Faux. Part réécrite par jour : 31 %, 24 %, 24 %, 20 %, 19 %, et **24 % le 23 août**. Le levier est intact. `mesures/par_date.py` |
| **Piste A vaut 4,9 %** | Faux, elle vaut 0,2 %. Le préfixe réellement commun entre deux briefs du même rôle est de **92 caractères** : le numéro de sous-point est interpolé dans la première phrase, ce qui casse tout partage. Mais la partie invariante ne pèse que 1 732 jetons, et le partage n'en rend que 1,15 sur 4,90. `mesures/briefs2.py`, `mesures/pisteA.py` |
| **Le partage de préfixe entre agents fonctionne déjà partiellement** | Faux, il ne fonctionne pas du tout au-delà d'un segment fixe. L'écriture de cache au premier appel est **plate à ~22 300 jetons quel que soit le rang de départ** de l'agent dans le vol (rangs 0 à 9, 96 vols), et la lecture plate à 10 813. `mesures/pisteA.py` |
| **Les schémas d'outils sont un gisement** | Réfuté par le dispositif en place : les outils sont **différés** (`ToolSearch` employé par 45 % des agents), et la liste différée ne pèse que 1 093 jetons. Huit outils distincts employés sur tout le corpus. `mesures/base.py` |
| **Élaguer les tours de navigation** | Réfuté en grande partie — §5. |
| **Résultats d'outils obtenus deux fois** (dossier antérieur) | Non recontrôlé. 5 doublons sur 39 865 : néant, et rien ne le contredit ici. |

---

## 7. Ce qui reste non éprouvé, et le protocole qu'il faudrait

**1. La perte de qualité du condensé.** §4 mesure une exposition de 36,6 %, pas une perte.
Protocole : un lot de **six sous-points** de la même branche, tiré au sort, traité deux fois —
`p1-etude.js` inchangé d'un côté, avec remise à zéro à mi-parcours de l'autre. Comparaison par
le portier existant (sections, ancres, bouclage de Σ) **et** par relecture croisée sur trois
points qui ne se contournent pas : nombre d'ancres distinctes en §3, nombre de DIV cités en
§2.5, présence des modes de panne silencieux en §7. Coût : deux vols de six sous-points,
soit environ 2 × 6 × 0,88 M = **10,6 M pondérés**, à comparer aux 20 % que le levier promet sur
les 112 sous-points restants. **La mesure se rembourse au sixième sous-point.**

**2. La perte de qualité du groupage.** Non mesurée ; seul le majorant d'indépendance l'est.
Protocole : même dispositif, avec une consigne de groupage ajoutée au brief des sondes, et
comptage du nombre d'ancres distinctes rendues — c'est la quantité que le groupage menacerait
en premier si l'agent perdait sa capacité d'adaptation.

**3. L'allègement de la chaîne `CLAUDE.md`.** 3,9 % en jeu, aucun risque mesuré, et ce sont les
instructions qui gouvernent le comportement des agents. **Non éprouvé, en toutes lettres.**
Protocole : identifier par lecture des transcriptions les règles effectivement invoquées par les
agents, retirer le reste, et mesurer sur un lot le nombre de constats du portier — un allègement
qui dégrade la conformité se voit là.

**4. Le découpage de la rédaction finale.** Le gain de 5,3 % est calculé, le remède est décrit,
mais **aucun vol ne l'a exécuté**. Le coût des tours supplémentaires est estimé, non observé.

**5. Ce que le condensé de `p1-synthese.js` transporte.** Le précédent favorable de la branche 12
porte sur un condensé écrit par un agent pour un autre, sous consigne de forme. Rien n'établit
qu'un agent se résumant à lui-même en cours de route atteigne la même qualité.

---

## 8. Ce qu'il faut faire

**Trois leviers rapportent 19,9 % ensemble, sans risque de fond, et deux d'entre eux sont
mécaniques :**

1. **Retirer le listing des skills des agents de workflow** — 2,0 %, risque nul mesuré.
2. **Faire écrire le fichier de sortie en trois appels** — 5,3 %, risque nul, une phrase dans
   le brief du synthétiseur.
3. **Demander le groupage des appels indépendants** — 13,6 % au taux prudent, une phrase dans
   le socle.

**Le condensé n'est pas à écarter, mais il ne se décide pas sur cette mesure.** Il vaut 13,9
points de plus par-dessus les trois autres — le premier gain marginal du dossier — et il engage
36,6 % du livrable. Le protocole du §7.1 se rembourse au sixième sous-point : **c'est cette
mesure qu'il faut payer, pas le pari.**

**La piste A est abandonnée** : 0,2 %.

---

## 9. L'impact en quantités réelles

Le poids employé — sortie ×5, entrée ×1, écriture de cache ×1,25, lecture ×0,1 — reproduit
exactement le rapport des tarifs d'Opus. **Une unité pondérée vaut donc un jeton d'entrée.**
Sous cette lecture, et elle est signalée comme telle :

| Quantité | Mesure | En dollars |
| --- | --- | --- |
| Corpus déjà dépensé (1 323 agents) | 1 170 M | ≈ 17 600 $ |
| Coût d'un sous-point en vol complet (3 sondes + 1 synthèse) | **4,66 M** | ≈ 70 $ |
| Les 112 sous-points restants | **522 M** | ≈ 7 800 $ |
| Ce que les trois leviers en retirent (19,9 %) | **104 M** | ≈ 1 560 $ |
| Avec le condensé (33,8 %) | 176 M | ≈ 2 640 $ |

Commande : `mesures/impact.py`.

**En fenêtres de quota** — `JOURNAL.md` mesure une fenêtre de session à 17-18 M sur deux
fenêtres indépendantes : les 112 sous-points restants demandent **29 fenêtres**, et 23 avec les
trois leviers. **Six fenêtres de moins.**

### CONSTAT — le dimensionnement des vols repose sur un coût par sous-point six fois trop bas

`JOURNAL.md` fixe la règle de dimensionnement à **0,88 M par sous-point**, plafond 15 sous-points
sur fenêtre neuve. La mesure sur les vols des 22 et 23 août donne **4,66 M**.

L'arithmétique de la même entrée de journal le confirme d'elle-même : elle relève qu'une fenêtre
de quota vaut 17-18 M **et** qu'un blocage a coûté « 4 sous-points et 18 agents ». 17,5 ÷ 4 = 4,4 M
par sous-point — la mesure directe, pas 0,88.

**Conséquence** : un vol dimensionné à 15 sous-points prévoit 13 M et en demande **70**. Il meurt
au quatrième sous-point. C'est le comportement observé — quatre vols arrêtés, 40 agents perdus,
tous sur rejet de quota explicite.

**Ce constat pèse plus lourd que les économies de ce rapport** : les trois leviers retirent 19,9 %
d'une facture ; un plafond de vol juste supprime les vols morts, qui coûtent leur prix entier
pour zéro ligne écrite — le seul vol `wf_4659c272-75d` a brûlé 442,9 M de lecture pour rien.

**SOLUTION** : plafonner un vol à **trois sous-points** sur fenêtre neuve (14 M sur 17-18),
quatre si la fenêtre est réputée entamée de moins d'un quart.
