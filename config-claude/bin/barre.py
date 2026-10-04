#!/usr/bin/env python3
"""Ligne du haut de la barre : modèle, session, état du fil principal, shells en cours.

L'entrée de la barre ne dit ni si Claude travaille ni quels outils tournent : tout se lit
dans le transcript. Il peut dépasser 90 Mo et la barre tourne toutes les 2 s, d'où une
lecture incrémentale dont l'état est gardé par session dans ~/.claude/cache/barre/.
"""
import json
import os
import re
import sys
from datetime import datetime

CACHE = os.path.expanduser('~/.claude/cache/barre')
LANCE_EN_FOND = ('Command running in background with ID', 'Async agent launched', 'Workflow launched in background')
ID_NOTIFIE = re.compile(r'<tool-use-id>([^<]+)</tool-use-id>')
RUN = re.compile(r'Run ID: (wf_[\w-]+)')
DOSSIER_RUN = re.compile(r'Transcript dir: (\S+)')


def debut_claude():
    pid = os.getppid()
    while pid > 1:
        try:
            with open(f'/proc/{pid}/cmdline', 'rb') as f:
                argv0 = f.read().split(b'\0')[0]
            with open(f'/proc/{pid}/stat') as f:
                champs = f.read().rsplit(')', 1)[1].split()
        except OSError:
            return 0
        if os.path.basename(argv0) == b'claude':
            with open('/proc/stat') as f:
                btime = next(int(l.split()[1]) for l in f if l.startswith('btime'))
            return btime + int(champs[19]) / os.sysconf('SC_CLK_TCK')
        pid = int(champs[1])
    return 0


def epoque(horodatage):
    try:
        return datetime.fromisoformat(horodatage.replace('Z', '+00:00')).timestamp()
    except (AttributeError, ValueError):
        return 0


def etat_vierge():
    return {'offset': 0, 'attente': False, 'premier_plan': {}, 'fond': {}}


def charger(sid):
    try:
        with open(os.path.join(CACHE, sid + '.json')) as f:
            return json.load(f)
    except (OSError, ValueError):
        return etat_vierge()


def sauver(sid, etat):
    os.makedirs(CACHE, exist_ok=True)
    tmp = os.path.join(CACHE, sid + '.tmp')
    with open(tmp, 'w') as f:
        json.dump(etat, f)
    os.replace(tmp, os.path.join(CACHE, sid + '.json'))


def texte(contenu):
    if isinstance(contenu, str):
        return contenu
    if isinstance(contenu, list):
        return ' '.join(b.get('text', '') for b in contenu if isinstance(b, dict))
    return ''


def lire_assistant(etat, message, quand):
    for bloc in message.get('content') or []:
        if bloc.get('type') == 'tool_use':
            entree = bloc.get('input') or {}
            etat['premier_plan'][bloc['id']] = {'outil': bloc.get('name'), 'nom': entree.get('description') or bloc.get('name'), 'quand': quand}
    etat['attente'] = message.get('stop_reason') == 'end_turn'


def lire_utilisateur(etat, message):
    contenu = message.get('content')
    if isinstance(contenu, list) and any(b.get('type') == 'tool_result' for b in contenu if isinstance(b, dict)):
        for bloc in contenu:
            if bloc.get('type') != 'tool_result':
                continue
            outil = etat['premier_plan'].pop(bloc.get('tool_use_id'), None)
            corps = texte(bloc.get('content'))
            if outil and corps.startswith(LANCE_EN_FOND):
                run, dossier = RUN.search(corps), DOSSIER_RUN.search(corps)
                if run and dossier:
                    outil['run'], outil['dossier'] = run.group(1), dossier.group(1)
                etat['fond'][bloc['tool_use_id']] = outil
        etat['attente'] = False
        return
    corps = texte(contenu)
    if '[Request interrupted by user' in corps:
        etat['premier_plan'].clear()
        etat['attente'] = True
    else:
        etat['attente'] = False


def avancer(etat, chemin):
    with open(chemin, 'rb') as f:
        f.seek(etat['offset'])
        bloc = f.read()
    fin = bloc.rfind(b'\n') + 1
    for ligne in bloc[:fin].splitlines():
        try:
            j = json.loads(ligne)
        except ValueError:
            continue
        if b'<task-notification>' in ligne:
            for ident in ID_NOTIFIE.findall(ligne.decode('utf-8', 'replace')):
                etat['fond'].pop(ident, None)
        if j.get('isSidechain') or not isinstance(j.get('message'), dict):
            continue
        if j.get('type') == 'assistant':
            lire_assistant(etat, j['message'], epoque(j.get('timestamp')))
        elif j.get('type') == 'user':
            lire_utilisateur(etat, j['message'])
    etat['offset'] += fin


def workflow_vivant(outil):
    if 'run' not in outil:
        return True
    journal = os.path.join(outil['dossier'], 'journal.jsonl')
    bilan = os.path.join(outil['dossier'].split('/subagents/')[0], 'workflows', outil['run'] + '.json')
    try:
        return not os.path.exists(bilan) or os.path.getmtime(journal) > os.path.getmtime(bilan)
    except OSError:
        return False


def etat_session(sid, chemin):
    etat = charger(sid)
    if os.path.getsize(chemin) < etat['offset']:
        etat = etat_vierge()
    avancer(etat, chemin)
    debut = debut_claude()
    for cle in ('premier_plan', 'fond'):
        etat[cle] = {k: v for k, v in etat[cle].items() if v.get('quand', 0) >= debut and workflow_vivant(v)}
    sauver(sid, etat)
    return etat


def rendu(entree):
    modele = (entree.get('model') or {}).get('display_name') or ''
    sid = entree.get('session_id') or ''
    chemin = entree.get('transcript_path') or ''
    tete = [modele, f'session {sid[:8]}' if sid else '']
    if not (sid and os.path.isfile(chemin)):
        return ' · '.join(filter(None, tete))
    etat = etat_session(sid, chemin)
    en_fond = bool(etat['fond'])
    if etat['attente']:
        tete.append('○ en attente de toi' + (' · ● en cours' if en_fond else ''))
    else:
        tete.append('● en cours')
    shells = [o['nom'] for o in list(etat['premier_plan'].values()) + list(etat['fond'].values()) if o['outil'] == 'Bash']
    return '\n'.join([' · '.join(filter(None, tete))] + [f'S ● {nom}' for nom in shells])


def main():
    try:
        entree = json.load(sys.stdin)
    except ValueError:
        entree = {}
    try:
        print(rendu(entree))
    except OSError:
        print((entree.get('model') or {}).get('display_name') or '')


if __name__ == '__main__':
    main()
