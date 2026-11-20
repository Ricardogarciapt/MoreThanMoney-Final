# Música + SFX (sem direitos) pela linha do tempo de cada anúncio: whoosh a cada imagem, impacto no gancho e no CTA.
import json, re, subprocess, sys, os
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(os.path.dirname(AQUI))
k = sys.argv[1]
leg = json.load(open(f'{RAIZ}/src/projetos/anuncio-reel/legendas.json'))[k]
src = open(f'{RAIZ}/src/projetos/anuncio-reel/anuncios.ts', encoding='utf-8').read()
bloco = src.split(f'\n  {k}: {{', 1)[1].split('\n  },', 1)[0]
imgs = [float(x) for x in re.findall(r"\{ de: ([\d.]+), ate:", bloco)]
cta = float(re.search(r"cta: \{ de: ([\d.]+)", bloco).group(1))
total = leg[-1][1] + 2.4
cfg = {'total': total, 'cortes': imgs + [cta], 'impactos': [0.05, cta], 'risers': [cta], 'pulso_desde': 0.0}
os.makedirs(f'{RAIZ}/out', exist_ok=True)
json.dump(cfg, open(f'{RAIZ}/out/tempos-{k}.json', 'w'))
subprocess.run(['python3', f'{AQUI}/sintese.py', f'{RAIZ}/out/tempos-{k}.json', f'{RAIZ}/public/stock/anuncios/{k}-musica.wav'], check=True)
