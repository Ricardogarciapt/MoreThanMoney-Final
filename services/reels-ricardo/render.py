#!/usr/bin/env python3
"""Reel curto do @ricardogarciapt («gémeo IA»): fotos dele animadas + voz clonada (Fish)
+ legendas PT-PT sincronizadas por fala + capa no estilo aprovado (capa_reel.py).

Uso:
  python3 render.py guioes.json N pasta_voz pasta_fotos saida/   [--teste]

  guioes.json  media/reels-ricardo/guioes.json (lista `reels`, cada um com `falas`)
  N            número do reel
  pasta_voz    pasta com 1.mp3, 2.mp3, … (uma por fala, pela ordem das falas)
  pasta_fotos  fotos do Ricardo (jpg/png); o reel roda por elas a partir de N
  --teste      sem voz: cada fala dura pelo nº de caracteres (só para ver o aspecto)

Saída: saida/reel-NN.mp4 (1080×1920, 30 fps, H.264 + AAC, -14 LUFS) e saida/capa-NN.jpg.

As legendas são exactas porque cada fala é um ficheiro de voz: sabemos onde começa e acaba;
dentro da fala, os blocos de 1–4 palavras repartem o tempo pelo nº de caracteres.
"""
import json, math, os, random, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import capa_reel as cr  # noqa: E402

_, W, H = cr.motor.formato('reel'); FPS = cr.motor.FPS
CIANO, AZUL = cr.CIANO, cr.AZUL
GAP = 0.14          # pausa entre falas (s)
INICIO = 0.35       # a voz entra aqui; antes só a capa
TEMPO = 1.04        # ligeiramente mais rápido (reels)
CAUDA = 1.3         # segura o CTA depois da última fala
Y_LEG = 1230        # centro das legendas (fora da UI do Instagram)


def sh(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def dur(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout
    return float(out.strip())


# ---------- áudio ----------
def preparar_voz(falas, pasta_voz, tmp, teste):
    """Cada fala → wav limpo (sem silêncios nas pontas, tempo 1,04). Devolve [(wav, dur)]."""
    out = []
    for i, fala in enumerate(falas, 1):
        w = os.path.join(tmp, f'f{i}.wav')
        if teste:
            d = max(1.0, len(fala) / 15.5)
            sh('ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=mono', '-t', f'{d:.2f}', w)
        else:
            src = os.path.join(pasta_voz, f'{i}.mp3')
            af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,'
                  'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,'
                  f'atempo={TEMPO},highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80')
            sh('ffmpeg', '-y', '-i', src, '-af', af, '-ar', '48000', '-ac', '1', w)
        out.append((w, dur(w)))
    return out


def montar_audio(vozes, total, tmp):
    """Voz na linha do tempo + música própria (sem direitos) com ducking + whoosh nos cortes."""
    SR = 48000
    voz = np.zeros(int(total * SR) + SR)
    t = INICIO
    marcas = []
    for w, d in vozes:
        with wave.open(w) as f:
            x = np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float32) / 32768
        s = int(t * SR); voz[s:s + len(x)] += x
        marcas.append((t, t + d)); t += d + GAP
    voz = voz[:int(total * SR)]
    mus_wav = os.path.join(tmp, 'musica.wav')
    sh(sys.executable, os.path.join(AQUI, 'musica.py'), f'{total + 0.5:.2f}', mus_wav)
    with wave.open(mus_wav) as f:
        m = np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float32).reshape(-1, 2) / 32768
    m = m[:len(voz)].mean(axis=1)
    if len(m) < len(voz): m = np.pad(m, (0, len(voz) - len(m)))
    # ducking: envolvente da voz suavizada
    env = np.convolve(np.abs(voz), np.ones(4800) / 4800, mode='same')
    duck = 1 - 0.75 * np.clip(env / (env.max() + 1e-9) * 6, 0, 1)
    mix = voz * 1.0 + m * 0.16 * duck
    # whoosh curto em cada corte de fala
    rng = np.random.default_rng(7)
    n = int(0.28 * SR); ruido = rng.standard_normal(n)
    envw = np.sin(np.linspace(0, math.pi, n)) ** 2
    wh = np.cumsum(ruido) ; wh = (wh - np.convolve(wh, np.ones(40) / 40, 'same')) * envw * 0.05
    for a, _ in marcas[1:]:
        s = int((a - 0.18) * SR)
        if 0 < s < len(mix) - n: mix[s:s + n] += wh
    mix /= max(1e-9, np.abs(mix).max()) / 0.9
    raw = os.path.join(tmp, 'mix.wav')
    with wave.open(raw, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((mix * 32767).astype(np.int16).tobytes())
    final = os.path.join(tmp, 'audio.wav')
    sh('ffmpeg', '-y', '-i', raw, '-af', cr.motor.LOUDNORM, '-ar', '48000', '-ac', '2', final)
    return final, marcas


# ---------- legendas ----------
def blocos(fala, a, b):
    """Parte a fala em blocos de ≤4 palavras (corta em vírgulas/pontos) e reparte [a,b]."""
    palavras = fala.replace('«', '').replace('»', '').split()
    grupos, g = [], []
    for p in palavras:
        g.append(p)
        if len(g) >= 4 or p[-1] in ',.?!:' and len(g) >= 2:
            grupos.append(g); g = []
    if g:
        if len(g) == 1 and grupos and len(grupos[-1]) < 5: grupos[-1] += g
        else: grupos.append(g)
    pesos = [sum(len(x) for x in gg) + 2 for gg in grupos]
    tot = sum(pesos); t = a; out = []
    for gg, p in zip(grupos, pesos):
        d = (b - a) * p / tot
        out.append((t, t + d, gg)); t += d
    return out


def img_bloco(palavras, palavra_chave):
    """Imagem RGBA do bloco: Anton itálico branco, palavra forte a ciano, quebra em 2 linhas se precisar."""
    limpa = lambda s: s.strip('.,?!:;').upper()
    forte = max(range(len(palavras)), key=lambda i: len(limpa(palavras[i])))
    for i, p in enumerate(palavras):
        if limpa(p) == palavra_chave.upper() or any(c.isdigit() for c in p): forte = i
    tam = lambda f, ln: sum(f.getlength(p.upper()) for _, p in ln) + 30 * (len(ln) - 1)
    todas = list(enumerate(palavras))
    linhas = None
    for t in range(116, 86, -6):  # primeiro tenta caber numa linha
        f = cr.fonte('Anton.ttf', t)
        if tam(f, todas) <= 930: linhas = [todas]; break
    if linhas is None:  # duas linhas equilibradas
        f = cr.fonte('Anton.ttf', 104)
        k = min(range(1, len(todas)), key=lambda k: abs(tam(f, todas[:k]) - tam(f, todas[k:])))
        linhas = [todas[:k], todas[k:]]
    imgs = []
    for ln in linhas:
        pecas = [cr.texto_italico(p.upper().rstrip(',;:'), f, CIANO if i == forte else (255, 255, 255)) for i, p in ln]
        w = sum(x.size[0] for x in pecas) - 24 * (len(pecas) - 1); h = max(x.size[1] for x in pecas)
        lay = Image.new('RGBA', (w, h), (0, 0, 0, 0)); x = 0
        for pc in pecas:
            lay.alpha_composite(pc, (x, h - pc.size[1])); x += pc.size[0] - 24
        imgs.append(lay)
    w = max(i.size[0] for i in imgs); h = sum(i.size[1] for i in imgs) - 10 * (len(imgs) - 1)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); y = 0
    for i in imgs:
        out.alpha_composite(i, ((w - i.size[0]) // 2, y)); y += i.size[1] - 10
    return out


# ---------- imagem ----------
def base_foto(path, cx):
    """Foto graduada 9:16 um pouco maior que o ecrã, para o Ken Burns."""
    im = cr.foto_916(path, cx)
    im = cr.gradientes(im)
    return im.resize((int(W * 1.14), int(H * 1.14)), Image.LANCZOS)


def quadro_kb(base, p, modo):
    """Ken Burns: p∈[0,1]. modos alternam zoom-in, zoom-out e deslize."""
    bw, bh = base.size
    e = p * p * (3 - 2 * p)
    if modo == 0: z = 1.0 + 0.10 * e; dx, dy = 0, -0.02 * e
    elif modo == 1: z = 1.10 - 0.10 * e; dx, dy = 0, 0.02 * e
    else: z = 1.05; dx, dy = -0.04 + 0.08 * e, 0
    cw, ch = bw / z, bh / z
    x0 = (bw - cw) / 2 + dx * bw; y0 = (bh - ch) / 2 + dy * bh
    x0 = min(max(0, x0), bw - cw); y0 = min(max(0, y0), bh - ch)
    return base.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))


def main():
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    teste = '--teste' in sys.argv
    guioes, n, pasta_voz, pasta_fotos, saida = a[0], int(a[1]), a[2], a[3], a[4]
    os.makedirs(saida, exist_ok=True)
    g = json.load(open(guioes))
    r = next(x for x in g['reels'] if int(x['n']) == n)
    fotos = sorted(os.path.join(pasta_fotos, f) for f in os.listdir(pasta_fotos)
                   if f.lower().endswith(('.jpg', '.jpeg', '.png')))
    random.Random(n).shuffle(fotos)
    cxs = r.get('cx', {})

    # capa (mesmo modelo do thread das capas)
    foto_capa = r.get('foto_capa') or fotos[0]
    capa_cfg = {'n': n, 'foto': foto_capa, 'cx': r.get('cx_capa', 600),
                'linhas': r.get('linhas_capa') or [['w', r['titulo_capa']]], 'nota': r.get('nota_capa')}
    capa_path = os.path.join(saida, f'capa-{n:02d}.jpg')
    cr.capa(capa_cfg, capa_path)
    capa_img = Image.open(capa_path).convert('RGB')

    tmp = tempfile.mkdtemp(prefix=f'reel{n}-')
    vozes = preparar_voz(r['falas'], pasta_voz, tmp, teste)
    total = INICIO + sum(d for _, d in vozes) + GAP * (len(vozes) - 1) + CAUDA
    audio, marcas = montar_audio(vozes, total, tmp)

    legendas = []
    for fala, (a0, b0) in zip(r['falas'], marcas):
        legendas += blocos(fala, a0, b0)
    leg_imgs = [img_bloco(gg, r['palavra']) for _, _, gg in legendas]

    # cenas: uma foto por fala (a 1.ª fala mantém a foto da capa para o corte ser suave)
    cenas = []
    for i, (a0, b0) in enumerate(marcas):
        ini = 0 if i == 0 else a0 - GAP / 2
        fim = total if i == len(marcas) - 1 else marcas[i + 1][0] - GAP / 2
        foto = foto_capa if i == 0 else fotos[i % len(fotos)]
        cenas.append((ini, fim, base_foto(foto, cxs.get(os.path.basename(foto), 600)), i % 3))

    cta = cr.faixa(cr.texto_italico(f"COMENTA {r['palavra']}", cr.fonte('Anton.ttf', 96), (255, 255, 255), sombra=False))
    sobre = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fs = cr.fonte('Oswald.ttf', 34); d = ImageDraw.Draw(sobre)
    s = '@ricardogarciapt'; d.text(((W - fs.getlength(s)) // 2, 130), s, font=fs, fill=(255, 255, 255, 200))

    video = os.path.join(saida, f'reel-{n:02d}.mp4')
    ff = subprocess.Popen(['ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                           '-i', '-', '-i', audio, *cr.motor.codificar('final'), '-shortest', video],
                          stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    nfr = int(total * FPS)
    ultima = marcas[-1][0]
    for k in range(nfr):
        t = k / FPS
        if t < INICIO + 0.9:
            # gancho: a capa (com o título) nos primeiros ~1,2 s, a respirar devagar
            z = 1 + 0.02 * t
            fr = capa_img.resize((int(W * z), int(H * z)), Image.BILINEAR)
            ox, oy = (fr.size[0] - W) // 2, (fr.size[1] - H) // 2
            frame = fr.crop((ox, oy, ox + W, oy + H)).convert('RGBA')
            if t > INICIO + 0.6:  # transição: clarão curto
                al = int(255 * (t - INICIO - 0.6) / 0.3 * 0.5)
                frame.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, al)))
            ff.stdin.write(frame.convert('RGB').tobytes()); continue
        ci = next(i for i, c in enumerate(cenas) if c[0] <= t < c[1] or i == len(cenas) - 1)
        ini, fim, base, modo = cenas[ci]
        frame = quadro_kb(base, min(1, (t - ini) / max(0.1, fim - ini)), modo).convert('RGBA')
        if ci > 0 and t - ini < 0.2:  # corte com mistura rápida
            pi, pf, pb, pm = cenas[ci - 1]
            ant = quadro_kb(pb, 1, pm).convert('RGBA')
            frame = Image.blend(ant, frame, (t - ini) / 0.2)
        frame.alpha_composite(sobre)
        li = next((i for i, (a0, b0, _) in enumerate(legendas) if a0 <= t < b0), None)
        if li is None and t >= INICIO:  # entre falas: mantém o último bloco
            prev = [i for i, (a0, _, _) in enumerate(legendas) if a0 <= t]
            li = prev[-1] if prev and t < legendas[prev[-1]][1] + GAP + 0.05 else None
        if li is not None:
            im = leg_imgs[li]; a0 = legendas[li][0]
            pop = min(1, (t - a0) / 0.12); esc = 0.86 + 0.14 * pop
            if esc < 0.999:
                im = im.resize((max(1, int(im.size[0] * esc)), max(1, int(im.size[1] * esc))), Image.BILINEAR)
            frame.alpha_composite(im, ((W - im.size[0]) // 2, Y_LEG - im.size[1] // 2))
        if t >= ultima:
            p = min(1, (t - ultima) / 0.25)
            c2 = cta if p >= 1 else cta.resize((max(1, int(cta.size[0] * (0.7 + 0.3 * p))), max(1, int(cta.size[1] * (0.7 + 0.3 * p)))))
            frame.alpha_composite(c2, ((W - c2.size[0]) // 2, 1450))
        # barra de progresso
        dr = ImageDraw.Draw(frame)
        dr.rectangle((0, H - 10, int(W * t / total), H), fill=CIANO + (255,))
        ff.stdin.write(frame.convert('RGB').tobytes())
    ff.stdin.close(); ff.wait()
    print(json.dumps({'video': video, 'capa': capa_path, 'duracao': round(total, 2)}))


if __name__ == '__main__':
    main()
