"""Cause des reecritures : ecart de temps depuis le tour precedent.
Refutable : si la masse reecrite se repartit comme la masse totale sur l'axe du temps, le TTL n'y est pour rien."""
import json, datetime as dt, collections
A=[json.loads(l) for l in open('agents.jsonl')]
def t(s):
    return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
BINS=[(0,10),(10,60),(60,300),(300,900),(900,3600),(3600,10**9)]
NOM=['<10s','10-60s','1-5min','5-15min','15-60min','>1h']
tot=collections.Counter(); rec=collections.Counter(); ntot=collections.Counter(); nrec=collections.Counter()
for a in A:
    req=a['req']
    for k in range(1,len(req)):
        d=t(req[k][4]); p=t(req[k-1][4])
        if d is None or p is None: continue
        g=d-p
        for (lo,hi),nm in zip(BINS,NOM):
            if lo<=g<hi:
                tot[nm]+=req[k][1]; ntot[nm]+=1
                if req[k][2]<req[k-1][2]: rec[nm]+=req[k][1]; nrec[nm]+=1
                break
print(f"{'ecart':<10}{'tours':>8}{'cw M':>9}{'tours reecrits':>16}{'masse reecrite M':>18}{'part':>7}")
for nm in NOM:
    print(f"{nm:<10}{ntot[nm]:>8}{tot[nm]/1e6:>9.1f}{nrec[nm]:>16}{rec[nm]/1e6:>18.1f}{100*rec[nm]/max(tot[nm],1):>6.0f}%")
print(f"\nmasse reecrite totale {sum(rec.values())/1e6:.1f} M ; part au-dela de 5 min : {100*(rec['5-15min']+rec['15-60min']+rec['>1h'])/max(sum(rec.values()),1):.0f} %")
