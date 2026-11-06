// Passa os vídeos já feitos a 1,10× (marcador .v2) para 1,03× sem voltar a renderizar:
// abranda imagem e voz no ffmpeg e reescala os tempos das legendas (.vtt) e dos capítulos.
// Uso (no Mac, na raiz do worktree): node video/bootcamp/ajustar-velocidade.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const F = 1.10 / 1.03 // quanto o vídeo fica mais longo
const SAIDA = path.join(DIR, 'saida')
const seg = s => { const p = s.split(':').map(Number); return p.reduce((a, x) => a * 60 + x, 0) }
const hms = s => new Date(s * 1000).toISOString().slice(11, 23)
const ms = s => new Date(s * 1000).toISOString().slice(14, 19)

for (const est of fs.existsSync(SAIDA) ? fs.readdirSync(SAIDA) : []) {
  for (const f of fs.readdirSync(path.join(SAIDA, est))) {
    if (!f.endsWith('.mp4')) continue
    const mp4 = path.join(SAIDA, est, f)
    if (!fs.existsSync(mp4 + '.v2') || fs.existsSync(mp4 + '.v3')) continue
    const tmp = mp4.replace(/\.mp4$/, '.tmp.mp4')
    console.log('a ajustar', f)
    execFileSync('nice', ['-n', '10', 'ffmpeg', '-y', '-v', 'error', '-i', mp4, '-filter_complex', `[0:v]setpts=PTS*${F}[v];[0:a]atempo=${1 / F}[a]`,
      '-map', '[v]', '-map', '[a]', '-r', '25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp], { stdio: 'inherit' })
    fs.renameSync(tmp, mp4)
    const base = mp4.replace(/\.mp4$/, '')
    if (fs.existsSync(base + '.vtt')) fs.writeFileSync(base + '.vtt', fs.readFileSync(base + '.vtt', 'utf8').replace(/(\d\d:\d\d:\d\d\.\d\d\d)/g, t => hms(seg(t) * F)))
    if (fs.existsSync(base + '-capitulos.txt')) fs.writeFileSync(base + '-capitulos.txt', fs.readFileSync(base + '-capitulos.txt', 'utf8').replace(/^(\d\d:\d\d)/gm, t => ms(seg(t) * F)))
    const [, n, lang] = f.match(/-(\d+)-(pt|en)\.mp4$/)
    execFileSync('node', [path.join(DIR, 'youtube-meta.mjs'), est, n, lang], { stdio: 'inherit' })
    fs.renameSync(mp4 + '.v2', mp4 + '.v3')
    const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim()
    console.log(`AJUSTADO ${f} ${Math.round(d)}s`)
  }
}
console.log('ajuste terminado')
