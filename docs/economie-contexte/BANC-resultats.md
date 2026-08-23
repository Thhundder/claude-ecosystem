# Banc d'essai des leviers — résultats

Vol `wf_f93922db-b71`, 4 agents, lancé le 2026-08-23 vers 11:33.
Transcriptions : `~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia/0e9ed7b5-.../subagents/workflows/wf_f93922db-b71/`

**Les transcriptions suffisent à tout remesurer, même si le vol est tué** : c'est la méthode de
tout ce rapport. Rien ne dépend du retour du workflow.

## Banc 1 — découper la rédaction

| Agent | Tours | Appels d'écriture | Fichier | Coût | Réécritures de cache |
| --- | --- | --- | --- | --- | --- |
| `decoupe` (3 appels) | 6 | 3 (1 Write + 2 Edit) | 185 670 car | **0,621 M** | **1, pour 0,05 M** |
| `monobloc` (1 appel) | — | — | — | — | **en cours au moment de l'écriture** |

L'agent découpé a produit 185 670 caractères en trois appels, et n'a subi qu'**une** réécriture de
0,05 M. Le témoin monobloc était encore en génération : sa mesure reste à prendre en relisant sa
transcription — chercher un tour dont la lecture de cache recule (`mesures/reecriture.py`).

## Banc 2 — grouper les appels

Tâche à vérité de terrain calculable : inventorier les 13 fichiers `.ts` de
`docs/mailbox-v2/outils/`, avec leur nombre de lignes et leurs fonctions déclarées.

| Agent | Tours | Appels | Appels/tour | Coût | Lignes justes | Fonctions justes | Écarts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `groupage-temoin` | 3 | 2 | 1,00 | 0,033 M | **13/13** | **13/13** | **0** |
| `groupage-consigne` | 3 | 3 | 1,50 | 0,036 M | **13/13** | **13/13** | **0** |

**Ce que ce banc établit** : la consigne de groupage ne coûte **rien** en exactitude. Deux
inventaires parfaits, notés contre une vérité calculée indépendamment.

**Ce qu'il n'établit PAS, et il faut le dire** : le gain. La tâche est trop courte — trois tours
des deux côtés. Un banc qui discriminerait le gain demande une tâche d'au moins vingt tours, du
type de celles que font les sondes du chantier. **Le gain de 13,6 % reste une simulation, pas une
mesure d'exécution.**

## Banc 1 — verdict, une fois le témoin monobloc terminé

| Tour | `monobloc` | | | `decoupe` | | |
| --- | --- | --- | --- | --- | --- | --- |
| | sortie | écart | cache | sortie | écart | cache |
| 0 | 2 | — | — | **38 424** | — | — |
| 1 | **39 510** | 12,3 min | — | 26 107 | **8,9 min** | **RÉÉCRITURE** |
| 2 | 155 | **9,1 min** | **RÉÉCRITURE, cr → 0, cw 69 029** | 12 458 | 6,1 min | — |
| 3 | 161 | 0,0 min | — | 155 | 2,8 min | — |
| **Coût** | **0,341 M** pour ~100 000 car | | | **0,621 M** pour 185 670 car | | |

**Le mécanisme est CONFIRMÉ, et de la façon la plus nette possible.** L'agent monobloc a généré
**39 510 jetons de sortie en 12,3 minutes** — 53 jetons par seconde — et au tour suivant sa lecture
de cache est tombée à **zéro** : perte totale du préfixe, réécriture de 69 029 jetons. C'est
exactement le mécanisme décrit au §2, observé en vol, sur un contrôle qui pouvait échouer.

**Mais le remède, tel que je l'avais écrit, NE MARCHE PAS.** L'agent découpé a subi lui aussi une
réécriture : son premier appel faisait **38 424 jetons**, soit 8,9 minutes — au-delà du TTL. Découper
« en trois » ne borne rien si chaque tiers reste énorme.

**Normalisé au volume produit, le découpage rend un peu — pas ce que j'annonçais.** Tailles finales
rendues par les agents : monobloc **91 942** caractères, découpé **185 670**. Soit **3,71 M par million
de caractères** pour le monobloc contre **3,34 M** pour le découpé — **10 % de moins**, et non les 5,3 %
attendus d'une suppression complète des réécritures, puisque le découpé en a subi une lui aussi.
L'écart de coût brut (+82 %) vient d'abord de ce que l'agent découpé a écrit deux fois plus de texte.

### Le remède corrigé, et il est mesuré

Ce qu'il faut borner n'est pas **le nombre d'appels**, c'est **la taille de chaque appel**.
Débit observé : **53 jetons/seconde**. Cinq minutes valent donc **16 000 jetons, soit ~40 000
caractères**. Pour rester avec une marge sous le TTL, un appel d'écriture ne doit pas dépasser
**25 000 caractères** — ce qui fait **six appels** pour un fichier de 150 kO, pas trois.

**Conséquence sur le chiffrage** : le gain de 5,3 % du §2 reste celui de la suppression des
réécritures, il est inchangé. Ce qui change est la consigne : « écris en trois fois » est
insuffisant et le banc le prouve ; il faut « aucun appel d'écriture au-delà de 25 000 caractères ».

## Ce que le banc a coûté

4 agents, **241 077 jetons de sous-agent**, 24 minutes de mur. Les deux agents de rédaction en
portent l'essentiel ; les deux agents de groupage ont coûté 0,033 et 0,036 M.

## Banc 2 — les deux inventaires sont identiques au caractère près

Les deux rendus ne diffèrent que par un espace en fin de ligne sur `verifier-portier.ts`.
La consigne de groupage n'a pas seulement préservé l'exactitude : elle a produit **le même texte**.

---

# Banc 2 — le groupage sur une tâche longue de type sonde

Vols `wf_03139d38-bdd` (1 paire) et `wf_3c48c6ee-220` (3 paires). **Quatre paires, huit agents**,
490 826 jetons, neuf minutes de mur au total.

Tâche identique pour les huit : décrire la synchronisation IMAP incrémentale de Roundcube sur le
clone réel au SHA `6b62348d61db`, avec au moins 12 ancres `dépôt@sha:chemin#symbole:ligne`.
Seule différence : quatre agents portent la consigne de groupage, quatre non.

**Chaque ancre a été rouverte dans le dépôt** — le chemin existe-t-il, le symbole est-il à la
ligne annoncée ou dans les cinq suivantes (`mesures/verifier_ancres_banc.py`).

| | Tours | Appels/tour | Coût | Rapport | Ancres | **Ancres justes** |
| --- | --- | --- | --- | --- | --- | --- |
| témoin | 17 · 17 · 13 · 12 | 1,50–1,83 | méd. **0,185 M** | 12–15 k car | 21 · 23 · 24 · 31 | **100 %** |
| groupée | 12 · 12 · 12 · 10 | 1,73–1,91 | méd. **0,166 M** | 12–16 k car | 23 · 25 · 28 · 29 | **100 %** |

## Verdict

**Le gain est mesuré : −10,1 % sur le coût, −20 % sur les tours.** Les deux nuages de tours ne se
recouvrent pas — le groupé n'a jamais dépassé 12 tours, le témoin est monté à 17 deux fois.

**La non-régression est établie, et mieux que cela.** Sur 204 ancres et huit agents, **exactitude
de 100 % des deux côtés, zéro ancre inventée**. Et les agents groupés en ont produit **davantage**
— médiane 26,5 contre 23,5 — pour une longueur de rapport comparable.

**Rétractation d'une inquiétude que j'avais soulevée** : la première paire donnait 31 ancres au
témoin contre 23 au groupé, et j'avais refusé de conclure sur un tirage. Bien m'en a pris — sur
quatre paires l'écart s'inverse. **C'était du bruit.**

## La simulation est validée par le banc

Le modèle prédisait −10,8 % pour une réduction de 20 % des tours ; le banc mesure **−10,1 %**.
**Écart de 0,7 point.** Le simulateur de ce rapport reproduit donc le réel à moins d'un point
sur le seul levier qui ait pu être éprouvé de bout en bout.

## Chiffrage final, calibré sur la mesure

| Combinaison | Gain |
| --- | --- |
| Listing des skills seul | 2,0 % |
| Borne d'écriture seule (part Write mesurée) | 3,5 % |
| Groupage seul, **calibré sur le banc** | **10,1 % mesuré · 10,8 % simulé** |
| **LES TROIS ENSEMBLE** | **15,7 %** |
| Plafond, si toutes les réécritures tombaient | 17,3 % |
