#!/usr/bin/env bash
# SessionStart -> injecte la tete du JOURNAL.md, et fige une empreinte de depart
# Stop         -> refuse de clore si l'arbre de travail a bouge sans que la partie
#                 REDIGEE du journal ait bouge, ou si des champs obligatoires sont vides.
#
# La detection s'appuie sur l'etat reel du depot, jamais sur l'outil employe :
# en mode auto les fichiers sont ecrits par le shell, un hook accroche a Edit/Write
# ne verrait rien.
set -u
input="$(cat)"
ev="$(printf '%s' "$input"  | jq -r '.hook_event_name // empty' 2>/dev/null)"
sid="$(printf '%s' "$input" | jq -r '.session_id // "x"' 2>/dev/null)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cwd" ] && cwd="$PWD"
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$root" ] && exit 0
J="$root/JOURNAL.md"
C="$HOME/.claude/cache/journal"; mkdir -p "$C"
BASE="$C/$sid.base"; SEEN="$C/$sid.seen"

arbre() { { git -C "$root" status --porcelain; git -C "$root" log -1 --format=%H; } 2>/dev/null | md5sum | cut -d' ' -f1; }
redige() { [ -f "$J" ] && sed '/<!-- ETAT:DEBUT/,/<!-- ETAT:FIN -->/d' "$J" | md5sum | cut -d' ' -f1 || echo ABSENT; }
champ_vide() { [ -f "$J" ] || return 0; grep -qE '^\*\*(Chantier|Situation|Prochaine action)\*\*[[:space:]]*$' "$J"; }

case "$ev" in
  SessionStart)
    printf '%s\n%s\n' "$(arbre)" "$(redige)" > "$BASE"
    [ -f "$J" ] || exit 0
    tete="$(awk '/^## Décisions/{exit} {print}' "$J" | head -60)"
    jq -nc --arg t "État repris de JOURNAL.md, écrit par la session précédente pour permettre une reprise à l'identique :

$tete" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$t}}'
    ;;

  Stop)
    # --- cette session a-t-elle REELLEMENT ecrit quelque chose ?
    # Sans ce filtre, les ecritures d'une autre session travaillant sur le meme
    # depot etaient attribuees a celle-ci. Quatre declenchements a tort le 23 aout.
    tr="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"
    if [ -n "$tr" ] && [ -f "$tr" ]; then
      if ! grep -qE '"name":"(Edit|Write|NotebookEdit)"|"command":"[^"]*([^<]>[^&]|>>|sed -i|tee |mkdir |rm |cp |mv |touch |git (add|commit))' "$tr"; then
        exit 0
      fi
      # ... et qu'elle a ecrit DANS CE DEPOT : au moins un des fichiers modifies
      # doit apparaitre dans son transcript. Sinon les modifications viennent
      # d'ailleurs — autre session, editeur, processus de fond.
      touche=0
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        if grep -qF -- "$f" "$tr"; then touche=1; break; fi
      done <<< "$(git -C "$root" status --porcelain 2>/dev/null | awk '{print $NF}' | head -60)"
      [ "$touche" = 0 ] && exit 0
    fi

    # --- pas d'interface neuve sans reference visuelle
    if [ ! -f "$C/$sid.front" ]; then
      front="$("$HOME"/.claude/bin/front-seuil.sh "$root" 2>/dev/null)"; code=$?
      if [ "$code" = 2 ]; then
        touch "$C/$sid.front"
        quoi="$(printf '%s' "$front" | cut -d'|' -f1)"
        det="$(printf '%s' "$front" | cut -d'|' -f2)"
        jq -nc --arg r "Travail d'interface classé « $quoi » ($det) dans un dépôt qui n'a AUCUNE référence visuelle versionnée. On ne code pas une interface neuve à l'aveugle.

Avant de clore : produire un atlas dans \`maquettes/\`, page HTML autonome et versionnée, en trois étages —
1. LE SOCLE : palettes déclinées avec un jeu de rôles unique, surfaces, échelle typographique, rayons/hauteurs/rythme, mesures, et les contrôles rendus à leur taille réelle.
2. LA ZONE CONTRASTE : chaque encre sur chaque surface, dans chaque palette, avec le ratio calculé et un verdict.
3. LES FILS : un fil par domaine, ses écrans et les chemins entre eux, jusqu'à la modification visée.

Plus un LISEZ-MOI disant ce que la page porte et quel fichier fait foi. Faire valider l'atlas avant d'écrire l'écran." \
          '{decision:"block", reason:$r}'
        exit 0
      fi
    fi

    if [ ! -f "$BASE" ]; then printf '%s\n%s\n' "$(arbre)" "$(redige)" > "$BASE"; exit 0; fi
    a0="$(sed -n 1p "$BASE")"; r0="$(sed -n 2p "$BASE")"
    a1="$(arbre)"; r1="$(redige)"
    [ "$a0" = "$a1" ] && exit 0                       # rien n'a bouge dans le depot
    if [ "$r0" != "$r1" ] && ! champ_vide; then       # journal reellement redige
      printf '%s\n%s\n' "$a1" "$r1" > "$BASE"; rm -f "$SEEN"; exit 0
    fi
    [ -f "$SEEN" ] && exit 0                          # un garde-fou ne doit jamais enfermer
    touch "$SEEN"
    if [ "$r0" = "$r1" ]; then
      motif="la partie rédigée de JOURNAL.md n'a pas bougé — régénérer le bloc d'état ne suffit pas"
    else
      motif="des champs obligatoires de \"Où j'en suis\" sont restés vides"
    fi
    jq -nc --arg r "L'arbre de travail a changé, mais $motif. Avant de clore : renseigne Chantier, Situation et Prochaine action ; ajoute au Journal ce qui a été fait, ce qui a été mesuré et ce qui a été supposé ; consigne toute rétractation ; puis régénère le bloc d'état avec ~/.claude/bin/journal.sh. Ensuite seulement, termine." \
      '{decision:"block", reason:$r}'
    ;;
esac
exit 0
