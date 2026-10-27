#!/usr/bin/env python3
"""ASR local com tempos por palavra (faster-whisper), para o robô diário do GitHub.

Uso: asr-local.py <audio> <saida.json> [idioma]
Sai no mesmo formato que o worker manda ao site: {"words": [{palavra, inicio, fim}], "duration": s}
"""
import json
import os
import subprocess
import sys

import numpy as np

from faster_whisper import WhisperModel

audio, saida = sys.argv[1], sys.argv[2]
idioma = (sys.argv[3] if len(sys.argv) > 3 else "") or None
modelo = WhisperModel(os.environ.get("ASR_LOCAL_MODELO", "small"), device="cpu", compute_type="int8")
# O áudio é descodificado pelo ffmpeg e não pelo PyAV: as versões do PyAV e do faster-whisper
# nem sempre se entendem (no Mac, o av.open rebentou), e o ffmpeg já está em todas as máquinas.
pcm = subprocess.run(
    ["ffmpeg", "-nostdin", "-v", "error", "-i", audio, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
    check=True, stdout=subprocess.PIPE,
).stdout
som = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
segmentos, info = modelo.transcribe(som, language=idioma, word_timestamps=True, vad_filter=True, beam_size=1)
palavras = []
for seg in segmentos:
    for w in seg.words or []:
        t = w.word.strip()
        if t:
            palavras.append({"palavra": t, "inicio": round(w.start, 2), "fim": round(w.end, 2)})
with open(saida, "w", encoding="utf-8") as f:
    json.dump({"words": palavras, "duration": info.duration}, f, ensure_ascii=False)
print(f"{len(palavras)} palavras, {info.duration:.0f} s")
