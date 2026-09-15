#!/usr/bin/env bash
# Garde sur les fichiers de test, pour Edit, Write et MultiEdit. Silencieuse
# par defaut : n'intervient que si le texte AJOUTE affaiblit un test.
# Pourquoi : le 14/09, une consigne en clair a suffi pour qu'une session pose
# `test.skip(...)` en tete de trois fichiers e2e en cinq minutes. La regle
# « jamais affaiblir, supprimer, sauter ou contourner un test valide »
# n'etait que de la prose. Ici elle demande confirmation.
# Un affaiblissement, c'est : un motif de saut ou d'exclusivite dans les lignes
# nouvelles, ou un nombre d'assertions qui baisse entre old_string et new_string.
# Retirer un saut n'est pas un affaiblissement. Rapide : ni git ni lecture de fichier.
set -u

input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
case "$tool" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -z "$path" ] && exit 0

printf '%s' "$path" \
  | grep -qE '(\.(test|spec)\.[A-Za-z0-9]+$|(^|/)(e2e|test|tests|__tests__|cypress|playwright)/)' \
  || exit 0

decide() { jq -nc --arg d "$1" --arg r "$2" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

REGLE="la regle interdit d'affaiblir un test valide pour obtenir un vert ; si le test est faux, explique-le a l'utilisateur avant d'y toucher"
MOTIFS='test\.skip|it\.skip|describe\.skip|test\.fixme|xit\(|xdescribe\(|xtest\(|\.only\(|test\.todo|pytest\.mark\.skip|@skip|unittest\.skip|t\.Skip\('

# Lignes de new absentes de old : c'est le seul texte que l'edition introduit.
lignes_ajoutees() {
  comm -13 <(printf '%s\n' "$1" | sort) <(printf '%s\n' "$2" | sort)
}
compte_assertions() { printf '%s' "$1" | grep -oE 'expect\(|assert|should\(' | wc -l; }

# Chaque outil est ramene a une liste de paires {old,new} ; Write est une paire
# a l'ancien vide, et le comptage d'assertions n'y a pas de sens.
paires="$(printf '%s' "$input" | jq -c '
  if .tool_name == "Edit" then
    [{old: (.tool_input.old_string // ""), new: (.tool_input.new_string // "")}]
  elif .tool_name == "MultiEdit" then
    [(.tool_input.edits // [])[] | {old: (.old_string // ""), new: (.new_string // "")}]
  else
    [{old: "", new: (.tool_input.content // "")}]
  end' 2>/dev/null)"
[ -z "$paires" ] && exit 0
n="$(printf '%s' "$paires" | jq 'length')"

i=0
while [ "$i" -lt "$n" ]; do
  old="$(printf '%s' "$paires" | jq -r ".[$i].old")"
  new="$(printf '%s' "$paires" | jq -r ".[$i].new")"
  i=$((i + 1))

  motif="$(lignes_ajoutees "$old" "$new" | grep -oE "$MOTIFS" | head -1 || true)"
  if [ -n "$motif" ]; then
    decide ask "$path : cette edition introduit \`$motif\` ; $REGLE."
  fi

  [ "$tool" = Write ] && continue
  avant="$(compte_assertions "$old")"
  apres="$(compte_assertions "$new")"
  if [ "$avant" -gt "$apres" ]; then
    retirees=$((avant - apres))
    s=""; [ "$retirees" -gt 1 ] && s="s"
    decide ask "$path : $retirees assertion$s retiree$s ; $REGLE."
  fi
done

exit 0
