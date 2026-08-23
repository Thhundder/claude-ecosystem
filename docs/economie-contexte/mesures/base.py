import json, statistics as st, collections
PRIX = dict(o=5.0, i=1.0, cw=1.25, cr=0.1)
A=[json.loads(l) for l in open('agents.jsonl')]
tot=collections.Counter(); nreq=[]; socle=[]; brief=[]; cw1=[]; res_tot=0
for a in A:
    nreq.append(a['n'])
    r0=a['req'][0]; socle.append(r0[0]+r0[1]+r0[2]); cw1.append(r0[1])
    brief.append(len(a['brief'])//4)
    for i,cw,cr,o,ts in a['req']:
        tot['i']+=i; tot['cw']+=cw; tot['cr']+=cr; tot['o']+=o
    res_tot+=sum(x[2] for x in a['resultats'])
cout=sum(tot[k]*v for k,v in PRIX.items())
print(f"agents            {len(A)}")
print(f"requêtes totales  {sum(nreq)}   médiane {st.median(nreq):.0f}  p90 {sorted(nreq)[int(.9*len(nreq))]}  moy {st.mean(nreq):.1f}")
print(f"socle (1er appel) médiane {st.median(socle):.0f}  moy {st.mean(socle):.0f}")
print(f"cache écrit 1er   médiane {st.median(cw1):.0f}  moy {st.mean(cw1):.0f}")
print(f"brief             médiane {st.median(brief):.0f}  p90 {sorted(brief)[int(.9*len(brief))]}")
print()
for k in ('i','cw','cr','o'):
    print(f"  {k:3} brut {tot[k]/1e6:9.1f} M   pondéré {tot[k]*PRIX[k]/1e6:9.1f} M   {100*tot[k]*PRIX[k]/cout:5.1f} % du coût   {100*tot[k]/sum(tot.values()):5.1f} % du volume")
print(f"  COÛT PONDÉRÉ TOTAL {cout/1e6:.0f} M")
print(f"  résultats d'outils {res_tot/1e6:.2f} M  -> facteur de port {tot['cr']/max(res_tot,1):.1f}")
