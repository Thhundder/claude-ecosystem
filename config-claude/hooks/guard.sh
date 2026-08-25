#!/usr/bin/env bash
# Garde unique sur Bash. Silencieuse par defaut : n'intervient que sur les gestes
# irrattrapables, partages, ou qui exposeraient un identifiant.
# Sur une commande ssh, seuls le controle de deploiement et celui des identifiants
# s'appliquent : la machine distante n'est pas soumise a des garde-fous supplementaires.
set -u

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cwd" ] && cwd="$PWD"

decide() { jq -nc --arg d "$1" --arg r "$2" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}
has() { printf '%s' "$cmd" | grep -qE "$1"; }

# Le corps d'un document ecrit par heredoc est de la DONNEE, pas une commande.
# Sans ce retrait, ecrire une doctrine qui mentionne un fichier d'identifiants
# declenche la garde des identifiants.
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
CRED='(^|[/(,{[:space:]=])((\.env(\.[A-Za-z0-9_-]+)?|\.claude\.json|\.credentials\.json|\.hub-notify\.json|\.netrc|\.npmrc|\.pgpass|id_rsa|id_ecdsa|id_ed25519)|([A-Za-z0-9_.-]*([Cc]redential|[Ss]ecret|[Tt]oken|[Aa]pi[-_]?[Kk]ey)[A-Za-z0-9_.-]*\.[A-Za-z0-9]{1,6})|([A-Za-z0-9_.~/-]*/[A-Za-z0-9_.-]*([Cc]redential|[Ss]ecret)[A-Za-z0-9_.-]*)|([A-Za-z0-9_./-]+\.(pem|p12|pfx|key|jks|keystore)))([[:space:],;`)}]|$)'
SANS_VALEUR='^[[:space:]]*(ls|stat|test|\[|rm|mv|cp|chmod|chown|touch|mkdir|find|wc|du|file|basename|dirname|readlink|ln|echo|printf|export|source|lire-secret\.sh|git[[:space:]]+(add|rm|check-ignore|status|ls-files))([[:space:]]|$)'

if ! has 'lire-secret\.sh'; then
  scan="$(printf '%s' "$cmd" \
    | sed -E 's/(^|[;&|][[:space:]]*)ssh[[:space:]]+[^[:space:]]+[[:space:]]+/\1/g' \
    | tr -d '\042\047' \
    | tr ';&|' '\n')"
  touche=0
  while IFS= read -r seg; do
    # un gabarit ne porte pas de valeur ; un fichier source non plus, meme s'il
    # s'appelle secret-quelque-chose
    seg="$(printf '%s' "$seg" \
      | sed -E 's#[A-Za-z0-9_./~-]*\.(example|sample|template|dist)([^A-Za-z0-9]|$)#GABARIT\2#g' \
      | sed -E 's#[A-Za-z0-9_./~-]*\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|c|h|cpp|css|scss|html|md|sql|sh|vue|svelte)([^A-Za-z0-9]|$)#SOURCE\2#g')"
    printf '%s' "$seg" | grep -qE "$CRED" || continue
    printf '%s' "$seg" | grep -qE "$SANS_VALEUR" && continue
    touche=1; break
  done <<< "$scan"
  [ "$touche" = 1 ] && decide deny "Cette commande afficherait le contenu d'un fichier d'identifiants. Une valeur affichée entre dans la conversation et doit être considérée comme divulguée. Utiliser ~/.claude/bin/lire-secret.sh <fichier> [motif] : il montre les clés et une empreinte de chaque valeur, jamais la valeur."
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
  decide deny "Substitution par motif sans preuve qu'elle s'est appliquée. Un motif absent laisse le fichier inchangé, la commande sort en succès, et le correctif annoncé n'existe pas. Utiliser ~/.claude/bin/remplacer.py <fichier> <ancien> <nouveau> — il échoue si le motif n'est pas trouvé le bon nombre de fois et relit après écriture. Ou ajouter une vérification dans la même commande."
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

# --- 4. Branche partagee sur un depot d'entreprise
if has '(^|[^A-Za-z0-9_-])git[[:space:]]+([^|;&]*[[:space:]])?(commit|push)([^A-Za-z0-9_-]|$)'; then
  root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
  case "${root:-}" in
    "$HOME"/Documents/Xeko/*)
      branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
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

exit 0
