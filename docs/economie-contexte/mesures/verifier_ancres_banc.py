"""Note les ancres d'un rapport de sonde contre le depot reel.
Une ancre vaut `depot@sha:chemin#symbole:ligne`. Elle est JUSTE si le chemin existe ET si le
symbole apparait a la ligne annoncee ou dans les cinq suivantes. Sinon elle est fausse, et le
detail dit pourquoi. usage : verifier_ancres_banc.py <racine_depot> <fichier_rapport>"""
import re, sys, os
RE=re.compile(r'[\w.\-]+/[\w.\-]+@[0-9a-f]{7,40}:([^\s`#]+)#([^\s`:]+):(\d+)')
racine, rapport = sys.argv[1], sys.argv[2]
txt=open(rapport, errors='replace').read()
vues=set(); juste=0; faux=[]
for m in RE.finditer(txt):
    a=m.group(0)
    if a in vues: continue
    vues.add(a)
    chemin, sym, ligne = m.group(1), m.group(2), int(m.group(3))
    p=os.path.join(racine, chemin)
    if not os.path.exists(p): faux.append((a,'chemin inexistant')); continue
    L=open(p, errors='replace').read().splitlines()
    if ligne>len(L): faux.append((a,f'ligne {ligne} > {len(L)} lignes')); continue
    fen='\n'.join(L[max(0,ligne-1):ligne+5])
    base=sym.split('::')[-1].split('.')[-1]
    if base and base in fen: juste+=1
    else: faux.append((a,f'symbole absent de la fenetre ligne {ligne}..{ligne+5}'))
n=len(vues)
print(f"{os.path.basename(rapport)} · {n} ancres distinctes · JUSTES {juste} ({100*juste/max(n,1):.0f} %) · fausses {len(faux)}")
for a,r in faux[:10]: print(f"   FAUSSE {a[:90]}  — {r}")
