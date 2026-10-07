#!/usr/bin/env python3
"""Mémoire de la machine : disponible, et ce qu'on peut arrêter, dans l'ordre d'arrêt.

Partagé par la garde des commandes lourdes (hooks/garde-memoire.py) et le veilleur
(bin/veilleur-memoire.py). Usage direct : memoire.py → état et liste d'arrêt.
"""
import os
import re
import subprocess

GO = 1024 ** 3

ORDRE = [
    (1, 'émulateur Android', lambda c, a: c.startswith('qemu-system') or c == 'emulator' or '/emulator/qemu' in a),
    (2, 'démon de compilation', lambda c, a: c == 'java' and re.search(r'GradleDaemon|GradleWrapperMain|KotlinCompileDaemon|kotlin-daemon', a)),
    (3, 'serveur de développement', lambda c, a: c in ('node', 'bun') and re.search(r'expo|metro|next dev|next-dev|vite|react-native start|webpack serve', a)),
    (4, 'navigateur de test', lambda c, a: re.search(r'chrom', c) and re.search(r'--headless|ms-playwright|puppeteer', a)),
]
DOCKER_SACRIFIABLES = r'^tess-'
DOCKER_PRIORITE = 5


def disponible():
    with open('/proc/meminfo') as f:
        for ligne in f:
            if ligne.startswith('MemAvailable:'):
                return int(ligne.split()[1]) * 1024
    return 0


def pression():
    try:
        with open('/proc/pressure/memory') as f:
            return float(f.readline().split()[1].split('=')[1])
    except (OSError, IndexError, ValueError):
        return 0.0


def _processus():
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            with open(f'/proc/{pid}/comm') as f:
                comm = f.read().strip()
            with open(f'/proc/{pid}/cmdline', 'rb') as f:
                args = f.read().replace(b'\0', b' ').decode(errors='replace')
            with open(f'/proc/{pid}/status') as f:
                rss = next((int(l.split()[1]) * 1024 for l in f if l.startswith('VmRSS:')), 0)
            uid = os.stat(f'/proc/{pid}').st_uid
        except (OSError, StopIteration):
            continue
        yield int(pid), comm, args, rss, uid


def _conteneurs():
    try:
        sortie = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{.Name}}\t{{.MemUsage}}'],
                                capture_output=True, text=True, timeout=15).stdout
    except (OSError, subprocess.TimeoutExpired):
        return []
    out = []
    for ligne in sortie.splitlines():
        nom, _, usage = ligne.partition('\t')
        if not re.search(DOCKER_SACRIFIABLES, nom):
            continue
        m = re.match(r'([\d.]+)\s*([KMG]i?B)', usage)
        mult = {'K': 1024, 'M': 1024 ** 2, 'G': GO}[m.group(2)[0]] if m else 0
        out.append(dict(priorite=DOCKER_PRIORITE, nature='conteneur Docker', pid=None, nom=nom,
                        octets=int(float(m.group(1)) * mult) if m else 0))
    return out


def candidats(avec_docker=True):
    moi = os.getuid()
    out = []
    for pid, comm, args, rss, uid in _processus():
        if uid != moi:
            continue
        for prio, nature, test in ORDRE:
            if test(comm, args):
                out.append(dict(priorite=prio, nature=nature, pid=pid, nom=comm, octets=rss))
                break
    if avec_docker:
        out += _conteneurs()
    return sorted(out, key=lambda c: (c['priorite'], -c['octets']))


def resume(liste):
    if not liste:
        return 'rien d\'arrêtable automatiquement (sessions Claude, bureau, Chrome et robots crypto exclus)'
    return '\n'.join(f"{c['priorite']}. {c['nature']} — {c['nom']}"
                     f"{' (pid ' + str(c['pid']) + ')' if c['pid'] else ''} — {c['octets'] / GO:.1f} Go"
                     for c in liste)


if __name__ == '__main__':
    print(f'disponible : {disponible() / GO:.1f} Go · pression : {pression():.1f} %')
    print(resume(candidats()))
