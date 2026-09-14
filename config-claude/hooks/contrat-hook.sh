#!/usr/bin/env bash
# Contrat de brief : un workflow ne part pas avec des agents mal briefés.
# Refus, pas demande de confirmation : c'est un contrôle sur ma propre production,
# l'utilisateur n'a pas à arbitrer une négligence de rédaction.
#
# Sur l'outil `Agent`, avertissement seulement : le plugin d'équipe lance ses agents
# par cet outil et ses briefs n'ont pas les trois dimensions par construction. Le
# rapport part alors en `hookSpecificOutput.additionalContext` avec `allow` — doc des
# hooks, « PreToolUse decision control » : additionalContext « String added to Claude's
# context alongside the tool result » ; permissionDecisionReason « For "allow" and "ask",
# shown to the user but not Claude. For "deny", shown to Claude. » Le stdout d'un
# PreToolUse en exit 0 ne va qu'au journal de débogage, jamais au modèle.
set -u
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"
rapport="$(printf '%s' "$input" | python3 "$HOME/.claude/bin/contrat-brief.py" 2>/dev/null)"; code=$?
[ "$code" != 2 ] && exit 0
corps="$rapport

Trois dimensions sont exigées dans chaque brief d'agent, parce que ce sont celles qui manquaient aux échecs documentés :
· critère de succès — à quoi on reconnaît que l'agent a réussi, en termes binaires ;
· condition d'arrêt — quand il renonce plutôt que d'insister ou d'inventer ;
· ce qui a déjà été tenté — pour qu'il ne refasse pas une ronde perdue.

Si le manque porte sur la lentille de complétude : une étape de vérification doit comporter un agent qui ne juge rien et cherche uniquement ce qui manque — quelle affirmation n'a été éprouvée par aucune lentille, quelle source n'a pas été lue, quel angle reste sans regard. C'est la seule lentille capable de trouver ce qu'aucune autre ne regarde. Catalogue complet et règle de composition : ~/.claude/lentilles.md.

Un vérificateur reçoit l'artefact et l'exigence d'origine, jamais le résumé du producteur."
if [ "$tool" = Agent ]; then
  jq -nc --arg r "Contrat de brief non tenu — avertissement, l'agent part quand même.

$corps

Au prochain brief passé à Agent, compléter les dimensions manquantes." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",additionalContext:$r}}'
  exit 0
fi
jq -nc --arg r "Contrat de brief non tenu.

$corps

Compléter les briefs, puis relancer." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
