"""Volume de matiere brute lue par agent, et part de la premiere moitie — taux de compression
qu'un condense doit tenir. Facteur caracteres/jetons = 2,54 (voir socle.py)."""
import json, statistics as st
A=[json.loads(l) for l in open('agents.jsonl')]
av=[];tot=[]
for a in A:
    n=len(a['req']); m=max(2,n//2)
    s1=sum(t for k,nom,t in a['resultats'] if k<m); s=sum(t for k,nom,t in a['resultats'])
    if n>=8 and s>0: av.append(s1*4/2.54); tot.append(s*4/2.54)
print(f"n={len(av)} agents (>=8 tours)")
print(f"matiere brute par agent : totale mediane {st.median(tot):.0f} j · premiere moitie mediane {st.median(av):.0f} j")
print(f"compression exigee d'un condense de 5000 j : {st.median(av)/5000:.0f} : 1")
