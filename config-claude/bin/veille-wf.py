#!/usr/bin/env python3
"""Veille sur les workflows : detecte l'agent gele et le workflow arrete.

Seuils tires de la mesure sur 167 workflows et 1955 agents termines :
duree mediane 8 min, p90 19 min, p99 40 min. Un agent silencieux depuis plus de
25 min pendant que le workflow continue d'ecrire est au-dela de la normale.

Un agent qui se tait en meme temps que le workflow n'est pas une panne : il a ete
arrete avec lui. La moitie des orphelins observes sont de ce type.
"""
import os, json, glob, time, sys

RACINE = os.path.expanduser('~/.claude/projects')
GEL_MIN = 25      # silence d'un agent pendant que le workflow avance
ARRET_MIN = 45    # silence de tout le workflow
FENETRE_H = 24    # au-dela, un workflow n'est plus une affaire courante

def etat_workflow(dossier, maintenant):
    j = os.path.join(dossier, 'journal.jsonl')
    if not os.path.exists(j):
        return None
    lances, rendus = set(), set()
    for l in open(j, errors='replace'):
        try: r = json.loads(l)
        except Exception: continue
        if r.get('type') == 'started': lances.add(r.get('agentId'))
        elif r.get('type') == 'result': rendus.add(r.get('agentId'))
    orphelins = lances - rendus
    fichiers = glob.glob(os.path.join(dossier, '*.jsonl'))
    if not fichiers:
        return None
    dernier = max(os.path.getmtime(p) for p in fichiers)
    silence_wf = (maintenant - dernier) / 60
    if not orphelins:
        return dict(etat='terminé', wf=os.path.basename(dossier), lances=len(lances),
                    rendus=len(rendus), silence=silence_wf)
    geles = []
    for a in orphelins:
        p = os.path.join(dossier, f'agent-{a}.jsonl')
        s = (maintenant - os.path.getmtime(p)) / 60 if os.path.exists(p) else silence_wf
        if s - silence_wf >= GEL_MIN:
            geles.append((a[:9], round(s)))
    if silence_wf >= ARRET_MIN:
        etat = 'arrêté'
    elif geles:
        etat = 'agent gelé'
    else:
        etat = 'en cours'
    return dict(etat=etat, wf=os.path.basename(dossier), lances=len(lances),
                rendus=len(rendus), orphelins=len(orphelins), geles=geles, silence=silence_wf)

def veiller(projet=None, fenetre_h=FENETRE_H):
    maintenant = time.time()
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
        if e: out.append(e)
    return out

if __name__ == '__main__':
    args = sys.argv[1:]
    projet = None
    if '--projet' in args:
        projet = args[args.index('--projet') + 1]
    fen = float(args[args.index('--heures') + 1]) if '--heures' in args else FENETRE_H
    etats = veiller(projet, fen)
    problemes = [e for e in etats if e['etat'] in ('agent gelé', 'arrêté')]
    if '--court' in args:
        n_cours = sum(1 for e in etats if e['etat'] == 'en cours')
        bouts = []
        if n_cours: bouts.append(f'wf {n_cours}')
        g = sum(1 for e in problemes if e['etat'] == 'agent gelé')
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
        print(base)
    sys.exit(1 if problemes else 0)
