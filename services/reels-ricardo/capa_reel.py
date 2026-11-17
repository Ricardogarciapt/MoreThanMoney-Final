#!/usr/bin/env python3
"""Capa de reel 9:16 no estilo @ricardogarciapt (foto do Ricardo + título condensado itálico
branco/ciano + faixa azul + logo MTM). Uso: python3 capa_reel.py capas.json pasta_saida
capas.json: lista de {n, foto, cx, linhas:[[estilo,texto],...], nota}
estilo: w (branco), c (ciano), box (branco sobre faixa azul). foto: imagem com o Ricardo."""
import json, sys, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

AQUI = os.path.dirname(os.path.abspath(__file__))
FONTES = os.path.join(AQUI, 'fontes')
W, H = 1080, 1920
CIANO = (30, 170, 230); AZUL = (18, 86, 190); OURO = (210, 166, 60)
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
    azul = Image.new('RGB', (W, H), (10, 30, 50))
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
    escuro = Image.new('RGB', (W, H), (4, 10, 26))
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
    d.polygon([(18, 0), (bw, 0), (bw - 18, bh), (0, bh)], fill=AZUL + (255,))
    # textura de pincel nas pontas
    for i in range(6):
        d.line([(bw - 14 + i * 3, 4 + i * 6), (bw + 6, bh - 10 - i * 5)], fill=AZUL + (180,), width=3)
    base.alpha_composite(img_txt, (px + 15, py))
    return base.rotate(2.2, resample=Image.BICUBIC, expand=True)

def capa(c, saida):
    im = gradientes(foto_916(c['foto'], c.get('cx', 600))).convert('RGBA')
    blocos = []
    for estilo, txt in c['linhas']:
        maxt = c.get('tam', {}).get(estilo, 190 if estilo != 'box' else 110)
        if estilo == 'box':
            f = ajustar(txt.upper(), 'Anton.ttf', 860, maxt)
            blocos.append(faixa(texto_italico(txt.upper(), f, (255, 255, 255), sombra=False)))
        else:
            f = ajustar(txt.upper(), 'Anton.ttf', 980, maxt)
            blocos.append(texto_italico(txt.upper(), f, (255, 255, 255) if estilo == 'w' else CIANO))
    nota = None
    if c.get('nota'):
        fn = ajustar(c['nota'], 'Kalam.ttf', 900, 64)
        nota = texto_italico(c['nota'], fn, OURO, shear=0.05)
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
    s = '@ricardogarciapt'; bb = fs.getbbox(s)
    d.text(((W - (bb[2] - bb[0])) // 2, 1800), s, font=fs, fill=(255, 255, 255, 170))
    im.convert('RGB').save(saida, quality=93)

if __name__ == '__main__':
    lista = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    for c in lista:
        p = os.path.join(out, f"capa-{int(c['n']):02d}.jpg"); capa(c, p); print(p)
