"""Contrôle indépendant : les jetons de sortie déclarés correspondent-ils au texte réellement écrit ?
Un écart > 2x réfute la mesure."""
import json, glob, os, collections
P=os.path.expanduser('~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia')
ech=sorted(glob.glob(f'{P}/*/subagents/workflows/wf_73389a69-c29/agent-*.jsonl'))[:6]
for p in ech:
    par_req=collections.OrderedDict(); carac=0
    for l in open(p,errors='replace'):
        try: r=json.loads(l)
        except: continue
        if r.get('type')!='assistant': continue
        m=r.get('message') or {}; rid=r.get('requestId') or m.get('id')
        u=m.get('usage') or {}
        d=par_req.setdefault(rid,{'vals':[]}); d['vals'].append(u.get('output_tokens',0))
        c=m.get('content')
        if isinstance(c,list):
            for b in c:
                if not isinstance(b,dict): continue
                if b.get('type')=='text': carac+=len(b.get('text',''))
                elif b.get('type')=='thinking': carac+=len(b.get('thinking',''))
                elif b.get('type')=='tool_use': carac+=len(json.dumps(b.get('input',{}),ensure_ascii=False))
    mx=sum(max(d['vals']) for d in par_req.values())
    sm=sum(sum(d['vals']) for d in par_req.values())
    print(f"{os.path.basename(p)[:22]} req={len(par_req):3}  max/req={mx:7}  somme={sm:7}  texte≈{carac//4:7} jetons  ratio max/texte={mx/max(carac//4,1):.2f}")
