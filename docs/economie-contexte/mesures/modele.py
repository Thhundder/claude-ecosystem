"""Le coût est-il expliqué par : cr = somme des contextes, cw = matiere ajoutee ?
Controle qui peut echouer : si cw_k s'ecarte fortement de (sortie_{k-1}+resultats_{k-1}),
le modele est faux et il reste une masse inexpliquee a nommer."""
import json, statistics as st, collections
A=[json.loads(l) for l in open('agents.jsonl')]
# masse par agent
cw_tot=cr_tot=o_tot=res_tot=0; n_tot=0; socle_tot=0
ecarts=[]
for a in A:
    req=a['req']; n=len(req)
    res_par_tour=collections.Counter()
    for k,nom,t in a['resultats']: res_par_tour[k]+=t
    socle_tot+=req[0][0]+req[0][1]+req[0][2]
    for k,(i,cw,cr,o,ts) in enumerate(req):
        cw_tot+=cw; cr_tot+=cr; o_tot+=o
        if k>0:
            attendu=req[k-1][3]+res_par_tour.get(k-1,0)
            ecarts.append((cw, attendu))
    res_tot+=sum(res_par_tour.values()); n_tot+=n
N=len(A)
print(f"par agent : {n_tot/N:.1f} tours · socle {socle_tot/N:.0f} · cw {cw_tot/N:.0f} · cr {cr_tot/N:.0f} · sortie {o_tot/N:.0f} · resultats {res_tot/N:.0f}")
print(f"matiere ajoutee apres le socle : {(cw_tot-socle_tot)/N:.0f}   dont sortie {o_tot/N:.0f} + resultats {res_tot/N:.0f} = {(o_tot+res_tot)/N:.0f}   INEXPLIQUE {(cw_tot-socle_tot-o_tot-res_tot)/N:.0f}")
obs=sum(c for c,_ in ecarts); att=sum(a for _,a in ecarts)
print(f"tours k>0 : cw observe {obs/1e6:.1f} M  vs  attendu(sortie+resultats du tour precedent) {att/1e6:.1f} M   ratio {obs/max(att,1):.2f}")
# verification du modele quadratique
pred=0
for a in A:
    req=a['req']; C=req[0][0]+req[0][1]+req[0][2]; s=0
    for k,(i,cw,cr,o,ts) in enumerate(req):
        s+=C if k>0 else 0
        C+=cw if k>0 else 0
    pred+=s
print(f"cr predit par le cumul des cw : {pred/1e6:.0f} M   observe {cr_tot/1e6:.0f} M   ratio {pred/cr_tot:.2f}")
