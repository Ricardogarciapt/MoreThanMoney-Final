# Música e SFX sintetizados (sem direitos). Uso: python3 som.py tempos.json out/musica.wav
import json, sys, wave, numpy as np
SR = 48000
cfg = json.load(open(sys.argv[1])); DUR = cfg['total']; cortes = cfg['cortes']; impactos = cfg['impactos']; risers = cfg['risers']
n = int(DUR * SR); t = np.arange(n) / SR
mix = np.zeros((n, 2))
def nota(m): return 440 * 2 ** ((m - 69) / 12)
# acordes Am F C G (graves, pad suave), 90 BPM, 2 compassos por acorde
bpm = 118; beat = 60 / bpm; compasso = 4 * beat
prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
rng = np.random.default_rng(3)
for k in range(int(DUR / (2 * compasso)) + 1):
    a0 = k * 2 * compasso; a1 = min(DUR, a0 + 2 * compasso)
    if a0 >= DUR: break
    i0, i1 = int(a0 * SR), int(a1 * SR); tt = t[i0:i1] - a0
    env = np.minimum(1, tt / 1.2) * np.minimum(1, (a1 - a0 - tt) / 1.0)
    for m in prog[k % 4]:
        for det, pan in [(-0.08, 0.3), (0.08, 0.7)]:
            f = nota(m) * 2 ** (det / 12)
            w = 0.6 * np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt + 0.3) + 0.1 * np.sin(2 * np.pi * 3 * f * tt)
            mix[i0:i1, 0] += 0.035 * env * w * (1 - pan); mix[i0:i1, 1] += 0.035 * env * w * pan
    b = nota(prog[k % 4][0] - 12)
    mix[i0:i1] += (0.05 * env * np.sin(2 * np.pi * b * tt))[:, None]
# pulso de bombo suave a partir do capítulo 3
ini = cfg.get('pulso_desde', 0)
for bt in np.arange(ini, DUR - 3, beat):
    i0 = int(bt * SR); L = int(0.35 * SR)
    if i0 + L > n: break
    tt = np.arange(L) / SR
    k = np.sin(2 * np.pi * (50 + 80 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
    mix[i0:i0 + L] += (0.09 * k)[:, None]
def ruido(L): return rng.standard_normal(L)
def lowpass(x, a):
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)): acc += a * (x[i] - acc); y[i] = acc
    return y
for c in cortes:  # whoosh
    L = int(0.9 * SR); i0 = int((c - 0.55) * SR)
    if i0 < 0 or i0 + L > n: continue
    tt = np.arange(L) / L; env = np.sin(np.pi * tt) ** 2
    w = np.convolve(ruido(L), np.ones(18) / 18, 'same') * env * 0.35
    mix[i0:i0 + L, 0] += w * (1 - tt); mix[i0:i0 + L, 1] += w * tt
for c in risers:  # riser
    L = int(2.5 * SR); i0 = int((c - 2.5) * SR)
    if i0 < 0: continue
    tt = np.arange(L) / SR; env = (tt / 2.5) ** 2
    s = np.sin(2 * np.pi * (200 + 900 * (tt / 2.5) ** 2) * tt) * 0.04 + np.convolve(ruido(L), np.ones(6) / 6, 'same') * 0.12
    mix[i0:i0 + L] += (s * env)[:, None]
for c in impactos:  # impacto
    L = int(1.8 * SR); i0 = int(c * SR)
    if i0 + L > n: L = n - i0
    tt = np.arange(L) / SR
    s = np.sin(2 * np.pi * (40 + 60 * np.exp(-tt * 12)) * tt) * np.exp(-tt * 2.5) * 0.45 + np.convolve(ruido(L), np.ones(4) / 4, 'same') * np.exp(-tt * 14) * 0.25
    mix[i0:i0 + L] += s[:, None]
# fade
f = np.minimum(1, t / 1.5) * np.minimum(1, (DUR - t) / 2.0); mix *= f[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.8
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', DUR)
