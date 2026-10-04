#!/usr/bin/env bash
# Signale un workflow gele ou arrete, ou un agent lance seul qui ne repond plus, au
# moment ou l'utilisateur reprend la main. Une seule alerte par anomalie et par session :
# les anomalies deja signalees sont gardees dans ~/.claude/cache/veille/<session>.
# Silencieux quand tout va bien. Aucun processus de fond : la detection se lit
# sur le systeme de fichiers, une boucle permanente n'apporterait rien.
set -u
input="$(cat)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"; [ -z "$cwd" ] && cwd="$PWD"
sid="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')"
projet="$(printf '%s' "$cwd" | sed 's#/#-#g')"
brut="$(python3 "$HOME/.claude/bin/veille-wf.py" --projet "$projet" ${sid:+--session "$sid"} --cles 2>/dev/null \
  | grep -E 'agent gelé|arrêté|agent seul muet')" || true
[ -z "$brut" ] && exit 0

etat=/dev/null
if [ -n "$sid" ]; then
  etat="$HOME/.claude/cache/veille/$sid"; mkdir -p "${etat%/*}"; touch "$etat"
fi
rapport=""
while IFS=$'\t' read -r cles ligne; do
  neuve=0
  for c in $cles; do
    grep -qxF -- "$c" "$etat" 2>/dev/null && continue
    neuve=1; [ "$etat" != /dev/null ] && printf '%s\n' "$c" >> "$etat"
  done
  [ "$neuve" = 1 ] && rapport="$rapport$ligne"$'\n'
done <<< "$brut"
[ -z "$rapport" ] && exit 0

jq -nc --arg t "Veille des workflows et des agents — anomalie détectée (signalée une seule fois) :

$rapport
Un agent gelé n'a plus écrit depuis longtemps alors que le workflow avance. Un workflow arrêté a laissé des agents sans résultat. Un agent seul muet n'écrit plus depuis 25 min alors que la session qui l'a lancé continue." \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$t}}'
