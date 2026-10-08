#!/usr/bin/env bash
# Garde unique sur Bash. Silencieuse par defaut : n'intervient que sur les gestes
# irrattrapables, partages, qui figeraient la session, ou qui exposeraient un identifiant.
# Sur une commande ssh, seuls le controle de deploiement et celui des identifiants
# s'appliquent : la machine distante n'est pas soumise a des garde-fous supplementaires.
set -u

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0
brut="$cmd"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cwd" ] && cwd="$PWD"

decide() { jq -nc --arg d "$1" --arg r "$2" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}
has() { printf '%s' "$cmd" | grep -qE "$1"; }

# Le corps d'un document ecrit par heredoc est de la DONNEE, pas une commande.
# Sans ce retrait, ecrire une doctrine qui cite un geste dangereux declenche les gardes
# qui suivent. La garde des identifiants decoupe elle-meme la commande brute : un
# heredoc donne a un interpreteur y est du code.
cmd="$(printf '%s' "$cmd" | awk '
  !dans && match($0, /<<-?[\x27"]?[A-Za-z_][A-Za-z0-9_]*/) {
    m = substr($0, RSTART, RLENGTH); sub(/^<<-?[\x27"]?/, "", m)
    fin = m; dans = 1; print; next
  }
  dans { if ($0 == fin) dans = 0; next }
  { print }
')"

# Un chemin absolu ou en ~/ est une position de commande comme une autre : sans lui,
# `/srv/app/deploy.sh` et `~/projets/deploy.sh` passaient sans confirmation.
CMDPOS='(^|[;&|(]|&&|\|\|)[[:space:]]*((bash|sh|source)[[:space:]]+)?(\.?~?/)?([A-Za-z0-9_.-]+/)*'

# --- 0. Fichiers d'identifiants : la valeur ne doit jamais entrer dans la conversation
# L'analyse suit le tube : une lecture masquee avant l'ecran passe (garde-identifiants.py).
if printf '%s' "$brut" | grep -qiE 'env|secret|credential|token|api.?key|netrc|npmrc|pgpass|id_(rsa|ecdsa|ed25519)|\.(pem|p12|pfx|key|jks|keystore)|claude\.json|hub-notify'; then
  etape="$(CMD_BRUT="$brut" python3 "$HOME/.claude/hooks/garde-identifiants.py" 2>/dev/null)" \
    || decide deny "Cette commande afficherait le contenu d'un fichier d'identifiants (étape en cause : ${etape:-inconnue}). Une valeur affichée entre dans la conversation et doit être considérée comme divulguée. Formes admises : un compte ou une présence (grep -c, grep -q, grep -l, test -s), les noms de clés seuls (grep -o '^[A-Z_]*=', cut -d= -f1, awk -F= '{print \$1}', sed 's/=.*/=<défini>/'), une empreinte (… | sha256sum), une sortie envoyée dans un fichier. Charger les valeurs dans un programme (source, --env-file, un script) est admis. Sinon : ~/.claude/bin/lire-secret.sh <fichier> [motif] montre les clés et une empreinte de chaque valeur, jamais la valeur. À distance, sans rien installer sur le serveur : ssh <hôte> bash -s -- <fichier> [motif] < ~/.claude/bin/lire-secret.sh"
fi

# --- 0 bis. Substitution par motif non verifiee
# Une substitution qui ne s'applique pas laisse le fichier intact, sort en succes,
# et fait annoncer un correctif inexistant. Trois fois le 22 aout.
# une substitution qui sort sur la sortie standard ne modifie aucun fichier :
# seul l'edition en place, ou une substitution suivie d'une ecriture, compte.
SUBST='(sed -i|\.replace\(|re\.sub\()'
ECRIT='(open\([^)]*.w.\)|\.write\(|> *"?\$|tee )'
PREUVE='(assert |remplacer\.py|--verifie|\.count\(|grep -c|grep -q|grep -rl|diff |md5sum|\bverif|relu|raise |\[ -e |\[ -f |test -)'
if has "$SUBST" && { has "$ECRIT" || has 'sed -i'; } && ! has "$PREUVE"; then
  decide deny "Substitution par motif sans preuve qu'elle s'est appliquée. Un motif absent laisse le fichier inchangé, la commande sort en succès, et le correctif annoncé n'existe pas. Utiliser ~/.claude/bin/remplacer.py <fichier> <ancien> <nouveau> — il échoue si le motif n'est pas trouvé le bon nombre de fois et relit après écriture. À distance, sans rien installer sur le serveur : ssh <hôte> python3 - <fichier> <ancien> <nouveau> < ~/.claude/bin/remplacer.py. Ou ajouter une vérification dans la même commande."
fi

# Le controle de deploiement doit voir a travers ssh : la machine distante est
# exclue des garde-fous, pas le declenchement lui-meme. Sans retrait du prefixe
# « ssh <hote> » et des guillemets, `ssh hote ./deploy.sh` passait sans confirmation.
depl="$(printf '%s' "$cmd" \
  | sed -E 's/(^|[;&|][[:space:]]*)ssh[[:space:]]+(-[A-Za-z]([[:space:]]+[^[:space:]]+)?[[:space:]]+)*[^[:space:]]+[[:space:]]+/\1/g' \
  | tr -d '\042\047')"
hasd() { printf '%s' "$depl" | grep -qE "$1"; }

# --- 1. Deploiement interactif : injouable par un agent, il attend un choix clavier
if has "${CMDPOS}build-and-deploy\.sh" || hasd "${CMDPOS}build-and-deploy\.sh"; then
  decide deny "Script de deploiement interactif (menu clavier) : il figerait la session. Lance-le toi-meme."
fi

# --- 2. Declenchement d'un deploiement
DEPLOI='gh[[:space:]]+workflow[[:space:]]+run[^|;&]*deploy|eas[[:space:]]+build[^|;&]*--profile[[:space:]]+production'
if has "${CMDPOS}deploy\.sh" || hasd "${CMDPOS}deploy\.sh" \
  || has "$DEPLOI" || hasd "$DEPLOI"; then
  decide ask "Declenchement d'un deploiement. Confirme explicitement."
fi

# --- au-dela, une commande ssh n'est plus inspectee
if has "${CMDPOS}ssh[[:space:]]"; then exit 0; fi

# --- 3. Gestes git irrattrapables (le travail non enregistre ne revient pas)
if has 'git[[:space:]]+([^|;&]*[[:space:]])?reset[[:space:]]+[^|;&]*--hard'; then
  decide ask "git reset --hard detruit les modifications non enregistrees, sans retour possible."
fi
if has 'git[[:space:]]+([^|;&]*[[:space:]])?push[[:space:]]+[^|;&]*(--force([^-]|$)|-f([[:space:]]|$))'; then
  decide ask "Publication forcee : reecrit l'historique distant, sans retour possible."
fi
if has 'git[[:space:]]+([^|;&]*[[:space:]])?clean[[:space:]]+-[a-z]*[fd]'; then
  decide ask "git clean supprime les fichiers non suivis, sans retour possible."
fi

# --- 3 bis. Ajout en bloc dans un worktree secondaire : il embarque ce que le poste
# porte sans l'avoir choisi (liens, fichiers copies d'un autre chantier, sorties).
ADD_BLOC='git[[:space:]]+(-C[[:space:]]+[^[:space:];&|]+[[:space:]]+)?add([[:space:]]+-[^[:space:];&|]*)*[[:space:]]+(-A|--all|\.)([[:space:];&|)]|$)'
if has "${CMDPOS}${ADD_BLOC}"; then
  dir="$(printf '%s' "$cmd" | grep -oE "$ADD_BLOC" | head -1 | sed -nE 's/^git[[:space:]]+-C[[:space:]]+([^[:space:]]+).*/\1/p')"
  [ -z "$dir" ] && dir="$(printf '%s' "$cmd" | sed -E "s/$ADD_BLOC.*//" \
    | grep -oE '(^|[;&|(])[[:space:]]*cd[[:space:]]+[^;&|[:space:]]+' | tail -1 | sed -E 's/.*cd[[:space:]]+//')"
  dir="$(printf '%s' "$dir" | tr -d '\042\047')"; dir="${dir/#\~/$HOME}"
  case "$dir" in /*) ;; "") dir="$cwd" ;; *) dir="$cwd/$dir" ;; esac
  gd="$(git -C "$dir" rev-parse --absolute-git-dir 2>/dev/null || true)"
  gc="$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$gd" ] && [ -n "$gc" ] && [ "$gd" != "$gc" ]; then
    decide deny "Worktree secondaire ($dir) : git add -A, git add . et git add --all embarquent tout ce que ce poste porte — liens, fichiers copiés d'un autre chantier, sorties. Ajouter fichier par fichier (git add <chemin> …), puis lire git status avant le commit."
  fi
fi

# --- 3 ter. Attente de CI au premier plan : la session reste figee jusqu'a la fin du run
if has "${CMDPOS}(timeout[[:space:]]+[0-9.]+[smh]?[[:space:]]+)?gh[[:space:]]+(run[[:space:]]+watch|pr[[:space:]]+checks[^|;&]*--watch)"; then
  fond="$(printf '%s' "$input" | jq -r '.tool_input.run_in_background // false' 2>/dev/null)"
  [ "$fond" = true ] || decide deny "Attente de CI au premier plan : la session reste figée jusqu'à la fin du run. Relancer la même commande avec run_in_background: true, et donner l'état tout de suite (gh run view, ou gh pr checks sans --watch)."
fi

# --- 4. Branche partagee sur un depot d'entreprise
if has '(^|[^A-Za-z0-9_-])git[[:space:]]+([^|;&]*[[:space:]])?(commit|push)([^A-Za-z0-9_-]|$)'; then
  # Le depot vise est celui du `cd` ou du `git -C` qui precede la publication, pas le dossier de la
  # session : le 07/10, trois push sur main d'autres depots ont ete annonces « pms-ia » (audit A).
  gitdir="$cwd"
  avant="$(printf '%s' "$cmd" | tr '\n' ';' | grep -oE '.*git[[:space:]]+([^|;&]*[[:space:]])?(commit|push)' | head -1)"
  vers="$(printf '%s' "$avant" | grep -oE '(^|[;&|][[:space:]]*)cd[[:space:]]+[^;&|[:space:]]+' | tail -1 | sed -E 's/.*cd[[:space:]]+//')"
  opt="$(printf '%s' "$avant" | grep -oE 'git[[:space:]]+-C[[:space:]]+[^[:space:]]+' | tail -1 | awk '{print $3}')"
  for x in "$vers" "$opt"; do
    [ -n "$x" ] || continue
    x="$(printf '%s' "$x" | tr -d "\"'")"
    case "$x" in "~"*) x="$HOME${x#\~}" ;; '$HOME'*) x="$HOME${x#\$HOME}" ;; esac
    case "$x" in /*) gitdir="$x" ;; *) gitdir="$gitdir/$x" ;; esac
  done
  root="$(git -C "$gitdir" rev-parse --show-toplevel 2>/dev/null || true)"
  case "${root:-}" in
    "$HOME"/Documents/Xeko/*)
      branch="$(git -C "$gitdir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
      target=""
      # On ne cherche la branche visee QUE dans la commande de publication elle-meme.
      # Chercher le mot partout attrapait « reemis a la main » dans une note de travail
      # et bloquait un enregistrement sur une branche de travail. Mesure du 2026-08-23.
      pousse="$(printf '%s' "$cmd" | grep -oE 'git[[:space:]]+[^|;&]*push[^|;&]*' || true)"
      if [ -n "$pousse" ]; then
        target="$(printf '%s' "$pousse" | grep -oE '(^|[^A-Za-z0-9_/-])(dev|main)([^A-Za-z0-9_/-]|$)' | grep -oE '(dev|main)' | head -1)"
      fi
      # Un enregistrement se fait sur la branche courante : le texte du message ne compte pas.
      case "${branch:-}" in dev|main) target="$branch" ;; esac
      [ -n "$target" ] && decide ask "Depot d'entreprise $(basename "$root"), branche partagee $target. Confirme, ou bascule sur une branche de travail."
      ;;
  esac
fi

# --- 5. Effacement hors du perimetre de travail
if has '(^|[^A-Za-z0-9_-])rm[[:space:]]'; then
  cibles="$(printf '%s' "$cmd" | grep -oE '(^|[^A-Za-z0-9_-])rm[[:space:]]+[^|;&]*' \
    | sed -E 's/.*rm[[:space:]]+//' | tr ' ' '\n' | grep -vE '^-' | grep -v '^$')"
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    t="${t%\"}"; t="${t#\"}"; t="${t%\'}"; t="${t#\'}"
    # Deux emplacements sont jetables par definition : le cache de l'outillage et
    # le repertoire temporaire du systeme. Y effacer n'a jamais de consequence.
    case "$t" in
      "$HOME"/.claude/cache/*|'~/.claude/cache/'*|/tmp/*|'$HOME'/.claude/cache/*) continue ;;
    esac
    case "$t" in
      /|/*|'~'|'~/'*|'$HOME'*|../*|*/../*|..)
        decide ask "Effacement hors du repertoire de travail ($t). Confirme." ;;
    esac
  done <<< "$cibles"
fi

# --- 6. Test affaibli par le shell : meme controle que sur Edit et Write (garde-tests.sh)
tests="$(printf '%s' "$input" | "$HOME/.claude/hooks/garde-tests.sh")"
[ -n "$tests" ] && { printf '%s\n' "$tests"; exit 0; }

# --- 7. Commande lourde (emulateur, compilation, serveur, tests navigateur) : boite memoire
# ou refus si la memoire manque. Le 07/10, deux coupures en une heure (garde-memoire.py).
mem="$(printf '%s' "$input" | "$HOME/.claude/hooks/garde-memoire.py" 2>/dev/null)"
[ -n "$mem" ] && { printf '%s\n' "$mem"; exit 0; }

exit 0
