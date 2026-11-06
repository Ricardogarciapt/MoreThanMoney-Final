#!/usr/bin/env node
/**
 * MTM Conteúdo — a app local do Conteúdo Magnético (Mac).
 *
 * Um painel em http://127.0.0.1:4747 que junta, num sítio só, o que o render precisa:
 *   · o motor de vídeo (services/conteudo-magnetico-render/motor.mjs) a correr como processo filho,
 *     um render de cada vez, com nice e 2 threads (o Mac tem 16 GB e o swap cheio)
 *   · a fila do site (ver, tirar da fila), os vídeos prontos
 *   · render local de um guião JSON, sem fila, para ~/Movies/MTM Conteudo
 *   · verificação e instalação das dependências (ffmpeg, edge-tts, gTTS)
 *   · ligação ao Claude Code: o MCP do site (MCP_TOKEN) e o ArtCraft MCP, se estiver compilado
 *
 * Sem dependências npm. Só ouve em 127.0.0.1, e cada pedido à API leva um token que só o painel
 * servido por esta app conhece — uma página aberta noutro separador não consegue mandar ordens.
 *
 * Segredos (CRON_SECRET, MCP_TOKEN, PEXELS_API_KEY) ficam em
 * ~/Library/Application Support/MTM Conteudo/config.json com permissões 600 e nunca voltam ao
 * browser: o painel só vê se estão definidos.
 */
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync, createReadStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const PORTA = Number(process.env.MTM_CONTEUDO_PORTA || 4747)
const SUPORTE = path.join(os.homedir(), 'Library', 'Application Support', 'MTM Conteudo')
const CONFIG = path.join(SUPORTE, 'config.json')
const SAIDAS = path.join(os.homedir(), 'Movies', 'MTM Conteudo')
const MOTOR_JS = existsSync(path.join(AQUI, 'motor.mjs'))
  ? path.join(AQUI, 'motor.mjs')
  : path.join(AQUI, '..', 'conteudo-magnetico-render', 'motor.mjs')
const ARTCRAFT_BIN = path.join(os.homedir(), 'mtm-artcraft', 'artcraft-mcp')
const ARTCRAFT_CRED = path.join(os.homedir(), 'Artcraft', 'credentials')
const TOKEN = randomBytes(24).toString('hex')

mkdirSync(SUPORTE, { recursive: true })
mkdirSync(SAIDAS, { recursive: true })

// PATH do Finder é curto: sem isto, uma app aberta com duplo clique não encontra o brew nem o pip.
const PATH_EXTRA = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), 'Library', 'Python', '3.9', 'bin'), path.join(os.homedir(), 'Library', 'Python', '3.11', 'bin'), path.join(os.homedir(), 'Library', 'Python', '3.12', 'bin'), path.join(os.homedir(), '.cargo', 'bin')]
process.env.PATH = [...PATH_EXTRA, process.env.PATH || ''].join(':')

// ── configuração ────────────────────────────────────────────────────────────────────────────────
const OMISSAO = { site: 'https://www.morethanmoney.pt', voz: 'pt-PT-DuarteNeural', threads: 2, musica_dir: '', intervalo: 30, arrancar_motor: false }
function lerConfig() {
  try {
    return { ...OMISSAO, ...JSON.parse(readFileSync(CONFIG, 'utf8')) }
  } catch {
    return { ...OMISSAO }
  }
}
function gravarConfig(c) {
  writeFileSync(CONFIG, JSON.stringify(c, null, 2))
  chmodSync(CONFIG, 0o600)
}
const SEGREDOS = ['cron_secret', 'mcp_token', 'pexels']
function configPublica(c) {
  const o = { ...c }
  for (const k of SEGREDOS) o[k] = !!c[k]
  return o
}

// ── registo (o que o motor e as instalações escrevem) ──────────────────────────────────────────
const LINHAS = []
function registar(origem, texto) {
  for (const l of String(texto).split('\n')) {
    if (!l.trim()) continue
    LINHAS.push(`${new Date().toLocaleTimeString('pt-PT')} [${origem}] ${l}`)
  }
  while (LINHAS.length > 400) LINHAS.shift()
}

// ── motor ───────────────────────────────────────────────────────────────────────────────────────
let motor = null
let motorDesde = null
function envMotor(c, extra = {}) {
  return {
    ...process.env,
    SITE_URL: c.site,
    CRON_SECRET: c.cron_secret || '',
    MOTOR_NOME: 'mac',
    FFMPEG_THREADS: String(c.threads || 2),
    TTS_VOZ: c.voz,
    INTERVALO_S: String(c.intervalo || 30),
    ...(c.pexels ? { PEXELS_API_KEY: c.pexels } : {}),
    ...(c.musica_dir ? { MUSICA_DIR: c.musica_dir } : {}),
    ...extra,
  }
}
function ligarMotor() {
  if (motor) return { ok: true, ja: true }
  const c = lerConfig()
  if (!c.cron_secret) return { ok: false, erro: 'Falta o CRON_SECRET nas definições.' }
  if (!existsSync(MOTOR_JS)) return { ok: false, erro: `Não encontro o motor em ${MOTOR_JS}` }
  motor = spawn('nice', ['-n', '10', process.execPath, MOTOR_JS], { env: envMotor(c), stdio: ['ignore', 'pipe', 'pipe'] })
  motorDesde = Date.now()
  motor.stdout.on('data', (d) => registar('motor', d))
  motor.stderr.on('data', (d) => registar('motor', d))
  motor.on('exit', (code) => {
    registar('app', `motor parou (código ${code})`)
    motor = null
    motorDesde = null
  })
  registar('app', 'motor ligado')
  return { ok: true }
}
function desligarMotor() {
  if (!motor) return { ok: true }
  motor.kill('SIGTERM')
  return { ok: true }
}

// ── dependências ────────────────────────────────────────────────────────────────────────────────
function tem(cmd, args = ['--version']) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 })
  if (r.error || r.status !== 0) return null
  return (r.stdout || r.stderr || '').split('\n')[0].trim().slice(0, 80) || 'ok'
}
function dependencias() {
  const credOk = ['artcraft_session.txt', 'artcraft_avt.txt'].every((f) => {
    try {
      return readFileSync(path.join(ARTCRAFT_CRED, f), 'utf8').trim().length > 0
    } catch {
      return false
    }
  })
  return {
    node: process.version,
    ffmpeg: tem('ffmpeg', ['-version']),
    ffprobe: tem('ffprobe', ['-version']),
    edge_tts: tem('edge-tts', ['--help']) ? 'ok' : null,
    gtts: tem('gtts-cli', ['--help']) ? 'ok' : null,
    brew: tem('brew'),
    pip: tem('pip3'),
    claude: tem('claude'),
    motor_js: existsSync(MOTOR_JS),
    artcraft_bin: existsSync(ARTCRAFT_BIN),
    artcraft_cred: credOk,
  }
}
function instalar(qual) {
  const planos = {
    ffmpeg: ['brew', ['install', 'ffmpeg']],
    voz: ['pip3', ['install', '--user', 'edge-tts', 'gTTS']],
  }
  const p = planos[qual]
  if (!p) return { ok: false, erro: 'desconhecido' }
  registar('instalar', `${p[0]} ${p[1].join(' ')}`)
  const filho = spawn(p[0], p[1], { stdio: ['ignore', 'pipe', 'pipe'] })
  filho.stdout.on('data', (d) => registar('instalar', d))
  filho.stderr.on('data', (d) => registar('instalar', d))
  filho.on('exit', (c) => registar('instalar', c === 0 ? `${qual}: instalado` : `${qual}: falhou (${c})`))
  return { ok: true }
}

// ── site ────────────────────────────────────────────────────────────────────────────────────────
async function site(metodo, corpo, query = '') {
  const c = lerConfig()
  if (!c.cron_secret) throw new Error('Falta o CRON_SECRET nas definições.')
  const r = await fetch(`${c.site}/api/conteudo-magnetico/motor${query}`, {
    method: metodo,
    headers: { authorization: `Bearer ${c.cron_secret}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
  return j
}

// ── render local ────────────────────────────────────────────────────────────────────────────────
let renderLocal = null
function renderizarLocal(guiao) {
  if (renderLocal) return { ok: false, erro: 'Já há um render local a correr.' }
  if (motor) return { ok: false, erro: 'Desliga o motor da fila primeiro: um render de cada vez.' }
  const nome = `reel-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  const json = path.join(SUPORTE, `${nome}.json`)
  const mp4 = path.join(SAIDAS, `${nome}.mp4`)
  writeFileSync(json, JSON.stringify(guiao))
  const c = lerConfig()
  renderLocal = spawn('nice', ['-n', '10', process.execPath, MOTOR_JS, '--local', json, mp4], { env: envMotor(c), stdio: ['ignore', 'pipe', 'pipe'] })
  renderLocal.stdout.on('data', (d) => registar('local', d))
  renderLocal.stderr.on('data', (d) => registar('local', d))
  renderLocal.on('exit', (code) => {
    registar('local', code === 0 ? `pronto: ${mp4}` : `falhou (${code})`)
    renderLocal = null
  })
  return { ok: true, saida: mp4 }
}
function ficheiros() {
  return readdirSync(SAIDAS)
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => ({ nome: f, bytes: statSync(path.join(SAIDAS, f)).size, quando: statSync(path.join(SAIDAS, f)).mtimeMs }))
    .sort((a, b) => b.quando - a.quando)
    .slice(0, 30)
}

// ── Claude Code ─────────────────────────────────────────────────────────────────────────────────
function ligarClaude() {
  const c = lerConfig()
  const feito = []
  const correr = (args) => {
    const r = spawnSync('claude', args, { encoding: 'utf8', timeout: 20_000 })
    return r.status === 0 ? 'ok' : (r.stderr || r.stdout || 'falhou').trim().slice(0, 200)
  }
  if (c.mcp_token) {
    correr(['mcp', 'remove', '-s', 'user', 'morethanmoney'])
    feito.push({ mcp: 'morethanmoney', resultado: correr(['mcp', 'add', '-s', 'user', '--transport', 'http', 'morethanmoney', `${c.site}/api/mcp`, '--header', `Authorization: Bearer ${c.mcp_token}`]) })
  } else feito.push({ mcp: 'morethanmoney', resultado: 'falta o MCP_TOKEN nas definições' })
  if (existsSync(ARTCRAFT_BIN)) {
    correr(['mcp', 'remove', '-s', 'user', 'artcraft'])
    feito.push({ mcp: 'artcraft', resultado: correr(['mcp', 'add', '-s', 'user', 'artcraft', '--', ARTCRAFT_BIN]) })
  } else feito.push({ mcp: 'artcraft', resultado: `binário não encontrado em ${ARTCRAFT_BIN}` })
  registar('claude', feito.map((f) => `${f.mcp}: ${f.resultado}`).join(' · '))
  return { ok: true, feito }
}

// ── servidor HTTP ───────────────────────────────────────────────────────────────────────────────
function corpo(req) {
  return new Promise((resolve) => {
    let b = ''
    req.on('data', (d) => {
      b += d
      if (b.length > 2_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(b ? JSON.parse(b) : {})
      } catch {
        resolve({})
      }
    })
  })
}
function json(res, codigo, dados) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(dados))
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORTA}`)
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const html = readFileSync(path.join(AQUI, 'painel.html'), 'utf8').replace('__MTM_TOKEN__', TOKEN)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(html)
    }
    if (req.method === 'GET' && url.pathname === '/logo.png') {
      const logo = path.join(AQUI, 'logo.png')
      if (!existsSync(logo)) return json(res, 404, {})
      res.writeHead(200, { 'content-type': 'image/png' })
      return createReadStream(logo).pipe(res)
    }
    if (req.method === 'GET' && url.pathname === '/video') {
      if (url.searchParams.get('t') !== TOKEN) return json(res, 401, { erro: 'token' })
      const nome = path.basename(url.searchParams.get('n') || '')
      const f = path.join(SAIDAS, nome)
      if (!nome.endsWith('.mp4') || !existsSync(f)) return json(res, 404, {})
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': statSync(f).size })
      return createReadStream(f).pipe(res)
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { erro: 'não existe' })
    if (req.headers['x-mtm-token'] !== TOKEN) return json(res, 401, { erro: 'token' })

    const b = req.method === 'POST' ? await corpo(req) : {}
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /api/estado':
        return json(res, 200, {
          config: configPublica(lerConfig()),
          deps: dependencias(),
          motor: motor ? { ligado: true, desde: motorDesde } : { ligado: false },
          render_local: !!renderLocal,
          saidas: SAIDAS,
        })
      case 'GET /api/log':
        return json(res, 200, { linhas: LINHAS.slice(-200) })
      case 'POST /api/config': {
        const c = lerConfig()
        for (const k of ['site', 'voz', 'musica_dir']) if (typeof b[k] === 'string') c[k] = b[k].trim()
        for (const k of SEGREDOS) if (typeof b[k] === 'string' && b[k].trim()) c[k] = b[k].trim()
        for (const k of SEGREDOS) if (b[`limpar_${k}`]) delete c[k]
        if (b.threads) c.threads = Math.min(Math.max(Number(b.threads) || 2, 1), 6)
        if (typeof b.arrancar_motor === 'boolean') c.arrancar_motor = b.arrancar_motor
        gravarConfig(c)
        return json(res, 200, { ok: true, config: configPublica(c) })
      }
      case 'POST /api/motor':
        return json(res, 200, b.acao === 'desligar' ? desligarMotor() : ligarMotor())
      case 'POST /api/instalar':
        return json(res, 200, instalar(String(b.qual)))
      case 'GET /api/fila':
        return json(res, 200, await site('GET', null, '?lista=1'))
      case 'POST /api/fila/cancelar':
        return json(res, 200, await site('POST', { id: String(b.id || ''), estado: 'cancelar' }))
      case 'POST /api/local':
        return json(res, 200, renderizarLocal(b.guiao))
      case 'GET /api/ficheiros':
        return json(res, 200, { ficheiros: ficheiros() })
      case 'POST /api/abrir-pasta':
        spawn('open', [SAIDAS])
        return json(res, 200, { ok: true })
      case 'POST /api/claude':
        return json(res, 200, ligarClaude())
      default:
        return json(res, 404, { erro: 'não existe' })
    }
  } catch (e) {
    return json(res, 500, { erro: e instanceof Error ? e.message : 'erro' })
  }
})

servidor.listen(PORTA, '127.0.0.1', () => {
  registar('app', `MTM Conteúdo em http://127.0.0.1:${PORTA}`)
  console.log(`MTM Conteúdo em http://127.0.0.1:${PORTA}`)
  if (lerConfig().arrancar_motor) ligarMotor()
  if (process.argv.includes('--abrir')) spawn('open', [`http://127.0.0.1:${PORTA}`])
})
servidor.on('error', (e) => {
  // Já está a correr (duplo clique outra vez na app): só abre o painel.
  if (e.code === 'EADDRINUSE') {
    if (process.argv.includes('--abrir')) spawn('open', [`http://127.0.0.1:${PORTA}`])
    process.exit(0)
  }
  throw e
})
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, () => {
    motor?.kill('SIGTERM')
    renderLocal?.kill('SIGTERM')
    process.exit(0)
  })
}
