"""Les rapports de sonde sur disque sont-ils bien ceux qui ont produit le fichier ?
recuperer-sondes.ts a ecrit des rapports issus de vols MORTS, posterieurs aux fichiers rediges par
d'autres vols. Une sonde ecrite APRES le fichier ne peut pas l'avoir produit : l'appariement est faux.
A lancer depuis docs/mailbox-v2/."""
import glob, os, re, statistics as st
STRICT=re.compile(r'[\w.\-]+/[\w.\-]+@[0-9a-f]{7,40}:[^\s`\)]+|\b[\w.\-]+@[0-9a-f]{7,40}:[^\s`\)]+|RFC\s?\d{4,5}(?::§[\d.]+)?|https?://[^\s`\)\]]+')
def anc(t): return set(m.group(0).rstrip('.,;:') for m in STRICT.finditer(t))
ok=[]; bad=0
for br in sorted(glob.glob('sondes/BR-*')):
    b=os.path.basename(br)
    for f in sorted(glob.glob(f'{br}/SP-*.lourde.md')):
        base=os.path.basename(f).replace('.lourde.md','')
        rap=[f'{br}/{base}.{r}.md' for r in ('lourde','legere','fournisseurs')]
        sp=f'etude/{b}/{base}.md'
        if not all(os.path.exists(x) for x in rap) or not os.path.exists(sp): continue
        if max(os.path.getmtime(x) for x in rap) >= os.path.getmtime(sp): bad+=1; continue
        src=set()
        for x in rap: src|=anc(open(x,errors='replace').read())
        o=anc(open(sp,errors='replace').read())
        if src: ok.append((base,len(src),len(o),len(src&o)))
print(f"appariements VALIDES {len(ok)} · INVALIDES (sondes posterieures au fichier) {bad}")
r=[100*x[3]/x[1] for x in ok]; nv=[100*(x[2]-x[3])/max(x[2],1) for x in ok]
print(f"ancres des sondes reprises dans le fichier : mediane {st.median(r):.0f} % (min {min(r):.0f}, max {max(r):.0f})")
print(f"ancres du fichier absentes des sondes      : mediane {st.median(nv):.0f} %")
