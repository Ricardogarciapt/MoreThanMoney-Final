#!/usr/bin/env python3
"""Engenharia reversa dos sinais Premium → MTM Premium Scanner (docs/pine/mtm-premium-scanner.pine).

Dados em dados-estudo/ (branch do estudo):
  premium-sinais.json.gz — 871 sinais Premium únicos (chat premium-ideas, 04/06–27/10/2026)
  xau-m15.csv.gz, xau-m5.csv.gz — velas XAUUSD da MetaApi (t,o,h,l,c), puxadas com premium-velas-puxar.ts --csv
Uso: python3 -I scripts/estudos/premium-scanner-check.py [pasta dados-estudo]
Simulação em M5: limite no meio da zona válido 1 h, 3 partes (TP1/TP2/TP3), break-even depois do TP1,
SL primeiro quando SL e TP caem na mesma vela, sem spread nem comissão. 1 $ = 10 pips.
"""
import gzip, sys
import json, datetime as dt, bisect, statistics as st, collections as co, math, os
D=sys.argv[1] if len(sys.argv)>1 else 'dados-estudo'
def load(p):
    R=[tuple(map(float,l.split(','))) for l in gzip.open(p,'rt').read().split()]
    return [int(r[0]) for r in R],[r[1] for r in R],[r[2] for r in R],[r[3] for r in R],[r[4] for r in R]
T,O,H,L,CL=load(f'{D}/xau-m15.csv.gz')
T5,O5,H5,L5,C5=load(f'{D}/xau-m5.csv.gz')
SIG=json.load(gzip.open(f'{D}/premium-sinais.json.gz','rt'))
for s in SIG: s['ts']=dt.datetime.fromisoformat(s['t']).replace(tzinfo=dt.timezone.utc).timestamp()
SW=[s for s in SIG if T[0]+2*86400<=s['ts']<=T[-1]]
def ema(x,n):
    k=2/(n+1); o=[x[0]]
    for v in x[1:]: o.append(o[-1]+k*(v-o[-1]))
    return o
def idx_before(ts): return bisect.bisect_right(T, ts-900)-1   # última M15 fechada antes de ts
UT=lambda i: dt.datetime.fromtimestamp(T[i]+900, dt.timezone.utc)
def sess(h,m):
    t=h*60+m
    if 7*60<=t<11*60: return 'LDN'
    if 13*60<=t<16*60: return 'NY'
    if 0<=t<6*60: return 'ASIA'
    return None
def sim5(ts, d, mid, sl, tps, valid_s=3600, max_s=24*3600, be=True, entry='limit'):
    """Simula em M5 a partir do instante ts. Entrada: limite no meio da zona (válida valid_s) ou mercado."""
    sg=1 if d=='B' else -1
    j=bisect.bisect_left(T5, ts)  # primeira M5 que abre a partir de ts
    if j>=len(T5): return None
    if entry=='limit':
        f=None
        while j<len(T5) and T5[j]<ts+valid_s:
            if (d=='B' and L5[j]<=mid) or (d=='S' and H5[j]>=mid): f=j; break
            j+=1
        if f is None: return None
        e=mid
    else:
        f=j; e=O5[j]; sl=e-(mid-sl); tps=[e+(t-mid) for t in tps]
    done=0; pnl=0.0; stop=sl; j=f
    while j<len(T5) and T5[j]<T5[f]+max_s:
        if (L5[j]<=stop) if d=='B' else (H5[j]>=stop):
            pnl+=(len(tps)-done)/len(tps)*sg*(stop-e)
            return dict(pips=pnl*10,tp1=done>=1,res='sl' if done==0 else 'be',e=e)
        while done<len(tps) and ((H5[j]>=tps[done]) if d=='B' else (L5[j]<=tps[done])):
            pnl+=sg*(tps[done]-e)/len(tps); done+=1
            if be: stop=e
        if done==len(tps): return dict(pips=pnl*10,tp1=True,res='tp3',e=e)
        j+=1
    j=min(j,len(T5)-1); pnl+=(len(tps)-done)/len(tps)*sg*(C5[j]-e)
    return dict(pips=pnl*10,tp1=done>=1,res='tempo',e=e)
def stats(rs):
    rs=[r for r in rs if r]; n=len(rs)
    if not n: return 'n=0'
    w=sum(r['tp1'] for r in rs); p=sum(r['pips'] for r in rs); sl=sum(r['res']=='sl' for r in rs); t3=sum(r['res']=='tp3' for r in rs)
    return f"n={n} TP1={w/n:.0%} TP3={t3/n:.0%} SL={sl/n:.0%} net={p:+.0f} ({p/n:+.1f}/trade)"
def orig_levels(s):
    lo,hi=min(s['z1'],s['z2']),max(s['z1'],s['z2']); mid=(lo+hi)/2; sg=1 if s['d']=='B' else -1
    near=hi if sg==1 else lo
    tp1=s['t1']; step=abs(tp1-near) or 5
    return mid, s['sl'], [tp1, tp1+sg*step, tp1+sg*2*step]
def valido(s):
    lo,hi=min(s['z1'],s['z2']),max(s['z1'],s['z2']); sg=1 if s['d']=='B' else -1
    far=lo if sg==1 else hi; near=hi if sg==1 else lo
    i=bisect.bisect_right(T,s['ts'])-1
    return (hi-lo)<=10 and abs(s['sl']-far)<=10 and sg*(far-s['sl'])>0 and abs(s['t1']-near)<=10 and sg*(s['t1']-near)>0 and abs((lo+hi)/2-CL[i])<=20
SWV=[s for s in SW if valido(s)]
E9=ema(CL,9); E20=ema(CL,20); E50=ema(CL,50); E200=ema(CL,200)
def sess_open_idx(i):
    u=UT(i); h=u.hour; d0=T[i]-T[i]%86400
    st_= 7 if 6<=h<12 else 13 if 12<=h<18 else 0
    return bisect.bisect_left(T,d0+st_*3600)
def day_open_idx(i): return bisect.bisect_left(T,T[i]-T[i]%86400)
def votos(i):
    c=CL[i]; j=sess_open_idx(i); k=day_open_idx(i)
    return dict(sess=c>O[j], r1h=c>CL[i-4], r4h=c>CL[i-16], r2h=c>CL[i-8], day=c>O[k], e9=c>E9[i], e20=c>E20[i], e50=c>E50[i],
                e200=c>E200[i], e9s=E9[i]>E9[i-1], e20s=E20[i]>E20[i-2], r24=c>CL[i-96], r30=c>CL[i-2], r15=c>CL[i-1])
K3=('sess','r1h','r4h'); K5=('sess','r1h','r4h','e200','e9')
VOT={}
def score(i,keys):
    if i not in VOT: VOT[i]=votos(i)
    v=VOT[i]; return sum(1 if v[k] else -1 for k in keys)
def scanner(keys=K3, need=1, cool=2, maxs=6, sessions=('LDN','NY'), rng=None, hours=None):
    out=[]; last=-99; cnt={}
    for i in range(120,len(T)):
        u=UT(i); se=sess(u.hour,u.minute)
        if se not in sessions: continue
        if hours and u.hour not in hours: continue
        if rng and not (rng[0]<=T[i]<rng[1]): continue
        sc=score(i,keys)
        if abs(sc)<need: continue
        d='B' if sc>0 else 'S'
        key=(u.date(),se)
        if cnt.get(key,0)>=maxs or i-last<cool: continue
        cnt[key]=cnt.get(key,0)+1; last=i; out.append((i,d,se))
    return out
def niveis(i,d,recuo=4.0,larg=5.0,dsl=5.0,passo=5.0):
    sg=1 if d=='B' else -1; mid=CL[i]-sg*recuo
    near=mid+sg*larg/2; far=mid-sg*larg/2
    return mid, far-sg*dsl, [near+sg*passo, near+sg*2*passo, near+sg*3*passo]
def match(sc,sigs,tol=1800):
    st_=[(T[i]+900,d) for i,d,_ in sc]
    tsd=sorted((s['ts'],s['d']) for s in sigs)
    import bisect as bs
    def near(t,d,lst):
        a=bs.bisect_left(lst,(t-tol,'')); 
        while a<len(lst) and lst[a][0]<=t+tol:
            if lst[a][1]==d: return True
            a+=1
        return False
    stl=sorted(st_)
    rec=sum(near(s['ts'],s['d'],stl) for s in sigs)
    pre=sum(near(t,d,tsd) for t,d in st_)
    return rec,pre

if __name__ == '__main__':
    split = dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp()
    print(f'sinais válidos {len(SWV)} de {len(SW)}')
    print('ORIGINAL limite ', stats([sim5(s['ts'], s['d'], *orig_levels(s)) for s in SWV]))
    print('ORIGINAL mercado', stats([sim5(s['ts'], s['d'], *orig_levels(s), entry='market') for s in SWV]))
    acc = [(score(idx_before(s['ts']), K5) > 0) == (s['d'] == 'B') for s in SWV]
    print(f'direcção (voto de 5) {sum(acc)}/{len(acc)} = {sum(acc)/len(acc):.0%} · vender sempre {sum(s["d"]=="S" for s in SWV)/len(SWV):.0%}')
    has = set()
    for s in SWV:
        u = dt.datetime.fromtimestamp(s['ts'], dt.timezone.utc); se = sess(u.hour, u.minute)
        if se: has.add((u.date(), se))
    for nome, need in [('Maioria', 1), ('Unânime', 5)]:
        sc = scanner(K5, need, 2, 6, ('ASIA', 'LDN', 'NY'))
        for per, rng in [('jun-ago', (0, split)), ('set-out', (split, 9e18))]:
            sigs = [s for s in SWV if rng[0] <= s['ts'] < rng[1]]
            x = [z for z in sc if rng[0] <= T[z[0]] < rng[1]]
            act = [z for z in x if (UT(z[0]).date(), z[2]) in has]
            r, p = match(act, sigs)
            print(f'{nome} {per}: originais apanhados {r}/{len(sigs)} · scanner certo {p}/{len(act)} (só sessões em que a fonte operou)')
            for se in ['ASIA', 'LDN', 'NY']:
                print('   ', se, stats([sim5(T[i] + 900, d, *niveis(i, d)) for i, d, s_ in x if s_ == se]))
