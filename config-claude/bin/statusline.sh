#!/usr/bin/env bash
# Indicateur permanent. Doit rester rapide : il est rendu en continu.
# Repond a trois questions sans avoir a demander :
#   ou suis-je, le journal suit-il, et le cache est-il encore chaud.
set -u
IN="$(cat 2>/dev/null)"
C="$HOME/.claude/cache"; mkdir -p "$C"
# capture unique de la forme reelle de l'entree, pour verification
[ -s "$C/statusline-input.json" ] || printf '%s' "$IN" > "$C/statusline-input.json" 2>/dev/null

f(){ printf '%s' "$IN" | jq -r "$1 // empty" 2>/dev/null; }
cwd="$(f '.workspace.current_dir // .cwd')"; [ -z "$cwd" ] && cwd="$PWD"
modele="$(f '.model.display_name // .model.id // .model')"
tr_path="$(f '.transcript_path')"

# --- position
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
seg_repo=""
if [ -n "$root" ]; then
  br="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  n="$(git -C "$cwd" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  seg_repo="⎇ $br"
  [ "${n:-0}" -gt 0 ] && seg_repo="$seg_repo ${n}△"
fi

# --- journal : le bloc genere est-il posterieur a la derniere modification du depot ?
seg_j=""
if [ -n "$root" ] && [ -f "$root/JOURNAL.md" ]; then
  # comparaison a la seconde : mtime du journal contre le fichier modifie le plus recent,
  # le journal lui-meme etant exclu sinon le regenerer le rendrait perpetuellement en retard
  tb=$(stat -c %Y "$root/JOURNAL.md" 2>/dev/null || echo 0)
  tf=$(git -C "$cwd" status --porcelain 2>/dev/null | awk '{print $NF}' | grep -v '^JOURNAL\.md$' | head -40 \
       | while read -r p; do [ -e "$root/$p" ] && stat -c %Y "$root/$p" 2>/dev/null; done | sort -rn | head -1)
  if [ -n "${tf:-}" ] && [ "$tf" -gt "$tb" ]; then seg_j="journal en retard"; else seg_j="journal ✓"; fi
elif [ -n "$root" ]; then
  seg_j="journal absent"
fi

# --- cache : le contexte est mis en cache 60 min apres le dernier echange
seg_c=""
t="$tr_path"
if [ -z "$t" ] || [ ! -f "$t" ]; then
  slug="$(printf '%s' "$cwd" | sed 's#/#-#g')"
  t="$(ls -t "$HOME/.claude/projects/$slug"/*.jsonl 2>/dev/null | head -1)"
fi
if [ -n "${t:-}" ] && [ -f "$t" ]; then
  age=$(( ( $(date +%s) - $(stat -c %Y "$t") ) / 60 ))
  reste=$(( 60 - age ))
  if [ "$reste" -le 0 ]; then seg_c="cache expiré"
  elif [ "$reste" -le 10 ]; then seg_c="cache ${reste}′ ⚠"
  else seg_c="cache ${reste}′"; fi
fi

# --- workflows : en cours, gelés, arrêtés
seg_w="$(python3 "$HOME/.claude/bin/veille-wf.py" --projet "$(printf '%s' "$cwd" | sed 's#/#-#g')" --court 2>/dev/null)"

out=""
for s in "$modele" "$seg_repo" "$seg_j" "$seg_c" "$seg_w"; do
  [ -n "$s" ] && { [ -n "$out" ] && out="$out · $s" || out="$s"; }
done
[ -z "$out" ] && out="$(basename "$cwd")"
printf '%s' "$out"
