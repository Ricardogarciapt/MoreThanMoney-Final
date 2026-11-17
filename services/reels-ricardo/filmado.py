#!/usr/bin/env python3
"""Reel FILMADO do @ricardogarciapt: corta um take real dele (cara + voz verdadeiras) plano a
plano, como manda o guião, e junta legendas palavra a palavra, capa e CTA no estilo aprovado.

  python3 filmado.py take.mp4 montagem.json palavras.json saida/

  take.mp4       vídeo vertical dele a falar (1080×1920; o do teleprompter do /estudio serve)
  montagem.json  {n, palavra, linhas_capa, capa_t, centro:[x,y], correcoes:{"i-j": "texto"},
                  planos:[{i0, i1, plano}]}  (i0/i1 = índices de palavras do Whisper, inclusive)
  palavras.json  [[início, fim, palavra], …] do faster-whisper (word_timestamps=True)

Planos (lib/conteudo-magnetico/guiao.ts): aberto · medio · fechado · detalhe. Cada plano é um
enquadramento do mesmo take: o corte de plano esconde o salto de imagem entre frases.
Saída: saida/reel-NN.mp4 (1080×1920, 25 fps, -14 LUFS) e saida/capa-NN.jpg.
"""
import json, math, os, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import capa_reel as cr  # noqa: E402
from render import img_bloco, CIANO  # noqa: E402

W, H, FPS, SR = 1080, 1920, 25, 48000
ZOOM = {'aberto': 1.0, 'medio': 1.28, 'fechado': 1.6, 'de_cima': 1.15, 'de_baixo': 1.15, 'detalhe': 2.0, 'mao': 1.4}
Y_LEG = 1400      # legendas abaixo do queixo (a cara fica no terço de cima)
Y_CTA = 1560
CAPA_S = 0.6      # a capa abre o reel (o mesmo quadro que o Instagram mostra na grelha)
PAD = 0.07        # folga antes/depois de cada frase


def sh(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def quadro(src, t, saida):
    sh('ffmpeg', '-y', '-ss', f'{t:.3f}', '-i', src, '-frames:v', '1', saida)


def ler_frames(src, a, b):
    """Frames RGB de [a, b) do take, ao ritmo do reel."""
    n = max(1, round((b - a) * FPS))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{a:.3f}', '-i', src, '-t', f'{b - a + 0.2:.3f}',
                          '-vf', f'fps={FPS},scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
    if len(fr) < n: fr = np.concatenate([fr, np.repeat(fr[-1:], n - len(fr), 0)])
    return fr[:n]


def enquadrar(fr, plano, centro, t_rel):
    """Recorta e amplia à volta da cara; um empurrão lento dá vida a cada plano."""
    z = ZOOM.get(plano, 1.0) * (1 + 0.012 * t_rel)
    if z <= 1.001: return Image.fromarray(fr)
    cw, ch = W / z, H / z
    cx = min(max(centro[0], cw / 2), W - cw / 2); cy = min(max(centro[1] - H * 0.06 * (z - 1), ch / 2), H - ch / 2)
    return Image.fromarray(fr).resize((W, H), Image.BICUBIC, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))


def audio_take(src):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def palavras_legenda(palavras, correcoes, i0, i1):
    """Palavras do Whisper com as correcções (nomes da casa, gralhas); '' apaga."""
    out, i = [], i0
    while i <= i1:
        hit = next(((int(k.split('-')[0]), int(k.split('-')[-1]), v) for k, v in correcoes.items()
                    if int(k.split('-')[0]) == i), None)
        if hit:
            a, b, txt = hit
            if txt: out.append((palavras[a][0], palavras[min(b, i1)][1], txt))
            i = b + 1
        else:
            out.append(tuple(palavras[i])); i += 1
    return out


def blocos_palavras(ws):
    """Blocos de ≤4 palavras, cortados na pontuação, com os tempos reais de cada palavra."""
    g, out = [], []
    for w in ws:
        g.append(w)
        if len(g) >= 4 or (w[2][-1] in ',.?!:' and len(g) >= 2):
            out.append(g); g = []
    if g:
        if len(g) == 1 and out and len(out[-1]) < 5: out[-1] += g
        else: out.append(g)
    return [(b[0][0], b[-1][1], [x[2] for x in b]) for b in out]


def main():
    src, mont, pal, saida = sys.argv[1:5]
    os.makedirs(saida, exist_ok=True)
    m = json.load(open(mont)); palavras = json.load(open(pal))
    n = int(m['n']); centro = m.get('centro', [W / 2, H * 0.5]); cor = m.get('correcoes', {})
    tmp = tempfile.mkdtemp(prefix=f'filmado{n}-')

    # capa: um quadro real dele com o título do guião
    q = os.path.join(tmp, 'capa-src.png'); quadro(src, m.get('capa_t', 1.0), q)
    capa_path = os.path.join(saida, f'capa-{n:02d}.jpg')
    cr.capa({'n': n, 'foto': q, 'cx': m.get('cx_capa', int(centro[0])), 'linhas': m['linhas_capa'],
             'nota': m.get('nota_capa')}, capa_path)
    capa = Image.open(capa_path).convert('RGB')

    # linha do tempo: cada plano é uma frase (ou parte) do take
    take = audio_take(src)
    cortes, t = [], CAPA_S
    planos = m['planos']
    for k, p in enumerate(planos):
        # planos seguidos no take partilham a fronteira (a meio do silêncio): sem sílabas repetidas
        if k > 0 and p['i0'] == planos[k - 1]['i1'] + 1:
            a = (palavras[p['i0'] - 1][1] + palavras[p['i0']][0]) / 2
        else:
            a = max(0, palavras[p['i0']][0] - PAD)
        if k + 1 < len(planos) and planos[k + 1]['i0'] == p['i1'] + 1:
            b = (palavras[p['i1']][1] + palavras[p['i1'] + 1][0]) / 2
        else:
            b = palavras[p['i1']][1] + PAD
        cortes.append({**p, 'a': a, 'b': b, 't': t}); t += b - a
    total = t + 1.4

    # áudio: voz real + música própria baixinha com ducking
    voz = np.zeros(int(total * SR) + SR, np.float32)
    fade = int(0.012 * SR)
    for c in cortes:
        x = take[int(c['a'] * SR):int(c['b'] * SR)].copy()
        x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
        s = int(c['t'] * SR); voz[s:s + len(x)] += x
    voz = voz[:int(total * SR)]
    mw = os.path.join(tmp, 'musica.wav')
    sh(sys.executable, os.path.join(AQUI, 'musica.py'), f'{total + 0.5:.2f}', mw)
    with wave.open(mw) as f:
        mu = np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float32).reshape(-1, 2).mean(1) / 32768
    mu = np.pad(mu, (0, max(0, len(voz) - len(mu))))[:len(voz)]
    env = np.convolve(np.abs(voz), np.ones(4800) / 4800, 'same')
    mix = voz / (np.abs(voz).max() + 1e-9) * 0.9 + mu * 0.10 * (1 - 0.8 * np.clip(env / (env.max() + 1e-9) * 6, 0, 1))
    mix /= np.abs(mix).max() / 0.9
    raw = os.path.join(tmp, 'mix.wav')
    with wave.open(raw, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((mix * 32767).astype(np.int16).tobytes())
    audio = os.path.join(tmp, 'audio.wav')
    sh('ffmpeg', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '2', audio)

    # legendas com os tempos reais das palavras, passados para a linha do tempo do reel
    legendas = []
    for c in cortes:
        ws = palavras_legenda(palavras, cor, c['i0'], c['i1'])
        off = c['t'] - c['a']
        for a, b, gg in blocos_palavras(ws):
            legendas.append((a + off, b + off, gg))
    for i in range(len(legendas) - 1):  # cada bloco fica até o seguinte entrar (sem piscar)
        a, b, gg = legendas[i]; legendas[i] = (a, max(b, min(legendas[i + 1][0], b + 0.6)), gg)
    imgs = [img_bloco(gg, m['palavra']) for _, _, gg in legendas]

    cta = cr.faixa(cr.texto_italico(f"COMENTA {m['palavra']}", cr.fonte('Anton.ttf', 96), (255, 255, 255), sombra=False))
    sobre = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(sobre)
    fs = cr.fonte('Oswald.ttf', 34); s = '@ricardogarciapt'
    d.text(((W - fs.getlength(s)) // 2, 130), s, font=fs, fill=(255, 255, 255, 210))
    # sombra suave em baixo para as legendas lerem bem em cima da camisa
    grad = np.zeros((H, W, 4), np.uint8); y0 = 1150
    grad[y0:, :, 3] = (np.linspace(0, 150, H - y0)[:, None]).astype(np.uint8)
    sombra = Image.fromarray(grad, 'RGBA')

    video = os.path.join(saida, f'reel-{n:02d}.mp4')
    ff = subprocess.Popen(['ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                           '-i', '-', '-i', audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '160k',
                           '-movflags', '+faststart', '-shortest', video], stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    k = 0
    for _ in range(int(CAPA_S * FPS)):
        ff.stdin.write(capa.tobytes()); k += 1
    ultima_t = cortes[-1]['t']
    for ci, c in enumerate(cortes):
        frames = ler_frames(src, c['a'], c['b'] + (1.4 if ci == len(cortes) - 1 else 0))
        for j, fr in enumerate(frames):
            t = k / FPS
            im = enquadrar(fr, c['plano'], centro, j / FPS).convert('RGBA')
            if ci == 0 and j < 4:  # clarão curto a sair da capa
                im.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(140 * (1 - j / 4)))))
            im.alpha_composite(sombra); im.alpha_composite(sobre)
            li = next((i for i, (a, b, _) in enumerate(legendas) if a <= t < b), None)
            if li is not None:
                g = imgs[li]; pop = min(1, (t - legendas[li][0]) / 0.1); e = 0.88 + 0.12 * pop
                if e < 0.999: g = g.resize((max(1, int(g.size[0] * e)), max(1, int(g.size[1] * e))), Image.BILINEAR)
                im.alpha_composite(g, ((W - g.size[0]) // 2, Y_LEG - g.size[1] // 2))
            if t >= ultima_t:
                p = min(1, (t - ultima_t) / 0.25); s2 = 0.7 + 0.3 * p
                c2 = cta if p >= 1 else cta.resize((max(1, int(cta.size[0] * s2)), max(1, int(cta.size[1] * s2))))
                im.alpha_composite(c2, ((W - c2.size[0]) // 2, Y_CTA))
            ImageDraw.Draw(im).rectangle((0, H - 10, int(W * t / total), H), fill=CIANO + (255,))
            ff.stdin.write(im.convert('RGB').tobytes()); k += 1
    ff.stdin.close(); ff.wait()
    print(json.dumps({'video': video, 'capa': capa_path, 'duracao': round(k / FPS, 2)}))


if __name__ == '__main__':
    main()
