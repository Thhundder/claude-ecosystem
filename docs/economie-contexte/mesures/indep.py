"""Combien de tours consecutifs auraient pu etre groupes ?
Critere operatoire et refutable : le tour k+1 DEPEND du tour k si sa commande reutilise un fragment
d'au moins 12 caracteres present dans le resultat du tour k et absent du contexte anterieur.
Sinon il en est independant, et les deux appels pouvaient partir ensemble."""
import json, glob, os, re, collections, random, statistics as st
P=os.path.expanduser('~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia')
fics=sorted(glob.glob(f'{P}/*/subagents/workflows/wf_*/agent-*.jsonl'))
random.seed(11); random.shuffle(fics)
def frag(s, n=12):
    s=re.sub(r'\s+',' ',s)
    return set(s[i:i+n] for i in range(0, max(0,len(s)-n), 3))
indep=dep=0; agents=0
for p in fics:
    if os.path.getsize(p)<150000: continue
    nom2={}; cur=-1
    cmds=collections.defaultdict(list); res=collections.defaultdict(str)
    for l in open(p,errors='replace'):
        try: r=json.loads(l)
        except: continue
        m=r.get('message') or {}; c=m.get('content')
        if r.get('type')=='assistant':
            rid=r.get('requestId') or m.get('id')
            if rid not in nom2: nom2[rid]=len(nom2)
            cur=nom2[rid]
            if isinstance(c,list):
                for b in c:
                    if isinstance(b,dict) and b.get('type')=='tool_use':
                        cmds[cur].append(json.dumps(b.get('input',{}),ensure_ascii=False))
        if r.get('type')=='user' and isinstance(c,list) and cur>=0:
            for b in c:
                if isinstance(b,dict) and b.get('type')=='tool_result':
                    res[cur]+=json.dumps(b.get('content',''),ensure_ascii=False)
    n=len(nom2)
    if n<10: continue
    agents+=1
    for k in range(n-1):
        if not cmds.get(k) or not cmds.get(k+1) or not res.get(k): continue
        f=frag(res[k]); nxt=' '.join(cmds[k+1])
        reutilise=any(nxt[i:i+12] in f for i in range(0,max(0,len(nxt)-12)))
        if reutilise: dep+=1
        else: indep+=1
    if agents>=60: break
t=indep+dep
print(f"{agents} agents · {t} paires de tours consecutifs examinees")
print(f"  le tour k+1 reutilise un fragment du resultat de k (DEPENDANT) : {dep} ({100*dep/t:.0f} %)")
print(f"  aucune reutilisation (INDEPENDANT, groupable)                  : {indep} ({100*indep/t:.0f} %)")
