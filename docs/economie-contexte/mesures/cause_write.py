"""Hypothese : c'est la GENERATION du tour precedent qui dure, pas l'outil.
Refutable : si les tours precedant un ecart > 5 min n'ont pas une sortie anormalement grosse, l'hypothese tombe."""
import json, datetime as dt, statistics as st, collections
A=[json.loads(l) for l in open('agents.jsonl')]
def t(s):
    return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
lents=[]; normaux=[]
paires=[]
for a in A:
    req=a['req']
    outils=collections.defaultdict(list)
    for k,nom in a['outils']: outils[k].append(nom)
    for k in range(1,len(req)):
        d=t(req[k][4]); p=t(req[k-1][4])
        if d is None or p is None: continue
        o_prec=req[k-1][3]
        (lents if d-p>300 else normaux).append(o_prec)
        if d-p>300: paires.append((d-p, o_prec, ','.join(outils.get(k-1,['-']))))
print(f"sortie du tour precedent — ecart > 5 min : n={len(lents)}  mediane {st.median(lents):.0f}  moyenne {st.mean(lents):.0f}  min {min(lents)}  max {max(lents)}")
print(f"sortie du tour precedent — ecart < 5 min : n={len(normaux)} mediane {st.median(normaux):.0f}  moyenne {st.mean(normaux):.0f}")
# duree vs sortie
import statistics
xs=[p[1] for p in paires]; ys=[p[0] for p in paires]
mx=statistics.mean(xs); my=statistics.mean(ys)
cov=sum((x-mx)*(y-my) for x,y in zip(xs,ys)); vx=sum((x-mx)**2 for x in xs); vy=sum((y-my)**2 for y in ys)
print(f"correlation duree/sortie sur ces 241 tours : r = {cov/max((vx*vy)**.5,1e-9):.2f}")
print(f"debit implique (jetons de sortie / seconde) : mediane {st.median([x/y for x,y in zip(xs,ys) if y>0]):.1f}")
