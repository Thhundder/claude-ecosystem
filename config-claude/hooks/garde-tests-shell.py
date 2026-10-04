#!/usr/bin/env python3
"""Pour garde-tests.sh : les éditions de fichiers faites par une commande shell (variable
CMD), ramenées à une liste JSON de {path, old, new, w}. Reconnaît remplacer.py, sed -i,
les redirections > et >> (heredoc, printf, echo) et tee. Le découpage de la commande est
celui de garde-identifiants.py."""
import importlib.util
import json
import os
import re

spec = importlib.util.spec_from_file_location('gi', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'garde-identifiants.py'))
gi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gi)


def developper(mot, vars_):
    return re.sub(r'\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?', lambda m: vars_.get(m.group(1), m.group(0)), mot)


def sed_paires(args):
    opts, ops = gi.options(args, 'ef')
    if not gi.drapeau(opts, 'i', ('--in-place',)):
        return []
    scripts = [opts[k + 1] for k, o in enumerate(opts) if o == '-e' and k + 1 < len(opts)]
    if not scripts and ops:
        scripts, ops = [ops[0]], ops[1:]
    out = []
    for sc in scripts:
        for cmd in re.split(r';|\n', sc):
            cmd = cmd.strip()
            m = re.fullmatch(r's(.)(.*?)(?<!\\)\1(.*?)(?<!\\)\1[gpI0-9]*', cmd)
            d = re.fullmatch(r'/(.*)/d', cmd)
            if m:
                ancien, nouveau = m.group(2), m.group(3)
            elif d:
                ancien, nouveau = d.group(1), ''
            else:
                continue
            ancien = re.sub(r'\\(.)', r'\1', ancien)
            out += [{'path': f, 'old': ancien, 'new': nouveau, 'w': False} for f in ops]
    return out


def paires(s, vars_, prof=0):
    if prof > 4:
        return []
    subs, out = [], []
    for tube in gi.lexer(s, subs):
        for et in tube:
            mots = [developper(m, vars_) for m, _ in et.mots]
            while mots and mots[0] in gi.MOTS_CLES:
                mots = mots[1:]
            while mots and re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', mots[0]):
                nom, val = mots[0].split('=', 1)
                vars_[nom] = val
                mots = mots[1:]
            corps = '\n'.join(et.heredocs)
            p = os.path.basename(mots[0]) if mots else ''
            args = mots[1:]
            for op, cible in et.sorties:
                if op in ('>', '>>', '>|'):
                    nouveau = corps or (' '.join(args).replace('\\n', '\n') if p in ('printf', 'echo') else '')
                    out.append({'path': developper(cible, vars_), 'old': '', 'new': nouveau, 'w': True})
            if p in gi.INTERPRETES and args and os.path.basename(args[0]) == 'remplacer.py':
                p, args = 'remplacer.py', args[1:]
            if p == 'remplacer.py' and len(args) >= 3 and args[1] != '--verifie' and not args[0].startswith('-'):
                out.append({'path': args[0], 'old': args[1], 'new': args[2], 'w': False})
            elif p == 'tee':
                out += [{'path': a, 'old': '', 'new': corps, 'w': True} for a in args if not a.startswith('-')]
            elif p == 'sed':
                out += sed_paires(args)
            elif p in gi.COQUILLES and '-c' in args and args.index('-c') + 1 < len(args):
                out += paires(args[args.index('-c') + 1], vars_, prof + 1)
    for sub in subs:
        out += paires(sub, vars_, prof + 1)
    return out


try:
    print(json.dumps(paires(os.environ.get('CMD', ''), {}), ensure_ascii=False))
except Exception:
    print('[]')
