#!/usr/bin/env bash
# Signale un workflow gele ou arrete au moment ou l'utilisateur reprend la main.
# Silencieux quand tout va bien. Aucun processus de fond : la detection se lit
# sur le systeme de fichiers, une boucle permanente n'apporterait rien.
set -u
input="$(cat)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"; [ -z "$cwd" ] && cwd="$PWD"
projet="$(printf '%s' "$cwd" | sed 's#/#-#g')"
rapport="$(python3 "$HOME/.claude/bin/veille-wf.py" --projet "$projet" 2>/dev/null | grep -E 'agent gelé|arrêté')" || true
[ -z "$rapport" ] && exit 0
jq -nc --arg t "Veille des workflows — anomalie détectée :

$rapport

Un agent gelé n'a plus écrit depuis longtemps alors que le workflow avance. Un workflow arrêté a laissé des agents sans résultat." \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$t}}'
