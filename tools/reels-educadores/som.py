"""Banda sonora sintetizada para os reels v2 (sem música de terceiros): pad em acordes, batida
suave a 100 bpm, «whoosh» em cada corte e um «pop» por palavra do gancho.
Uso: python3 som.py <saida.wav> <total_s> '<json cortes>' '<json palavras>'"""
import json, sys, wave
import numpy as np

SR = 48000
out, total = sys.argv[1], float(sys.argv[2])
cortes, palavras = json.loads(sys.argv[3]), json.loads(sys.argv[4])
n = int(total * SR)
t = np.arange(n) / SR
mix = np.zeros(n)
rng = np.random.default_rng(7)

# Pad: Am – F – C – G, 2 compassos cada (4,8 s), senos com leve desafinação e envelope lento.
acordes = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 196.0, 261.63], [196.0, 246.94, 293.66]]
dur_ac = 4.8
for i in range(int(total / dur_ac) + 1):
    a, b = int(i * dur_ac * SR), min(n, int((i + 1) * dur_ac * SR))
    if a >= n: break
    tt = t[a:b] - t[a]
    env = np.minimum(1, tt / .8) * np.minimum(1, (dur_ac - tt) / .8)
    for f in acordes[i % 4]:
        for d in (-0.6, 0.6):
            mix[a:b] += 0.035 * env * np.sin(2 * np.pi * (f + d) * tt)

# Batida: kick a cada 0,6 s (100 bpm) a partir do fim do gancho.
inicio = cortes[1] if len(cortes) > 1 else 0
for k in np.arange(inicio, total - .4, 0.6):
    a = int(k * SR); m = min(n - a, int(.35 * SR)); tt = np.arange(m) / SR
    f = 50 + 90 * np.exp(-tt * 30)
    mix[a:a + m] += 0.32 * np.exp(-tt * 9) * np.sin(2 * np.pi * np.cumsum(f) / SR)
    a2 = int((k + .3) * SR); m2 = min(n - a2, int(.08 * SR))
    if m2 > 0: mix[a2:a2 + m2] += 0.05 * rng.standard_normal(m2) * np.exp(-np.arange(m2) / SR * 60)

# Whoosh: ruído filtrado a subir antes de cada corte.
for c in cortes[1:]:
    a = int(max(0, c - .25) * SR); m = min(n - a, int(.45 * SR)); tt = np.arange(m) / SR
    r = rng.standard_normal(m)
    r = np.convolve(r, np.ones(12) / 12, mode='same')
    mix[a:a + m] += 0.22 * np.sin(np.pi * tt / (m / SR)) ** 2 * r

# Pop por palavra do gancho e um impacto no primeiro frame.
for p in palavras:
    a = int(p * SR); m = min(n - a, int(.12 * SR)); tt = np.arange(m) / SR
    mix[a:a + m] += 0.28 * np.exp(-tt * 40) * np.sin(2 * np.pi * (900 - 4000 * tt) * tt)
m = int(.6 * SR); tt = np.arange(m) / SR
mix[:m] += 0.5 * np.exp(-tt * 6) * np.sin(2 * np.pi * (60 + 40 * np.exp(-tt * 20)) * tt)

mix *= np.minimum(1, (total - t) / 1.0)
mix = mix / max(1e-9, np.abs(mix).max()) * 0.85
pcm = (np.repeat(mix[:, None], 2, axis=1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
