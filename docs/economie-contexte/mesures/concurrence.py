"""La reecriture de cache est-elle liee a la concurrence ? Mesure par vol :
concurrence maximale observee (agents dont l'intervalle [debut,fin] se recouvre) contre masse reecrite."""
import json, collections, datetime as dt
A=[json.loads(l) for l in open('agents.jsonl')]
vols=collections.defaultdict(list)
for a in A: vols[a['vol']].append(a)
def t(s):
    return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
lignes=[]
for v,ags in vols.items():
    evts=[]
    cw=0; reecrit=0; nrec=0; ntours=0
    for a in ags:
        req=a['req']
        d=t(req[0][4]); f=t(req[-1][4])
        if d and f: evts.append((d,1)); evts.append((f,-1))
        for k in range(1,len(req)):
            ntours+=1; cw+=req[k][1]
            if req[k][2]<req[k-1][2]: reecrit+=req[k][1]; nrec+=1
    evts.sort(); cur=0; mx=0
    for _,x in evts:
        cur+=x; mx=max(mx,cur)
    lignes.append((v,len(ags),mx,cw,reecrit,nrec,ntours))
lignes.sort(key=lambda x:-x[4])
print(f"{'vol':<18}{'agents':>7}{'conc.max':>9}{'cw M':>8}{'reecrit M':>10}{'% cw':>7}{'n rec':>7}")
for v,n,mx,cw,re,nrec,nt in lignes[:14]:
    print(f"{v:<18}{n:>7}{mx:>9}{cw/1e6:>8.1f}{re/1e6:>10.1f}{100*re/max(cw,1):>6.0f}%{nrec:>7}")
print("...")
# correlation grossiere : part reecrite par palier de concurrence
par=collections.defaultdict(lambda:[0,0])
for v,n,mx,cw,re,nrec,nt in lignes:
    b = '1-4' if mx<=4 else ('5-8' if mx<=8 else ('9-14' if mx<=14 else '15+'))
    par[b][0]+=cw; par[b][1]+=re
print("\nconcurrence max du vol -> part de l'ecriture de cache due a une reecriture")
for b in ('1-4','5-8','9-14','15+'):
    cw,re=par[b]
    if cw: print(f"  {b:<6} cw {cw/1e6:7.1f} M   reecrit {re/1e6:6.1f} M   {100*re/cw:5.1f} %")
