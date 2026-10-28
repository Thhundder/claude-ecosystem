#!/usr/bin/env python3
"""Lance un travail dans une vraie session Claude nommée « AGENT · <description> », à la place de l'outil Agent.

usage : agent-session.py "<description>" [--fork] [--dossier D] [--modele M] < consigne
        agent-session.py --etat [n]
La consigne arrive sur l'entrée standard. --fork part d'une copie de la session principale (tout son
contexte), comme un agent fork. Pour un travail long : lancer cette commande en tâche de fond (Bash
run_in_background) ; la fin arrive comme celle de n'importe quel shell.
Reprise : claude --resume "AGENT · <description>" (ou par l'identifiant affiché).
"""
import datetime
import json
import os
import subprocess
import sys
import time
import uuid

DOSSIER = os.path.expanduser('~/.claude/cache/agents-sessions')
JOURNAL = f'{DOSSIER}/journal.log'
RETIRER = ('CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN')


def noter(ligne):
    os.makedirs(DOSSIER, exist_ok=True)
    with open(JOURNAL, 'a') as f:
        f.write(f'{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {ligne}\n')


def fiche(sid, **champs):
    os.makedirs(DOSSIER, exist_ok=True)
    chemin = f'{DOSSIER}/{sid}.json'
    actuelle = json.load(open(chemin)) if os.path.exists(chemin) else {}
    actuelle.update(champs)
    with open(chemin, 'w') as f:
        json.dump(actuelle, f, ensure_ascii=False, indent=1)
    return actuelle


def memoire_go():
    for l in open('/proc/meminfo'):
        if l.startswith('MemAvailable'):
            return int(l.split()[1]) / 1024 ** 2
    return 0.0


def etat(n):
    fiches = sorted((json.load(open(f'{DOSSIER}/{f}')) for f in os.listdir(DOSSIER) if f.endswith('.json')), key=lambda x: x.get('debut', ''))[-n:] if os.path.isdir(DOSSIER) else []
    for x in fiches:
        j = x.get('jetons') or {}
        cout = f"{(j.get('lus', 0) + j.get('ecrits', 0) + j.get('entree', 0) + j.get('produits', 0)) // 1000} k jetons" if j else '—'
        print(f"{x.get('debut', '?')}  {x.get('etat', '?'):9s}  {cout:>12s}  {x['id'][:8]}  {x.get('nom', '')}")
    return 0


def lancer(description, fork, dossier, modele):
    consigne = sys.stdin.read().strip()
    if not consigne:
        print('Consigne vide : elle se donne sur l’entrée standard.', file=sys.stderr)
        return 2
    libre = memoire_go()
    if libre < 3:
        noter(f'refusé (mémoire {libre:.1f} Go) : {description}')
        print(f'Refusé : {libre:.1f} Go de mémoire libre, il en faut 3.', file=sys.stderr)
        return 3
    controle = subprocess.run([os.path.expanduser('~/.claude/bin/contrat-brief.py')], input=json.dumps({'tool_name': 'Agent', 'tool_input': {'prompt': consigne}}), capture_output=True, text=True)
    if controle.returncode != 0:
        print(f'Contrat de brief non tenu — avertissement, la session part quand même :\n{controle.stdout.strip()[:1500]}\n', file=sys.stderr)
    sid = str(uuid.uuid4())
    nom = f'AGENT · {description}'[:120]
    principale = os.environ.get('CLAUDE_CODE_SESSION_ID')
    cmd = ['claude', '-p', '-n', nom, '--session-id', sid, '--permission-mode', 'auto', '--output-format', 'json']
    if modele:
        cmd += ['--model', modele]
    if fork:
        if not principale:
            print('--fork : session principale inconnue (CLAUDE_CODE_SESSION_ID absent).', file=sys.stderr)
            return 2
        cmd += ['--resume', principale, '--fork-session']
    env = {k: v for k, v in os.environ.items() if k not in RETIRER}
    env['CLAUDE_CODE_FORCE_SESSION_PERSISTENCE'] = '1'
    debut = time.time()
    fiche(sid, id=sid, nom=nom, description=description, dossier=dossier, principale=principale, fork=fork,
          debut=datetime.datetime.now().isoformat(timespec='seconds'), etat='en cours', pid=os.getpid())
    noter(f'lancé {sid[:8]} « {nom} » fork={fork} dossier={dossier}')
    p = subprocess.run(cmd, input=consigne, cwd=dossier, env=env, capture_output=True, text=True)
    duree = round(time.time() - debut, 1)
    try:
        j = json.loads(p.stdout)
    except ValueError:
        fiche(sid, etat='échec', fin=datetime.datetime.now().isoformat(timespec='seconds'), duree_s=duree, erreur=(p.stderr or p.stdout)[:2000])
        noter(f'échec {sid[:8]} code={p.returncode} {p.stderr[:200]!r}')
        print(f'Échec de la session {sid} (code {p.returncode}) : {(p.stderr or p.stdout)[:1000]}', file=sys.stderr)
        return 1
    usage = j.get('modelUsage') or {}
    cout = round(sum(v.get('costUSD', 0) for v in usage.values()), 4)
    jetons = {k: sum(v.get(c, 0) for v in usage.values()) for k, c in (('lus', 'cacheReadInputTokens'), ('ecrits', 'cacheCreationInputTokens'), ('entree', 'inputTokens'), ('produits', 'outputTokens'))}
    resume_jetons = f"{jetons['lus'] // 1000} k lus en cache, {(jetons['ecrits'] + jetons['entree']) // 1000} k écrits, {jetons['produits'] // 1000} k produits"
    rapport = j.get('result') or ''
    sid_reel = j.get('session_id') or sid
    fiche(sid, etat='erreur' if j.get('is_error') else 'fini', fin=datetime.datetime.now().isoformat(timespec='seconds'),
          duree_s=duree, cout_usd=cout, jetons=jetons, session_reelle=sid_reel, rapport=rapport[:20000])
    noter(f'fini {sid[:8]} en {duree} s, {resume_jetons}, session {sid_reel[:8]}')
    print(f'[{nom}] session {sid_reel} · {duree} s · {resume_jetons} · reprise : claude --resume {sid_reel}\n')
    print(rapport)
    return 0


def main(args):
    if args[:1] == ['--etat']:
        return etat(int(args[1]) if len(args) > 1 else 15)
    if not args or args[0].startswith('-'):
        print(__doc__, file=sys.stderr)
        return 2
    description, reste = args[0], args[1:]
    fork = '--fork' in reste
    dossier = reste[reste.index('--dossier') + 1] if '--dossier' in reste else os.getcwd()
    modele = reste[reste.index('--modele') + 1] if '--modele' in reste else None
    if modele and any(m in modele.lower() for m in ('sonnet', 'haiku')):
        noter(f'refusé (modèle {modele}) : {description}')
        print(f'Refusé : modèle « {modele} ». Un agent tourne sur le même modèle que la session '
              '(une session Fable peut lancer ses agents sur Opus), jamais Sonnet ni Haiku. '
              'Relancer sans --modele.', file=sys.stderr)
        return 2
    return lancer(description, fork, os.path.abspath(dossier), modele)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
