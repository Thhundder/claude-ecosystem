"""Piste B — gain exact d'une remise a zero du contexte a mi-parcours, calcule sur les suites cw reelles.
Modele : a partir du tour m, le contexte redevient socle + condense S, puis recroit normalement."""
import json, statistics as st
A=[json.loads(l) for l in open('agents.jsonl')]
def cout_cr(a, m=None, S=0):
    req=a['req']; n=len(req)
    if m is None:
        return sum(r[2] for r in req)
    socle=req[0][0]+req[0][1]+req[0][2]
    C=socle; tot=0
    for k in range(n):
        if k==m: C=socle+S
        if k>0: tot+=C
        C+=req[k][1] if k>0 else 0
    return tot
base=sum(cout_cr(a) for a in A)
print(f"lecture de cache reelle : {base/1e6:.0f} M  (pondere {base*0.1/1e6:.0f} M)")
TOT=1170e6
for frac,lab in ((0.5,'a mi-parcours'),):
    for S in (2000,5000,10000):
        n2=sum(cout_cr(a, max(2,int(len(a['req'])*frac)), S) for a in A)
        g=(base-n2)*0.1
        print(f"  condense {S:>6} j {lab:<16} lecture {n2/1e6:>6.0f} M  gain pondere {g/1e6:>6.1f} M = {100*g/TOT:>4.1f} %")
for S in (5000,):
    for frac in (0.33,0.5,0.66):
        n2=sum(cout_cr(a, max(2,int(len(a['req'])*frac)), S) for a in A)
        g=(base-n2)*0.1
        print(f"  condense {S} j, remise a {frac:.0%}    gain pondere {g/1e6:>6.1f} M = {100*g/TOT:>4.1f} %")
# deux remises
def cout2(a,S=5000):
    req=a['req']; n=len(req); socle=req[0][0]+req[0][1]+req[0][2]
    m1,m2=max(2,n//3), max(3,2*n//3); C=socle; tot=0
    for k in range(n):
        if k in (m1,m2): C=socle+S
        if k>0: tot+=C
        C+=req[k][1] if k>0 else 0
    return tot
n2=sum(cout2(a) for a in A); print(f"  deux remises (1/3 et 2/3), condense 5000 j   gain pondere {(base-n2)*0.1/1e6:.1f} M = {100*(base-n2)*0.1/TOT:.1f} %")
