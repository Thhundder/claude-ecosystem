#!/usr/bin/env bash
# SessionStart -> injecte la tete de evan/JOURNAL.md, et fige une empreinte de depart
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
J="$root/evan/JOURNAL.md"
C="$HOME/.claude/cache/journal"; mkdir -p "$C"
BASE="$C/$sid.base"; SEEN="$C/$sid.seen"

arbre() { { git -C "$root" status --porcelain; git -C "$root" log -1 --format=%H; } 2>/dev/null | md5sum | cut -d' ' -f1; }
redige() { [ -f "$J" ] && sed '/<!-- ETAT:DEBUT/,/<!-- ETAT:FIN -->/d' "$J" | md5sum | cut -d' ' -f1 || echo ABSENT; }
champ_vide() { [ -f "$J" ] || return 0; grep -qE '^\*\*(Chantier|Situation|Prochaine action)\*\*[[:space:]]*$' "$J"; }

case "$ev" in
  SessionStart)
    printf '%s\n%s\n' "$(arbre)" "$(redige)" > "$BASE"
    ctx=""
    if [ -f "$J" ]; then
      tete="$(awk '/^## Décisions/{exit} {print}' "$J" | head -60)"
      ctx="État repris de evan/JOURNAL.md, écrit par la session précédente pour permettre une reprise à l'identique :

$tete"
    fi
    S="$root/.claude/settings.json"
    if [ -f "$S" ] && jq -e '.enabledPlugins["xeko@xeko-engineering"] == true' "$S" >/dev/null 2>&1; then
      routage="$(cat <<'ROUTAGE'
Plugin xeko actif dans ce dépôt. Sept workflows du plugin ne sont pas listés dans ton contexte parce qu'ils sont réservés à l'humain ; ils existent, et une demande en clair de l'utilisateur vaut invocation :
- construire ce qui n'existe pas → /xeko:feature
- quelque chose est cassé, lent ou intermittent → /xeko:diagnose
- du code existe et doit devenir fiable avant la prod → /xeko:harden
- prouver un comportement de modèle (chatbot, callbot, RAG) → /xeko:eval
- promouvoir en staging puis en production → /xeko:ship
- concevoir un module structurant, ou relever la dette → /xeko:architecture
- équiper un dépôt sans CLAUDE.md → /xeko:setup-repo
- ne sait pas → /xeko:route
Quand la demande correspond à une ligne : nommer le workflow, ouvrir son fichier ~/.claude/plugins/cache/xeko-engineering/xeko/<version>/skills/<nom>/SKILL.md (la version installée est le seul dossier sous xeko/), et le suivre — phases, gates et GO compris ; remplacer soi-même $ARGUMENTS par ce que l'utilisateur a nommé. Ne jamais choisir un workflow que l'utilisateur n'a pas décrit.
ROUTAGE
)"
      [ -n "$ctx" ] && ctx="$ctx

"
      ctx="$ctx$routage"
    fi
    [ -z "$ctx" ] && exit 0
    jq -nc --arg t "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$t}}'
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
        mode="$(printf '%s' "$front" | cut -d'|' -f4)"
        if [ "$mode" = "maquette" ]; then
          jq -nc --arg r "Travail d'interface classé « $quoi » ($det) sans maquette de l'écran visé. On ne code pas une interface neuve à l'aveugle.

Avant de clore : produire une maquette HTML autonome de l'écran visé sous \`evan/maquettes/\` (ou \`maquettes/\` si l'équipe la versionne), la faire valider par l'utilisateur, puis seulement écrire l'écran." \
            '{decision:"block", reason:$r}'
          exit 0
        fi
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
      motif="la partie rédigée de evan/JOURNAL.md n'a pas bougé — régénérer le bloc d'état ne suffit pas"
    else
      motif="des champs obligatoires de \"Où j'en suis\" sont restés vides"
    fi
    jq -nc --arg r "L'arbre de travail a changé, mais $motif. Avant de clore : renseigne Chantier, Situation et Prochaine action ; ajoute au Journal ce qui a été fait, ce qui a été mesuré et ce qui a été supposé ; consigne toute rétractation ; puis régénère le bloc d'état de evan/JOURNAL.md avec ~/.claude/bin/journal.sh. Ensuite seulement, termine." \
      '{decision:"block", reason:$r}'
    ;;
esac
exit 0
