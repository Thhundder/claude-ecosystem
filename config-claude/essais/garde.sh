#!/usr/bin/env bash
# Banc d'essai de hooks/guard.sh : chaque cas attend une decision precise.
GUARD="$HOME/.claude/hooks/guard.sh"
ok=0; ko=0
essai() {
  local attendu="$1" nom="$2" commande="$3" cwd="${4:-$HOME}"
  local out dec
  out=$(jq -nc --arg c "$commande" --arg w "$cwd" '{tool_name:"Bash",tool_input:{command:$c},cwd:$w}' | "$GUARD" 2>&1)
  if [ -z "$out" ]; then dec="allow"
  else dec=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "PARSE-ERR"' 2>/dev/null); fi
  if [ "$dec" = "$attendu" ]; then ok=$((ok+1)); printf 'ok    %-46s -> %s\n' "$nom" "$dec"
  else ko=$((ko+1)); printf 'ECHEC %-46s -> %s (attendu %s)\n' "$nom" "$dec" "$attendu"; fi
}

essai allow "commande anodine"            'ls -la /etc'
essai deny  "lecture credentials"         'cat ~/.claude/.credentials.json'
essai deny  "lecture .env"                'cat .env'
essai deny  "lecture cle privee"          'cat ~/.ssh/id_ed25519'
essai deny  "lecture .pem"                'openssl x509 -in serveur.pem -text'
essai allow "ls sur .env"                 'ls -la .env'
essai allow "test -f .env"                'test -f .env && echo present'
essai allow "lire-secret.sh"              '~/.claude/bin/lire-secret.sh .env'
essai allow "gabarit .env.example"        'cat .env.example'
essai allow "source nomme secret.ts"      'cat src/secret.ts'
essai deny  "sed -i sans preuve"          "sed -i 's/aa/bb/' fichier.txt"
essai allow "sed -i avec grep -c"         "sed -i 's/aa/bb/' f.txt && grep -c bb f.txt"
essai allow "remplacer.py"                '~/.claude/bin/remplacer.py f.txt aa bb'
essai allow "sed vers stdout"             "sed 's/aa/bb/' f.txt | head"
essai ask   "deploiement"                 './deploy.sh --prod'
essai deny  "deploiement interactif"      './build-and-deploy.sh'
essai ask   "git reset --hard"            'git reset --hard origin/main'
essai ask   "git push --force"            'git push --force origin ma-branche'
essai ask   "git clean -fd"               'git clean -fd'
essai allow "git status"                  'git status --short'
essai ask   "rm hors perimetre"           'rm -rf ~/Documents/quelque-chose'
essai allow "rm dans /tmp"                'rm -rf /tmp/scratch/x'
essai allow "rm relatif local"            'rm -f build/artefact.o'
essai allow "ssh + geste git dur"         'ssh xeko-backend-prod "git reset --hard"'
essai ask   "ssh + deploiement"           'ssh xeko-backend-prod "./deploy.sh"'
essai deny  "ssh + cat .env"              'ssh xeko-backend-prod "cat /srv/app/.env"'

echo
echo "resultat: $ok reussis, $ko echecs"
