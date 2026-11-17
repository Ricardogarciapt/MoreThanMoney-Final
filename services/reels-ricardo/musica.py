import numpy as np, wave, sys
from scipy.signal import butter, sosfilt
SR=48000; BPM=100; beat=60/BPM; D=float(sys.argv[1]); OUT=sys.argv[2] if len(sys.argv)>2 else 'music.wav'
N=int(D*SR); tt=np.arange(N)/SR; rng=np.random.default_rng(3)
def note(m): return 440*2**((m-69)/12)
chords=[[57,60,64,69],[53,57,60,65],[48,55,60,64],[55,59,62,67]]  # Am F C G
bass=[45,41,48,43]
bar=4*beat; seg=2*bar
pad=np.zeros(N); bs=np.zeros(N)
for k in range(int(D/seg)+1):
    c=chords[k%4]; s0=int(k*seg*SR); s1=min(N,int((k+1)*seg*SR)+int(0.3*SR))
    if s0>=N: break
    t=np.arange(s1-s0)/SR; L=len(t)
    env=np.minimum(1,t/0.6)*np.minimum(1,(L/SR-t)/0.4)
    for m in c:
        f=note(m)
        for det in (-0.08,0.08):
            pad[s0:s1]+=env*(2*((t*f*(1+det/100))%1)-1)*0.12
    fb=note(bass[k%4])
    # baixo em colcheias
    pulse=((t%(beat/2))<beat*0.38).astype(float)*np.exp(-(t%(beat/2))*6)
    bs[s0:s1]+=np.sin(2*np.pi*fb*t)*pulse*env*0.6
pad=sosfilt(butter(2,1400,fs=SR,output='sos'),pad)
# kick
kick=np.zeros(N); kt=np.arange(int(0.35*SR))/SR
k1=np.sin(2*np.pi*np.cumsum(50+90*np.exp(-kt*30))/SR)*np.exp(-kt*9)
for b in range(int(D/beat)):
    s=int(b*beat*SR)
    if s+len(k1)<N: kick[s:s+len(k1)]+=k1
# hats
hat=np.zeros(N); hn=sosfilt(butter(2,7000,'hp',fs=SR,output='sos'),rng.standard_normal(int(0.05*SR)))*np.exp(-np.arange(int(0.05*SR))/SR*80)
for b in range(int(D/beat)*2):
    if b%2==1:
        s=int(b*beat/2*SR)
        if s+len(hn)<N: hat[s:s+len(hn)]+=hn
mix=pad*0.9+bs*0.8+kick*0.55+hat*0.12
fade=np.minimum(1,tt/1.5)*np.minimum(1,(D-tt)/2.5)
mix*=fade; mix/=np.abs(mix).max()+1e-9; mix*=0.8
L=mix; R=np.roll(mix,int(0.012*SR))*0.95+pad*0.05
x=np.stack([L,R],1)
w=wave.open(OUT,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype(np.int16).tobytes()); w.close()
