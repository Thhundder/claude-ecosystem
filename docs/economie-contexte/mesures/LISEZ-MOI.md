# Rejouer les mesures du RAPPORT

Toutes les mesures partent d'un jeu compact extrait des transcriptions d'agents de workflow.

    cd <un repertoire de travail>
    python3 <ici>/extraire.py agents.jsonl     # ~4 s, 75 Mo, 1 323 agents

Les autres scripts lisent `agents.jsonl` dans le repertoire courant :

| Script | Ce qu'il etablit |
| --- | --- |
| `base.py` | cout pondere total, decomposition, recensement des outils employes |
| `verif_sortie.py` | contre-epreuve de la mesure de sortie contre le texte reellement ecrit |
| `modele.py` | le modele « lecture = somme des contextes » (ecart 8 %) |
| `socle.py` | regression cw1 = K + a x caracteres : K = 18 264 j, 2,54 car/jeton |
| `cout_socle.py` | facteur 4,90 d'un jeton de socle, cout de chaque composant |
| `reecriture.py` | detection des reecritures de cache (recul de la lecture) |
| `ttl.py` | leur cause : 93 % de la masse au-dela de cinq minutes d'ecart |
| `lent.py`, `cause_write.py` | quel geste produit ces ecarts |
| `concurrence.py` | refute le lien avec la concurrence |
| `par_date.py` | le TTL n'a pas change |
| `briefs2.py`, `pisteA.py` | prefixe commun reel (92 car), absence de partage entre agents |
| `pisteB_gain.py` | gain d'une remise a zero du contexte |
| `provenance.py`, `provenance2.py` | RISQUE du condense : 36,6 % du livrable expose |
| `matiere.py` | taux de compression exige d'un condense : 12 pour 1 |
| `indep.py` | part des tours consecutifs groupables (majorant 53 %) |
| `groupage.py` | gain du groupage |
| `cmds.py` | nature reelle des tours a petit resultat |
| `combi2.py` | simulateur exact, tout le corpus |
| `recent.py` | **le tableau du rapport** — regime actuel, 328 agents |

`extraire.py` pointe sur le projet `-home-thundder-Documents-Xeko-pms-ia` ; changer la constante
`PROJET` pour un autre chantier.
