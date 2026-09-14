#!/usr/bin/env python3
"""Recompose une session Claude Code en Markdown : demandé, exécuté, répondu, tour par tour.

Matière de /reprendre et de l'audit « demandé contre livré, mesuré contre exécuté ».
Le transcript brut mêle résultats d'outils, rappels système et résumés de compactage ;
on ne garde que ce que l'utilisateur a tapé, les appels d'outils de Claude et son dernier
texte à chaque tour, puis on relève ses rétractations. Le filtrage des demandes suit
evan/motifs-conversations-2026-09-14.extraire.py, à l'identique.

usage: session.py <id|préfixe> [--projet <dossier>] [--sortie <fichier>]
       session.py derniere [--exclure <id courant>] [--projet <dossier>] [--sortie <fichier>]
codes: 0 écrit ; 2 session introuvable ou ambiguë (candidats sur stderr)
"""
import glob
import json
import os
import re
import sys
import unicodedata

RACINE = os.path.expanduser('~/.claude/projects')
PLAFOND = 400_000
BRUIT = re.compile(r'<system-reminder>.*?</system-reminder>', re.S)
COMMANDE = re.compile(r'<(local-command-stdout|local-command-caveat|command-name|command-message|command-args)>', re.S)
RETRACTATIONS = [re.compile(r"(?<!\w)(je retire|j'ai eu tort|c'etait faux|a tort|je me suis trompe)(?!\w)"),
                 re.compile(r'(?<!\w)(retract|faux —)')]
FIN_PHRASE = re.compile(r'[.!?]\s|\n')


def texte(message):
    contenu = message.get('content')
    if isinstance(contenu, str):
        return contenu
    return '\n'.join(b['text'] for b in contenu or [] if isinstance(b, dict) and b.get('type') == 'text')


def demande(evenement):
    if evenement.get('isMeta'):
        return None
    t = texte(evenement.get('message', {}))
    if not t or COMMANDE.search(t):
        return None
    t = BRUIT.sub('', t).strip()
    if not t or t.startswith('[Request interrupted') or t.startswith('Base directory for this skill'):
        return None
    if t.startswith('This session is being continued') or '<task-notification>' in t or t.startswith('<task-notification'):
        return None
    if len(t) > 3000:
        t = t[:2200] + '\n[… %d caractères coupés …]\n' % (len(t) - 2800) + t[-600:]
    return t


def est_resume(evenement):
    if evenement.get('isCompactSummary'):
        return True
    return texte(evenement.get('message', {})).startswith('This session is being continued')


def chemin_court(p):
    maison = os.path.expanduser('~')
    return '~' + p[len(maison):] if isinstance(p, str) and p.startswith(maison) else str(p)


def libelle(bloc, largeur_bash):
    nom, entree = bloc.get('name', '?'), bloc.get('input') or {}
    if nom == 'Bash':
        commande = str(entree.get('command', '')).strip().splitlines() or ['']
        return f'`{commande[0][:largeur_bash]}`'
    if nom in ('Edit', 'Write', 'Read', 'NotebookEdit'):
        return f'{nom} {chemin_court(entree.get("file_path") or entree.get("notebook_path", ""))}'
    if nom in ('Agent', 'Workflow'):
        for cle in ('description', 'label', 'name', 'prompt', 'script'):
            if entree.get(cle):
                return f'{nom} « {str(entree[cle])[:80].replace(chr(10), " ")} »'
    return nom


def outils_compacts(blocs, largeur_bash):
    lignes = []
    for b in blocs:
        l = libelle(b, largeur_bash)
        if lignes and lignes[-1][0] == l and b.get('name') not in ('Bash', 'Edit', 'Write', 'Read'):
            lignes[-1][1] += 1
        else:
            lignes.append([l, 1])
    return [l if n == 1 else f'{l} ×{n}' for l, n in lignes]


def lire_tours(chemin):
    tours, compteurs = [], {'outils': 0, 'Agent': 0, 'Workflow': 0, 'resumes': 0, 'debut': '', 'fin': ''}
    courant = None
    for ligne in open(chemin, encoding='utf-8', errors='replace'):
        try:
            e = json.loads(ligne)
        except ValueError:
            continue
        if e.get('isSidechain') or e.get('type') not in ('user', 'assistant'):
            continue
        ts = e.get('timestamp', '')
        compteurs['debut'] = compteurs['debut'] or ts
        compteurs['fin'] = ts or compteurs['fin']
        if e['type'] == 'user':
            if est_resume(e):
                compteurs['resumes'] += 1
                if courant:
                    courant['resume'] = True
                continue
            t = demande(e)
            if t is None:
                continue
            courant = {'n': len(tours) + 1, 'ts': ts, 'demande': t, 'outils': [], 'textes': [], 'resume': False}
            tours.append(courant)
            continue
        if courant is None:
            continue
        for b in e.get('message', {}).get('content') or []:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'tool_use':
                courant['outils'].append(b)
                compteurs['outils'] += 1
                if b.get('name') in ('Agent', 'Workflow'):
                    compteurs[b['name']] += 1
            elif b.get('type') == 'text' and b.get('text', '').strip():
                courant['textes'].append(b['text'].strip())
    return tours, compteurs


def sans_accent(c):
    plat = ''.join(x for x in unicodedata.normalize('NFKD', c) if not unicodedata.combining(x))
    return plat if len(plat) == 1 else c


def normaliser(s):
    return ''.join(sans_accent(c) for c in s.replace('’', "'")).lower()


def phrases_retractees(textes):
    trouvees = []
    for t in textes:
        n = normaliser(t)
        for motif in RETRACTATIONS:
            for m in motif.finditer(n):
                debut = max((x.end() for x in FIN_PHRASE.finditer(t, 0, m.start())), default=0)
                fin = FIN_PHRASE.search(t, m.end())
                phrase = t[debut:fin.end() if fin else len(t)].strip()
                if phrase and phrase not in trouvees:
                    trouvees.append(phrase[:400])
    return trouvees


def couper(t, bord):
    if len(t) <= 2 * bord:
        return t
    return t[:bord] + '\n[… %d caractères coupés …]\n' % (len(t) - 2 * bord) + t[-bord:]


def heure(ts, precedent):
    jour, hm = ts[:10], ts[11:16]
    return hm if jour == precedent[:10] else f'{jour} {hm}'


def rendre(sid, projet, tours, compteurs, bord, largeur_bash):
    e = compteurs
    out = [f'# Session {sid[:8]}', '',
           f'- id : {sid}', f'- projet : {projet}', f'- de {e["debut"]} à {e["fin"]} (UTC)',
           f'- tours utilisateur : {len(tours)}', f'- appels d\'outils : {e["outils"]}',
           f'- sous-agents (Agent) : {e["Agent"]} · workflows : {e["Workflow"]}',
           f'- résumés de reprise (contexte saturé) : {e["resumes"]}', '']
    precedent = ''
    for t in tours:
        out += [f'## Tour {t["n"]} — {heure(t["ts"], precedent)}', '', t['demande'], '']
        precedent = t['ts']
        if t['resume']:
            out += ['_Contexte compacté pendant ce tour._', '']
        out.append('**Exécuté :**' + ('' if t['outils'] else ' rien'))
        out += [f'- {l}' for l in outils_compacts(t['outils'], largeur_bash)]
        out += ['', '**Répondu :**', '', couper(t['textes'][-1], bord) if t['textes'] else '_(aucun texte)_', '']
    out += ['## Rétractations et corrections', '']
    lignes = [f'- Tour {t["n"]} ({t["ts"][11:16]}) : {p}' for t in tours for p in phrases_retractees(t['textes'])]
    out += lignes or ['_Aucune._']
    return '\n'.join(out) + '\n'


def dossier_projet(arg):
    if arg is None:
        return os.path.join(RACINE, os.getcwd().replace('/', '-'))
    p = os.path.expanduser(arg)
    if os.path.isdir(p) and os.path.abspath(p).startswith(RACINE):
        return os.path.abspath(p)
    return os.path.join(RACINE, os.path.abspath(p).replace('/', '-') if p.startswith(('/', '~', '.')) else p)


def trouver(cible, projet, exclure):
    if cible == 'derniere':
        candidats = [f for f in glob.glob(os.path.join(projet, '*.jsonl'))
                     if not exclure or not os.path.basename(f).startswith(exclure)]
        if not candidats:
            print(f'aucune session dans {projet}', file=sys.stderr)
            return None
        return max(candidats, key=os.path.getmtime)
    dossiers = [projet] if os.path.isdir(projet) else []
    candidats = [f for d in dossiers for f in glob.glob(os.path.join(d, cible + '*.jsonl'))]
    if not candidats:
        candidats = glob.glob(os.path.join(RACINE, '*', cible + '*.jsonl'))
    if len(candidats) == 1:
        return candidats[0]
    if not candidats:
        print(f'session introuvable : {cible} (projet {os.path.basename(projet)})', file=sys.stderr)
    else:
        print(f'préfixe ambigu : {cible} — {len(candidats)} candidats', file=sys.stderr)
        for f in sorted(candidats):
            print(f'  {os.path.basename(os.path.dirname(f))}/{os.path.basename(f)}', file=sys.stderr)
    return None


def racine_depot():
    d = os.getcwd()
    while d != os.path.dirname(d):
        if os.path.isdir(os.path.join(d, '.git')):
            return d
        d = os.path.dirname(d)
    return os.getcwd()


def option(args, nom):
    return args[args.index(nom) + 1] if nom in args and args.index(nom) + 1 < len(args) else None


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    projet = dossier_projet(option(args, '--projet'))
    chemin = trouver(args[0], projet, option(args, '--exclure'))
    if chemin is None:
        return 2
    sid = os.path.basename(chemin)[:-6]
    sortie = os.path.expanduser(option(args, '--sortie') or os.path.join(racine_depot(), 'evan', f'reprise-{sid[:8]}.md'))
    tours, compteurs = lire_tours(chemin)
    nom_projet = os.path.basename(os.path.dirname(chemin)).replace('-home-thundder-Documents', '~')
    contenu = ''
    for bord, largeur in ((300, 120), (150, 120), (150, 80), (80, 80)):
        contenu = rendre(sid, nom_projet, tours, compteurs, bord, largeur)
        if len(contenu) <= PLAFOND:
            break
    os.makedirs(os.path.dirname(sortie) or '.', exist_ok=True)
    with open(sortie, 'w', encoding='utf-8') as w:
        w.write(contenu)
    print(f'{chemin_court(sortie)} · {len(tours)} tours · {compteurs["outils"]} appels · {len(contenu)} caractères')
    return 0


if __name__ == '__main__':
    sys.exit(main())
