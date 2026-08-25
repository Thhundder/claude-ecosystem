# JOURNAL — claude-ecosystem

Destinataire : une session neuve, sans aucun contexte. Écrit pour qu'elle reprenne
à l'identique après un plantage, une coupure ou une limite atteinte.

## État machine

<!-- ETAT:DEBUT — bloc généré par ~/.claude/bin/journal.sh, ne pas éditer à la main -->
**Généré le** 2026-08-25T09:59Z
**Branche** `main` — **dernier enregistrement** 34d48cf docs(journal): ouverture du journal, deux retractations consignees
**Publication** 3 commit(s) non poussé(s) vers origin/main
**Arbre de travail** 9 fichier(s) non enregistré(s)
     M JOURNAL.md
    M  config-claude/bin/atlas.py
    M  config-claude/bin/ecran.mjs
    M  config-claude/bin/lire-secret.sh
    D  config-claude/essais/LISEZ-MOI.md
    D  config-claude/essais/garde-chemins.sh
    D  config-claude/essais/garde.sh
    D  config-claude/essais/secret.sh
    M  config-claude/hooks/guard.sh
**Modifié mais invisible pour git** rien

<!-- ETAT:FIN -->

## Où j'en suis

**Chantier** Épreuve de la configuration importée le 2026-08-25 : hooks, outils de `bin/`, agents, skills, MCP.
**Situation** Configuration remise à l'état importé sur demande. Les cinq défauts relevés le 25 août sont présents dans le code actif : ils sont décrits ici, pas corrigés. Les correctifs et les bancs restent récupérables dans l'historique (`ab791e0`, `6064eae`).
**Prochaine action** Décider lesquels des cinq défauts méritent d'être repris, et trancher l'écart entre `installe.txt` et ce qui est réellement chargé.
**Bloqué par** rien

## Décisions
<!-- append-only. Une ligne : date — décision — raison — ce qui l'invaliderait. -->

## Rétractations
<!-- append-only. Une ligne : date — affirmé — retiré — ce qui manquait au moment de l'affirmation. -->
- 2026-08-25 — affirmé « sur 18 clés d'épreuve, 12 fuyaient » dans le compte rendu et dans le message de `ab791e0` — retiré : le compte réel est 13 clés problématiques, plus `CLIENT_ID` qui sort en clair à juste titre, soit 14 valeurs lisibles sur 18 — ce qui manquait : le chiffre a été récité de mémoire depuis une lecture de la sortie, jamais compté ; la mesure programmatique n'a été faite qu'après coup. Le correctif lui-même n'est pas en cause, il est mesuré à 1 sur 18 après.
- 2026-08-25 — affirmé « une feuille compacte donnait 1 couleur sur 10 » — retiré : à jeux de jetons identiques la mesure donne 0 couleur sur 10 — ce qui manquait : le « 1 » venait d'une première feuille d'essai différente de celle servant à la comparaison avant/après, les deux mesures n'étaient pas comparables.

## Journal
<!-- append-only, le plus détaillé. Ce qui a été fait, ce qui a été mesuré, ce qui a été supposé. -->
- 2026-08-25 — Épreuve de la configuration importée. Mesuré : les 4 hooks répondent et restent silencieux hors de leur périmètre ; `journal-hook` bloque puis laisse clore et ne s'enferme pas au second passage ; `contrat-hook` refuse un brief sans critère de succès et laisse passer un brief complet ; `front-seuil` classe PAGE NEUVE / FEATURE et s'efface dès qu'un atlas est versionné ; `remplacer.py` échoue sur motif absent comme sur compte inattendu ; `ecran.mjs` relève les écarts d'un rendu incomplet et sort conforme sur un rendu identique.
- 2026-08-25 — Quatre défauts corrigés : fuite de valeurs dans `lire-secret.sh` ; contrôle de déploiement aveugle à `ssh`, aux chemins absolus et à `~/` dans `guard.sh` ; absence d'interpréteur et de résolution de chemin dans `ecran.mjs` ; relevé de jetons ancré en début de ligne dans `atlas.py`. Chaque correctif est mesuré avant/après depuis la version extraite de l'historique.
- 2026-08-25 — `context7` était déclaré dans `~/.claude/.mcp.json`, emplacement que l'outil ne lit pas : le serveur n'était pas enregistré alors qu'une skill installée en dépend. Déclaré en portée utilisateur, connecté, fichier orphelin retiré.
- 2026-08-25 — Configuration remise à l'état importé (`dde5a0b`) sur demande explicite : les quatre correctifs sont retirés du code actif comme du miroir, le fichier de déclaration inerte est remis, le serveur de documentation est désenregistré, les bancs d'essai sont retirés du miroir. Vérifié en éprouvant que les défauts sont revenus, et non en déclarant la restauration : 14 valeurs sur 18 ressortent en clair, un déploiement par chemin absolu comme à travers ssh passe sans confirmation, l'inventaire d'écran échoue à l'appel direct, une feuille compacte donne 0 couleur sur 10, le serveur de documentation n'est plus déclaré. Les cas d'origine de la garde répondent toujours.
- 2026-08-25 — Supposé, non vérifié : que les 14 agents, 15 skills et 13 commandes installés fonctionnent. Aucun n'a été lancé. Seul leur poids en contexte a été mesuré, ~3 400 jetons de descriptifs par session.
