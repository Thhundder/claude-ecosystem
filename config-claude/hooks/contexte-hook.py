#!/usr/bin/env python3
# UserPromptSubmit -> avertit quand le contexte de la session principale devient lourd.
# Seuils fondés sur la lenteur et le coût, pas sur la qualité : aucun seuil de qualité
# n'a été établi. Mesures : ~/Documents/claude-ecosystem/evan/seuil-degradation-2026-09-27.md
import json
import os
import re
import sys

SEUIL = 600_000
TRANCHE = 100_000
BLOC = 1 << 16
LECTURE_MAX = 32 << 20
ETAT = os.path.expanduser("~/.claude/cache/contexte")


def contexte(ligne):
    if b'"assistant"' not in ligne or b'"usage"' not in ligne:
        return None
    try:
        d = json.loads(ligne)
    except ValueError:
        return None
    if d.get("type") != "assistant" or d.get("isSidechain"):
        return None
    u = (d.get("message") or {}).get("usage")
    if not u:
        return None
    return (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0)


def dernier_contexte(chemin):
    with open(chemin, "rb") as f:
        f.seek(0, os.SEEK_END)
        pos = f.tell()
        reste = b""
        lu = 0
        while pos > 0 and lu < LECTURE_MAX:
            n = min(BLOC, pos)
            pos -= n
            f.seek(pos)
            morceau = f.read(n) + reste
            lu += n
            lignes = morceau.split(b"\n")
            reste = lignes[0] if pos > 0 else b""
            for ligne in reversed(lignes[1:] if pos > 0 else lignes):
                c = contexte(ligne)
                if c is not None:
                    return c
    return None


def message(k):
    evan = (f"Session à {k} k jetons de contexte : au-delà de 600 k, chaque réponse prend en médiane 9,9 s "
            f"et relit tout ce contexte. Change de session ; Claude met le journal à jour pour la reprise.")
    modele = (f"Le contexte de cette session atteint {k} k jetons (seuil d'avertissement : 600 k, rappel tous les 100 k). "
              f"Ce seuil repose sur la lenteur et le coût mesurés, pas sur une baisse de qualité, qui n'a pas été établie. "
              f"Avant de traiter la demande, ou juste après si elle est courte : mets à jour evan/JOURNAL.md, section "
              f"« Où j'en suis » (Chantier, Situation, Prochaine action), de sorte qu'une session neuve reprenne sans relire "
              f"celle-ci, puis régénère le bloc d'état avec ~/.claude/bin/journal.sh. Termine ta réponse en proposant à Evan "
              f"d'ouvrir une nouvelle session.")
    return evan, modele


def main():
    entree = json.load(sys.stdin)
    chemin = entree.get("transcript_path") or ""
    sid = re.sub(r"[^A-Za-z0-9_-]", "", entree.get("session_id") or "")
    if not sid or not os.path.isfile(chemin):
        return
    c = dernier_contexte(chemin)
    if c is None:
        return
    tranche = c // TRANCHE if c >= SEUIL else 0
    fichier = os.path.join(ETAT, sid)
    try:
        with open(fichier) as f:
            deja = int(f.read().strip() or 0)
    except (OSError, ValueError):
        deja = 0
    if tranche == deja:
        return
    os.makedirs(ETAT, exist_ok=True)
    with open(fichier, "w") as f:
        f.write(str(tranche))
    if tranche < deja:
        return
    evan, modele = message(c // 1000)
    print(json.dumps({
        "systemMessage": evan,
        "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": modele},
    }, ensure_ascii=False))


try:
    main()
except Exception:
    pass
sys.exit(0)
