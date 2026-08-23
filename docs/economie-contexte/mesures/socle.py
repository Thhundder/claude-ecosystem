"""De quoi sont faits les 22 300 jetons ecrits au 1er appel ?
Regression cw1 = K + a * (longueur du brief). K = la part invariante non partagee (systeme agent + schemas d'outils).
Controle refutable : si a s'ecarte fortement de 1/4 jeton par caractere, le modele est faux."""
import json, statistics as st, collections
A=[json.loads(l) for l in open('agents.jsonl')]
pts=[(len(a['brief']), a['req'][0][1], a['req'][0][2]) for a in A if a['brief']]
xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
mx=st.mean(xs); my=st.mean(ys)
a_=sum((x-mx)*(y-my) for x,y in pts and zip(xs,ys))/sum((x-mx)**2 for x in xs)
K=my-a_*mx
print(f"n={len(pts)}  cw1 = {K:.0f} + {a_:.4f} x caracteres_du_brief")
print(f"  -> {1/a_:.2f} caracteres par jeton (attendu ~3 a 4 pour du francais)")
print(f"  -> K = {K:.0f} jetons invariants ecrits par CHAQUE agent, hors brief")
print(f"  cr1 median = {st.median([p[2] for p in pts]):.0f} jetons deja partages")
# controle par tranche
tr=collections.defaultdict(list)
for c,cw,cr in pts:
    b = '<5k car' if c<5000 else ('5-15k' if c<15000 else ('15-60k' if c<60000 else '>60k'))
    tr[b].append((c,cw))
for b in ('<5k car','5-15k','15-60k','>60k'):
    if tr[b]:
        cs=[x[0] for x in tr[b]]; ws=[x[1] for x in tr[b]]
        print(f"  {b:<9} n={len(cs):>4}  brief median {st.median(cs):>8.0f} car ({st.median(cs)/4:>7.0f} j)  cw1 median {st.median(ws):>8.0f}  ecart {st.median(ws)-st.median(cs)/4:>8.0f}")
