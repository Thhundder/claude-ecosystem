"""Le constat des 43 % : les ancres d'un fichier absentes de ses sondes sont-elles du reformatage,
de la re-derivation, ou de la fabrication ? Comptage par famille, et pour la famille depot@sha
— la seule verifiable — controle du sha ET du chemin contre les sondes."""
import glob, os, re, collections, statistics as st
D='docs/mailbox-v2'
DEPOT=re.compile(r'([\w.\-]+(?:/[\w.\-]+)?)@([0-9a-f]{7,40}):([^\s`\)\]]+)')
RFC=re.compile(r'RFC\s?(\d{4,5})')
URL=re.compile(r'https?://([^\s`\)\]/]+)(/[^\s`\)\]]*)?')
res=collections.Counter(); ex=collections.defaultdict(list)
n_sp=0
for br in sorted(glob.glob(f'{D}/sondes/BR-*')):
    b=os.path.basename(br)
    for f in sorted(glob.glob(f'{br}/SP-*.lourde.md')):
        base=os.path.basename(f).replace('.lourde.md','')
        rap=[f'{br}/{base}.{r}.md' for r in ('lourde','legere','fournisseurs')]
        sp=f'{D}/etude/{b}/{base}.md'
        if not all(os.path.exists(x) for x in rap) or not os.path.exists(sp): continue
        n_sp+=1
        src=''.join(open(x,errors='replace').read() for x in rap)
        out=open(sp,errors='replace').read()
        s_dep={m.group(0) for m in DEPOT.finditer(src)}
        s_sha={m.group(2)[:12] for m in DEPOT.finditer(src)}
        s_che={m.group(3).split(':')[0] for m in DEPOT.finditer(src)}
        s_rfc={m.group(1) for m in RFC.finditer(src)}
        s_dom={m.group(1) for m in URL.finditer(src)}
        for m in DEPOT.finditer(out):
            if m.group(0) in s_dep: res['depot identique']+=1
            elif m.group(2)[:12] in s_sha and m.group(3).split(':')[0] in s_che: res['depot: sha+chemin connus, ligne/symbole different']+=1
            elif m.group(2)[:12] in s_sha: res['depot: sha connu, CHEMIN inconnu']+=1
            else:
                res['depot: SHA INCONNU des sondes']+=1
                if len(ex['sha'])<6: ex['sha'].append(f"{base}: {m.group(0)[:80]}")
        for m in RFC.finditer(out):
            res['RFC deja cite' if m.group(1) in s_rfc else 'RFC absent des sondes']+=1
            if m.group(1) not in s_rfc and len(ex['rfc'])<6: ex['rfc'].append(f"{base}: RFC {m.group(1)}")
        for m in URL.finditer(out):
            res['URL: domaine deja cite' if m.group(1) in s_dom else 'URL: DOMAINE inconnu']+=1
            if m.group(1) not in s_dom and len(ex['url'])<6: ex['url'].append(f"{base}: {m.group(1)}")
t=sum(res.values())
print(f"{n_sp} sous-points · {t} ancres opposables dans les fichiers finaux\n")
for k,v in res.most_common():
    print(f"  {v:>6} ({100*v/t:>5.1f} %)  {k}")
for fam,titre in (('sha','SHA inconnus des sondes'),('rfc','RFC absents des sondes'),('url','domaines inconnus')):
    if ex[fam]:
        print(f"\nexemples — {titre} :")
        for e in ex[fam][:4]: print(f"    {e}")
