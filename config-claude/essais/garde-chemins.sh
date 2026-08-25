#!/usr/bin/env bash
# Formes d'invocation d'un deploiement. Toutes doivent demander confirmation,
# sauf `npm run deploy` qui est hors du perimetre declare de la garde.
G="$HOME/.claude/hooks/guard.sh"
t(){ o=$(jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c},cwd:"/home/emorreal"}' | "$G")
     d=$(printf '%s' "$o" | jq -r '.hookSpecificOutput.permissionDecision // "allow"' 2>/dev/null)
     [ -z "$o" ] && d=allow; printf '%-8s %s\n' "$d" "$1"; }
t './deploy.sh'
t 'bash deploy.sh'
t '/srv/app/deploy.sh'
t 'bash /srv/app/deploy.sh'
t '~/projets/deploy.sh'
t 'cd /srv && ./deploy.sh'
t 'ssh h ./deploy.sh'
t 'ssh h "./deploy.sh"'
t "ssh h './deploy.sh'"
t 'ssh h "cd /srv && ./deploy.sh"'
t 'ssh h "bash /srv/deploy.sh"'
t 'npm run deploy'
