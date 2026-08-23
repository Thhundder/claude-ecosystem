"""Combien d'ancres une etape de synthese laisse-t-elle deja tomber, EN PRODUCTION ?
C'est l'attrition qu'un condense viendrait aggraver. Mesure sur disque : ancres des 3 rapports
de sonde d'un sous-point, contre ancres du fichier SP-*.md qui en est issu."""
import glob, os, re, collections, statistics as st
D='docs/mailbox-v2'
ANCRE=re.compile(r'[A-Za-z][\w.\-/]{4,}@[0-9a-f]{7,40}:[^\s`]+|RFC\s?\d{3,5}|https?://[^\s`)\]]+|\b[a-z]+_[a-z_]+\b|\b[A-Z][a-z]+[A-Z]\w+\b|\b\d{3,}\b')
def anc(t): return set(m.group(0).rstrip('.,;:') for m in ANCRE.finditer(t))
lignes=[]
for br in sorted(glob.glob(f'{D}/sondes/BR-*')):
    b=os.path.basename(br)
    for f in sorted(glob.glob(f'{br}/SP-*.lourde.md')):
        base=os.path.basename(f).replace('.lourde.md','')
        rap=[f'{br}/{base}.{r}.md' for r in ('lourde','legere','fournisseurs')]
        if not all(os.path.exists(x) for x in rap): continue
        sp=f'{D}/etude/{b}/{base}.md'
        if not os.path.exists(sp): continue
        src=set(); n_src=0
        for x in rap:
            t=open(x,errors='replace').read(); src|=anc(t); n_src+=len(t)
        out=open(sp,errors='replace').read()
        o=anc(out)
        garde=len(src&o)
        lignes.append((base, n_src, len(out), len(src), len(o), garde, len(o-src)))
print(f"{len(lignes)} sous-points ayant leurs 3 rapports de sonde ET leur fichier final\n")
print(f"{'sous-point':<12}{'sondes ko':>10}{'SP ko':>8}{'anc.sondes':>12}{'anc.SP':>8}{'reprises':>10}{'% repris':>10}{'nouvelles':>11}")
for l in lignes[:12]:
    print(f"{l[0]:<12}{l[1]/1024:>10.0f}{l[2]/1024:>8.0f}{l[3]:>12}{l[4]:>8}{l[5]:>10}{100*l[5]/max(l[3],1):>9.0f}%{l[6]:>11}")
if len(lignes)>12: print(f"... ({len(lignes)-12} autres)")
r=[100*l[5]/max(l[3],1) for l in lignes]
nv=[100*l[6]/max(l[4],1) for l in lignes]
print(f"\npart des ancres des sondes reprise dans le fichier final : mediane {st.median(r):.0f} %  (p10 {sorted(r)[len(r)//10]:.0f} %, p90 {sorted(r)[int(.9*len(r))]:.0f} %)")
print(f"part des ancres du fichier final ABSENTES des sondes      : mediane {st.median(nv):.0f} %")
print(f"volume : sondes {st.median(l[1] for l in lignes)/1024:.0f} ko -> fichier {st.median(l[2] for l in lignes)/1024:.0f} ko")
