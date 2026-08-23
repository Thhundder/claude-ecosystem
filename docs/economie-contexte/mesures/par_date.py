"""Le TTL a-t-il change ? Part de reecriture par date de vol, et ecarts > 5 min par date."""
import json, collections, datetime as dt
A=[json.loads(l) for l in open('agents.jsonl')]
def t(s):
    return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
par=collections.defaultdict(lambda: [0,0,0,0])  # cw, reecrit, tours, tours>5min
for a in A:
    req=a['req']; j=(req[0][4] or '')[:10]
    for k in range(1,len(req)):
        d=t(req[k][4]); p=t(req[k-1][4])
        par[j][0]+=req[k][1]; par[j][2]+=1
        if req[k][2]<req[k-1][2]: par[j][1]+=req[k][1]
        if d and p and d-p>300: par[j][3]+=1
print(f"{'jour':<12}{'tours':>8}{'cw M':>8}{'reecrit M':>11}{'part':>7}{'tours>5min':>12}")
for j in sorted(par):
    cw,re,n,l=par[j]
    print(f"{j:<12}{n:>8}{cw/1e6:>8.1f}{re/1e6:>11.1f}{100*re/max(cw,1):>6.0f}%{l:>12}")
