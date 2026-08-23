"""Piste B — RISQUE. Pour chaque agent : d'ou vient chaque ancre de son rapport final ?
Une ancre dont la SEULE source est un resultat d'outil anterieur au point de remise a zero
disparait avec le contexte, sauf si le condense la porte.
Controle refutable : si presque toutes les ancres proviennent de la seconde moitie, le condense ne risque rien."""
import json, glob, os, re, collections, statistics as st, sys

P=os.path.expanduser('~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia')
ANCRE = re.compile(r'[A-Za-z][\w.\-/]{4,}@[0-9a-f]{7,40}:[^\s`]+|RFC\s?\d{3,5}|https?://[^\s`)\]]+|\b[a-z]+_[a-z_]+\b|\b[A-Z][a-z]+[A-Z]\w+\b|\b\d{3,}\b')
def ancres(t):
    return set(m.group(0).rstrip('.,;:') for m in ANCRE.finditer(t))

def analyser(p, frac=0.5):
    tours=[]; nom2={}; rapport=[]
    cur=-1
    for l in open(p, errors='replace'):
        try: r=json.loads(l)
        except: continue
        m=r.get('message') or {}; c=m.get('content')
        if r.get('type')=='assistant':
            rid=r.get('requestId') or m.get('id')
            if rid not in nom2: nom2[rid]=len(nom2); tours.append([])
            cur=nom2[rid]
            if isinstance(c,list):
                txt=[b.get('text','') for b in c if isinstance(b,dict) and b.get('type')=='text']
                if txt: rapport=txt
        if r.get('type')=='user' and isinstance(c,list) and cur>=0:
            for b in c:
                if isinstance(b,dict) and b.get('type')=='tool_result':
                    tours[cur].append(json.dumps(b.get('content',''), ensure_ascii=False))
        if r.get('type')=='attachment' and cur>=0:
            a=r.get('attachment') or {}
            if a.get('type')=='read_truncation_notice': continue
    n=len(tours)
    if n<8: return None
    rap='\n'.join(rapport)
    if len(rap)<3000: return None
    m=max(2,int(n*frac))
    A=ancres(rap)
    if not A: return None
    avant=collections.Counter(); apres=collections.Counter()
    txt_av='\n'.join(x for t in tours[:m] for x in t)
    txt_ap='\n'.join(x for t in tours[m:] for x in t)
    seul_avant=[]; des_deux=0; jamais=0; seul_apres=0
    for a in A:
        av = a in txt_av; ap = a in txt_ap
        if av and ap: des_deux+=1
        elif av: seul_avant.append(a)
        elif ap: seul_apres+=1
        else: jamais+=1
    return dict(n=n, m=m, rap=len(rap), tot=len(A), seul_avant=len(seul_avant),
                des_deux=des_deux, seul_apres=seul_apres, jamais=jamais,
                car_avant=sum(len(x)+2 for x in seul_avant))

fics=sorted(glob.glob(f'{P}/*/subagents/workflows/wf_*/agent-*.jsonl'))
import random; random.seed(7); random.shuffle(fics)
res=[]
for p in fics:
    if os.path.getsize(p) < 200000: continue
    d=analyser(p)
    if d: res.append(d)
    if len(res)>=45: break
print(f"{len(res)} agents analyses (rapport final > 3000 car, > 8 tours)\n")
def col(k): return [r[k] for r in res]
print(f"tours median {st.median(col('n')):.0f} · rapport median {st.median(col('rap')):.0f} car · ancres distinctes medianes {st.median(col('tot')):.0f}")
tot=sum(col('tot'))
print(f"\nprovenance des {tot} ancres de rapport, remise a zero a mi-parcours :")
for k,lab in (('jamais','jamais vue dans un resultat d\'outil (brief, norme, redaction propre)'),
              ('seul_avant','vue UNIQUEMENT avant la remise a zero  → EN RISQUE'),
              ('des_deux','vue avant ET apres'),
              ('seul_apres','vue uniquement apres')):
    s=sum(col(k)); print(f"  {lab:<62}{s:>7}  {100*s/tot:>5.1f} %")
parts=[100*r['seul_avant']/r['tot'] for r in res]
print(f"\npart en risque par agent : mediane {st.median(parts):.1f} %  p90 {sorted(parts)[int(.9*len(parts))]:.1f} %  max {max(parts):.1f} %")
print(f"volume a porter par le condense pour couvrir ces ancres : median {st.median(col('car_avant')):.0f} car ≈ {st.median(col('car_avant'))/2.54:.0f} jetons  (p90 {sorted(col('car_avant'))[int(.9*len(res))]/2.54:.0f} j)")
