"""Piste A — seul le PREFIXE compte pour le cache. Mesure du prefixe commun reel par vol et par role,
et de ce qu'il deviendrait si l'invariant etait remonte en tete."""
import json, collections, os
A=[json.loads(l) for l in open('agents.jsonl')]
def role(b):
    for m in ('SONDE LOURDE','SONDE LEGERE','SONDE FOURNISSEURS','SYNTHETISEUR','5e AGENT DE LA BRANCHE'):
        if m in b[:8000]: return m
    return 'autre'
g=collections.defaultdict(list)
for a in A:
    if a['brief']: g[(a['vol'],role(a['brief']))].append(a['brief'])
def pref(ss):
    p=ss[0]
    for s in ss[1:]:
        i=0; L=min(len(p),len(s))
        while i<L and p[i]==s[i]: i+=1
        p=p[:i]
    return p
par=collections.defaultdict(lambda:[0,0,0.0,0.0,0.0])
for (v,r),bs in g.items():
    if len(bs)<2: continue
    p=len(pref(bs))
    d=par[r]; d[0]+=1; d[1]+=len(bs); d[2]+=sum(len(x) for x in bs)/len(bs); d[3]+=p
print(f"{'role':<24}{'groupes':>8}{'briefs':>8}{'car. moyen':>12}{'prefixe commun':>16}{'part':>7}")
for r,d in sorted(par.items(), key=lambda x:-x[1][1]):
    n=d[0]; print(f"{r:<24}{n:>8}{d[1]:>8}{d[2]/n:>12.0f}{d[3]/n:>16.0f}{100*d[3]/max(d[2],1):>6.1f}%")
# ou se trouve la premiere variable dans le SOCLE ?
ex=[b for b in g[[k for k in g if k[1]=='SONDE LOURDE'][0]]][:2]
print("\npremiers 200 caracteres d'un brief de sonde lourde :")
print(repr(ex[0][:200]))
