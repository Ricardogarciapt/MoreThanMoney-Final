# Marca TrimBox (170x240 mm) e BleedBox (176x246 mm) em cada página do PDF para gráfica.
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
mm = 72 / 25.4
r = PdfReader(sys.argv[1]); w = PdfWriter()
for p in r.pages:
    W, H = float(p.mediabox.width), float(p.mediabox.height)
    s = 3 * mm
    p.trimbox = RectangleObject([s, s, W - s, H - s])
    p.bleedbox = RectangleObject([0, 0, W, H])
    w.add_page(p)
w.add_metadata({'/Title': sys.argv[3] if len(sys.argv) > 3 else ''})
with open(sys.argv[2], 'wb') as f: w.write(f)
