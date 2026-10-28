#!/usr/bin/env python3
"""Barre : modèle, session, shells et tâches en cours (--parties les donne au mod ecran).

Le transcript sert à nommer les shells, agents et workflows en cours. Il peut dépasser 90 Mo
et la barre tourne toutes les 2 s, d'où une lecture incrémentale dont l'état est gardé par
session dans ~/.claude/cache/barre/. Plus aucun signe d'état ni dans la barre ni dans le titre
d'onglet (27/10) ; --fin remet le titre de l'onglet tel que le terminal le fait.
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime

CACHE = os.path.expanduser('~/.claude/cache/barre')
LANCE_EN_FOND = ('Command running in background with ID', 'Async agent launched', 'Workflow launched in background')
ID_NOTIFIE = re.compile(r'<tool-use-id>([^<]+)</tool-use-id>')
RUN = re.compile(r'Run ID: (wf_[\w-]+)')
DOSSIER_RUN = re.compile(r'Transcript dir: (\S+)')
QUESTION = re.compile(r'\*\*Questions?\*\*|\?\s*$', re.M)
FORMAT_ONGLET = '%d : %n'


def processus_claude():
    pid = os.getppid()
    while pid > 1:
        try:
            with open(f'/proc/{pid}/cmdline', 'rb') as f:
                argv0 = f.read().split(b'\0')[0]
            with open(f'/proc/{pid}/stat') as f:
                champs = f.read().rsplit(')', 1)[1].split()
        except OSError:
            return 0, 0
        if os.path.basename(argv0) == b'claude':
            with open('/proc/stat') as f:
                btime = next(int(l.split()[1]) for l in f if l.startswith('btime'))
            return pid, btime + int(champs[19]) / os.sysconf('SC_CLK_TCK')
        pid = int(champs[1])
    return 0, 0


def epoque(horodatage):
    try:
        return datetime.fromisoformat(horodatage.replace('Z', '+00:00')).timestamp()
    except (AttributeError, ValueError):
        return 0


def etat_vierge():
    return {'offset': 0, 'attente': False, 'premier_plan': {}, 'fond': {}, 'question': False, 'signe': ''}


def charger(sid):
    try:
        with open(os.path.join(CACHE, sid + '.json')) as f:
            return json.load(f)
    except (OSError, ValueError):
        return etat_vierge()


def sauver(sid, etat):
    os.makedirs(CACHE, exist_ok=True)
    tmp = os.path.join(CACHE, f'{sid}.{os.getpid()}.tmp')
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
    corps = ' '.join(b.get('text', '') for b in message.get('content') or [] if b.get('type') == 'text').strip()
    if corps:
        etat['question'] = bool(QUESTION.search(corps[-1500:]))
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
    if '<task-notification>' not in corps and '<agent-message' not in corps:
        etat['question'] = False
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
    _, debut = processus_claude()
    for cle in ('premier_plan', 'fond'):
        etat[cle] = {k: v for k, v in etat[cle].items() if v.get('quand', 0) >= debut and workflow_vivant(v)}
    sauver(sid, etat)
    return etat


def onglet(signe):
    service, session = os.environ.get('KONSOLE_DBUS_SERVICE'), os.environ.get('KONSOLE_DBUS_SESSION')
    ecoute, fenetre = os.environ.get('KITTY_LISTEN_ON'), os.environ.get('KITTY_WINDOW_ID')
    if ecoute and fenetre and os.environ.get('TERM') == 'xterm-kitty':
        titre = f'{signe} {os.path.basename(os.getcwd())} : claude' if signe else ''
        commande = ['kitten', '@', '--to', ecoute, 'set-tab-title', '--match', f'window_id:{fenetre}', titre]
    elif service and session:
        format_onglet = f'{signe} {FORMAT_ONGLET}' if signe else FORMAT_ONGLET
        commande = ['qdbus', service, session, 'setTabTitleFormat', '0', format_onglet]
    else:
        return
    try:
        subprocess.run(commande, timeout=1, capture_output=True)
    except (OSError, subprocess.SubprocessError):
        pass


BLEU, ARDOISE = '#8FB3D9', '#B5AFA3'


def transcript(sid):
    racine = os.path.expanduser('~/.claude/projects')
    for dossier in os.listdir(racine) if sid and os.path.isdir(racine) else []:
        chemin = os.path.join(racine, dossier, f'{sid}.jsonl')
        if os.path.isfile(chemin):
            return chemin
    return ''


def parties(entree):
    modele = (entree.get('model') or {}).get('display_name') or ''
    sid = entree.get('session_id') or ''
    chemin = entree.get('transcript_path') or transcript(sid)
    tete = [(t, c) for t, c in [(modele, BLEU), (f'session {sid[:8]}' if sid else '', ARDOISE)] if t]
    if not (sid and os.path.isfile(chemin)):
        return tete, [], []
    etat = etat_session(sid, chemin)
    # Plus de signe d'état (27/10) : un titre d'onglet qui en porte encore un d'avant est remis une fois.
    if etat.get('signe'):
        onglet('')
        etat['signe'] = ''
        sauver(sid, etat)
    shells = [o['nom'] for o in list(etat['premier_plan'].values()) + list(etat['fond'].values()) if o['outil'] == 'Bash']
    return tete, [(f'S ● {nom}', ARDOISE) for nom in shells], encours(etat)


SORTES = {'Bash': 'shell', 'Agent': 'agent', 'Task': 'agent', 'Workflow': 'workflow'}


def encours(etat):
    maintenant = datetime.now().timestamp()
    taches = list(etat['premier_plan'].values()) + list(etat['fond'].values())
    return [[SORTES[o['outil']], o['nom'], max(0, round(maintenant - o.get('quand', maintenant)))] for o in taches if o.get('outil') in SORTES]


def teinte(texte, couleur):
    r, v, b = (int(couleur[k:k + 2], 16) for k in (1, 3, 5))
    return f'\033[38;2;{r};{v};{b}m{texte}\033[0m'


def rendu(entree):
    tete, shells, _ = parties(entree)
    return '\n'.join([teinte(' · ', ARDOISE).join(teinte(*p) for p in tete)] + [teinte(*p) for p in shells])


def main():
    if sys.argv[1:] == ['--fin']:
        onglet('')
        return
    try:
        entree = json.load(sys.stdin)
    except ValueError:
        entree = {}
    if sys.argv[1:] == ['--parties']:
        tete, shells, taches = parties(entree)
        print(json.dumps({'tete': tete, 'shells': shells, 'encours': taches}, ensure_ascii=False))
        return
    try:
        print(rendu(entree))
    except OSError:
        print((entree.get('model') or {}).get('display_name') or '')


if __name__ == '__main__':
    main()
