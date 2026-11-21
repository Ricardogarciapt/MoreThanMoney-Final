"""Imagem «três páginas do interior» para a página de venda (public/marketplace/ebooks/<slug>-paginas.jpg).
Usa o PDF já montado: uma abertura de capítulo (página escura) ao centro e duas páginas de texto aos lados.
  python3 tools/ebooks/paginas.py <slug>
"""
import subprocess, sys, tempfile, os
from PIL import Image, ImageStat

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
slug = sys.argv[1]
pdf = os.path.join(RAIZ, 'conteudo-privado/ebooks', slug, f'{slug}.pdf')
tmp = tempfile.mkdtemp()
subprocess.run(['pdftoppm', '-r', '60', '-f', '6', '-l', '40', '-jpeg', pdf, os.path.join(tmp, 'p')], check=True)
fs = sorted(os.listdir(tmp))
luz = [(f, ImageStat.Stat(Image.open(os.path.join(tmp, f)).convert('L')).mean[0]) for f in fs]
escuras = [i for i, (_, l) in enumerate(luz) if l < 90]
c = escuras[1] if len(escuras) > 1 else (escuras[0] if escuras else len(fs) // 2)
claras = [i for i, (_, l) in enumerate(luz) if l > 150 and i != c]
lados = sorted(claras, key=lambda i: abs(i - c))[:2] or [max(c - 2, 0), min(c + 2, len(fs) - 1)]
num = lambda i: int(fs[i].split('-')[-1].split('.')[0])
def pagina(n, h):
    out = os.path.join(tmp, f'hi-{n}')
    subprocess.run(['pdftoppm', '-r', '150', '-f', str(n), '-l', str(n), '-singlefile', '-jpeg', pdf, out], check=True)
    im = Image.open(out + '.jpg').convert('RGB')
    return im.resize((int(im.width * h / im.height), h), Image.LANCZOS)
W, H = 1800, 1100
fundo = Image.new('RGB', (W, H), (10, 10, 11))
e, d = pagina(num(lados[0]), 900), pagina(num(lados[-1]), 900)
fundo.paste(e, (34, 100)); fundo.paste(d, (W - d.width - 34, 100))
m = pagina(num(c), 980)
sombra = Image.new('RGB', (m.width + 16, m.height + 16), (0, 0, 0))
fundo.paste(sombra, ((W - m.width) // 2 - 8, 52)); fundo.paste(m, ((W - m.width) // 2, 60))
dest = os.path.join(RAIZ, 'public/marketplace/ebooks', f'{slug}-paginas.jpg')
fundo.save(dest, quality=86)
print(dest, num(lados[0]), num(c), num(lados[-1]))
