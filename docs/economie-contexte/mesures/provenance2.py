"""Risque du condense, mesure sur le LIVRABLE et non sur les seules etiquettes :
quelle part du rapport final (en caracteres de paragraphe) s'appuie sur une ancre dont
la seule source est anterieure a la remise a zero ?"""
import json, glob, os, re, collections, statistics as st, random
P=os.path.expanduser('~/.claude/projects/-home-thundder-Documents-Xeko-pms-ia')
ANCRE = re.compile(r'[A-Za-z][\w.\-/]{4,}@[0-9a-f]{7,40}:[^\s`]+|RFC\s?\d{3,5}|https?://[^\s`)\]]+|\b[a-z]+_[a-z_]+\b|\b[A-Z][a-z]+[A-Z]\w+\b|\b\d{3,}\b')
def analyser(p, frac=0.5):
    tours=[]; nom2={}; rapport=[]; cur=-1
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
                    tours[cur].append(json.dumps(b.get('content',''),ensure_ascii=False))
    n=len(tours); rap='\n'.join(rapport)
    if n<8 or len(rap)<3000: return None
    m=max(2,int(n*frac))
    av='\n'.join(x for t in tours[:m] for x in t); ap='\n'.join(x for t in tours[m:] for x in t)
    cache={}
    def statut(a):
        if a not in cache:
            cache[a]=( (a in av), (a in ap) )
        return cache[a]
    paras=[q for q in re.split(r'\n\s*\n', rap) if q.strip()]
    c_tot=c_risque=c_sur=c_libre=0
    for q in paras:
        As=set(x.group(0).rstrip('.,;:') for x in ANCRE.finditer(q))
        risque = any(statut(a)==(True,False) for a in As)
        source = any(statut(a)[0] or statut(a)[1] for a in As)
        c_tot+=len(q)
        if risque: c_risque+=len(q)
        elif source: c_sur+=len(q)
        else: c_libre+=len(q)
    return dict(n=n,tot=c_tot,risque=c_risque,sur=c_sur,libre=c_libre,paras=len(paras))
fics=sorted(glob.glob(f'{P}/*/subagents/workflows/wf_*/agent-*.jsonl'))
random.seed(7); random.shuffle(fics)
res=[]
for p in fics:
    if os.path.getsize(p)<200000: continue
    d=analyser(p)
    if d: res.append(d)
    if len(res)>=45: break
T=sum(r['tot'] for r in res); R=sum(r['risque'] for r in res); S=sum(r['sur'] for r in res); L=sum(r['libre'] for r in res)
print(f"{len(res)} agents · {sum(r['paras'] for r in res)} paragraphes · {T/1e6:.2f} Mcar de rapport")
print(f"  paragraphes appuyes sur une ancre EXCLUSIVEMENT de la 1re moitie : {100*R/T:>5.1f} % des caracteres  -> EN RISQUE")
print(f"  paragraphes appuyes sur une ancre encore visible apres la remise : {100*S/T:>5.1f} %")
print(f"  paragraphes sans ancre tracable a un resultat d'outil            : {100*L/T:>5.1f} %")
parts=[100*r['risque']/r['tot'] for r in res]
print(f"\npar agent : mediane {st.median(parts):.1f} %  p10 {sorted(parts)[len(parts)//10]:.1f} %  p90 {sorted(parts)[int(.9*len(parts))]:.1f} %  max {max(parts):.1f} %")
