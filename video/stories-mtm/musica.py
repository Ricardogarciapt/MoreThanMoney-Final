"""Banda sonora original para os stories MTM (síntese própria, sem música de terceiros).

Electrónica cinematográfica a 118 bpm em lá menor (Am – F – C – G): pad supersaw com «pump» do kick,
baixo em colcheias, arpejo pluck com eco em pingue-pongue, bateria a partir do «drop», uma pausa antes
do CTA e o refrão final. Risers e impactos marcam as viragens.

Uso: python3 musica.py <saida.wav> <total_s> '<json {"drop": s, "pausa": s, "final": s}>'
"""
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
out, total = sys.argv[1], float(sys.argv[2])
sec = json.loads(sys.argv[3])
DROP, PAUSA, FINAL = sec['drop'], sec['pausa'], sec['final']
n = int(total * SR)
t = np.arange(n) / SR
rng = np.random.default_rng(11)
BPM = 118
BEAT = 60 / BPM
L = np.zeros(n); R = np.zeros(n)


def lp(x, f, o=2):
    return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)


def saw(f, tt, fase=0.0):
    return 2 * np.mod(f * tt + fase, 1) - 1


def add(sinal, ini, gl=1.0, gr=None):
    a = int(ini * SR)
    if a >= n: return
    m = min(len(sinal), n - a)
    L[a:a + m] += sinal[:m] * gl
    R[a:a + m] += sinal[:m] * (gl if gr is None else gr)


def nota(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# Acordes (midi): Am, F, C, G — um compasso cada.
ACORDES = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]
RAIZ = [45, 41, 48, 43]
COMP = 4 * BEAT
ativo = lambda x: (x >= DROP and x < PAUSA) or x >= FINAL

# Envelope de sidechain: cai a cada tempo depois do drop (o «pump»).
sc = np.ones(n)
for k in np.arange(DROP, total, BEAT):
    if not ativo(k + 1e-3): continue
    a = int(k * SR); m = min(n - a, int(BEAT * SR)); tt = np.arange(m) / SR
    sc[a:a + m] = np.minimum(sc[a:a + m], 0.25 + 0.75 * (1 - np.exp(-tt * 9)))

# Pad supersaw, largo em estéreo, com filtro a abrir até ao drop.
padL = np.zeros(n); padR = np.zeros(n)
for i in range(int(total / COMP) + 1):
    a, b = int(i * COMP * SR), min(n, int((i + 1) * COMP * SR) + int(.3 * SR))
    if a >= n: break
    tt = t[a:b] - t[a]; d = tt[-1] + 1e-9
    env = np.minimum(1, tt / .25) * np.minimum(1, (d - tt) / .3)
    for m_ in ACORDES[i % 4]:
        f = nota(m_)
        for j, det in enumerate((-0.18, -0.09, 0, 0.09, 0.18)):
            s = saw(f * 2 ** (det / 12), tt, j * .13) * env * .028
            if j % 2: padL[a:b] += s
            else: padR[a:b] += s
abre = np.clip((t - 0) / max(DROP, .1), 0, 1)
padL = lp(padL, 1800) * (0.55 + 0.45 * abre); padR = lp(padR, 1800) * (0.55 + 0.45 * abre)
L += padL * sc; R += padR * sc

# Baixo: colcheias na raiz, só com bateria.
for i in range(int(total / (BEAT / 2)) + 1):
    k = i * BEAT / 2
    if not ativo(k) or k >= total: continue
    f = nota(RAIZ[int(k / COMP) % 4]); m = int(BEAT / 2 * SR * .9); tt = np.arange(m) / SR
    s = (saw(f, tt) * .6 + np.sin(2 * np.pi * f / 2 * tt)) * np.exp(-tt * 5) * .16
    add(lp(s, 380), k)

# Arpejo pluck em semicolcheias, com eco pingue-pongue.
arpL = np.zeros(n); arpR = np.zeros(n)
for i in range(int(total / (BEAT / 4)) + 1):
    k = i * BEAT / 4
    if k >= total - .1: break
    if PAUSA <= k < FINAL - 2 * BEAT and (i % 2): continue
    ac = ACORDES[int(k / COMP) % 4]
    seq = [ac[0] + 12, ac[1] + 12, ac[2] + 12, ac[1] + 24]
    f = nota(seq[i % 4]); m = int(.22 * SR); tt = np.arange(m) / SR
    s = (np.sign(np.sin(2 * np.pi * f * tt)) * .5 + saw(f, tt) * .5) * np.exp(-tt * 18) * .05
    s = lp(s, 2600 if k > DROP else 1300)
    a = int(k * SR); mm = min(m, n - a)
    if mm <= 0: continue
    arpL[a:a + mm] += s[:mm]; arpR[a:a + mm] += s[:mm]
eco = int(BEAT * .75 * SR)
eL = np.zeros(n); eR = np.zeros(n)
eL[eco:] += arpR[:-eco] * .45; eR[2 * eco:] += arpL[:-2 * eco] * .35
L += (arpL + eL) * (0.6 + 0.4 * sc); R += (arpR + eR) * (0.6 + 0.4 * sc)

# Bateria.
for k in np.arange(DROP, total - .2, BEAT):
    if not ativo(k + 1e-3): continue
    m = int(.4 * SR); tt = np.arange(m) / SR
    f = 45 + 95 * np.exp(-tt * 28)
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7) * .55
    kick[:200] += rng.standard_normal(200) * .15 * np.exp(-np.arange(200) / 40)
    add(kick, k)
    beat_i = int(round((k - DROP) / BEAT))
    if beat_i % 2 == 1:
        m = int(.25 * SR); tt = np.arange(m) / SR
        clap = hp(lp(rng.standard_normal(m), 3500), 900) * (np.exp(-tt * 22) + .5 * np.exp(-np.maximum(tt - .012, 0) * 25) * (tt > .012)) * .22
        add(clap, k, .9, 1.0)
    m = int(.06 * SR); tt = np.arange(m) / SR
    hat = hp(rng.standard_normal(m), 7000) * np.exp(-tt * 70) * .09
    add(hat, k + BEAT / 2, .8, 1.0)
    if k >= FINAL and beat_i % 4 == 3:
        m = int(.35 * SR); tt = np.arange(m) / SR
        add(hp(rng.standard_normal(m), 6000) * np.exp(-tt * 9) * .06, k + BEAT / 2, 1.0, .8)


def riser(fim, dur=2.0, g=.07):
    ini = max(0, fim - dur); m = int((fim - ini) * SR); tt = np.arange(m) / SR
    if m <= 0: return
    r = rng.standard_normal(m); x = tt / (m / SR)
    r = hp(r, 600) * x ** 2.2 * g
    add(r, ini, .9, 1.0)
    sw = np.sin(2 * np.pi * np.cumsum(200 + 1400 * x ** 2) / SR) * x ** 3 * .05
    add(sw, ini)


def impacto(k, g=.6):
    m = int(1.6 * SR); tt = np.arange(m) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-tt * 9)) / SR) * np.exp(-tt * 2.2) * g
    boom += lp(rng.standard_normal(m), 900) * np.exp(-tt * 6) * g * .35
    add(boom, k)


riser(DROP); impacto(DROP)
riser(FINAL, 2.6); impacto(FINAL, .7)
impacto(0.0, .45)

mix = np.stack([L, R], axis=1)
mix *= np.minimum(1, (total - t) / 1.6)[:, None]
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix = mix / max(1e-9, np.abs(mix).max()) * 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
