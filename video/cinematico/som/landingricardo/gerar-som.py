"""Som da LandingRicardo: música + SFX sintetizados (sintese.py, cortes em tempos.json) e a voz do
gémeo digital (áudio do raw.mp4 da HeyGen, em public/stock/landing-ricardo) entra aos 3,2 s, com a
música a baixar por baixo dela. Saída: out/som.wav (o render.sh normaliza a -14 LUFS)."""
import os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, os.path.join(AQUI, 'sintese.py'), os.path.join(AQUI, 'tempos.json'), 'out/musica.wav'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'public/stock/landing-ricardo/raw.mp4', '-i', 'out/musica.wav', '-filter_complex',
  '[0:a]adelay=3200|3200,apad,aformat=channel_layouts=stereo,asplit=2[v][sc];[1:a]volume=0.9[m];'
  '[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];[v][md]amix=inputs=2:duration=shortest:normalize=0[a]',
  '-map', '[a]', '-ar', '48000', 'out/som.wav'], check=True)
