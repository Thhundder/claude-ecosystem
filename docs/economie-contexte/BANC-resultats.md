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
