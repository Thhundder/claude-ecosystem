"""Piste A, chiffree. Deux mesures :
1) masse invariante d'un brief de sonde (SequenceMatcher entre deux briefs du meme role)
2) le partage fonctionne-t-il deja ? cw du 1er appel selon l'ordre de depart dans le vol."""
import json, collections, difflib, datetime as dt, statistics as st
A=[json.loads(l) for l in open('agents.jsonl')]
def role(b):
    for m in ('SONDE LOURDE','SONDE LEGERE','SONDE FOURNISSEURS','SYNTHETISEUR','5e AGENT DE LA BRANCHE'):
        if m in b[:8000]: return m
    return 'autre'
g=collections.defaultdict(list)
for a in A:
    if a['brief']: g[role(a['brief'])].append(a['brief'])
print("masse invariante entre deux briefs du meme role (caracteres) :")
for r in ('SONDE LOURDE','SONDE LEGERE','SONDE FOURNISSEURS'):
    bs=g[r]
    ech=[(bs[i],bs[i+1]) for i in range(0,min(len(bs)-1,6),2)]
    vals=[]
    for x,y in ech:
        sm=difflib.SequenceMatcher(None,x,y,autojunk=False)
        vals.append(sum(b.size for b in sm.get_matching_blocks()))
    print(f"  {r:<20} brief moyen {st.mean(len(b) for b in bs):8.0f} car · invariant median {st.median(vals):8.0f} car ({100*st.median(vals)/st.mean(len(b) for b in bs):.1f} %) ≈ {st.median(vals)/4:.0f} jetons")
# synthetiseur : invariant = tout ce qui precede le premier rapport
bs=g['SYNTHETISEUR']
pos=[b.find('════ RAPPORT DE LA SONDE LOURDE') for b in bs]
pos=[p for p in pos if p>0]
print(f"  SYNTHETISEUR         brief moyen {st.mean(len(b) for b in bs):8.0f} car · entete avant les rapports median {st.median(pos):.0f} car ≈ {st.median(pos)/4:.0f} jetons")

print("\npartage effectif aujourd'hui — cw du 1er appel par rang de depart dans le vol :")
def t(s): return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else 0
vols=collections.defaultdict(list)
for a in A: vols[a['vol']].append(a)
rangs=collections.defaultdict(list)
for v,ags in vols.items():
    ags=[x for x in ags if x['req'][0][4]]
    ags.sort(key=lambda x:t(x['req'][0][4]))
    for i,a in enumerate(ags):
        rangs[min(i,9)].append((a['req'][0][1], a['req'][0][2]))
for i in range(10):
    if rangs[i]:
        cw=[x[0] for x in rangs[i]]; cr=[x[1] for x in rangs[i]]
        print(f"  rang {i:>2} : n={len(cw):>4}  cw median {st.median(cw):>7.0f}  cr median {st.median(cr):>7.0f}")
