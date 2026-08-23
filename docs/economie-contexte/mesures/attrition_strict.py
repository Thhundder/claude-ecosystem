"""Attrition d'ancres OPPOSABLES (depot@sha:chemin, RFC, URL) entre les 3 rapports de sonde et le
fichier de sous-point qui en est issu. A lancer depuis la racine de pms-ia."""
import glob, os, re, statistics as st
D='docs/mailbox-v2'
STRICT=re.compile(r'[\w.\-]+/[\w.\-]+@[0-9a-f]{7,40}:[^\s`\)]+|\b[\w.\-]+@[0-9a-f]{7,40}:[^\s`\)]+|RFC\s?\d{4,5}(?::§[\d.]+)?|https?://[^\s`\)\]]+')
def anc(t): return set(m.group(0).rstrip('.,;:') for m in STRICT.finditer(t))
res=[]
for br in sorted(glob.glob(f'{D}/sondes/BR-*')):
    b=os.path.basename(br)
    for f in sorted(glob.glob(f'{br}/SP-*.lourde.md')):
        base=os.path.basename(f).replace('.lourde.md','')
        rap=[f'{br}/{base}.{r}.md' for r in ('lourde','legere','fournisseurs')]
        sp=f'{D}/etude/{b}/{base}.md'
        if not all(os.path.exists(x) for x in rap) or not os.path.exists(sp): continue
        src=set()
        for x in rap: src|=anc(open(x,errors='replace').read())
        o=anc(open(sp,errors='replace').read())
        if src: res.append((base,len(src),len(o),len(src&o)))
r=[100*x[3]/x[1] for x in res]
print(f"{len(res)} sous-points · ancres opposables sondes mediane {st.median(x[1] for x in res):.0f} · fichier {st.median(x[2] for x in res):.0f}")
print(f"reprises telles quelles : mediane {st.median(r):.0f} % (p10 {sorted(r)[len(r)//10]:.0f} %, p90 {sorted(r)[int(.9*len(r))]:.0f} %)")
print(f"ancres du fichier absentes des sondes : mediane {st.median(100*(x[2]-x[3])/max(x[2],1) for x in res):.0f} %")
