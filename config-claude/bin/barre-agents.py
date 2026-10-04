#!/usr/bin/env python3
"""Lignes du panneau des agents : « A ● nom · jetons », « A ◌ » quand l'agent ne consomme
plus rien depuis PAUSE secondes ; un agent qui n'est plus en cours est masqué.

Un tokenCount figé ne se voit qu'entre deux appels : il est gardé par tâche dans
~/.claude/cache/barre/agents.json.
"""
import json
import os
import sys
import time

ETAT = os.path.expanduser('~/.claude/cache/barre/agents.json')
PAUSE = 300


def charger():
    try:
        with open(ETAT) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def sauver(vus):
    os.makedirs(os.path.dirname(ETAT), exist_ok=True)
    tmp = ETAT + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(vus, f)
    os.replace(tmp, ETAT)


def jetons(n):
    return f'{round(n / 1000)} k' if n >= 1000 else str(n)


def ligne(tache, vus, maintenant):
    if tache.get('status') != 'running':
        return ''
    n = tache.get('tokenCount') or 0
    avant = vus.get(tache['id'])
    if not avant or avant['jetons'] != n:
        vus[tache['id']] = {'jetons': n, 'depuis': maintenant}
    signe = '◌' if maintenant - vus[tache['id']]['depuis'] >= PAUSE else '●'
    nom = tache.get('description') or tache.get('label') or tache.get('name') or 'agent'
    return f'A {signe} {nom} · {jetons(n)}'


def main():
    try:
        taches = json.load(sys.stdin).get('tasks') or []
    except ValueError:
        return
    vus, maintenant = charger(), time.time()
    lignes = [{'id': t['id'], 'content': ligne(t, vus, maintenant)} for t in taches if t.get('id')]
    ids = {t.get('id') for t in taches}
    sauver({k: v for k, v in vus.items() if k in ids})
    for l in lignes:
        print(json.dumps(l, ensure_ascii=False))


if __name__ == '__main__':
    main()
