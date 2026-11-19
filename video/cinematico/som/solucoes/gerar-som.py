"""Banda sonora 100% sintetizada (sem direitos de terceiros) para o vídeo /solucoes.
Linha de tempo = src/tempo.ts (30 fps). Saída: out/som.wav (48 kHz, estéreo)."""
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
import wave

SR = 48000
FPS = 30
TOTAL = 1950 / FPS + 1.5
N = int(TOTAL * SR)
rs = np.random.default_rng(42)
mus = np.zeros((N, 2))
sfx = np.zeros((N, 2))

def t_(n): return np.arange(n) / SR
def fr(f): return f / FPS
def add(buf, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    x = x[: N - i]
    if x.ndim == 1:
        l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        buf[i:i + len(x), 0] += x * gain * l * 1.41
        buf[i:i + len(x), 1] += x * gain * r * 1.41
    else:
        buf[i:i + len(x)] += x * gain
def env(n, a=0.005, d=0.3, curve=1.0):
    t = t_(n); e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d) ** curve
    return e
def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100) / (SR / 2), 'low', output='sos'), x)
def hp(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), 'high', output='sos'), x)
def bp(x, lo, hi):
    return sosfilt(butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)
def noise(n): return rs.standard_normal(n)
def saw(f, n, ph=0.0):
    t = t_(n); return 2 * ((f * t + ph) % 1) - 1
def nota(m): return 440 * 2 ** ((m - 69) / 12)

# ---------- SFX ----------
def tick(alto=False):
    n = int(0.05 * SR); x = bp(noise(n), 2500, 7000) * env(n, 0.0005, 0.008)
    x += np.sin(2 * np.pi * (1800 if alto else 1200) * t_(n)) * env(n, 0.0005, 0.012) * 0.6
    return x
def whoosh(dur=0.8, sobe=True):
    n = int(dur * SR); x = noise(n); t = t_(n)
    fc = np.linspace(300, 6000, n) if sobe else np.linspace(6000, 300, n)
    out = np.zeros(n); blk = 1024
    for i in range(0, n, blk):
        out[i:i + blk] = bp(x[i:i + blk], max(100, fc[i] * 0.5), fc[i])
    e = np.sin(np.pi * t / dur) ** 2
    return out * e * 1.5
def riser(dur=1.5):
    n = int(dur * SR); t = t_(n)
    f = 200 * (2 ** (3 * t / dur))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + hp(noise(n), 1500) * 0.4 * (t / dur) ** 2
    return x * (t / dur) ** 1.5
def impacto(grave=1.0):
    n = int(2.2 * SR); t = t_(n)
    f = 110 * np.exp(-t * 6) + 38
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.7) * 1.2 * grave
    x += lp(noise(n), 1800) * env(n, 0.001, 0.18) * 0.8
    return x
def ping(f0=1568, dur=0.6):
    n = int(dur * SR); t = t_(n)
    return (np.sin(2 * np.pi * f0 * t) + 0.4 * np.sin(2 * np.pi * f0 * 2.01 * t)) * env(n, 0.002, 0.12)
def notificacao():
    a = ping(1318, 0.3); b = ping(1760, 0.5)
    x = np.zeros(int(0.6 * SR)); x[:len(a)] += a; x[int(0.09 * SR):int(0.09 * SR) + len(b)] += b[: len(x) - int(0.09 * SR)]
    return x
def glitch():
    n = int(0.22 * SR); x = np.sign(np.sin(2 * np.pi * 90 * t_(n))) * 0.3
    x *= (rs.random(n // 400 + 1).repeat(400)[:n] > 0.4)
    return bp(x + noise(n) * 0.3, 200, 5000) * 1.3
def brilho(dur=2.4):
    n = int(dur * SR); x = np.zeros(n)
    for _ in range(70):
        f0 = rs.uniform(2000, 6000); m = int(0.25 * SR); st = rs.uniform(0, dur - 0.26)
        g = np.sin(2 * np.pi * f0 * t_(m)) * env(m, 0.003, 0.06)
        i = int(st * SR); x[i:i + m] += g * rs.uniform(0.1, 0.35)
    return x * np.linspace(0.3, 1, n)
def pop():
    n = int(0.12 * SR); t = t_(n); f = 900 * np.exp(-t * 30) + 300
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.04)
def tecla():
    n = int(0.04 * SR); return bp(noise(n), 1500, 6000) * env(n, 0.0005, 0.006) * rs.uniform(0.5, 1)
def ding():
    n = int(1.2 * SR); t = t_(n)
    return sum(np.sin(2 * np.pi * nota(84) * k * t) * (0.6 / k) for k in (1, 2.76, 5.4)) * env(n, 0.002, 0.35)
def vento(dur):
    n = int(dur * SR); x = lp(noise(n), 700) * 0.6
    return x * np.sin(np.pi * t_(n) / dur)

C = {k: v for k, v in dict(relogio=0, caos=180, transforma=420, automacao=750, formacao=1170, liberdade=1530, cta=1740).items()}

# Cena 1: tique-taque a acelerar
t = 0.15; passo = 0.5; k = 0
while t < fr(C['caos']) - 0.05:
    add(sfx, tick(k % 2 == 0), t, 0.55, pan=0.3 if k % 2 else -0.3)
    t += passo; k += 1
    if t > 3.6: passo = max(0.045, passo * 0.82)
add(sfx, impacto(0.7), fr(12), 0.6)
add(sfx, riser(1.6), fr(C['caos']) - 1.6, 0.5)
# Cena 2
for i in range(7): add(sfx, notificacao(), fr(C['caos'] + 8 + i * 22), 0.45, pan=0.5)
for g in (78, 150, 222): add(sfx, glitch(), fr(C['caos'] + g) - 0.05, 0.5)
add(sfx, riser(1.8), fr(C['transforma']) - 1.8, 0.6)
# Cena 3
add(sfx, brilho(2.6), fr(C['transforma']), 0.5)
add(sfx, whoosh(1.0), fr(C['transforma'] + 62), 0.5)
add(sfx, whoosh(1.2), fr(C['transforma'] + 120), 0.35, pan=0.4)
for k in range(5): add(sfx, ping(2093, 0.4), fr(C['transforma'] + 160 + k * 28), 0.25, pan=0.6)
# Cena 4
for i in range(8): add(sfx, pop(), fr(C['automacao'] + 20 + i * 6), 0.4, pan=(i / 3.5) - 1)
for i in range(4): add(sfx, whoosh(0.5), fr(C['automacao'] + 228 + i * 10), 0.3, pan=-0.6 + i * 0.4)
for b in range(30): add(sfx, ping(rs.choice([2637, 3136, 3520]), 0.15), fr(C['automacao'] + 60) + b * 0.25 + rs.uniform(0, .1), 0.06, pan=rs.uniform(-.8, .8))
# Cena 5
tt = fr(C['formacao'] + 60)
while tt < fr(C['formacao'] + 140): add(sfx, tecla(), tt, 0.35, pan=-0.3); tt += rs.uniform(0.045, 0.11)
for i in range(3): add(sfx, pop(), fr(C['formacao'] + 160 + i * 18), 0.35)
for i in range(4): add(sfx, ding(), fr(C['formacao'] + 260 + i * 15), 0.2, pan=0.4)
# Cena 6
add(sfx, vento(7.5), fr(C['liberdade']), 0.25)
for w in (8, 72, 135): add(sfx, impacto(0.5), fr(C['liberdade'] + w), 0.35)
# Cena 7
add(sfx, impacto(1.0), fr(C['cta'] + 4), 0.75)
add(sfx, brilho(1.6), fr(C['cta'] + 60), 0.35)
# passagens
for c in ('caos', 'transforma', 'automacao', 'formacao', 'liberdade', 'cta'):
    add(sfx, whoosh(0.7), fr(C[c]) - 0.45, 0.55)
    if c in ('caos', 'transforma', 'automacao', 'formacao'): add(sfx, impacto(0.9), fr(C[c]), 0.55)

# ---------- MÚSICA ----------
BPM = 120; BEAT = 60 / BPM
def pad(midis, dur, brilho_fc=1800):
    n = int(dur * SR); x = np.zeros(n)
    for m in midis:
        for det in (-0.12, 0, 0.11):
            x += saw(nota(m + det), n, rs.random())
    x = lp(x / (len(midis) * 3), brilho_fc, 2)
    a = int(0.4 * SR); e = np.ones(n); e[:a] = np.linspace(0, 1, a); e[-a:] = np.linspace(1, 0, a)
    return x * e
def baixo(m, dur):
    n = int(dur * SR); t = t_(n)
    return (np.sin(2 * np.pi * nota(m) * t) + 0.3 * lp(saw(nota(m), n), 400)) * env(n, 0.01, dur * 0.8, 0.5)
def bombo():
    n = int(0.5 * SR); t = t_(n); f = 150 * np.exp(-t * 25) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.22) * 1.4
def palma():
    n = int(0.25 * SR); x = bp(noise(n), 900, 4000)
    e = np.zeros(n)
    for o in (0, 0.01, 0.022): i = int(o * SR); e[i:] += env(n - i, 0.0005, 0.05)
    return x * e * 0.8
def chimbal():
    n = int(0.06 * SR); return hp(noise(n), 7000) * env(n, 0.0005, 0.02)
def arp_nota(m, dur=0.22):
    n = int(dur * SR); x = lp(saw(nota(m), n) + 0.5 * np.sign(np.sin(2 * np.pi * nota(m + 12) * t_(n))), 3500)
    return x * env(n, 0.002, 0.09)

# 0–14 s: tensão (drone + pulso)
n = int(14 * SR)
drone = lp(saw(nota(26), n) + saw(nota(26.08), n) + 0.6 * saw(nota(39), n), 300)
drone *= np.minimum(1, t_(n) / 2) * np.linspace(0.6, 1, n)
add(mus, drone, 0, 0.22)
for b in range(int(6 / (BEAT / 2)), int(14 / (BEAT / 2))):
    tb = b * BEAT / 2
    add(mus, lp(saw(nota(38 if b % 4 else 39), int(0.18 * SR)), 900) * env(int(0.18 * SR), 0.003, 0.08), tb, 0.35)
for b in range(int(6 / BEAT), int(14 / BEAT)):
    add(mus, bombo(), b * BEAT, 0.5)

# 14–58 s: progressão Lá m – Fá – Dó – Sol
PROG = [(57, [57, 60, 64, 69], 45), (53, [53, 57, 60, 65], 41), (48, [48, 55, 60, 64], 36), (55, [55, 59, 62, 67], 43)]
ARP = [0, 2, 1, 3, 2, 1, 3, 2]
inicio = fr(C['transforma'])
compasso = 4 * BEAT
nc = int((fr(C['cta']) - inicio) / compasso) + 1
for c in range(nc):
    tc = inicio + c * compasso
    if tc > fr(C['cta']): break
    raiz, acorde, bx = PROG[c % 4]
    meia = tc >= fr(C['liberdade'])
    add(mus, pad(acorde, compasso + 0.4, 2600 if tc > 25 else 1400), tc, 0.33)
    add(mus, baixo(bx - 12 if not meia else bx - 12, compasso), tc, 0.45)
    if tc >= inicio + 2 * BEAT:
        for s in range(16):
            m = acorde[ARP[s % 8]] + (12 if s >= 8 else 0)
            add(mus, arp_nota(m), tc + s * BEAT / 4, 0.09 if not meia else 0.06, pan=0.35 if s % 2 else -0.35)
    if not meia:
        for b in range(4):
            if tc + b * BEAT >= inicio + 3 * BEAT: add(mus, bombo(), tc + b * BEAT, 0.5)
        if tc >= fr(C['automacao']) - 0.1:
            for b in (1, 3): add(mus, palma(), tc + b * BEAT, 0.35)
            for e8 in range(8): add(mus, chimbal(), tc + e8 * BEAT / 2, 0.18 if e8 % 2 else 0.1, pan=0.4)

# 58–65 s: acorde final aberto
add(mus, pad([45, 57, 64, 69, 72, 76], 7.5, 2200), fr(C['cta']), 0.4)
add(mus, baixo(33, 6), fr(C['cta']), 0.5)

# ---------- MISTURA ----------
def reverb(x, seg=2.2, wet=0.25):
    n = int(seg * SR); ir = noise(n) * np.exp(-t_(n) * 3.2 / seg); ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    out = np.zeros_like(x)
    for ch in range(2): out[:, ch] = fftconvolve(x[:, ch], ir)[: len(x)]
    return x * (1 - wet) + out * wet * 1.6

# abafar a música quando há impactos fortes (sidechain simples a partir dos sfx graves)
mus = reverb(mus, 2.6, 0.3)
sfx = reverb(sfx, 1.6, 0.18)
lvl = np.abs(lp(sfx[:, 0] + sfx[:, 1], 150))
lvl = sosfilt(butter(1, 8 / (SR / 2), output='sos'), lvl)
duck = 1 / (1 + lvl * 1.2)
np.save('out/stem_mus.npy', (mus * duck[:, None]).astype(np.float32)); np.save('out/stem_sfx.npy', sfx.astype(np.float32))
mix = mus * duck[:, None] + sfx
# fade in/out
fi = int(0.3 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fim = int((1950 / FPS) * SR); fo = int(1.6 * SR)
mix[fim - fo:fim] *= np.linspace(1, 0, fo)[:, None]; mix[fim:] = 0
mix = mix[:fim]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 0.89 / np.max(np.abs(mix))
pcm = (mix * 32767).astype(np.int16)
with wave.open('out/som.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', len(mix) / SR, 's')
