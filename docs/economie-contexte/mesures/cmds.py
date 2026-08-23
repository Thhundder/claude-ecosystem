"""Que font les tours a petit resultat ? Echantillon des commandes reelles."""
import json, glob, os, re, collections, random
P=os.path.expanduser('~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia')
fics=sorted(glob.glob(f'{P}/*/subagents/workflows/wf_*/agent-*.jsonl'))
random.seed(3); random.shuffle(fics)
fam=collections.Counter(); ex=collections.defaultdict(list); n=0
def classer(cmd):
    c=cmd.strip()
    if c.startswith('test -f') and 'STOP' in c: return 'test STOP (impose par le brief)'
    m=re.match(r'^(\S+)', c)
    t=m.group(1) if m else '?'
    if t in ('rg','grep','ag'):
        return 'rg -l (localisation)' if re.search(r'\s-l\b|--files-with-matches', c) else 'rg (extraction)'
    if t in ('ls','find','test','stat','wc','du','tree','basename','dirname'): return f'{t} (existence/inventaire)'
    if t in ('sed','head','tail','cat','awk','cut'): return f'{t} (lecture par plage)'
    if t in ('git',): return 'git'
    if t in ('bun','python3','node','curl'): return f'{t}'
    return t
for p in fics[:120]:
    tu={}; cur=-1; nom2={}
    lignes=list(open(p,errors='replace'))
    res_par_tour=collections.defaultdict(int); cmd_par_tour=collections.defaultdict(list)
    for l in lignes:
        try: r=json.loads(l)
        except: continue
        m=r.get('message') or {}; c=m.get('content')
        if r.get('type')=='assistant':
            rid=r.get('requestId') or m.get('id')
            if rid not in nom2: nom2[rid]=len(nom2)
            cur=nom2[rid]
            if isinstance(c,list):
                for b in c:
                    if isinstance(b,dict) and b.get('type')=='tool_use' and b.get('name')=='Bash':
                        cmd_par_tour[cur].append(b.get('input',{}).get('command',''))
        if r.get('type')=='user' and isinstance(c,list) and cur>=0:
            for b in c:
                if isinstance(b,dict) and b.get('type')=='tool_result':
                    res_par_tour[cur]+=len(json.dumps(b.get('content',''),ensure_ascii=False))//4
    for k,cmds in cmd_par_tour.items():
        if res_par_tour.get(k,0)<200:
            for cmd in cmds:
                f=classer(cmd); fam[f]+=1; n+=1
                if len(ex[f])<2: ex[f].append(cmd[:110].replace('\n',' '))
print(f"{n} commandes Bash sur des tours a resultat < 200 jetons, sur 120 agents\n")
for f,v in fam.most_common(14):
    print(f"  {v:>6} ({100*v/n:>4.1f} %)  {f}")
    for e in ex[f][:1]: print(f"            ex: {e}")
