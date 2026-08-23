"""Une reecriture de cache se voit quand la lecture de cache RECULE : cr_k < cr_{k-1}.
Le contexte, lui, ne peut que croitre. Controle refutable : si les reculs sont rares et petits,
la masse inexpliquee ne vient pas de la reecriture."""
import json, collections, statistics as st
A=[json.loads(l) for l in open('agents.jsonl')]
n_tours=0; n_recul=0; masse_recul=0; cw_tot=0; ecarts=[]
gros=[]
for a in A:
    req=a['req']
    for k in range(1,len(req)):
        n_tours+=1; cw_tot+=req[k][1]
        d=req[k][2]-req[k-1][2]
        if d<0:
            n_recul+=1; masse_recul+=req[k][1]
            gros.append((a['vol'],a['agent'][:14],k,req[k-1][2],req[k][2],req[k][1],req[k-1][4],req[k][4]))
print(f"tours k>0 : {n_tours}   reculs de lecture de cache : {n_recul} ({100*n_recul/n_tours:.1f} %)")
print(f"ecriture de cache sur ces tours : {masse_recul/1e6:.1f} M sur {cw_tot/1e6:.1f} M  = {100*masse_recul/cw_tot:.1f} %")
print("\nexemples :")
for g in gros[:8]: print(f"  {g[1]} tour {g[2]:3}  cr {g[3]:>7} -> {g[4]:>7}  cw {g[5]:>7}  {g[6]} -> {g[7]}")
