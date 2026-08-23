#!/usr/bin/env python3
"""Cout d'un vol de workflow, decompose par ce qui le cause reellement.

Un agent relit TOUT son contexte a chaque appel d'outil. Le cout ne vient donc
pas de ce qu'il produit, mais du produit (taille du contexte x nombre d'appels).
Mesure de reference sur 1307 agents : socle 33 k, 73 appels, 4,9 M de lecture.

usage: cout-vol.py [--projet <slug>] [--vol wf_xxx] [--top N]
"""
import os, json, glob, sys, collections

R = os.path.expanduser('~/.claude/projects')
PRIX = dict(sortie=5.0, entree=1.0, cache_ecrit=1.25, cache_lu=0.1)

def mesurer(p):
    """Un tour = une REQUETE, pas une ligne de transcription.

    Une reponse d'assistant contenant plusieurs blocs — reflexion puis appel d'outil —
    s'inscrit sur plusieurs lignes portant le MEME releve `usage`. Compter les lignes
    surcompte d'un facteur 1,92 : 74 tours annonces au lieu de 37, 11 574 M de lecture
    au lieu de 6 027. Mesure du 2026-08-23, corpus de 1 323 agents.

    Les jetons d'entree se prennent une fois par requete ; la sortie se prend au
    MAXIMUM des lignes de la requete, la derniere portant le total.
    """
    a = collections.Counter(); res = 0
    reqs = {}; ordre = []
    for l in open(p, errors='replace'):
        try: r = json.loads(l)
        except Exception: continue
        m = r.get('message') or {}
        u = m.get('usage') or {}
        if u:
            rid = r.get('requestId') or m.get('id')
            if rid is None: continue
            if rid not in reqs:
                reqs[rid] = dict(
                    entree=u.get('input_tokens', 0),
                    cache_ecrit=u.get('cache_creation_input_tokens', 0),
                    cache_lu=u.get('cache_read_input_tokens', 0), sortie=0)
                ordre.append(rid)
            reqs[rid]['sortie'] = max(reqs[rid]['sortie'], u.get('output_tokens', 0))
        c = m.get('content')
        if r.get('type') == 'user' and isinstance(c, list):
            res += sum(len(json.dumps(b.get('content',''))) for b in c
                       if isinstance(b, dict) and b.get('type') == 'tool_result') // 4
    for i, rid in enumerate(ordre):
        v = reqs[rid]
        for k in ('entree', 'cache_ecrit', 'cache_lu', 'sortie'): a[k] += v[k]
        if i == 0: a['socle'] = v['entree'] + v['cache_ecrit'] + v['cache_lu']
    a['appels'] = len(ordre); a['resultats'] = res
    return a

def cout(a):
    return sum(a[k] * v for k, v in PRIX.items())

args = sys.argv[1:]
projet = args[args.index('--projet')+1] if '--projet' in args else '*'
vol    = args[args.index('--vol')+1] if '--vol' in args else 'wf_*'
top    = int(args[args.index('--top')+1]) if '--top' in args else 8

vols = {}
for d in glob.glob(f'{R}/{projet}/*/subagents/workflows/{vol}'):
    tot = collections.Counter(); n = 0
    for p in glob.glob(d + '/agent-*.jsonl'):
        a = mesurer(p)
        if not a['appels']: continue
        n += 1
        for k in ('sortie','entree','cache_ecrit','cache_lu','appels','resultats','socle'): tot[k] += a[k]
    if n: vols[os.path.basename(d)] = (tot, n)

if not vols:
    print("aucun vol trouvé"); sys.exit(0)

tt = collections.Counter()
for t, _ in vols.values(): tt.update(t)
N = sum(n for _, n in vols.values())
print(f"{len(vols)} vol(s), {N} agents\n")
print(f"  lecture de cache : {tt['cache_lu']/1e6:>9.0f} M   {100*tt['cache_lu']/max(sum(tt[k] for k in PRIX),1):>4.1f} % des jetons")
print(f"  socle relu       : {tt['socle']//max(N,1):>9} jetons/agent x {tt['appels']//max(N,1)} appels")
print(f"  résultats        : {tt['resultats']//max(N,1):>9} jetons/agent")
part_socle = tt['socle'] * (tt['appels']/max(N,1)) / max(tt['cache_lu'],1)
print(f"  part du socle dans la lecture : ~{100*min(part_socle,1):.0f} %  — le reste vient des résultats accumulés")
print(f"\n{'vol':<20}{'agents':>7}{'appels/ag':>11}{'résultats':>11}{'coût pondéré':>14}")
for nom, (t, n) in sorted(vols.items(), key=lambda x: -cout(x[1][0]))[:top]:
    print(f"  {nom:<18}{n:>7}{t['appels']//n:>11}{t['resultats']//n:>11}{cout(t)/1e6:>13.1f}M")
