#!/usr/bin/env python3
"""Voz clonada com Chatterbox Multilingual (Resemble AI, MIT), em português.
Uso: voz_chatterbox.py "texto" referencia.wav saida.wav   (corre no venv do Chatterbox)
A referência são 10 a 30 s da voz real do Ricardo, limpa, sem música."""
import sys

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

texto, ref, saida = sys.argv[1], sys.argv[2], sys.argv[3]
import os
_dev = os.environ.get("MTM_DEVICE") or ("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
modelo = ChatterboxMultilingualTTS.from_pretrained(device=_dev)
# Frases longas soam melhor partidas: o Chatterbox perde naturalidade acima de ~300 caracteres.
partes, atual = [], ""
for frase in texto.replace("!", "!|").replace("?", "?|").replace(".", ".|").split("|"):
    if len(atual) + len(frase) > 280 and atual:
        partes.append(atual.strip()); atual = ""
    atual += frase
if atual.strip():
    partes.append(atual.strip())
audios = [modelo.generate(p, language_id="pt", audio_prompt_path=ref, exaggeration=0.55, cfg_weight=0.5) for p in partes]
pausa = torch.zeros(1, int(modelo.sr * 0.18))
juntos = torch.cat([x for a in audios for x in (a, pausa)][:-1], dim=1)
ta.save(saida, juntos, modelo.sr)
