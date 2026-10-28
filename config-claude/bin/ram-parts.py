#!/usr/bin/env python3
"""Parts de la mémoire et du processeur par famille, pour les ronds du panneau (mod ecran).

Familles : sessions Claude, Chrome, python (bancs), système, autre ; mémoire = PSS de chaque processus,
le reste de l'utilisé va à « noyau, illisible ». Processeur = temps consommé entre deux instantanés,
temps des enfants morts compris (cutime/cstime du parent qui les a attendus), interruptions du noyau
lues dans /proc/stat ; la charge totale se lit sur la même fenêtre que les processus.

--json : instantané comparé au précédent gardé dans ~/.claude/cache/ecran/ (pas d'attente).
--mesure N : deux instantanés à N secondes d'écart, tableau de contrôle (somme des familles contre charge).
"""
import glob
import json
import os
import sys
import time

HZ = os.sysconf('SC_CLK_TCK')
COEURS = os.cpu_count() or 1
SESSIONS = os.path.expanduser('~/.claude/sessions')
CACHE = os.path.expanduser('~/.claude/cache/ecran')
INSTANT = f'{CACHE}/instant-cpu.json'
DERNIER = f'{CACHE}/parts.json'
FENETRE_MIN = 1.5
FAMILLES = ['sessions Claude', 'Chrome', 'python (bancs)', 'système', 'autre']
SYSTEME = {'systemd', 'systemd-journal', 'systemd-logind', 'systemd-udevd', 'systemd-resolve', 'systemd-oomd',
           'systemd-timesyn', 'dbus-daemon', 'dbus-broker', 'Xorg', 'Xwayland', 'kwin_wayland', 'kwin_x11',
           'plasmashell', 'pipewire', 'pipewire-pulse', 'wireplumber', 'pulseaudio', 'NetworkManager',
           'polkitd', 'udisksd', 'upowerd', 'accounts-daemon', 'snapd', 'cupsd', 'avahi-daemon', 'rsyslogd',
           'gnome-shell', 'baloo_file', 'kded6', 'kded5', 'ksmserver', 'thermald', 'irqbalance', 'ModemManager',
           'packagekitd', 'gvfsd', 'xdg-desktop-por', 'kactivitymanagerd', 'gsd-housekeepin', 'ibus-daemon'}


def lire(chemin):
    try:
        with open(chemin) as f:
            return f.read()
    except OSError:
        return ''


def stat_cpu():
    v = list(map(int, lire('/proc/stat').splitlines()[0].split()[1:9]))
    return {'total': sum(v), 'repos': v[3] + v[4], 'irq': v[5] + v[6]}


def execution_ns():
    lignes = [l.split() for l in lire('/proc/schedstat').splitlines() if l.startswith('cpu')]
    return sum(int(l[7]) for l in lignes) if lignes and all(len(l) > 7 for l in lignes) else None


def moyenne(a, b):
    return {k: (a[k] + b[k]) / 2 for k in a}


def instantane():
    avant, t0, ns0 = stat_cpu(), time.time(), execution_ns()
    procs = {}
    for d in glob.glob('/proc/[0-9]*'):
        s = lire(f'{d}/stat')
        if not s:
            continue
        c = s[s.rindex(')') + 2:].split()
        procs[d[6:]] = [s[s.index('(') + 1:s.rindex(')')], int(c[1]), int(c[11]) + int(c[12]), int(c[13]) + int(c[14]), int(c[19])]
    ns1 = execution_ns()
    return {'t': (t0 + time.time()) / 2, 'stat': moyenne(avant, stat_cpu()), 'ns': None if ns0 is None or ns1 is None else (ns0 + ns1) / 2, 'procs': procs}


def consommation(a, b):
    """Jiffies consommés par chaque processus vivant en b ; un enfant mort pendant la fenêtre compte chez
    l'ancêtre vivant qui l'a attendu, moins ce qu'il avait déjà consommé avant la fenêtre."""
    pa, pb = a['procs'], b['procs']
    meme = lambda pid: pid in pa and pid in pb and pa[pid][4] == pb[pid][4]
    conso = {}
    for pid, (_, _, propre, enfants, _) in pb.items():
        conso[pid] = propre + enfants - (pa[pid][2] + pa[pid][3] if meme(pid) else 0)
    for pid, (_, ppid, propre, enfants, _) in pa.items():
        if meme(pid):
            continue
        parent, vus = str(ppid), 0
        while parent in pa and not meme(parent) and vus < 64:
            parent, vus = str(pa[parent][1]), vus + 1
        if meme(parent):
            conso[parent] -= propre + enfants
    return {pid: max(0, j) for pid, j in conso.items()}


def sessions():
    noms = {}
    for f in glob.glob(f'{SESSIONS}/*.json'):
        try:
            fiche = json.loads(lire(f))
        except ValueError:
            continue
        noms[str(fiche.get('pid'))] = (fiche.get('name') or str(fiche.get('pid')))[:40]
    return noms


def uid(pid):
    for l in lire(f'/proc/{pid}/status').splitlines():
        if l.startswith('Uid:'):
            return int(l.split()[1])
    return -1


def pss_ko(pid):
    for l in lire(f'/proc/{pid}/smaps_rollup').splitlines():
        if l.startswith('Pss:'):
            return int(l.split()[1])
    return 0


def classer(pid, nom, ppid, cmd, noms, procs):
    if nom == 'claude' or pid in noms:
        p, vus = pid, 0
        while p in procs and p not in noms and vus < 64:
            p, vus = str(procs[p][1]), vus + 1
        return 'sessions Claude', noms.get(p, 'claude hors session nommée')
    if 'chrome' in nom or 'chrome' in cmd[:80]:
        sorte = 'rendu' if '--type=renderer' in cmd else 'gpu' if '--type=gpu' in cmd else 'utilitaire' if '--type=utility' in cmd else 'principal'
        return 'Chrome', f'chrome {sorte}'
    if nom.startswith('python'):
        m = cmd.split()
        i = 1
        while i < len(m) and m[i].startswith('-') and m[i] not in ('-m', '-c'):
            i += 2 if m[i] in ('-W', '-X') else 1
        lib = m[i + 1] if i + 1 < len(m) and m[i] == '-m' else 'python -c' if i < len(m) and m[i] == '-c' else m[i] if i < len(m) else nom
        return 'python (bancs)', lib.rsplit('/', 1)[-1][:30]
    if ppid == 2 or pid == '2':
        return 'système', 'fils du noyau (' + nom.split('/')[0].split(':')[0] + ')'
    if nom in SYSTEME or uid(pid) == 0:
        return 'système', nom
    return 'autre', nom


def parts(a, b):
    pb = b['procs']
    noms = sessions()
    conso = consommation(a, b)
    jif = b['stat']['total'] - a['stat']['total']
    duree = b['t'] - a['t']
    echelle = 100 / HZ / duree if duree > 0 else 0
    meminfo = {l.split(':')[0]: int(l.split()[1]) for l in lire('/proc/meminfo').splitlines()}
    groupes = {f: {'ko': 0, 'cpu': 0.0, 'n': 0, 'detail': {}} for f in FAMILLES}
    for pid, (nom, ppid, _, _, _) in pb.items():
        cmd = lire(f'/proc/{pid}/cmdline').replace('\0', ' ').strip()
        fam, lib = classer(pid, nom, ppid, cmd, noms, pb)
        ko, cpu = pss_ko(pid), conso.get(pid, 0) * echelle
        g = groupes[fam]
        g['ko'] += ko
        g['cpu'] += cpu
        g['n'] += 1
        d = g['detail'].setdefault(lib, [0, 0.0, 0])
        d[0] += ko
        d[1] += cpu
        d[2] += 1
    total, dispo = meminfo['MemTotal'], meminfo['MemAvailable']
    part_stat = 100 * COEURS / jif if jif > 0 else 0
    irq = (b['stat']['irq'] - a['stat']['irq']) * part_stat
    if a.get('ns') is not None and b.get('ns') is not None and duree > 0:
        pris = (b['ns'] - a['ns']) / 1e9 / duree * 100 + irq
    else:
        pris = (jif - (b['stat']['repos'] - a['stat']['repos'])) * part_stat
    somme = sum(g['cpu'] for g in groupes.values()) + irq
    return {
        'quand': time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(b['t'])),
        'fenetre_s': round(b['t'] - a['t'], 2),
        'total': total,
        'dispo': dispo,
        'coeurs': COEURS,
        'cpu_pris': round(pris, 1),
        'cpu_irq': round(irq, 1),
        'cpu_non_attribue': round(max(0.0, pris - somme), 1),
        'cpu_somme': round(somme, 1),
        'noyau_ko': max(0, total - dispo - sum(g['ko'] for g in groupes.values())),
        'noyau_detail': [[n, meminfo.get(k, 0)] for n, k in (('tables du noyau', 'Slab'), ('mémoire partagée', 'Shmem'), ('tables de pages', 'PageTables'), ('piles du noyau', 'KernelStack'))],
        'familles': [{'nom': f, 'ko': g['ko'], 'cpu': round(g['cpu'], 1), 'n': g['n'],
                      'detail': [[n, d[0], round(d[1], 1), d[2]] for n, d in sorted(g['detail'].items(), key=lambda x: -(x[1][0] / max(1, total) + x[1][1] / (100 * COEURS)))[:8]]}
                     for f, g in groupes.items()],
    }


def ecrire(chemin, valeur):
    os.makedirs(CACHE, exist_ok=True)
    tmp = f'{chemin}.{os.getpid()}'
    with open(tmp, 'w') as f:
        json.dump(valeur, f, ensure_ascii=False)
    os.replace(tmp, chemin)


def en_json():
    try:
        precedent = json.loads(lire(INSTANT))
    except ValueError:
        precedent = None
    if precedent is not None and time.time() - precedent['t'] < FENETRE_MIN and os.path.exists(DERNIER):
        return json.loads(lire(DERNIER))
    if precedent is None or time.time() - precedent['t'] > 120:
        precedent = instantane()
        time.sleep(1)
    actuel = instantane()
    ecrire(INSTANT, actuel)
    r = parts(precedent, actuel)
    ecrire(DERNIER, r)
    return r


def mesure(secondes):
    a = instantane()
    time.sleep(secondes)
    r = parts(a, instantane())
    pris = r['cpu_pris'] or 1
    print(f"{r['quand']}  fenêtre {r['fenetre_s']} s  charge {r['cpu_pris']:.0f} % sur {100 * COEURS} %")
    for f in r['familles']:
        print(f"  {f['cpu']:6.1f} %  {f['cpu'] / pris * 100:5.1f} % de la charge  {f['nom']}")
        for n, _, c, _ in sorted(f['detail'], key=lambda x: -x[2])[:4]:
            if c >= 0.5:
                print(f'           {c:6.1f} %  {n}')
    print(f"  {r['cpu_irq']:6.1f} %  {r['cpu_irq'] / pris * 100:5.1f} % de la charge  noyau (interruptions)")
    print(f"  somme {r['cpu_somme']:.1f} % = {r['cpu_somme'] / pris * 100:.1f} % de la charge ; non attribué {r['cpu_non_attribue']:.1f} % = {r['cpu_non_attribue'] / pris * 100:.1f} %")


if __name__ == '__main__' and '--json' in sys.argv:
    print(json.dumps(en_json(), ensure_ascii=False))
elif __name__ == '__main__' and '--mesure' in sys.argv:
    mesure(float(sys.argv[sys.argv.index('--mesure') + 1]))
elif __name__ == '__main__':
    print(__doc__)
