"""Tout est rejoue sur le REGIME ACTUEL : les vols des 22 et 23 aout, seuls representatifs de ce qui partira demain."""
import json, random, statistics as st, collections
A=[json.loads(l) for l in open('agents.jsonl')]
A=[a for a in A if (a['req'][0][4] or '')[:10] >= '2026-08-22']
print(f"{len(A)} agents · {sum(a['n'] for a in A)} tours")
PRIX=dict(i=1.0,cw=1.25,cr=0.1,o=5.0)
t=collections.Counter()
for a in A:
    for i,cw,cr,o,ts in a['req']: t['i']+=i; t['cw']+=cw; t['cr']+=cr; t['o']+=o
BASE=sum(t[k]*v for k,v in PRIX.items())
print(f"cout pondere du regime actuel : {BASE/1e6:.0f} M   (sortie {100*t['o']*5/BASE:.0f} %, ecriture {100*t['cw']*1.25/BASE:.0f} %, lecture {100*t['cr']*0.1/BASE:.0f} %)")
print(f"socle median {st.median([a['req'][0][0]+a['req'][0][1]+a['req'][0][2] for a in A]):.0f} · tours median {st.median([a['n'] for a in A]):.0f}")
def suite(a):
    req=a['req']
    return ([r[0]+r[1]+r[2] for r in req],[r[3] for r in req],
            [False]+[req[k][2]<req[k-1][2] for k in range(1,len(req))])
SU=[suite(a) for a in A]
def cout(d_socle=0,fusion=0.0,remise=None,S=5000,ttl=False,graine=5):
    random.seed(graine); tot=0.0
    for C,O,RE in SU:
        n=len(C); D=[max(2000,C[0]-d_socle)]+[max(0,C[k]-C[k-1]) for k in range(1,n)]
        ctx=0.0; report=0.0; m=int(n*remise) if remise else None
        for k in range(n):
            tot+=O[k]*5.0
            if k==0: ctx=D[0]; tot+=D[0]*1.25; continue
            if m is not None and k==m: ctx=D[0]+S
            if fusion and k<n-1 and random.random()<fusion: report+=D[k]; continue
            tot+=ctx*0.1
            if RE[k] and not ttl: tot+=ctx*1.15
            tot+=(D[k]+report)*1.25; ctx+=D[k]+report; report=0.0
    return tot
B=cout(); print(f"base simulee {B/1e6:.0f} M (ecart {100*abs(B-BASE)/BASE:.1f} %)\n")
def L(n,**k):
    c=cout(**k); print(f"  {n:<56}{c/1e6:>7.0f} M   -{100*(B-c)/B:>5.1f} %")
print("SEULES, regime actuel :")
L("retirer le listing des skills (3 617 j)", d_socle=3617)
L("retirer skills + chaine CLAUDE.md (10 450 j)", d_socle=10450)
L("supprimer les reecritures de cache", ttl=True)
L("grouper 25 % des tours", fusion=0.25)
L("grouper 53 % des tours (plafond mesure)", fusion=0.53)
L("condense a mi-parcours, 5 000 j", remise=0.5)
print("\nCOMBINEES :")
L("skills + reecritures", d_socle=3617, ttl=True)
L("skills + reecritures + groupage 25 %", d_socle=3617, ttl=True, fusion=0.25)
L("les trois sans risque + condense", d_socle=3617, ttl=True, fusion=0.25, remise=0.5)
L("skills+CLAUDE.md + reecritures + groupage 53 %", d_socle=10450, ttl=True, fusion=0.53)
L("tout, condense compris", d_socle=10450, ttl=True, fusion=0.53, remise=0.5)
