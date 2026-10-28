#!/usr/bin/env python3
"""Naissance et fin des worktrees : chacun vit dans <parent du dépôt>/worktrees/<sujet>/<nom>, avec un SUJET.md.

usage : worktree.py neuf <dépôt> <sujet> <nom> <branche> --pourquoi "<texte>" [--base <ref>]
        worktree.py fin <sujet> [--racine <dossier>]     retire les worktrees propres et poussés, liste le reste
        worktree.py etat [--racine <dossier>]            chaque sujet et ses worktrees
"""
import datetime, os, re, subprocess, sys

RACINE = os.path.expanduser('~/Documents/Xeko/worktrees')
BENIN = re.compile(r'(^|/)(venv|\.venv|node_modules|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.next|\.turbo|\.cache|.*\.pyc|tsconfig\.tsbuildinfo|next-env\.d\.ts)(/|$)')
NOM = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')


def git(chemin, *a):
    return subprocess.run(['git', '-C', chemin, *a], capture_output=True, text=True)


def jour():
    return datetime.date.today().strftime('%d/%m/%Y')


def neuf(depot, sujet, nom, branche, pourquoi, base):
    if not (NOM.match(sujet) and NOM.match(nom)):
        sys.exit(f'sujet et nom : lettres, chiffres, . _ - seulement ({sujet!r}, {nom!r})')
    top = git(os.path.expanduser(depot), 'rev-parse', '--path-format=absolute', '--git-common-dir')
    if top.returncode:
        sys.exit(f'pas un dépôt git : {depot}')
    principal = os.path.dirname(top.stdout.strip())
    dossier = os.path.join(os.path.dirname(principal), 'worktrees', sujet)
    chemin = os.path.join(dossier, nom)
    if os.path.exists(chemin):
        sys.exit(f'existe déjà : {chemin}')
    os.makedirs(dossier, exist_ok=True)
    existe = git(principal, 'rev-parse', '--verify', '--quiet', f'refs/heads/{branche}').returncode == 0
    cmd = ['worktree', 'add', chemin, branche] if existe else ['worktree', 'add', '-b', branche, chemin] + ([base] if base else [])
    r = git(principal, *cmd)
    print(r.stdout + r.stderr, end='')
    if r.returncode:
        sys.exit(r.returncode)
    fiche = os.path.join(dossier, 'SUJET.md')
    if not os.path.exists(fiche):
        with open(fiche, 'w') as f:
            f.write(f'# {sujet}\n\nPourquoi : {pourquoi}\n\n'
                    'Quand supprimer : à la fin du chantier, `~/.claude/bin/worktree.py fin ' + sujet + '` retire ceux qui sont propres,\n'
                    'sans commit local ni processus dedans, et liste le reste pour Evan.\n\nWorktrees :\n')
    session = os.environ.get('CLAUDE_CODE_SESSION_ID', 'hors session Claude')
    with open(fiche, 'a') as f:
        f.write(f'- {nom} — {os.path.basename(principal)}, branche {branche}{" (existante)" if existe else ""}, créé le {jour()}, '
                f'session {session} — {pourquoi}\n')
    print(f'worktree : {chemin}\nfiche    : {fiche}')


def processus(chemin):
    pat = re.compile(re.escape(chemin) + r'(/|\s|"|$)', re.M)
    pids = []
    for p in os.listdir('/proc'):
        if not p.isdigit() or int(p) == os.getpid():
            continue
        txt = ''
        try:
            txt += os.readlink(f'/proc/{p}/cwd') + '\n'
        except OSError:
            pass
        for f in ('cmdline', 'environ'):
            try:
                txt += open(f'/proc/{p}/{f}', 'rb').read().decode(errors='replace').replace('\0', '\n') + '\n'
            except OSError:
                pass
        if pat.search(txt):
            pids.append(p)
    return pids


def obstacles(chemin):
    principal = os.path.dirname(git(chemin, 'rev-parse', '--path-format=absolute', '--git-common-dir').stdout.strip())
    fautes = []
    st = git(chemin, 'status', '--porcelain')
    if st.returncode or st.stdout.strip():
        fautes.append(f'{len(st.stdout.splitlines())} fichier(s) non enregistré(s)')
    rl = git(chemin, 'rev-list', '--count', 'HEAD', '--not', '--remotes')
    if rl.returncode or rl.stdout.strip() != '0':
        fautes.append(f'{rl.stdout.strip() or "?"} commit(s) absents de GitHub')
    pids = processus(chemin)
    if pids:
        fautes.append(f'en usage (processus {",".join(pids[:5])})')
    for l in git(chemin, 'status', '--porcelain', '--ignored').stdout.splitlines():
        i = l[3:].rstrip('/')
        if not l.startswith('!! ') or BENIN.search(i):
            continue
        copie = os.path.join(principal, i)
        if os.path.basename(i).startswith('.env') and os.path.isfile(copie) and open(copie, 'rb').read() == open(os.path.join(chemin, i), 'rb').read():
            continue
        fautes.append(f'fichier ignoré par git à copier d\'abord : {i}')
    return principal, fautes


def worktrees(dossier):
    if os.path.isfile(os.path.join(dossier, '.git')):
        return [dossier]
    return sorted(os.path.join(dossier, n) for n in os.listdir(dossier) if os.path.isfile(os.path.join(dossier, n, '.git')))


def reserve(fiche, nom):
    if not os.path.exists(fiche):
        return None
    for l in open(fiche):
        if l.startswith(f'- {nom} ') and ('À DÉCIDER' in l or 'À GARDER' in l):
            return 'marqué « à décider » ou « à garder » dans SUJET.md : décision d\'Evan'
    return None


def fin(sujet, racine):
    dossier = os.path.join(racine, sujet)
    if not os.path.isdir(dossier):
        sys.exit(f'sujet absent : {dossier}')
    fiche = os.path.join(dossier, 'SUJET.md')
    restes = []
    for chemin in worktrees(dossier):
        principal, fautes = obstacles(chemin)
        marque = reserve(fiche, os.path.basename(chemin))
        if marque:
            fautes.append(marque)
        if fautes:
            restes.append((chemin, fautes))
            continue
        r = git(principal, 'worktree', 'remove', chemin)
        if r.returncode:
            restes.append((chemin, [r.stderr.strip()]))
            continue
        print(f'SUPPRIMÉ  {chemin}')
        if os.path.exists(fiche):
            with open(fiche, 'a') as f:
                f.write(f'- {os.path.basename(chemin)} supprimé le {jour()} (propre, poussé)\n')
    for chemin, fautes in restes:
        print(f'À VOIR    {chemin} : {" ; ".join(fautes)}')
    if os.path.isdir(dossier) and not worktrees(dossier):
        if os.path.exists(fiche):
            os.remove(fiche)
        if not os.listdir(dossier):
            os.rmdir(dossier)
            print(f'sujet clos, dossier retiré : {dossier}')
    if restes:
        print(f'{len(restes)} worktree(s) restent : liste à donner à Evan avec la raison de chacun.')


def etat(racine):
    for s in sorted(os.listdir(racine)) if os.path.isdir(racine) else []:
        d = os.path.join(racine, s)
        if not os.path.isdir(d):
            continue
        print(s)
        for chemin in worktrees(d):
            _, fautes = obstacles(chemin)
            marque = reserve(os.path.join(d, 'SUJET.md'), os.path.basename(chemin))
            if marque:
                fautes.append(marque)
            print(f'  {os.path.basename(chemin)} : {" ; ".join(fautes) if fautes else "supprimable (propre, poussé)"}')


def main(a):
    def option(nom, defaut=None):
        if nom in a:
            i = a.index(nom)
            v = a[i + 1]
            del a[i:i + 2]
            return v
        return defaut
    if not a:
        sys.exit(__doc__)
    if a[0] == 'neuf':
        pourquoi, base = option('--pourquoi'), option('--base')
        if len(a) != 5 or not pourquoi:
            sys.exit(__doc__)
        return neuf(*a[1:5], pourquoi, base)
    racine = os.path.expanduser(option('--racine', RACINE))
    if a[0] == 'fin' and len(a) == 2:
        return fin(a[1], racine)
    if a[0] == 'etat' and len(a) == 1:
        return etat(racine)
    sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
