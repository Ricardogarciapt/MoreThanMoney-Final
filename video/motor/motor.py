"""MOTOR DE VÍDEO ÚNICO da MTM — versão Python (reels do clone, motores PIL/numpy).

Lê os mesmos formatos.json e marcas/*.json que motor.mjs e lib/video/motor.ts. Uso:

    sys.path.insert(0, '<repo>/video/motor'); import motor
    motor.codificar('final')        # argumentos ffmpeg de vídeo+áudio+faststart
    motor.LOUDNORM                  # 'loudnorm=I=-14:TP=-1.5:LRA=11'
    motor.marca('ricardogarciapt')  # perfil (cores, fontes, logo, grade…)
    motor.saida('ricardo-garcia', 'reels', 'gancho-01')
"""
import datetime
import json
import os
import re
import unicodedata

DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(DIR, 'formatos.json'), encoding='utf-8') as _f:
    CFG = json.load(_f)
FPS = CFG['fps']

MARCAS = {}
for _n in sorted(os.listdir(os.path.join(DIR, 'marcas'))):
    if _n.endswith('.json'):
        with open(os.path.join(DIR, 'marcas', _n), encoding='utf-8') as _f:
            _m = json.load(_f)
            MARCAS[_m['id']] = _m


def marca(id_='morethanmoney'):
    k = str(id_ or '').strip().lower()
    if k in MARCAS:
        return MARCAS[k]
    for m in MARCAS.values():
        if k in m.get('aliases', []):
            return m
    return MARCAS['morethanmoney']


def fonte(id_marca, papel='titulo'):
    f = (marca(id_marca).get('fontes') or {}).get(papel) or {}
    return os.path.join(DIR, f['ficheiro']) if f.get('ficheiro') else None


PASTA_FONTES = os.path.join(DIR, 'fontes')


def rgb(hex_):
    h = hex_.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def formato(nome='reel'):
    k = str(nome or 'reel').lower()
    for id_, f in CFG['formatos'].items():
        if id_ == k or k in f.get('aliases', []):
            return id_, f['largura'], f['altura']
    f = CFG['formatos']['reel']
    return 'reel', f['largura'], f['altura']


def grade(nome_ou_marca):
    if nome_ou_marca in CFG['grades']:
        return CFG['grades'][nome_ou_marca]
    return CFG['grades'].get(marca(nome_ou_marca).get('grade'), '')


_V = CFG['volume']
LOUDNORM = f"loudnorm=I={_V['lufs']}:TP={_V['true_peak']}:LRA={_V['lra']}"


def codec_video(qualidade='final'):
    q = CFG['qualidade'].get(qualidade, CFG['qualidade']['final'])
    v = CFG['video']
    a = ['-c:v', v['codec'], '-preset', q['preset'], '-crf', str(q['crf']), '-pix_fmt', v['pix_fmt']]
    return a if qualidade == 'intermedio' else a + ['-profile:v', v['profile']]


def codec_audio():
    a = CFG['audio']
    return ['-c:a', a['codec'], '-b:a', a['bitrate'], '-ar', str(a['sample_rate']), '-ac', str(a['canais'])]


def codificar(qualidade='final', sem_audio=False):
    return codec_video(qualidade) + ([] if sem_audio else codec_audio()) + ['-movflags', '+faststart']


def raiz_renders():
    if os.environ.get('MTM_RENDERS'):
        return os.environ['MTM_RENDERS']
    s = CFG['saida']
    if os.path.isdir(os.path.dirname(s['raiz_mac'])):
        return s['raiz_mac']
    if os.path.isdir(os.path.dirname(s['raiz_nuvem'])):
        return s['raiz_nuvem']
    return os.path.join(DIR, '..', 'saida')


def raiz_ativos():
    if os.environ.get('MTM_ASSETS'):
        return os.environ['MTM_ASSETS']
    s = CFG['saida']
    return s['ativos_mac'] if os.path.isdir(s['ativos_mac']) else s['ativos_nuvem']


def _slug(s):
    s = unicodedata.normalize('NFD', str(s or 'video'))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60] or 'video'


def saida(id_marca='morethanmoney', produto='estudio', slug='video', ext='mp4', raiz=None, data=None):
    pasta = os.path.join(raiz or raiz_renders(), marca(id_marca)['id'], _slug(produto))
    os.makedirs(pasta, exist_ok=True)
    dia = (data or datetime.date.today()).isoformat()[:10]
    return os.path.join(pasta, f'{dia}-{_slug(slug)}.{ext}')


def chave_storage(id_marca, produto, ficheiro):
    return '/'.join([CFG['saida']['prefixo_storage'], marca(id_marca)['id'], _slug(produto), os.path.basename(ficheiro)])
