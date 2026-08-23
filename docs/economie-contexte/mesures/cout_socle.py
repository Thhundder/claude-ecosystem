"""Cout pondere d'un jeton place dans le SOCLE : ecrit une fois (1,25) puis relu a chaque tour (0,1).
Applique aux composants mesurables du socle."""
import json, statistics as st
A=[json.loads(l) for l in open('agents.jsonl')]
tours=[a['n'] for a in A]
facteur=[1.25+0.1*(n-1) for n in tours]
print(f"agents {len(A)} · tours median {st.median(tours):.0f} · facteur pondere d'un jeton de socle : median {st.median(facteur):.2f}, moyen {st.mean(facteur):.2f}")
TOT=1170e6
def chiffre(nom, jetons, n_agents=None):
    n = n_agents or len(A)
    f = st.mean(facteur)
    c = jetons*f*n
    print(f"  {nom:<38}{jetons:>8.0f} j/agent × {n:>5} agents × {f:.2f} = {c/1e6:>7.1f} M pondérés  = {100*c/TOT:>4.1f} % du total")
print("\ncomposants du socle, cout pondere sur tout le corpus :")
chiffre("listing des skills (jamais employe)", 21469/2.54, 1286)
chiffre("chaine CLAUDE.md + AGENTS.md", 17355/2.54)
chiffre("liste des outils differes", 2776/2.54, 1286)
chiffre("brief d'une sonde (total)", 7800/2.54)
chiffre("  dont partie invariante d'une sonde", 4400/2.54)
