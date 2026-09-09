---
description: Miroir de la configuration Claude entre ~/.claude/ et config-claude/ dans ce dépôt. Usage — /sync-claude-config push (dépôt ← machine) ou pull (machine ← dépôt).
argument-hint: push | pull
---

# /sync-claude-config

## Ce qui est synchronisé

| Élément | Pourquoi |
| --- | --- |
| `CLAUDE.md` | la doctrine |
| `settings.json` | permissions, hooks, style, indicateur |
| `lentilles.md` | catalogue de vérification |
| `output-styles/` | le style qui porte la méthode |
| `hooks/` | ce que `settings.json` appelle par chemin |
| `bin/` | ce que les hooks et l'indicateur appellent par chemin |
| `installe.txt` | **la liste de ce qui est installé, et elle fait foi** — le `pull` réinstalle ce qui y figure et retire les liens qui n'y sont plus. Sans elle, il ne fait ni l'un ni l'autre |

## Ce qui n'est jamais touché

Les identifiants d'authentification, l'état d'exécution (sessions, historique, projets), les
réglages locaux propres à la machine, le socle de rendu sous `lib/` — une dépendance se
réinstalle, elle ne se recopie pas — et le fichier de configuration racine, qui porte des clés.

## Exécution

```bash
MODE="$ARGUMENTS"
LIVE=~/.claude
REPO=~/Documents/claude-ecosystem/config-claude
ECO=~/Documents/claude-ecosystem
FICHIERS=(CLAUDE.md settings.json lentilles.md)
DOSSIERS=(hooks bin output-styles)

case "$MODE" in
  push)
    echo "machine -> depot"
    for f in "${FICHIERS[@]}"; do
      [ -f "$LIVE/$f" ] && { cp "$LIVE/$f" "$REPO/$f"; echo "  ok  $f"; } || echo "  -- $f absent"
    done
    for d in "${DOSSIERS[@]}"; do
      [ -d "$LIVE/$d" ] || { echo "  -- $d/ absent"; continue; }
      rm -rf "${REPO:?}/$d"; mkdir -p "$REPO/$d"; cp -r "$LIVE/$d/." "$REPO/$d/"
      find "$REPO/$d" -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null
      echo "  ok  $d/ ($(ls "$LIVE/$d" | wc -l) fichiers)"
    done
    : > "$REPO/installe.txt"
    for k in agents skills commands; do
      for l in $(find "$LIVE/$k" -mindepth 1 -maxdepth 1 2>/dev/null); do
        cible="$(readlink -f "$l")"
        case "$cible" in "$ECO"/*) echo "$k|${cible#$ECO/}|$(basename "$l")" >> "$REPO/installe.txt" ;; esac
      done
    done
    echo "  ok  installe.txt ($(wc -l < "$REPO/installe.txt") entrees)"
    echo; echo "Relire le diff dans $REPO, puis enregistrer."
    ;;

  pull)
    echo "depot -> machine"
    for f in "${FICHIERS[@]}"; do
      [ -f "$REPO/$f" ] && { cp "$REPO/$f" "$LIVE/$f"; echo "  ok  $f"; } || echo "  -- $f absent du depot"
    done
    for d in "${DOSSIERS[@]}"; do
      [ -d "$REPO/$d" ] || { echo "  -- $d/ absent du depot"; continue; }
      mkdir -p "$LIVE/$d"; cp -r "$REPO/$d/." "$LIVE/$d/"; chmod +x "$LIVE/$d"/* 2>/dev/null
      echo "  ok  $d/"
    done
    if [ -f "$REPO/installe.txt" ]; then
      for k in agents skills commands; do mkdir -p "$LIVE/$k"; done
      n=0
      while IFS='|' read -r k rel nom; do
        [ -n "$k" ] || continue
        ln -sfn "$ECO/$rel" "$LIVE/$k/$nom" && n=$((n+1))
      done < "$REPO/installe.txt"
      echo "  ok  $n artefact(s) reinstalles"
      # installe.txt fait foi : ce qui n'y figure pas n'est pas installe. Seuls les liens
      # sont balayes — un fichier reel a ete ecrit a la main, on n'y touche pas.
      r=0
      for k in agents skills commands; do
        attendus="|$(grep "^$k|" "$REPO/installe.txt" | cut -d"|" -f3 | tr "\\n" "|")"
        for e in "$LIVE/$k"/*; do
          [ -e "$e" ] || [ -L "$e" ] || continue
          nom=$(basename "$e")
          case "$attendus" in *"|$nom|"*) continue ;; esac
          if [ -L "$e" ]; then rm "$e"; r=$((r+1)); echo "      retire  $k/$nom"
          else echo "      garde   $k/$nom (fichier reel, pas un lien)"; fi
        done
      done
      echo "  ok  $r lien(s) hors liste retire(s)"
    else
      echo "  -- installe.txt absent : ni reinstallation ni balayage"
    fi
    echo; echo "Reste a la main : bun add playwright-core dans ~/.claude/lib ; outils jq, chrome, node, bun, python3."
    ;;

  *) echo "Usage : /sync-claude-config [push|pull]"; exit 1 ;;
esac
```
