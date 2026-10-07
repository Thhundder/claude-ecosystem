#!/usr/bin/env python3
"""Veilleur mémoire, hors de Claude (service utilisateur veilleur-memoire.service).

Pourquoi : le 07/10 à 20h54, le gardien du système (systemd-oomd) a tué tout le bureau quand
la pression mémoire a dépassé 50 %. Le veilleur agit avant lui : sous SEUIL disponible, ou
pression au-dessus de PRESSION, il arrête un programme à la fois dans l'ordre de memoire.py
(émulateur, démons de compilation, serveurs de dev, navigateurs de test, conteneurs tess-*),
jusqu'à repasser au-dessus de REPRISE. Jamais : bureau, Chrome d'Evan, sessions Claude,
robots crypto. Chaque arrêt : notification à l'écran et ligne au journal.

Usage : veilleur-memoire.py [--essai] [--une-fois] [--seuil GO] [--reprise GO]
  --essai : dit ce qu'il ferait, n'arrête rien.
Journal : ~/.claude/cache/memoire/veilleur.log
"""
import datetime
import os
import signal
import subprocess
import sys
import time

sys.path.insert(0, os.path.expanduser('~/.claude/bin'))
import memoire  # noqa: E402

GO = memoire.GO
JOURNAL = os.path.expanduser('~/.claude/cache/memoire/veilleur.log')
PAS = 5
PRESSION = 30.0


def option(nom, defaut):
    return float(sys.argv[sys.argv.index(nom) + 1]) if nom in sys.argv else defaut


SEUIL = option('--seuil', 1.5) * GO
REPRISE = option('--reprise', 3.0) * GO
ESSAI = '--essai' in sys.argv


def journal(ligne):
    os.makedirs(os.path.dirname(JOURNAL), exist_ok=True)
    with open(JOURNAL, 'a') as f:
        f.write(f'{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {ligne}\n')


def notifier(texte):
    try:
        subprocess.run(['notify-send', '-u', 'critical', '-a', 'Veilleur mémoire', 'Mémoire pleine', texte],
                       timeout=5, capture_output=True)
    except (OSError, subprocess.TimeoutExpired):
        pass


def arreter(c):
    if c['pid'] is None:
        subprocess.run(['docker', 'stop', '-t', '10', c['nom']], capture_output=True, timeout=30)
        return
    try:
        os.kill(c['pid'], signal.SIGTERM)
        for _ in range(10):
            time.sleep(0.5)
            os.kill(c['pid'], 0)
        os.kill(c['pid'], signal.SIGKILL)
    except ProcessLookupError:
        pass


def en_danger():
    return memoire.disponible() < SEUIL or memoire.pression() > PRESSION


def tour():
    if not en_danger():
        return False
    dispo, press = memoire.disponible(), memoire.pression()
    liste = memoire.candidats()
    journal(f'DANGER dispo={dispo / GO:.1f}Go pression={press:.0f}% candidats={len(liste)}')
    if not liste:
        notifier(f'{dispo / GO:.1f} Go disponibles et rien d\'arrêtable automatiquement : ferme quelque chose.')
        return True
    for c in liste:
        quoi = f"{c['nature']} {c['nom']}" + (f" (pid {c['pid']})" if c['pid'] else '')
        if ESSAI:
            print(f'arrêterait : {quoi} — {c["octets"] / GO:.1f} Go')
            continue
        arreter(c)
        journal(f'ARRET {quoi} {c["octets"] / GO:.1f}Go')
        notifier(f'Arrêté pour sauver la session : {quoi}, {c["octets"] / GO:.1f} Go.')
        time.sleep(2)
        if memoire.disponible() >= REPRISE and memoire.pression() <= PRESSION:
            break
    journal(f'FIN dispo={memoire.disponible() / GO:.1f}Go')
    return True


if __name__ == '__main__':
    journal(f'DEBUT seuil={SEUIL / GO:.1f}Go reprise={REPRISE / GO:.1f}Go essai={ESSAI}')
    if '--une-fois' in sys.argv:
        tour()
        sys.exit(0)
    while True:
        try:
            if tour():
                time.sleep(15)
        except Exception as erreur:
            journal(f'ERREUR {type(erreur).__name__}: {erreur}')
        time.sleep(PAS)
