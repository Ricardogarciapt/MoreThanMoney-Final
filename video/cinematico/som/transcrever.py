# Palavras com tempos (faster-whisper) do vídeo do gémeo → JSON [{w, ini, fim}].
# Uso: python3 transcrever.py <video.mp4> <saida.json> [texto-do-guiao]
# O texto do guião entra como initial_prompt: o Whisper acerta a ortografia dos nomes da casa.
import json, os, sys
from faster_whisper import WhisperModel

video, saida = sys.argv[1], sys.argv[2]
guiao = sys.argv[3] if len(sys.argv) > 3 else ''
modelo = WhisperModel(os.environ.get('ASR_LOCAL_MODELO', 'small'), device='cpu', compute_type='int8')
segs, _ = modelo.transcribe(video, language='pt', word_timestamps=True, vad_filter=True,
                            initial_prompt=(guiao[:600] or None), beam_size=5)
palavras = []
for s in segs:
    for w in (s.words or []):
        t = w.word.strip()
        if t:
            palavras.append({'w': t, 'ini': round(w.start, 2), 'fim': round(w.end, 2)})
json.dump(palavras, open(saida, 'w'), ensure_ascii=False)
print(f'{len(palavras)} palavras')
