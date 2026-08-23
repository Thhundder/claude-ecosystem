"""Quel outil precede un ecart > 5 min (donc une reecriture) ?"""
import json, datetime as dt, collections
A=[json.loads(l) for l in open('agents.jsonl')]
def t(s):
    return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
c=collections.Counter(); m=collections.Counter(); tous=collections.Counter()
vols=collections.Counter()
for a in A:
    req=a['req']
    outils=collections.defaultdict(list)
    for k,nom in a['outils']: outils[k].append(nom)
    for k in range(1,len(req)):
        d=t(req[k][4]); p=t(req[k-1][4])
        for nm in outils.get(k-1,[]): tous[nm]+=1
        if d and p and d-p>300:
            for nm in outils.get(k-1,['(aucun)']): c[nm]+=1; m[nm]+=req[k][1]
            vols[a['vol']]+=1
print("outil du tour precedent, pour les ecarts > 5 min :")
for nm,n in c.most_common(12):
    print(f"  {nm:<26}{n:>5} tours  {m[nm]/1e6:>6.1f} M reecrits   (sur {tous[nm]} appels de cet outil : {100*n/max(tous[nm],1):.2f} %)")
print("\nrepartition par vol :", dict(vols.most_common(8)))
