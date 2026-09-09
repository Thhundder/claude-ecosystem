# config-claude — miroir de ~/.claude

Copie versionnée de ce que `~/.claude/` charge à chaque session.

| Élément | Rôle |
| --- | --- |
| `CLAUDE.md` | doctrine utilisateur |
| `settings.json` | permissions, hooks, style, indicateur, mode auto |
| `lentilles.md` | catalogue des lentilles de vérification |
| `output-styles/rigueur.md` | le style qui porte la méthode |
| `hooks/` | ce que `settings.json` appelle par chemin |
| `bin/` | ce que les hooks, l'indicateur et la doctrine appellent par chemin |
| `installe.txt` | liste des liens `~/.claude/{agents,commands}` → dépôt |

Jamais copiés : identifiants, sessions, historique, `lib/` (dépendance à réinstaller),
`~/.claude.json`.

- `/sync-claude-config push` — machine → dépôt, puis relire le diff et enregistrer
- `/sync-claude-config pull` — dépôt → machine, recrée les liens d'après `installe.txt`

Sauvegarde avant une opération lourde : `cp -r ~/.claude ~/claude-backup-$(date +%Y%m%dT%H%M)`.
