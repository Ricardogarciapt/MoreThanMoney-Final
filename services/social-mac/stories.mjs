// OS STORIES SEMANAIS COM STORYTELLING, feitos no Mac (pedido do Ricardo a 28/10: «automatiza»).
//
// 1. pede o guião da semana a /api/stories-auto (o site escreve-o com a IA e valida-o);
// 2. descarrega o flyer real da semana passada (/api/flyer/weekly) para a cena da prova;
// 3. narra com a voz do Ricardo (Fish, video/stories-mtm/voz.mjs) e desenha (render.mjs);
// 4. corta em 3 stories, envia-os ao Supabase por endereço assinado e pede o agendamento
//    (19:00 de Lisboa). Se a semana já estiver agendada, não faz nada.
//
// Uso: node stories.mjs   (o launchd corre-o às segundas; pode correr-se à mão)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = process.env.MTM_API_BASE || 'https://www.morethanmoney.pt'
const AUTH = { Authorization: `Bearer ${process.env.CRON_SECRET}` }
const log = (...a) => console.log(new Date().toISOString(), '[stories]', ...a)
const corre = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })

const r = await (await fetch(`${BASE}/api/stories-auto`, { headers: AUTH })).json()
if (!r.ok) { log('sem guião:', r.erro); process.exit(1) }
if (r.estado === 'agendado') { log(`semana ${r.semana} já agendada`); process.exit(0) }
const { guiao, semana } = r
log(`semana ${semana}: ${guiao.angulo}`)

// Trabalha numa cópia do motor, para não sujar o repositório com o guião da semana.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtm-stories-'))
const MOTOR = path.join(tmp, 'motor')
fs.cpSync(path.join(REPO, 'video/stories-mtm'), MOTOR, { recursive: true })
const G = JSON.parse(fs.readFileSync(path.join(MOTOR, 'guiao.json'), 'utf8'))
const T = JSON.parse(fs.readFileSync(path.join(MOTOR, 'textos.json'), 'utf8'))
// Só a peça da semana: assim o voz.mjs não percorre as outras.
G.pecas = { historia: Object.entries(guiao.falas).map(([id, pt]) => ({ id, pt })) }
T.historia = { pt: { ...guiao.textos } }
fs.rmSync(path.join(MOTOR, 'voz', 'historia'), { recursive: true, force: true })

// A prova real: o flyer auditado da semana anterior (pips, com origem). Sem flyer, sem prova.
try {
  const seg = new Date(Date.now() - 7 * 86400000)
  seg.setUTCDate(seg.getUTCDate() - ((seg.getUTCDay() + 6) % 7))
  const f = await fetch(`${BASE}/api/flyer/weekly?w=${seg.toISOString().slice(0, 10)}&lang=pt`)
  if (!f.ok) throw new Error(String(f.status))
  const png = path.join(tmp, 'prova.png')
  fs.writeFileSync(png, Buffer.from(await f.arrayBuffer()))
  corre('ffmpeg', ['-y', '-v', 'error', '-i', png, '-q:v', '3', path.join(MOTOR, 'assets', 'prova.jpg')])
} catch (e) {
  log('sem flyer da semana, a cena fica com o scanner:', e.message)
  delete T.historia.pt.prova
}
fs.writeFileSync(path.join(MOTOR, 'guiao.json'), JSON.stringify(G, null, 2))
fs.writeFileSync(path.join(MOTOR, 'textos.json'), JSON.stringify(T, null, 1))

corre('node', [path.join(MOTOR, 'voz.mjs'), 'pt'], MOTOR)
const SAIDA = path.join(tmp, 'saida')
corre('node', [path.join(MOTOR, 'render.mjs'), 'historia', 'pt', `--saida=${SAIDA}`], MOTOR)

// Cortes nas fronteiras das cenas, com a mesma conta do render.mjs.
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
const ids = Object.keys(guiao.falas)
const D = {}
let s = 0
ids.forEach((id, i) => {
  const len = Math.max(2.4, 0.3 + dur(path.join(MOTOR, 'voz/historia/pt', `${id}.mp3`)) + 0.45) + (i === ids.length - 1 ? 2.6 : 0)
  D[id] = [s, s + len]
  s += len
})
const cortes = [[0, D.h03[1]], [D.h04[0], D.h05[1]], [D.h06[0], s]]
const videos = []
for (const [i, [a, b]] of cortes.entries()) {
  const mp4 = path.join(SAIDA, `story-${i + 1}.mp4`)
  corre('ffmpeg', ['-y', '-v', 'error', '-ss', a.toFixed(2), '-i', path.join(SAIDA, 'historia-pt.mp4'), '-t', (b - a).toFixed(2),
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k',
    '-af', `afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, b - a - 0.3).toFixed(2)}:d=0.3`, '-movflags', '+faststart', mp4])
  const up = await (await fetch(`${BASE}/api/stories-auto`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'upload-url' }) })).json()
  if (!up.ok) throw new Error(`upload-url: ${up.erro}`)
  const put = await fetch(up.signedUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(mp4) })
  if (!put.ok) throw new Error(`envio ${put.status}: ${await put.text()}`)
  videos.push(up.publicUrl)
}
const ag = await (await fetch(`${BASE}/api/stories-auto`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'agendar', semana, videos }) })).json()
if (!ag.ok) throw new Error(`agendar: ${ag.erro}`)
log('agendados', ag.horas ?? '(já estavam)', videos)
fs.rmSync(tmp, { recursive: true, force: true })
