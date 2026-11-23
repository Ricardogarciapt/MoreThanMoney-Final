#!/usr/bin/env python3
"""Capa de reel 9:16 no estilo @ricardogarciapt (marca ricardo-garcia) ou com o branding MTM
(marca morethanmoney: ouro sobre carvão, @morethanmoney.pt). Pedido do Ricardo 22/11: todos os reels
levam capa, cada uma diferente. O robô dos reels cinemáticos chama:
  python3 capa_reel.py --marca=ricardo-garcia --semente=<id> --linhas='[["w","..."],["c","..."],["box","..."]]' --saida=capa.jpg
Uso antigo (foto do Ricardo + título condensado itálico
branco/ciano + faixa azul + logo MTM). Uso: python3 capa_reel.py capas.json pasta_saida
capas.json: lista de {n, foto, cx, linhas:[[estilo,texto],...], nota}
estilo: w (branco), c (ciano), box (branco sobre faixa azul). foto: imagem com o Ricardo."""
import json, sys, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = os.path.join(AQUI, 'fontes')
W, H = 1080, 1920
CIANO = (30, 170, 230); AZUL = (18, 86, 190); OURO = (210, 166, 60)
# Paletas por marca: destaque (linha 'c'), faixa (fundo do 'box'), texto da faixa, tinta da grade, assinatura.
PALETAS = {
    'ricardo-garcia': dict(destaque=CIANO, faixa=AZUL, faixa_txt=(255, 255, 255), tinta=(10, 30, 50), escuro=(4, 10, 26), nota=OURO, conta='@ricardogarciapt'),
    'morethanmoney': dict(destaque=(233, 196, 106), faixa=(210, 166, 60), faixa_txt=(14, 12, 8), tinta=(30, 22, 8), escuro=(10, 9, 7), nota=(233, 196, 106), conta='@morethanmoney.pt'),
}
PAL = PALETAS['ricardo-garcia']
# Centro do rosto (x) de cada foto, para o recorte 9:16.
CX = {'foto-05.jpg': 440, 'foto-22.jpg': 430, 'foto-06.jpg': 520, 'foto-19.jpg': 800, 'foto-01.jpg': 601, 'foto-16.jpg': 600,
      'foto-14.jpg': 620, 'foto-18.jpg': 580, 'foto-08.jpg': 440, 'foto-24.jpg': 480, 'foto-12.jpg': 540, 'foto-20.jpg': 440}
LOGO = os.path.join(AQUI, 'logo-mtm-transparent.png')

def fonte(nome, t): return ImageFont.truetype(os.path.join(FONTES, nome), t)

def foto_916(path, cx):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    cw = round(h * 9 / 16)
    if cw > w:
        ch = round(w * 16 / 9); im = im.crop((0, 0, w, ch)); h = ch; cw = w
    x0 = max(0, min(w - cw, int(cx - cw / 2)))
    im = im.crop((x0, 0, x0 + cw, h)).resize((W, H), Image.LANCZOS)
    # grade cinematográfica: contraste, ligeiro arrefecimento
    im = ImageEnhance.Contrast(im).enhance(1.12)
    im = ImageEnhance.Color(im).enhance(0.95)
    azul = Image.new('RGB', (W, H), PAL['tinta'])
    im = Image.blend(im, azul, 0.10)
    return im.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))

def gradientes(im):
    g = Image.new('L', (1, H))
    for y in range(H):
        a = 0
        if y > H * 0.48: a = min(235, int(((y - H * 0.48) / (H * 0.40)) ** 1.1 * 235))
        if y < 260: a = max(a, int((1 - y / 260) * 150))
        g.putpixel((0, y), a)
    g = g.resize((W, H))
    escuro = Image.new('RGB', (W, H), PAL['escuro'])
    return Image.composite(escuro, im, g)

def texto_italico(txt, f, cor, sombra=True, shear=0.18):
    bb = f.getbbox(txt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    pad = 40
    lay = Image.new('RGBA', (tw + pad * 2 + int(th * shear), th + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    if sombra:
        s = Image.new('RGBA', lay.size, (0, 0, 0, 0))
        ImageDraw.Draw(s).text((pad - bb[0] + 6, pad - bb[1] + 8), txt, font=f, fill=(0, 0, 0, 200))
        lay = Image.alpha_composite(lay, s.filter(ImageFilter.GaussianBlur(9)))
        d = ImageDraw.Draw(lay)
    d.text((pad - bb[0], pad - bb[1]), txt, font=f, fill=cor)
    sh = lay.transform(lay.size, Image.AFFINE, (1, shear, -shear * lay.size[1] * 0.5, 0, 1, 0), Image.BICUBIC)
    return sh.crop(sh.getbbox())

def ajustar(txt, nome, maxw, maxt):
    t = maxt
    while t > 30:
        f = fonte(nome, t); bb = f.getbbox(txt)
        if bb[2] - bb[0] + 0.18 * (bb[3] - bb[1]) <= maxw: return f
        t -= 4
    return fonte(nome, 30)

def faixa(img_txt):
    w, h = img_txt.size
    px, py = 34, 22
    base = Image.new('RGBA', (w + px * 2 + 30, h + py * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    bw, bh = base.size
    d.polygon([(18, 0), (bw, 0), (bw - 18, bh), (0, bh)], fill=PAL['faixa'] + (255,))
    # textura de pincel nas pontas
    for i in range(6):
        d.line([(bw - 14 + i * 3, 4 + i * 6), (bw + 6, bh - 10 - i * 5)], fill=PAL['faixa'] + (180,), width=3)
    base.alpha_composite(img_txt, (px + 15, py))
    return base.rotate(2.2, resample=Image.BICUBIC, expand=True)

def referencia(im, c, cor):
    """22/11 (Ricardo, exemplo «O CEO da NVIDIA também falha»): a imagem real de que o reel fala entra na capa,
    à direita e em cima, a desvanecer para o fundo; o Ricardo fica à esquerda. Logo opcional no canto."""
    rp = c.get('ref')
    if rp and os.path.exists(rp):
        r = Image.open(rp).convert('RGB')
        rw, rh = 640, 900
        k = max(rw / r.size[0], rh / r.size[1])
        r = r.resize((int(r.size[0] * k) + 1, int(r.size[1] * k) + 1), Image.LANCZOS)
        r = r.crop(((r.size[0] - rw) // 2, (r.size[1] - rh) // 3, (r.size[0] - rw) // 2 + rw, (r.size[1] - rh) // 3 + rh))
        r = ImageEnhance.Contrast(r).enhance(1.1); r = ImageEnhance.Color(r).enhance(0.8)
        r = Image.blend(r, Image.new('RGB', r.size, cor), 0.18)
        m = Image.new('L', (rw, rh), 0); dm = ImageDraw.Draw(m)
        for y in range(rh):
            fy = 1.0 if y < rh - 300 else max(0.0, (rh - y) / 300)
            fy = fy if y > 200 else fy * (y / 200) ** 1.2
            dm.line([(0, y), (rw, y)], fill=int(255 * fy))
        lx = Image.new('L', (rw, rh), 0); dl = ImageDraw.Draw(lx)
        for x in range(rw):
            dl.line([(x, 0), (x, rh)], fill=int(255 * min(1.0, x / 240) ** 1.3))
        import numpy as np
        m = Image.fromarray(np.minimum(np.array(m), np.array(lx)))
        im.paste(r, (W - rw, 250), m)
    lp = c.get('ref_logo')
    if lp and os.path.exists(lp):
        lg = Image.open(lp).convert('RGBA'); lg.thumbnail((260, 170))
        im.alpha_composite(lg, (W - lg.size[0] - 60, 80))
    return im

def capa(c, saida):
    im = gradientes(foto_916(c['foto'], c.get('cx', 600) + (230 if c.get('ref') else 0))).convert('RGBA')
    im = referencia(im, c, PAL['tinta'])
    blocos = []
    for estilo, txt in [l for l in c['linhas'] if l[0] != 'k']:
        maxt = c.get('tam', {}).get(estilo, 190 if estilo != 'box' else 110)
        if estilo == 'box':
            f = ajustar(txt.upper(), 'Anton.ttf', 860, maxt)
            blocos.append(faixa(texto_italico(txt.upper(), f, PAL['faixa_txt'], sombra=False)))
        else:
            f = ajustar(txt.upper(), 'Anton.ttf', 980, maxt)
            blocos.append(texto_italico(txt.upper(), f, (255, 255, 255) if estilo == 'w' else PAL['destaque']))
    nota = None
    if c.get('nota'):
        fn = ajustar(c['nota'], 'Kalam.ttf', 900, 64)
        nota = texto_italico(c['nota'], fn, PAL['nota'], shear=0.05)
    gap = -6
    total = sum(b.size[1] for b in blocos) + gap * (len(blocos) - 1) + (nota.size[1] + 24 if nota else 0)
    y = c.get('fundo', 1620) - total
    for b in blocos:
        im.alpha_composite(b, ((W - b.size[0]) // 2, int(y))); y += b.size[1] + gap
    if nota:
        im.alpha_composite(nota, ((W - nota.size[0]) // 2, int(y + 24)))
    # logo MTM por baixo do título
    if os.path.exists(LOGO):
        lg = Image.open(LOGO).convert('RGBA'); lg.thumbnail((300, 120))
        im.alpha_composite(lg, ((W - lg.size[0]) // 2, 1665))
    # assinatura
    fs = fonte('Oswald.ttf', 34)
    d = ImageDraw.Draw(im)
    s = PAL['conta']; bb = fs.getbbox(s)
    d.text(((W - (bb[2] - bb[0])) // 2, 1800), s, font=fs, fill=(255, 255, 255, 170))
    im.convert('RGB').save(saida, quality=93)

# ── Molde MTM (22/11, Ricardo: «as capas da MTM devem estar ligadas ao estilo que já existe na MTM»).
# Copia a linguagem dos carrosséis e flyers do @morethanmoney.pt: fundo quase preto com brilho dourado e velas
# ténues, cabeçalho com o selo redondo + «More Than Money / @morethanmoney.pt», pequeno título dourado em
# itálico por cima (kicker), título Anton itálico branco com palavras a ouro, alinhado à esquerda, traço
# dourado por baixo e rodapé discreto. Linhas: k (kicker), w (branco), c/box (ouro).
OURO_C = (233, 196, 106); CARVAO = (10, 9, 7)

def _velas(semente):
    import random
    r = random.Random(str(semente))
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    y = 1050; x = -20
    while x < W + 40:
        mv = r.uniform(-70, 75); o, c = y, y - mv
        hi, lo = min(o, c) - r.uniform(10, 60), max(o, c) + r.uniform(10, 60)
        a = r.randint(40, 85)
        d.line([(x + 13, hi), (x + 13, lo)], fill=OURO + (a,), width=3)
        d.rectangle([x, min(o, c), x + 26, max(o, c) + 4], fill=OURO + (a + 25,) if c < o else (0, 0, 0, 0), outline=OURO + (a + 25,), width=3)
        y = max(520, min(1200, c - 6)); x += 44
    return lay.filter(ImageFilter.GaussianBlur(1.2))

def _brilho():
    g = Image.new('L', (W, H), 0); d = ImageDraw.Draw(g)
    for i in range(40):
        rr = 900 - i * 20; d.ellipse([W * 0.62 - rr, 760 - rr, W * 0.62 + rr, 760 + rr], fill=int(i * 2.2))
    g = g.filter(ImageFilter.GaussianBlur(80))
    return Image.composite(Image.new('RGB', (W, H), (120, 88, 24)), Image.new('RGB', (W, H), CARVAO), g)

def _selo(tam):
    s = Image.new('RGBA', (tam, tam), (0, 0, 0, 0)); d = ImageDraw.Draw(s)
    d.ellipse([2, 2, tam - 3, tam - 3], fill=(18, 16, 12, 255), outline=OURO + (255,), width=max(2, tam // 40))
    if os.path.exists(LOGO):
        lg = Image.open(LOGO).convert('RGBA'); lg = lg.crop(lg.getbbox()); lg.thumbnail((int(tam * .72), int(tam * .72)))
        s.alpha_composite(lg, ((tam - lg.size[0]) // 2, (tam - lg.size[1]) // 2))
    return s

def capa_mtm(c, saida):
    fundo = _brilho().convert('RGBA')
    # foto: grade quente e escura, a desvanecer para o carvão nas bordas e em baixo
    fo = foto_916(c['foto'], c.get('cx', 600) + (230 if c.get('ref') else 0))
    fo = ImageEnhance.Color(fo).enhance(0.55); fo = ImageEnhance.Brightness(fo).enhance(0.82)
    fo = Image.blend(fo, Image.new('RGB', (W, H), (60, 42, 12)), 0.16)
    m = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(m)
    for y in range(H):
        a = 255 if y < 820 else int(255 * max(0.0, 1 - (y - 820) / 520) ** 1.4)
        if y < 220: a = int(a * (0.35 + 0.65 * y / 220))
        dm.line([(0, y), (W, y)], fill=a)
    lados = Image.new('L', (W, H), 0); dl = ImageDraw.Draw(lados)
    for x in range(W):
        dl.line([(x, 0), (x, H)], fill=int(255 * min(1, min(x, W - x) / 260)))
    m = Image.fromarray(__import__('numpy').minimum(__import__('numpy').array(m), __import__('numpy').array(lados)))
    fundo.alpha_composite(_velas(c.get('semente', 'x')))
    fundo.paste(fo, (0, 0), m)
    im = referencia(fundo, c, (60, 42, 12))
    d = ImageDraw.Draw(im)
    # cabeçalho como nos carrosséis
    selo = _selo(104); im.alpha_composite(selo, (64, 70))
    d.text((190, 84), 'More Than Money', font=fonte('Oswald.ttf', 40), fill=(255, 255, 255))
    d.text((190, 134), '@morethanmoney.pt', font=fonte('Oswald.ttf', 30), fill=(200, 192, 176))
    # bloco de texto alinhado à esquerda
    kicker = next((t for e, t in c['linhas'] if e == 'k'), c.get('kicker') or 'Método MTM')
    linhas = [(e, t) for e, t in c['linhas'] if e != 'k']
    blocos = []
    for e, t in linhas:
        f = ajustar(t.upper(), 'Anton.ttf', 930, c.get('tam', {}).get(e, 170))
        blocos.append(texto_italico(t.upper(), f, (255, 255, 255) if e == 'w' else OURO_C))
    kb = texto_italico(kicker.upper(), ajustar(kicker.upper(), 'Anton.ttf', 700, 66), OURO, sombra=False)
    gap = -14
    total = kb.size[1] + 10 + sum(b.size[1] for b in blocos) + gap * (len(blocos) - 1) + 50
    y = c.get('fundo', 1690) - total
    x0 = 64
    im.alpha_composite(kb, (x0, int(y))); y += kb.size[1] + 10
    for b in blocos:
        im.alpha_composite(b, (x0 - 8, int(y))); y += b.size[1] + gap
    d = ImageDraw.Draw(im)
    d.rectangle([x0, y + 30, x0 + 150, y + 38], fill=OURO_C)
    # rodapé: linha fina dourada + chamada, como o «DESLIZA →»
    d.line([(64, 1790), (W - 64, 1790)], fill=OURO + (90,), width=2)
    d.rectangle([64, 1787, 300, 1793], fill=OURO_C)
    fs = fonte('Oswald.ttf', 30); txt = 'VÊ ATÉ AO FIM'; bb = fs.getbbox(txt)
    xt = W - 64 - 34 - (bb[2] - bb[0])
    d.text((xt, 1820), txt, font=fs, fill=(220, 212, 196))
    d.polygon([(W - 86, 1830), (W - 86, 1858), (W - 64, 1844)], fill=OURO_C)
    d.text((64, 1820), 'morethanmoney.pt', font=fs, fill=(150, 142, 128))
    im.convert('RGB').save(saida, quality=93)

def foto_da_semente(semente, evitar=()):
    """Foto escolhida pela semente (id do projecto), para capas diferentes entre reels."""
    import hashlib
    fotos = sorted(f for f in os.listdir(os.path.join(AQUI, 'fotos')) if f.endswith('.jpg') and f not in evitar)
    h = int(hashlib.sha1(str(semente).encode()).hexdigest(), 16)
    return fotos[h % len(fotos)]

if __name__ == '__main__' and any(a.startswith('--') for a in sys.argv[1:]):
    a = dict(x[2:].split('=', 1) for x in sys.argv[1:] if x.startswith('--') and '=' in x)
    PAL = PALETAS.get(a.get('marca', 'ricardo-garcia'), PALETAS['ricardo-garcia'])
    foto = a.get('foto') or foto_da_semente(a.get('semente', 'x'))
    c = {'foto': os.path.join(AQUI, 'fotos', foto), 'cx': int(a.get('cx') or CX.get(foto, 560)), 'linhas': json.loads(a['linhas'])}
    if a.get('nota'): c['nota'] = a['nota']
    if a.get('kicker'): c['kicker'] = a['kicker']
    if a.get('ref'): c['ref'] = a['ref']
    if a.get('ref_logo'): c['ref_logo'] = a['ref_logo']
    c['semente'] = a.get('semente', 'x')
    (capa_mtm if a.get('marca') == 'morethanmoney' else capa)(c, a['saida'])
    print(a['saida'], foto)
    sys.exit(0)

if __name__ == '__main__':
    lista = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    for c in lista:
        p = os.path.join(out, f"capa-{int(c['n']):02d}.jpg"); capa(c, p); print(p)
