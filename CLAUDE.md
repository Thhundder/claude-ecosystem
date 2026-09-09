# CLAUDE.md

Consignes pour travailler dans ce dépôt. La doctrine générale est déjà chargée depuis
`~/.claude/CLAUDE.md` ; ne pas la répéter ici.

- `config-claude/` est un **miroir** : on modifie `~/.claude/`, puis `/sync-claude-config push`.
  Jamais l'inverse, sauf restauration d'une machine neuve.
- `agents/` et `commands/` sont liés depuis `~/.claude/` : renommer ou déplacer un fichier
  casse le lien et l'entrée correspondante de `config-claude/installe.txt`.
- Rien n'entre dans ce dépôt sans être installé et chargé. Un artefact écrit « pour plus
  tard » est ce que le tri du 2026-09-09 a supprimé.
- Avant de retirer quoi que ce soit : `python3 scripts/custom-tools-stats.py`.
