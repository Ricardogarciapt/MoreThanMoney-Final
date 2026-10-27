#!/usr/bin/env python3
"""Engenharia reversa dos sinais Premium → MTM Premium Scanner (docs/pine/mtm-premium-scanner.pine).

Entradas (exportadas da Supabase com o SQL de docs/premium-scanner-engenharia-reversa.md):
  sig.json   — sinais Premium únicos [{t, d:'B'|'S', z1, z2, sl, t1, ...}]
  xau15.csv  — velas XAUUSD M15: epoch,high,low,close (tabela _bt_velas)
Uso: python3 -I scripts/estudos/premium-scanner-check.py <pasta com sig.json e xau15.csv>
"""
import os, sys
os.chdir(sys.argv[1] if len(sys.argv) > 1 else '.')
# ── base.py ──
import json, datetime as dt, bisect, math
C=[tuple(map(float,l.split(','))) for l in open('xau15.csv').read().split()]
T=[int(c[0]) for c in C]; H=[c[1] for c in C]; L=[c[2] for c in C]; CL=[c[3] for c in C]
O=[CL[i-1] if i else CL[0] for i in range(len(C))]
SIG=json.load(open('sig.json'))
for s in SIG: s['ts']=dt.datetime.fromisoformat(s['t']).replace(tzinfo=dt.timezone.utc).timestamp()
A,B=T[0],T[-1]+900
SW=[s for s in SIG if A+86400<=s['ts']<=B]
def ema(x,n):
    k=2/(n+1); o=[x[0]]
    for v in x[1:]: o.append(o[-1]+k*(v-o[-1]))
    return o
def rsi(x,n=14):
    o=[50]*len(x); g=l=0
    for i in range(1,len(x)):
        d=x[i]-x[i-1]; gu=max(d,0); ld=max(-d,0)
        g=(g*(n-1)+gu)/n; l=(l*(n-1)+ld)/n
        o[i]=100 if l==0 else 100-100/(1+g/l)
    return o
def atr(n=14):
    o=[0]*len(C); a=H[0]-L[0]
    for i in range(1,len(C)):
        tr=max(H[i]-L[i],abs(H[i]-CL[i-1]),abs(L[i]-CL[i-1])); a=(a*(n-1)+tr)/n; o[i]=a
    return o
def idx_before(ts):  # last bar fully closed before ts (bar t is open time, closes t+900)
    return bisect.bisect_right(T, ts-900)-1
def outcome(d,entry,sl,tp,i0,maxbars=96):
    # from bar i0 onward; returns +1 tp, -1 sl, 0 none; conservative when both
    for i in range(i0, min(i0+maxbars,len(C))):
        if d=='B':
            hs=L[i]<=sl; ht=H[i]>=tp
        else:
            hs=H[i]>=sl; ht=L[i]<=tp
        if hs: return -1,i
        if ht: return 1,i
    return 0,None
# ── feat.py ──
E20=ema(CL,20); E50=ema(CL,50); E200=ema(CL,200); R=rsi(CL,14); AT=atr(14)
E9=ema(CL,9)
def feats(i):
    c=CL[i]; f={}
    for n,lab in [(1,'r15'),(4,'r1h'),(16,'r4h'),(96,'r24h')]:
        f[lab]=c-CL[max(0,i-n)]
    f['e20']=c-E20[i]; f['e50']=c-E50[i]; f['e200']=c-E200[i]; f['e20_50']=E20[i]-E50[i]
    f['rsi']=R[i]; f['atr']=AT[i]
    hh=max(H[max(0,i-15):i+1]); ll=min(L[max(0,i-15):i+1]); f['pos4h']=(c-ll)/(hh-ll+1e-9)
    hh=max(H[max(0,i-95):i+1]); ll=min(L[max(0,i-95):i+1]); f['pos24h']=(c-ll)/(hh-ll+1e-9)
    # day open (00:00 UTC)
    d0=T[i]-T[i]%86400; j=bisect.bisect_left(T,d0); f['rday']=c-O[j]
    # asia range 00-07
    a0=bisect.bisect_left(T,d0); a1=bisect.bisect_left(T,d0+7*3600)
    if a1>a0 and T[i]>=d0+7*3600:
        ah=max(H[a0:a1]); al=min(L[a0:a1]); f['vs_asia']=(c-al)/(ah-al+1e-9); f['asia_rng']=ah-al
    else: f['vs_asia']=None; f['asia_rng']=None
    return f
# ── sim.py ──
def sim(i,d,mode='zona',pull=4.0,valid=4,maxbars=96):
    """i = last closed bar index before signal. returns dict or None if not filled.
    pips: XAU 1 pip = 0.1 -> $1 = 10 pips"""
    sg=1 if d=='B' else -1
    c=CL[i]
    if mode=='zona':
        mid=c - sg*pull; fill=None
        for j in range(i+1,min(i+1+valid,len(C))):
            if (d=='B' and L[j]<=mid) or (d=='S' and H[j]>=mid): fill=j; break
        if fill is None: return None
        e=mid; j0=fill
    else:
        if i+1>=len(C): return None
        e=O[i+1]; j0=i+1
    sl=e-sg*7.5; tps=[e+sg*7.5,e+sg*12.5,e+sg*17.5]
    done=0; pnl=0.0; stop=sl; first=True
    for j in range(j0,min(j0+maxbars,len(C))):
        hs=(L[j]<=stop) if d=='B' else (H[j]>=stop)
        if hs and (first or True):
            # conservative: stop checked first in the bar
            pnl+=(3-done)/3*sg*(stop-e); return dict(pips=pnl*10,tp1=done>=1,res='sl' if done==0 else 'be+',j=j)
        while done<3 and ((H[j]>=tps[done]) if d=='B' else (L[j]<=tps[done])):
            pnl+=sg*(tps[done]-e)/3; done+=1; stop=e  # BE after TP1
        first=False
        if done==3: return dict(pips=pnl*10,tp1=True,res='tp3',j=j)
    j=min(j0+maxbars,len(C))-1
    pnl+=(3-done)/3*sg*(CL[j]-e)
    return dict(pips=pnl*10,tp1=done>=1,res='timeout',j=j)
def stats(rs):
    rs=[r for r in rs if r]; n=len(rs)
    if not n: return 'n=0'
    w=sum(r['tp1'] for r in rs); p=sum(r['pips'] for r in rs)
    sl=sum(r['res']=='sl' for r in rs)
    return f"n={n} TP1={w/n:.0%} SL={sl/n:.0%} net={p:+.0f} pips ({p/n:+.1f}/trade)"
# ── scan.py ──
UT=lambda i: dt.datetime.fromtimestamp(T[i]+900, dt.timezone.utc)  # close time of bar i
F=[None]*len(C)
for i in range(20,len(C)): F[i]=feats(i)
def sess(h,m):
    t=h*60+m
    if 7*60<=t<11*60: return 'LDN'
    if 13*60<=t<16*60: return 'NY'
    if 0<=t<6*60: return 'ASIA'
    return None
def score(f,w):
    s=0
    s+= w[0]*(1 if f['e50']>0 else -1)
    s+= w[1]*(1 if f['rday']>0 else -1)
    s+= w[2]*(1 if f['r4h']>0 else -1)
    if f['vs_asia'] is not None: s+= w[3]*(1 if f['vs_asia']>0.5 else -1)
    return s
def run(trig='every',thr=3,cool=2,k=4,w=(1,1,1,1),sessions=('LDN','NY','ASIA'),rng=None):
    out=[]; last=-99
    for i in range(300,len(C)):
        u=UT(i); se=sess(u.hour,u.minute)
        if se not in sessions: continue
        if rng and not (rng[0]<=T[i]<rng[1]): continue
        f=F[i]; sc=score(f,w)
        d='B' if sc>=thr else 'S' if sc<=-thr else None
        if not d: continue
        sg=1 if d=='B' else -1
        ok=True
        if trig=='brk': ok = (CL[i]>max(H[i-k:i])) if d=='B' else (CL[i]<min(L[i-k:i]))
        elif trig=='pull': ok = (CL[i]>E9[i] and CL[i-1]<=E9[i-1]) if d=='B' else (CL[i]<E9[i] and CL[i-1]>=E9[i-1])
        elif trig=='mom': ok = sg*(CL[i]-CL[i-1])>0 and sg*(CL[i]-CL[i-k])>0
        if not ok: continue
        if i-last<cool: continue
        last=i; out.append((i,d,se))
    return out
def match(scan,sigs,tol=1800):
    st_=[(T[i]+900,d) for i,d,_ in scan]
    rec=sum(any(d==s['d'] and abs(t-s['ts'])<=tol for t,d in st_) for s in sigs)
    pre=sum(any(d==s['d'] and abs(t-s['ts'])<=tol for s in sigs) for t,d in st_)
    timeonly=sum(any(abs(t-s['ts'])<=tol for t,d in st_) for s in sigs)
    return rec,pre,timeonly
# ── replica.py ──
def sess_open_idx(i):
    u=UT(i); h=u.hour; d0=T[i]-T[i]%86400
    st_= 7 if 6<=h<12 else 13 if 12<=h<18 else 0
    return bisect.bisect_left(T,d0+st_*3600)
def bias(i):
    c=CL[i]; j=sess_open_idx(i)
    v=(1 if c>O[j] else -1)+(1 if c>CL[i-4] else -1)+(1 if c>CL[i-16] else -1)
    return 'B' if v>0 else 'S'
def replica(cool=2,maxs=6,trig='candle',sessions=('ASIA','LDN','NY'),rng=None):
    out=[]; last=-99; cnt={}
    for i in range(20,len(C)):
        u=UT(i); se=sess(u.hour,u.minute)
        if se not in sessions: continue
        if rng and not (rng[0]<=T[i]<rng[1]): continue
        d=bias(i); sg=1 if d=='B' else -1
        if trig=='candle' and not sg*(CL[i]-CL[i-1])>0: continue
        if trig=='e9' and not sg*(CL[i]-E9[i])>0: continue
        key=(u.date(),se)
        if cnt.get(key,0)>=maxs or i-last<cool: continue
        cnt[key]=cnt.get(key,0)+1; last=i; out.append((i,d,se))
    return out

if __name__ == '__main__':
    split = dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc).timestamp()
    tr = [s for s in SW if s['ts'] < split]; te = [s for s in SW if s['ts'] >= split]
    for nome, ses in [('LDN', ('LDN',)), ('LDN+NY', ('LDN', 'NY')), ('3 sessões', ('ASIA', 'LDN', 'NY'))]:
        for lab, rng, ss in [('treino set', (T[0], split), tr), ('teste out', (split, T[-1] + 1), te)]:
            sc = replica(2, 6, 'none', ses, rng=rng); r, p, _ = match(sc, ss)
            print(f"{nome:10s} {lab}: scanner {len(sc)} · originais apanhados {r}/{len(ss)} · scanner com original {p}/{len(sc)}")
    print('ORIGINAL (zona):', stats([sim(idx_before(s['ts']), s['d'], 'zona') for s in SW]))
    sc = replica(2, 6, 'none', ('ASIA', 'LDN', 'NY'))
    for se in ['ASIA', 'LDN', 'NY']:
        print('SCANNER', se, stats([sim(i, d, 'zona') for i, d, s_ in sc if s_ == se]))
