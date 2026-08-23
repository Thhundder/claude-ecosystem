"""Gain du groupage : fusionner une fraction des tours. La matiere ajoutee est identique,
seul le nombre de relectures du contexte baisse."""
import json, random
A=[json.loads(l) for l in open('agents.jsonl')]
random.seed(5)
def cr_simule(a, taux):
    req=a['req']; n=len(req)
    socle=req[0][0]+req[0][1]+req[0][2]
    C=socle; tot=0; report=0
    for k in range(1,n):
        d=req[k][1]
        if random.random()<taux and k<n-1:
            report+=d           # ce tour est fusionne dans le suivant : pas de relecture
        else:
            tot+=C; C+=d+report; report=0
    return tot
base=sum(sum(r[2] for r in a['req']) for a in A)
print(f"lecture reelle {base/1e6:.0f} M · pondere {base*0.1/1e6:.0f} M")
for taux in (0.25,0.40,0.53):
    s=sum(cr_simule(a,taux) for a in A)
    g=(base-s)*0.1
    print(f"  {taux:.0%} des tours fusionnes : lecture {s/1e6:>5.0f} M · gain pondere {g/1e6:>6.1f} M = {100*g/1170e6:>4.1f} % du total")
