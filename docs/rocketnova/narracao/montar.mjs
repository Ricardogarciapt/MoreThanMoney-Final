// Monta os vídeos da landing RocketNova narrados (voz clonada do Ricardo a 1,10× + música original).
// 1) no Mac: node docs/rocketnova/narracao/gerar-audios.mjs landing-pt landing-en  (Fish → landing-*/0N.mp3)
// 2) aqui:   node docs/rocketnova/narracao/montar.mjs [pt|en]  → public/scanners/rocketnova/apresentacao{,-en}.mp4
// As cenas do vídeo esticam-se à narração: linha 1 = abertura · 2 = médias · 3 = estrelas+painel ·
// 4 = plano+gestão · 5–7 = fecho (mercados, CTA, aviso).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(DIR, '../../..')
const VEL = 1.10
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'rn-narr-'))
const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

for (const lang of process.argv[2] ? [process.argv[2]] : ['pt', 'en']) {
  const pasta = path.join(DIR, `landing-${lang}`)
  // 1. voz a 1,10× por linha
  const falas = [1, 2, 3, 4, 5, 6, 7].map(i => {
    const out = path.join(TMP, `${lang}-${i}.wav`)
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(pasta, `0${i}.mp3`), '-af', `aresample=48000,atempo=${VEL}`, out])
    return { f: out, d: dur(out) }
  })
  const d = falas.map(x => x.d), G = 0.45
  // 2. tempos das cenas
  const abre = 0.5 + d[0] + 0.5
  const c3 = d[2] + 0.6, c4 = d[3] + 0.6
  const cenas = [d[1] + 0.6, c3 * 0.55, c3 * 0.45, c4 * 0.4, c4 * 0.6]
  const fim = 0.4 + d[4] + G + d[5] + G + d[6] + 1.2
  const ini = cenas.reduce((a, c, i) => (a.push(a[i] + c), a), [abre])
  const total = ini[5] + fim
  const off = [0.5, ini[0] + 0.2, ini[1] + 0.2, ini[3] + 0.2, ini[5] + 0.4, ini[5] + 0.4 + d[4] + G, ini[5] + 0.4 + d[4] + G + d[5] + G]
  console.log(lang, 'total', total.toFixed(2), 's')
  // 3. vídeo esticado
  execFileSync('node', [path.join(RAIZ, 'docs/rocketnova/gerar-materiais.mjs'), 'video'], {
    stdio: 'inherit', env: { ...process.env, RN_LANG: lang, RN_TEMPOS: JSON.stringify({ abre, cenas, fim }) },
  })
  const mudo = path.join(RAIZ, 'docs/rocketnova/saida', `apresentacao${lang === 'en' ? '-en' : ''}.mp4`)
  // 4. música original (síntese própria) com «ducking» pela voz
  const mus = path.join(TMP, `${lang}-mus.wav`)
  execFileSync('python3', [path.join(RAIZ, 'video/stories-mtm/musica.py'), mus, total.toFixed(2),
    JSON.stringify({ drop: abre, pausa: ini[5] - 0.6, final: ini[5] + 0.4 })])
  const ins = falas.flatMap(x => ['-i', x.f])
  const filt = falas.map((_, i) => `[${i}:a]adelay=${Math.round(off[i] * 1000)}:all=1[a${i}]`)
  filt.push(`${falas.map((_, i) => `[a${i}]`).join('')}amix=inputs=7:normalize=0,apad=whole_dur=${total.toFixed(2)},loudnorm=I=-16:TP=-1.5,aresample=48000,asplit[voz][chave]`,
    `[7:a]aresample=48000,atrim=0:${total.toFixed(2)},loudnorm=I=-30,aresample=48000,afade=t=in:d=1,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5[m]`,
    `[m][chave]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=500[md]`,
    `[voz][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[out]`)
  const final = path.join(RAIZ, 'public/scanners/rocketnova', `apresentacao${lang === 'en' ? '-en' : ''}.mp4`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...ins, '-i', mus, '-i', mudo, '-filter_complex', filt.join(';'),
    '-map', '8:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-shortest', '-movflags', '+faststart', final])
  console.log('feito', final, dur(final).toFixed(2), 's')
}
fs.rmSync(TMP, { recursive: true, force: true })
