# claude-ecosystem

Ce dépôt versionne la configuration Claude Code réellement chargée sur la machine, et rien
d'autre. Tri du 2026-09-09 : tout ce qui n'était plus chargé par aucun mécanisme a été
supprimé. L'état antérieur (14 agents, 50 skills, 13 commandes, 6 rules, deux index) reste
lisible au tag `avant-tri-2026-09-09`.

## Contenu

```
claude-ecosystem/
├── agents/            # les 3 agents installés, liés depuis ~/.claude/agents/
├── commands/          # /sync-claude-config, lié depuis ~/.claude/commands/
├── config-claude/     # miroir de ~/.claude : doctrine, settings, style, hooks, bin, lentilles
├── scripts/           # mesure d'usage : tool-stats.py (tools natifs), custom-tools-stats.py (artefacts)
├── docs/economie-contexte/   # étude close le 2026-08-23, conclusions reversées dans la doctrine
├── AMORCE-economie-contexte.md
├── SESSION-BOOT.md    # ordre d'assemblage du contexte de démarrage, mesuré le 2026-08-22
└── CLAUDE.md          # consignes quand Claude travaille DANS ce dépôt
```

## Installation

Les agents et la commande sont des liens symboliques de `~/.claude/` vers ce dépôt. La liste
fait foi dans `config-claude/installe.txt` ; sans elle une restauration ne réinstalle rien.

- machine modifiée → `/sync-claude-config push`, relire le diff, enregistrer
- machine neuve → cloner, `/sync-claude-config pull`, puis `bun add playwright-core` dans
  `~/.claude/lib`

## Mesurer avant de trier

```
python3 scripts/custom-tools-stats.py
python3 scripts/tool-stats.py --since 2026-09
```

Le premier croise le compteur natif, l'historique des commandes tapées et les transcripts.
C'est lui qui a servi au tri du 2026-09-09.
