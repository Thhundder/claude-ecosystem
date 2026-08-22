#!/usr/bin/env python3
"""Substitution dans un fichier, qui ECHOUE BRUYAMMENT si le motif n'est pas trouve.

Une substitution silencieusement inappliquee est le defaut le plus courant de
l'edition par motif : le fichier garde son ancien contenu, la commande sort en
succes, et on annonce un correctif qui n'existe pas. C'est arrive trois fois
dans la seule journee du 22 aout.

usage: remplacer.py <fichier> <ancien> <nouveau> [--fois N]
       remplacer.py <fichier> --verifie <motif attendu> [...]
"""
import sys, os

def main():
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__.strip(), file=sys.stderr); return 2
    chemin = os.path.expanduser(a[0])
    try:
        s = open(chemin, encoding='utf-8').read()
    except OSError as e:
        print(f"illisible : {e}", file=sys.stderr); return 1

    if a[1] == '--verifie':
        manquants = [m for m in a[2:] if m not in s]
        for m in a[2:]:
            print(f"  {'présent' if m in s else 'ABSENT ':<9} {m[:64]}")
        return 1 if manquants else 0

    ancien, nouveau = a[1], a[2]
    attendu = 1
    if '--fois' in a:
        attendu = int(a[a.index('--fois') + 1])
    n = s.count(ancien)
    if n != attendu:
        print(f"ÉCHEC : motif trouvé {n} fois, attendu {attendu} — rien n'a été écrit.\n"
              f"  fichier : {chemin}\n  motif   : {ancien[:100]}", file=sys.stderr)
        return 1
    open(chemin, 'w', encoding='utf-8').write(s.replace(ancien, nouveau))
    verif = open(chemin, encoding='utf-8').read()
    if nouveau and nouveau not in verif:
        print("ÉCHEC : écrit, mais le nouveau texte est introuvable à la relecture", file=sys.stderr)
        return 1
    print(f"appliqué {attendu}× · {os.path.basename(chemin)}")
    return 0

sys.exit(main())
