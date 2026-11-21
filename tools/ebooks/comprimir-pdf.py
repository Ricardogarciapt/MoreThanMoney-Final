# Versão digital mais leve: imagens com mais de 1600 px reduzidas e recomprimidas (a edição para gráfica fica intacta).
import sys
from pypdf import PdfReader, PdfWriter
w = PdfWriter(clone_from=PdfReader(sys.argv[1]))
for p in w.pages:
    for im in p.images:
        try:
            i = im.image
            if i.mode in ('RGBA', 'LA', 'P'): continue
            if max(i.size) > 1600:
                i = i.copy(); i.thumbnail((1600, 1600))
            im.replace(i.convert('RGB'), quality=80)
        except Exception:
            pass
w.compress_identical_objects(remove_identicals=True, remove_orphans=True)
with open(sys.argv[2], 'wb') as f: w.write(f)
