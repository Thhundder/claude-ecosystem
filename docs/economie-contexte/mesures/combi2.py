"""Simulateur exact. Le contexte d'un tour est observable : C_k = i_k + cw_k + cr_k.
La matiere ajoutee est D_k = C_k - C_{k-1}. Une reecriture ne change pas C, seulement le partage cw/cr.
On reconstruit donc la suite (C_k) reelle, puis on lui applique les leviers."""
import json, random
A=[json.loads(l) for l in open('agents.jsonl')]
def suite(a):
    req=a['req']
    C=[r[0]+r[1]+r[2] for r in req]
    O=[r[3] for r in req]
    RE=[False]+[req[k][2]<req[k-1][2] for k in range(1,len(req))]
    MRE=[0]+[req[k][1] if req[k][2]<req[k-1][2] else 0 for k in range(1,len(req))]
    return C,O,RE,MRE
SU=[suite(a) for a in A]
def cout(d_socle=0, fusion=0.0, remise=None, S=5000, ttl=False, graine=5):
    random.seed(graine); tot=0.0
    for C,O,RE,MRE in SU:
        n=len(C)
        D=[C[0]-d_socle]+[max(0,C[k]-C[k-1]) for k in range(1,n)]
        D[0]=max(2000,D[0])
        ctx=0.0; report=0.0; m=int(n*remise) if remise else None
        for k in range(n):
            tot+=O[k]*5.0
            if k==0:
                ctx=D[0]; tot+=D[0]*1.25; continue
            if m is not None and k==m: ctx=D[0]+S
            if fusion and k<n-1 and random.random()<fusion:
                report+=D[k]; continue
            tot+=ctx*0.1                      # relecture du contexte deja en place
            nouveau=D[k]+report; report=0.0
            if RE[k] and not ttl:
                tot+=ctx*1.15                 # reecriture : le contexte repasse en ecriture
            tot+=nouveau*1.25; ctx+=nouveau
    return tot
BASE=cout()
print(f"base simulee {BASE/1e6:.0f} M   (mesure exacte 1170 M — ecart {100*abs(BASE-1170e6)/1170e6:.1f} %)\n")
def L(nom,**kw):
    c=cout(**kw); print(f"  {nom:<56}{c/1e6:>7.0f} M   -{100*(BASE-c)/BASE:>5.1f} %")
print("SEULES :")
L("retirer le listing des skills (8 452 j)", d_socle=8452)
L("retirer skills + chaine CLAUDE.md (15 285 j)", d_socle=15285)
L("supprimer les reecritures (decouper la redaction finale)", ttl=True)
L("grouper 25 % des tours", fusion=0.25)
L("grouper 53 % des tours (plafond mesure)", fusion=0.53)
L("condense a mi-parcours, 5 000 j", remise=0.5)
L("condense a 1/3 et 2/3", remise=0.33)
print("\nCOMBINEES :")
L("skills + reecritures", d_socle=8452, ttl=True)
L("skills + reecritures + groupage 25 %", d_socle=8452, ttl=True, fusion=0.25)
L("les trois sans risque + condense", d_socle=8452, ttl=True, fusion=0.25, remise=0.5)
L("skills+CLAUDE.md + reecritures + groupage 53 %", d_socle=15285, ttl=True, fusion=0.53)
L("tout, condense compris", d_socle=15285, ttl=True, fusion=0.53, remise=0.5)
