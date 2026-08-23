"""Critere AFFINE de dependance. Le premier critere ne voyait que la reprise textuelle dans la COMMANDE.
Un agent peut lire un resultat, changer de direction, sans en citer un mot : sa REFLEXION le trahit.
On classe donc une paire (k, k+1) dependante si la commande OU le bloc de reflexion du tour k+1
reutilise un fragment de 12 caracteres du resultat du tour k."""
import json, glob, os, re, collections, random
P=os.path.expanduser('~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia')
fics=sorted(glob.glob(f'{P}/*/subagents/workflows/wf_*/agent-*.jsonl'))
random.seed(11); random.shuffle(fics)
def frag(s,n=12):
    s=re.sub(r'\s+',' ',s); return set(s[i:i+n] for i in range(0,max(0,len(s)-n),3))
dep_cmd=dep_pensee=indep=0; agents=0; sans_pensee=0
for p in fics:
    if os.path.getsize(p)<150000: continue
    nom2={}; cur=-1
    cmds=collections.defaultdict(list); pens=collections.defaultdict(str); res=collections.defaultdict(str)
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
                    if not isinstance(b,dict): continue
                    if b.get('type')=='tool_use': cmds[cur].append(json.dumps(b.get('input',{}),ensure_ascii=False))
                    elif b.get('type')=='thinking': pens[cur]+=b.get('thinking','')
                    elif b.get('type')=='text': pens[cur]+=b.get('text','')
        if r.get('type')=='user' and isinstance(c,list) and cur>=0:
            for b in c:
                if isinstance(b,dict) and b.get('type')=='tool_result':
                    res[cur]+=json.dumps(b.get('content',''),ensure_ascii=False)
    n=len(nom2)
    if n<10: continue
    agents+=1
    for k in range(n-1):
        if not cmds.get(k) or not cmds.get(k+1) or not res.get(k): continue
        f=frag(res[k])
        cmd=' '.join(cmds[k+1]); pen=pens.get(k+1,'')
        rc=any(cmd[i:i+12] in f for i in range(0,max(0,len(cmd)-12)))
        rp=any(pen[i:i+12] in f for i in range(0,max(0,len(pen)-12)))
        if rc: dep_cmd+=1
        elif rp: dep_pensee+=1
        else:
            indep+=1
            if not pen.strip(): sans_pensee+=1
    if agents>=60: break
t=dep_cmd+dep_pensee+indep
print(f"{agents} agents · {t} paires de tours consecutifs")
print(f"  dependante — la COMMANDE reprend le resultat precedent   : {dep_cmd:>5} ({100*dep_cmd/t:>4.0f} %)")
print(f"  dependante — la REFLEXION reprend le resultat precedent   : {dep_pensee:>5} ({100*dep_pensee/t:>4.0f} %)")
print(f"  INDEPENDANTE — ni l'une ni l'autre, groupable             : {indep:>5} ({100*indep/t:>4.0f} %)")
print(f"     dont sans aucune reflexion ecrite entre les deux tours : {sans_pensee:>5} ({100*sans_pensee/t:>4.0f} %) — independance la plus sure")
