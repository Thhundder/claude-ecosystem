#!/usr/bin/env bash
# Classe les changements d'interface NON ENREGISTRES d'un depot :
#   PAGE NEUVE  un fichier ajoute a une position de route
#   FEATURE     trois fichiers d'interface neufs ou plus
#   REFONTE     un fichier dont >=60% des lignes changent, et >=150 lignes touchees
#   (rien)      retouche ordinaire
# Seuils tires de 60 enregistrements reels : fichiers d'interface mediane 266 lignes,
# en dessous de 150 lignes touchees ce sont des composants, pas des pages.
set -u
cd "${1:-$PWD}" 2>/dev/null || exit 0
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

EXT='\.(tsx|jsx|vue|svelte)$'
ROUTE='(^|/)(app|pages|routes|screens|views)/.*/(page|index|layout|route)\.(tsx|jsx|vue|svelte)$'
MIN_LIGNES=150
MIN_PCT=60

neufs="$( { git diff --cached --name-only --diff-filter=A; git ls-files --others --exclude-standard; } 2>/dev/null \
          | grep -E "$EXT" | sort -u )"
nb_neufs="$(printf '%s' "$neufs" | grep -c . )"
nb_routes="$(printf '%s\n' "$neufs" | grep -cE "$ROUTE")"

verdict=""; detail=""
if [ "${nb_routes:-0}" -gt 0 ]; then
  verdict="PAGE NEUVE"; detail="$(printf '%s\n' "$neufs" | grep -E "$ROUTE" | head -3 | tr '\n' ' ')"
elif [ "${nb_neufs:-0}" -ge 3 ]; then
  verdict="FEATURE"; detail="$nb_neufs fichiers d'interface neufs"
else
  while IFS=$'\t' read -r add del f; do
    case "$f" in *.tsx|*.jsx|*.vue|*.svelte|*.css) ;; *) continue ;; esac
    [ "$add" = "-" ] && continue
    tot=$((add + del)); [ "$tot" -lt "$MIN_LIGNES" ] && continue
    n="$(wc -l < "$f" 2>/dev/null || echo 0)"; [ "${n:-0}" -lt 1 ] && continue
    if [ $((tot * 100 / n)) -ge "$MIN_PCT" ]; then
      verdict="REFONTE"; detail="$f — $tot lignes sur $n"; break
    fi
  done < <(git diff HEAD --numstat 2>/dev/null)
fi

[ -z "$verdict" ] && exit 0

# Une reference visuelle existe-t-elle dans ce depot ?
atlas="$(git ls-files 2>/dev/null | grep -E '^(maquettes|design-mockups|atlas|docs/maquettes)/.*\.html$' | head -1)"

if [ -n "$atlas" ]; then
  echo "$verdict|$detail|$atlas"; exit 0
fi
echo "$verdict|$detail|"; exit 2
