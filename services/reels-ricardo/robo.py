#!/usr/bin/env python3
"""Robô dos reels do @ricardogarciapt: pede ao site o guião + voz, desenha, entrega.

  CRON_SECRET=… python3 robo.py [--n=N] [--rascunho] [--api=https://www.morethanmoney.pt]

Corre no GitHub Actions (.github/workflows/reels-ricardo.yml) ou em qualquer máquina com ffmpeg.
"""
import json, os, subprocess, sys, tempfile, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
ARGS = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
API = ARGS.get('api', os.environ.get('MTM_API', 'https://www.morethanmoney.pt')).rstrip('/')
SEGREDO = os.environ['CRON_SECRET']
UA = {'User-Agent': 'mtm-reels-ricardo/1'}


def api(metodo, corpo=None, query=''):
    req = urllib.request.Request(f'{API}/api/cron/reels-ricardo{query}', method=metodo,
                                 data=json.dumps(corpo).encode() if corpo else None,
                                 headers={**UA, 'Authorization': f'Bearer {SEGREDO}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def baixar(url, destino):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(destino, 'wb') as f:
        f.write(r.read())


def subir(caminho, ext):
    alvo = api('POST', {'acao': 'upload-url', 'ext': ext})
    with open(caminho, 'rb') as f:
        dados = f.read()
    req = urllib.request.Request(alvo['signedUrl'], data=dados, method='PUT',
                                 headers={**UA, 'Content-Type': 'video/mp4' if ext == 'mp4' else 'image/jpeg'})
    urllib.request.urlopen(req, timeout=300).read()
    return alvo['publicUrl']


def main():
    plano = api('GET', query=f"?n={ARGS['n']}" if 'n' in ARGS else '')
    if plano.get('nada') or plano.get('erro'):
        print(json.dumps(plano, ensure_ascii=False)); return 0 if plano.get('nada') else 1
    reel = plano['reel']; n = int(reel['n'])
    tmp = tempfile.mkdtemp(prefix=f'rr{n}-')
    voz, fotos, saida = (os.path.join(tmp, x) for x in ('voz', 'fotos', 'saida'))
    for d in (voz, fotos, saida): os.makedirs(d)
    for i, u in enumerate(plano['vozes'], 1):
        baixar(u, os.path.join(voz, f'{i}.mp3'))
    ok = 0
    for i, u in enumerate(plano['fotos'], 1):
        try:
            baixar(u, os.path.join(fotos, f'{i:02d}' + ('.png' if u.endswith('.png') else '.jpg'))); ok += 1
        except Exception as e:  # uma foto em falta não pára o reel
            print('foto falhou', u, e)
    if ok == 0: raise SystemExit('sem fotos')
    guiao = os.path.join(tmp, 'guiao.json')
    json.dump({'reels': [reel]}, open(guiao, 'w'), ensure_ascii=False)
    out = subprocess.run([sys.executable, os.path.join(AQUI, 'render.py'), guiao, str(n), voz, fotos, saida],
                         check=True, capture_output=True, text=True).stdout.strip().splitlines()[-1]
    res = json.loads(out)
    video = subir(res['video'], 'mp4'); capa = subir(res['capa'], 'jpg')
    entregue = api('POST', {'acao': 'entregar', 'n': n, 'videoUrl': video, 'capaUrl': capa, 'rascunho': 'rascunho' in ARGS})
    print(json.dumps({**entregue, 'video': video, 'capa': capa, 'duracao': res['duracao']}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
