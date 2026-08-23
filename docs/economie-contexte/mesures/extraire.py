#!/usr/bin/env python3
"""Extraction compacte des transcripts d'agents de workflow, dédoublonnée par requestId."""
import os, json, glob, sys, hashlib

R = os.path.expanduser('~/.claude/projects')
PROJET = '-home-thundder-Documents-Xeko-pms-ia'

def taille(x):
    """jetons approx d'un contenu de tool_result"""
    if isinstance(x, str): return len(x)//4
    return len(json.dumps(x, ensure_ascii=False))//4

def lire(p):
    reqs = {}          # requestId -> dict
    ordre = []
    outils = []        # (req_ordre, nom)
    resultats = []     # (apres_req_ordre, nom_outil, jetons)
    brief = None
    dernier_texte = []
    tool_use_id2nom = {}
    for l in open(p, errors='replace'):
        try: r = json.loads(l)
        except Exception: continue
        t = r.get('type'); m = r.get('message') or {}
        c = m.get('content')
        if t == 'user' and brief is None and isinstance(c, str):
            brief = c
        if t == 'assistant':
            rid = r.get('requestId') or (m.get('id'))
            if rid is None: continue
            u = m.get('usage') or {}
            if rid not in reqs:
                reqs[rid] = dict(i=u.get('input_tokens',0), cw=u.get('cache_creation_input_tokens',0),
                                 cr=u.get('cache_read_input_tokens',0), o=0, ts=r.get('timestamp'))
                ordre.append(rid)
            reqs[rid]['o'] = max(reqs[rid]['o'], u.get('output_tokens',0))
            k = len(ordre)-1
            if isinstance(c, list):
                txt = []
                for b in c:
                    if not isinstance(b, dict): continue
                    if b.get('type') == 'tool_use':
                        nom = b.get('name','?')
                        outils.append([k, nom])
                        tool_use_id2nom[b.get('id')] = nom
                    elif b.get('type') == 'text':
                        txt.append(b.get('text',''))
                if txt: dernier_texte = txt
        if t == 'user' and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get('type') == 'tool_result':
                    nom = tool_use_id2nom.get(b.get('tool_use_id'), '?')
                    resultats.append([len(ordre)-1, nom, taille(b.get('content',''))])
    if not ordre: return None
    return dict(
        fichier=p, vol=os.path.basename(os.path.dirname(p)), agent=os.path.basename(p)[:-6],
        n=len(ordre),
        req=[[reqs[r]['i'], reqs[r]['cw'], reqs[r]['cr'], reqs[r]['o'], reqs[r]['ts']] for r in ordre],
        outils=outils, resultats=resultats,
        brief=brief or '', rapport='\n'.join(dernier_texte),
    )

sortie = sys.argv[1]
n = 0
with open(sortie, 'w') as f:
    for p in sorted(glob.glob(f'{R}/{PROJET}/*/subagents/workflows/wf_*/agent-*.jsonl')):
        d = lire(p)
        if d:
            f.write(json.dumps(d, ensure_ascii=False)+'\n'); n += 1
print(f"{n} agents extraits -> {sortie}", file=sys.stderr)
