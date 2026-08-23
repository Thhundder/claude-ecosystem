"""Traduction du pourcentage en quantites reelles : par agent, par sous-point, et pour les 112 restants."""
import json, statistics as st, collections
A=[json.loads(l) for l in open('agents.jsonl')]
P=dict(i=1.0,cw=1.25,cr=0.1,o=5.0)
def cout(ags):
    t=collections.Counter()
    for a in ags:
        for i,cw,cr,o,ts in a['req']: t['i']+=i;t['cw']+=cw;t['cr']+=cr;t['o']+=o
    return sum(t[k]*v for k,v in P.items())
REC=[a for a in A if (a['req'][0][4] or '')[:10]>='2026-08-22']
print(f"corpus complet : {len(A)} agents · {cout(A)/1e6:.0f} M unites ponderees")
print(f"regime actuel  : {len(REC)} agents · {cout(REC)/1e6:.0f} M · {cout(REC)/len(REC)/1e6:.3f} M par agent")
# par role
def role(b):
    for m in ('SONDE LOURDE','SONDE LEGERE','SONDE FOURNISSEURS','SYNTHETISEUR','5e AGENT DE LA BRANCHE'):
        if m in b[:8000]: return m
    return 'autre'
g=collections.defaultdict(list)
for a in REC: g[role(a['brief'])].append(a)
print()
for r,ags in sorted(g.items(), key=lambda x:-cout(x[1])):
    print(f"  {r:<24}{len(ags):>4} agents · {cout(ags)/1e6:>6.1f} M · {cout(ags)/len(ags)/1e6:.3f} M/agent")
sondes=sum(len(g[k]) for k in ('SONDE LOURDE','SONDE LEGERE','SONDE FOURNISSEURS'))
c_sonde=sum(cout(g[k]) for k in ('SONDE LOURDE','SONDE LEGERE','SONDE FOURNISSEURS'))
c_syn=cout(g.get('SYNTHETISEUR',[]))
n_syn=len(g.get('SYNTHETISEUR',[]))
if n_syn:
    sp=c_sonde/max(sondes,1)*3 + c_syn/n_syn
    print(f"\ncout d'UN sous-point en vol complet : 3 sondes + 1 synthese = {sp/1e6:.2f} M unites ponderees")
    print(f"  reste 112 sous-points -> {112*sp/1e6:.0f} M")
    for lab,pc in (("les 3 leviers (19,9 %)",0.199),("+ condense (33,8 %)",0.338)):
        print(f"  {lab:<26} economise {112*sp*pc/1e6:>6.0f} M  -> il resterait {112*sp*(1-pc)/1e6:.0f} M")
