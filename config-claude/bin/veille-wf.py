#!/usr/bin/env python3
"""Veille sur les workflows et les agents seuls : detecte l'agent gele, le workflow
arrete, et l'agent lance seul qui ne repond plus.

Seuils tires de la mesure sur 167 workflows et 1955 agents termines :
duree mediane 8 min, p90 19 min, p99 40 min. Un agent silencieux depuis plus de
25 min pendant que le workflow continue d'ecrire est au-dela de la normale ; un agent
seul l'est quand la session qui l'a lance a continue d'ecrire 25 min apres lui.

Un agent qui se tait en meme temps que le workflow n'est pas une panne : il a ete
arrete avec lui. La moitie des orphelins observes sont de ce type.

Un workflow repris relance ses agents sous de nouveaux identifiants, avec la meme cle :
un agent dont la cle a rendu un resultat n'est pas orphelin, et un workflow dont l'etat
final est « completed » est termine (cas du 27/09, wf_d75bdf5d-c07).
"""
import os, json, glob, time, sys

RACINE = os.path.expanduser('~/.claude/projects')
GEL_MIN = 25      # silence d'un agent pendant que le workflow, ou la session, avance
ARRET_MIN = 45    # silence de tout le workflow
FENETRE_H = 24    # au-dela, un workflow n'est plus une affaire courante
TERMINAUX = {'completed', 'killed', 'failed'}


def statut_final(dossier):
    session = os.path.dirname(os.path.dirname(os.path.dirname(dossier)))
    try:
        with open(os.path.join(session, 'workflows', os.path.basename(dossier) + '.json')) as f:
            return json.load(f).get('status')
    except (OSError, ValueError):
        return None


def etat_workflow(dossier, maintenant):
    j = os.path.join(dossier, 'journal.jsonl')
    if not os.path.exists(j):
        return None
    lances, rendus, cles_rendues, cle_de = set(), set(), set(), {}
    for l in open(j, errors='replace'):
        try: r = json.loads(l)
        except Exception: continue
        if r.get('type') == 'started':
            lances.add(r.get('agentId')); cle_de[r.get('agentId')] = r.get('key')
        elif r.get('type') == 'result':
            rendus.add(r.get('agentId')); cles_rendues.add(r.get('key'))
    orphelins = {a for a in lances - rendus if not (cle_de.get(a) and cle_de[a] in cles_rendues)}
    fichiers = glob.glob(os.path.join(dossier, '*.jsonl'))
    if not fichiers:
        return None
    dernier = max(os.path.getmtime(p) for p in fichiers)
    silence_wf = (maintenant - dernier) / 60
    statut = statut_final(dossier)
    base = dict(wf=os.path.basename(dossier), lances=len(lances), rendus=len(rendus), silence=silence_wf)
    if not orphelins or statut == 'completed':
        return dict(base, etat='terminé')
    geles = []
    for a in orphelins:
        p = os.path.join(dossier, f'agent-{a}.jsonl')
        s = (maintenant - os.path.getmtime(p)) / 60 if os.path.exists(p) else silence_wf
        if s - silence_wf >= GEL_MIN:
            geles.append((a[:9], round(s)))
    if statut in TERMINAUX or silence_wf >= ARRET_MIN:
        etat = 'arrêté'
    elif geles:
        etat = 'agent gelé'
    else:
        etat = 'en cours'
    return dict(base, etat=etat, orphelins=len(orphelins), geles=geles)


def fini(chemin):
    """Un agent a fini quand sa derniere reponse s'arrete d'elle-meme, sans outil en attente."""
    try:
        with open(chemin, 'rb') as f:
            f.seek(0, os.SEEK_END); f.seek(max(0, f.tell() - 65536))
            lignes = f.read().splitlines()
    except OSError:
        return False
    for l in reversed(lignes):
        try: r = json.loads(l)
        except ValueError: continue
        if r.get('type') != 'assistant':
            continue
        return (r.get('message') or {}).get('stop_reason') in ('end_turn', 'stop_sequence')
    return False


def agents_seuls(projet, session, maintenant, fenetre_h):
    out = []
    for p in glob.glob(f'{RACINE}/*/*/subagents/agent-*.jsonl'):
        sess_dir = os.path.dirname(os.path.dirname(p))
        if projet and f'/{projet}/' not in p:
            continue
        if session and os.path.basename(sess_dir) != session:
            continue
        try:
            m_agent = os.path.getmtime(p)
            m_session = os.path.getmtime(sess_dir + '.jsonl')
        except OSError:
            continue
        if (maintenant - m_agent) / 3600 > fenetre_h or fini(p):
            continue
        silence = (maintenant - m_agent) / 60
        if silence >= GEL_MIN and (m_session - m_agent) / 60 >= GEL_MIN:
            agent = os.path.basename(p)[len('agent-'):-len('.jsonl')]
            out.append(dict(etat='agent seul muet', wf=f'agent {agent[:9]}', agent=agent,
                            silence=silence, lances=1, rendus=0))
    return out


CLOS = os.path.expanduser('~/.claude/.veille-clos')

def deja_traites():
    """Un vol dont on a constate et consigne l'issue ne doit plus reveiller.
    Sans cela l'alerte se repete a chaque tour et finit par etre ignoree —
    y compris le jour ou elle dit vrai."""
    try:
        with open(CLOS) as f:
            return {l.strip() for l in f if l.strip() and not l.startswith('#')}
    except OSError:
        return set()

def veiller(projet=None, fenetre_h=FENETRE_H, session=None):
    maintenant = time.time()
    tus = deja_traites()
    motif = f'{RACINE}/*/*/subagents/workflows/wf_*'
    out = []
    for d in glob.glob(motif):
        if projet and f'/{projet}/' not in d + '/':
            continue
        try:
            if (maintenant - os.path.getmtime(d)) / 3600 > fenetre_h:
                continue
        except OSError:
            continue
        e = etat_workflow(d, maintenant)
        if e and e['wf'] not in tus: out.append(e)
    out += [e for e in agents_seuls(projet, session, maintenant, fenetre_h) if e['agent'] not in tus]
    return out


def cles(e):
    """Une cle par anomalie, stable d'un appel a l'autre : la veille ne la signale qu'une fois."""
    if e['etat'] == 'agent gelé':
        return [f"{e['wf']}:gel:{a}" for a, _ in e['geles']]
    return [f"{e['wf']}:{e['etat']}"]


if __name__ == '__main__':
    args = sys.argv[1:]
    projet = args[args.index('--projet') + 1] if '--projet' in args else None
    session = args[args.index('--session') + 1] if '--session' in args else None
    fen = float(args[args.index('--heures') + 1]) if '--heures' in args else FENETRE_H
    etats = veiller(projet, fen, session)
    PROBLEMES = ('agent gelé', 'arrêté', 'agent seul muet')
    problemes = [e for e in etats if e['etat'] in PROBLEMES]
    if '--court' in args:
        n_cours = sum(1 for e in etats if e['etat'] == 'en cours')
        bouts = []
        if n_cours: bouts.append(f'wf {n_cours}')
        g = sum(1 for e in problemes if e['etat'] in ('agent gelé', 'agent seul muet'))
        a = sum(1 for e in problemes if e['etat'] == 'arrêté')
        if g: bouts.append(f'{g} gelé' + ('s' if g > 1 else ''))
        if a: bouts.append(f'{a} arrêté' + ('s' if a > 1 else ''))
        print(' · '.join(bouts), end='')
        sys.exit(0)
    if not etats:
        print('aucun workflow dans la fenêtre'); sys.exit(0)
    for e in sorted(etats, key=lambda x: x['silence']):
        base = f"{e['wf']:<20} {e['etat']:<11} {e['rendus']}/{e['lances']} rendus"
        if e['etat'] == 'agent gelé':
            base += '  — ' + ', '.join(f'{a} muet depuis {m} min' for a, m in e['geles'])
        elif e['etat'] == 'arrêté':
            base += f"  — {e['orphelins']} agent(s) sans résultat, plus rien depuis {e['silence']:.0f} min"
        elif e['etat'] == 'agent seul muet':
            base = f"{e['wf']:<20} {e['etat']:<11} — plus rien depuis {e['silence']:.0f} min, la session continue sans lui"
        if '--cles' in args:
            base = ' '.join(cles(e)) + '\t' + base
        print(base)
    sys.exit(1 if problemes else 0)
