"""Mistura a narração (voz/falaNN.*) com os stems de música e SFX. Uso: python3 misturar-voz.py <pasta_voz>"""
import sys, subprocess, numpy as np, wave
from scipy.signal import butter, sosfilt
SR = 48000
INICIO = {1: 0.6, 2: 6.4, 3: 14.5, 4: 17.3, 5: 25.4, 6: 40.2, 7: 51.2, 8: 58.3}
pasta = sys.argv[1]
mus = np.load('out/stem_mus.npy'); sfx = np.load('out/stem_sfx.npy'); N = len(mus)
voz = np.zeros(N)
import glob, os
for i, t in INICIO.items():
    fs = glob.glob(os.path.join(pasta, f'fala{i:02d}.*'))
    if not fs: print('falta', i); continue
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', fs[0], '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    # tira silêncio inicial
    nz = np.where(np.abs(x) > 0.02 * np.abs(x).max())[0]; x = x[max(0, nz[0] - 800):] if len(nz) else x
    x = x / (np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2)) + 1e-9) * 0.16
    a = int(t * SR); x = x[: N - a]; voz[a:a + len(x)] += x
    print(f'fala{i:02d} {len(x)/SR:.2f}s em {t}s')
# voz: corta graves, leve compressão e presença
voz = sosfilt(butter(2, 90 / (SR / 2), 'high', output='sos'), voz)
voz = np.tanh(voz * 2.2) / 2.2 * 1.25
env = sosfilt(butter(1, 6 / (SR / 2), output='sos'), np.abs(voz))
duck = 1 / (1 + env * 18)
mix = mus * (0.35 + 0.65 * duck)[:, None] + sfx * (0.6 + 0.4 * duck)[:, None] + voz[:, None]
mix = np.tanh(mix * 1.05) / np.tanh(1.05); mix *= 0.89 / np.abs(mix).max()
with wave.open('out/som-narrado.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok')
