#!/usr/bin/env python3
"""Garde mémoire des commandes lourdes (appelée par guard.sh, et au démarrage d'une session).

Pourquoi : le 07/10, un émulateur Android lancé depuis une session a rempli la mémoire deux
fois ; la 1re, le système a tué tout le bureau, la 2e tout le terminal et ses 8 sessions,
parce qu'un programme tué faute de mémoire fait arrêter tout son groupe.
- Commande lourde : enfermée dans sa propre boîte mémoire (systemd-run --scope, plafond,
  OOMPolicy=continue). Si elle déborde, elle seule est tuée.
- Mémoire disponible sous le plafond de la commande : refus, avec la liste d'arrêt.
- --demarrage : avertit si moins de 3 Go sont disponibles à l'ouverture d'une session.
Journal : ~/.claude/cache/memoire/garde.log
"""
import datetime
import json
import os
import re
import shlex
import sys

sys.path.insert(0, os.path.expanduser('~/.claude/bin'))
import memoire  # noqa: E402

GO = memoire.GO
JOURNAL = os.path.expanduser('~/.claude/cache/memoire/garde.log')
POS = r'(^\s*|[;&|(]\s*|\bexec\s+|\bnohup\s+|\btimeout\s+\S+\s+|\b[A-Z_][A-Z0-9_]*=\S*\s+)'
LOURDES = [
    ('émulateur Android', 5, POS + r'(\S*/)?(emulator|qemu-system\S*)\b'),
    ('compilation Android', 4, POS + r'(\S*/)?(gradlew?|\./gradlew)\b|expo\s+run:android|react-native\s+run-android|eas\s+build\s+.*--local'),
    ('serveur de développement', 3, POS + r'((npx|bunx|pnpm\s+dlx)\s+)?(expo\s+start|next\s+(dev|build)|vite(\s|$)|react-native\s+start)'
     r'|' + POS + r'(bun|npm|pnpm|yarn)\s+(run\s+)?(dev|build)(\s|$)'),
    ('suite de tests navigateur', 4, POS + r'((npx|bunx)\s+)?playwright\s+test\b|' + POS + r'(bun|npm|pnpm|yarn)\s+run\s+test:e2e\b'),
]
DEMARRAGE_MIN = 3 * GO


def journal(ligne):
    os.makedirs(os.path.dirname(JOURNAL), exist_ok=True)
    with open(JOURNAL, 'a') as f:
        f.write(f'{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {ligne}\n')


def sans_citations(cmd):
    return re.sub(r"'[^']*'|\"(\\\\.|[^\"\\\\])*\"", ' ', cmd)


def classer(cmd):
    cmd = sans_citations(cmd)
    trouves = [(nature, go) for nature, go, motif in LOURDES if re.search(motif, cmd)]
    if not trouves:
        return None
    return max(trouves, key=lambda t: t[1])


def envelopper(cmd, nature, go):
    return ' '.join([
        'systemd-run', '--user', '--scope', '--quiet', '--collect',
        f'--description={shlex.quote("claude: " + nature)}',
        f'-p MemoryMax={go}G', '-p MemorySwapMax=1G', '-p OOMPolicy=continue',
        '--', 'bash', '-c', shlex.quote(cmd),
    ])


def garde(entree):
    outil = entree.get('tool_input') or {}
    cmd = outil.get('command') or ''
    if not cmd or cmd.lstrip().startswith('systemd-run'):
        return None
    lourde = classer(cmd)
    if lourde is None:
        return None
    nature, go = lourde
    dispo = memoire.disponible()
    if dispo < go * GO:
        liste = memoire.resume(memoire.candidats())
        journal(f'REFUS {nature} dispo={dispo / GO:.1f}Go besoin={go}Go cmd={cmd[:200]!r}')
        raison = (f'Garde mémoire : {nature} refusé, il reste {dispo / GO:.1f} Go disponibles pour '
                  f'{go} Go nécessaires (le 07/10, ce cas a fait tomber le bureau puis le terminal). '
                  f'Libérer de la mémoire d\'abord, dans cet ordre :\n{liste}\n'
                  'Proposer à Evan quoi arrêter ; ne jamais arrêter une session Claude ni les robots crypto.')
        return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny',
                                       'permissionDecisionReason': raison}}
    journal(f'BOITE {nature} {go}Go dispo={dispo / GO:.1f}Go cmd={cmd[:200]!r}')
    return {'hookSpecificOutput': {'hookEventName': 'PreToolUse',
                                   'updatedInput': {**outil, 'command': envelopper(cmd, nature, go)}}}


def demarrage():
    dispo = memoire.disponible()
    if dispo >= DEMARRAGE_MIN:
        return None
    liste = memoire.resume(memoire.candidats())
    journal(f'DEMARRAGE dispo={dispo / GO:.1f}Go')
    texte = (f'Mémoire basse à l\'ouverture : {dispo / GO:.1f} Go disponibles (seuil 3 Go). '
             f'Aucun travail lourd avant d\'avoir libéré de la mémoire. Arrêtables, dans l\'ordre :\n{liste}')
    return {'systemMessage': texte,
            'hookSpecificOutput': {'hookEventName': 'SessionStart', 'additionalContext': texte}}


if __name__ == '__main__':
    try:
        entree = json.load(sys.stdin)
    except ValueError:
        entree = {}
    sortie = demarrage() if '--demarrage' in sys.argv else garde(entree)
    if sortie:
        print(json.dumps(sortie, ensure_ascii=False))
