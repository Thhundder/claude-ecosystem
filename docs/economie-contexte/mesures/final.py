"""Chiffrage final, regime actuel, avec la borne d'ecriture appliquee a la seule part des reecritures
imputable a un Write (55 % de la masse, mesure par lent.py). Le reste est laisse intact."""
import json, random, statistics as st, collections
A=[json.loads(l) for l in open('agents.jsonl')]
A=[a for a in A if (a['req'][0][4] or '')[:10]>='2026-08-22']
P=dict(i=1.0,cw=1.25,cr=0.1,o=5.0)
SU=[]
for a in A:
    req=a['req']; out=collections.defaultdict(list)
    for k,nom in a['outils']: out[k].append(nom)
    SU.append(([r[0]+r[1]+r[2] for r in req],[r[3] for r in req],
               [False]+[req[k][2]<req[k-1][2] for k in range(1,len(req))],
               [('Write' in out.get(k-1,[]) or not out.get(k-1)) for k in range(len(req))]))
def cout(d_socle=0,fusion=0.0,ttl=None,graine=5):
    random.seed(graine); tot=0.0
    for C,O,RE,WR in SU:
        n=len(C); D=[max(2000,C[0]-d_socle)]+[max(0,C[k]-C[k-1]) for k in range(1,n)]
        ctx=0.0; report=0.0
        for k in range(n):
            tot+=O[k]*5.0
            if k==0: ctx=D[0]; tot+=D[0]*1.25; continue
            if fusion and k<n-1 and random.random()<fusion: report+=D[k]; continue
            tot+=ctx*0.1
            evite = ttl=='tout' or (ttl=='write' and WR[k])
            if RE[k] and not evite: tot+=ctx*1.15
            tot+=(D[k]+report)*1.25; ctx+=D[k]+report; report=0.0
    return tot
B=cout()
def L(n,**k): c=cout(**k); print(f"  {n:<52}-{100*(B-c)/B:>5.1f} %")
print(f"base {B/1e6:.0f} M\n")
L("skills seul", d_socle=3617)
L("borne d'ecriture — part Write+redaction (mesuree)", ttl='write')
L("borne d'ecriture — suppression totale (plafond)", ttl='tout')
L("groupage 25 % seul (simule)", fusion=0.25)
print()
L("PRUDENT : skills + borne Write + groupage 15 %", d_socle=3617, ttl='write', fusion=0.15)
L("ATTENDU : skills + borne Write + groupage 25 %", d_socle=3617, ttl='write', fusion=0.25)
L("PLAFOND : skills + suppression totale + groupage 40 %", d_socle=3617, ttl='tout', fusion=0.40)
