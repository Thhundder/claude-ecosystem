#!/usr/bin/env bash
# Regenere le bloc d'etat machine de JOURNAL.md a la racine du depot courant.
# Le bloc est GENERE, jamais saisi : un compteur ecrit a la main finit par mentir.
# Cree le fichier depuis le gabarit s'il n'existe pas.
set -u
cd "${1:-$PWD}" 2>/dev/null || exit 0
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -z "$root" ] && exit 0
J="$root/JOURNAL.md"
now="$(date -u '+%Y-%m-%dT%H:%MZ')"
branch="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)"
last="$(git -C "$root" log -1 --format='%h %s' 2>/dev/null | LC_ALL=C.UTF-8 cut -c1-90)"

modifies="$(git -C "$root" status --porcelain 2>/dev/null | sed 's/^/    /' | head -25)"
nmod="$(git -C "$root" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

upstream="$(git -C "$root" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || true)"
if [ -n "$upstream" ]; then
  nahead="$(git -C "$root" rev-list --count "$upstream..HEAD" 2>/dev/null || echo 0)"
  pousse="$nahead commit(s) non poussé(s) vers $upstream"
else
  pousse="aucune branche distante suivie"
fi

# Piege de livraison : fichiers modifies recemment mais invisibles pour git.
ignores="$(git -C "$root" status --porcelain --ignored 2>/dev/null | awk '$1=="!!"{print $2}' \
  | while read -r p; do
      f="$root/$p"
      [ -e "$f" ] || continue
      if [ -n "$(find "$f" -newermt '-12 hours' -type f -print -quit 2>/dev/null)" ]; then echo "    $p"; fi
    done | head -12)"

bloc="$(cat <<EOF
<!-- ETAT:DEBUT — bloc généré par ~/.claude/bin/journal.sh, ne pas éditer à la main -->
**Généré le** $now
**Branche** \`$branch\` — **dernier enregistrement** $last
**Publication** $pousse
**Arbre de travail** $nmod fichier(s) non enregistré(s)
$( [ -n "$modifies" ] && printf '%s\n' "$modifies" )
**Modifié mais invisible pour git** $( [ -z "$ignores" ] && echo "rien" )
$( [ -n "$ignores" ] && printf '%s\n' "$ignores" )
<!-- ETAT:FIN -->
EOF
)"

if [ ! -f "$J" ]; then
  cat > "$J" <<EOF
# JOURNAL — $(basename "$root")

Destinataire : une session neuve, sans aucun contexte. Écrit pour qu'elle reprenne
à l'identique après un plantage, une coupure ou une limite atteinte.

## État machine

$bloc

## Où j'en suis

**Chantier**
**Situation**
**Prochaine action**
**Bloqué par** rien

## Décisions
<!-- append-only. Une ligne : date — décision — raison — ce qui l'invaliderait. -->

## Rétractations
<!-- append-only. Une ligne : date — affirmé — retiré — ce qui manquait au moment de l'affirmation. -->

## Journal
<!-- append-only, le plus détaillé. Ce qui a été fait, ce qui a été mesuré, ce qui a été supposé. -->
EOF
  echo "JOURNAL.md créé : $J"
  exit 0
fi

python3 - "$J" "$bloc" <<'PY'
import sys, re
path, bloc = sys.argv[1], sys.argv[2]
# les noms de fichiers et messages peuvent porter des octets invalides : on les
# neutralise plutot que de laisser l'ecriture du journal echouer en silence
bloc = bloc.encode('utf-8', 'replace').decode('utf-8')
s = open(path, encoding='utf-8', errors='replace').read()
pat = re.compile(r'<!-- ETAT:DEBUT.*?<!-- ETAT:FIN -->', re.S)
if pat.search(s):
    s = pat.sub(lambda _: bloc, s, count=1)
else:
    s = s.rstrip() + "\n\n## État machine\n\n" + bloc + "\n"
open(path, 'w', encoding='utf-8', errors='replace').write(s)
PY
echo "bloc d'état régénéré : $J"
