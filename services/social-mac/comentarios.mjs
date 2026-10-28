// OS COMENTÁRIOS DO RADAR, publicados pelo Mac (pedido do Ricardo a 28/10: «automatiza»).
//
// Lê os prontos em /api/operador/fila-comentarios (o Prospector já os escreveu e passou nas
// regras), abre cada post num Chromium com a sessão do @morethanmoney.pt, escreve o texto tal e
// qual e carrega em «Publicar». Regista cada um na mesma API. Nada de likes, follows nem DMs.
//
// Cautelas, porque um bloqueio do Instagram custa mais do que um dia sem comentários:
//   · no máximo MAX_DIA por dia (dia de Lisboa), com 2 a 5 minutos entre cada;
//   · pára ao primeiro sinal de bloqueio ou de sessão caída e deixa os restantes para amanhã;
//   · um post sem caixa de comentários (fechados, apagado) fica «saltado».
//
// Uso:  node comentarios.mjs            (o launchd corre-o todos os dias)
//       node comentarios.mjs --entrar   (uma vez: abre o Instagram para iniciares sessão)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const API = `${process.env.MTM_API_BASE || 'https://www.morethanmoney.pt'}/api/operador/fila-comentarios`
const AUTH = { Authorization: `Bearer ${process.env.CRON_SECRET}` }
const PERFIL = path.join(os.homedir(), '.mtm-social', 'perfil-instagram')
const MAX_DIA = Number(process.env.COMENTARIOS_MAX_DIA || 8)
const ESTADO = path.join(os.homedir(), '.mtm-social', 'comentarios-hoje.json')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
const log = (...a) => console.log(new Date().toISOString(), '[comentarios]', ...a)

const ctx = await chromium.launchPersistentContext(PERFIL, { headless: false, viewport: { width: 1200, height: 900 }, locale: 'pt-PT' })
const page = ctx.pages()[0] || (await ctx.newPage())

if (process.argv.includes('--entrar')) {
  await page.goto('https://www.instagram.com/accounts/login/')
  console.log('Inicia sessão como @morethanmoney.pt nesta janela. Fecha-a quando vires o feed.')
  await new Promise((r) => ctx.on('close', r))
  process.exit(0)
}

let feitos = 0
try { const e = JSON.parse(fs.readFileSync(ESTADO, 'utf8')); if (e.dia === dia) feitos = e.feitos } catch {}
const guardar = () => fs.writeFileSync(ESTADO, JSON.stringify({ dia, feitos }))

async function registar(id, acao, nota) {
  const r = await fetch(API, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao, nota }) })
  if (!r.ok) log('registo falhou', id, r.status, await r.text())
}

const BLOQUEIO = /(tenta novamente mais tarde|try again later|ação bloqueada|action blocked|restringimos|we restrict)/i

try {
  const fila = await (await fetch(API, { headers: AUTH })).json()
  feitos = Math.max(feitos, fila.contadores?.publicadosHoje ?? 0)
  // Comentar um post com mais de 3 dias já não apanha conversa: esses ficam para o dono decidir.
  const limite = Date.now() - 3 * 86400000
  const prontos = (fila.itens || []).filter((i) => i.estado === 'pronto' && i.permalink && Date.parse(i.criado_em) >= limite)
  log(`fila: ${prontos.length} prontos, já hoje ${feitos}/${MAX_DIA}`)
  for (const item of prontos) {
    if (feitos >= MAX_DIA) break
    await page.goto(item.permalink, { waitUntil: 'domcontentloaded' })
    await espera(4000 + Math.random() * 3000)
    if (/accounts\/login/.test(page.url())) { log('sessão caída: corre `node comentarios.mjs --entrar`'); break }
    const caixa = page.locator('textarea[aria-label*="coment" i], textarea[aria-label*="comment" i]').first()
    if (!(await caixa.count())) { await registar(item.id, 'saltado', 'sem caixa de comentários'); continue }
    await caixa.click()
    await espera(800)
    await page.keyboard.type(item.comentario, { delay: 40 + Math.random() * 50 })
    await espera(1200)
    await page.getByRole('button', { name: /^(Publicar|Post)$/ }).first().click()
    await espera(5000)
    const corpo = await page.locator('body').innerText()
    if (BLOQUEIO.test(corpo)) { log('o Instagram mostrou um aviso de limite: paro por hoje'); break }
    const inicio = item.comentario.slice(0, 40)
    if (!corpo.includes(inicio)) { log('não confirmei o comentário na página, fica por publicar:', item.id); continue }
    await registar(item.id, 'publicado', 'Mac (automático)')
    feitos++; guardar()
    log('publicado', item.id, item.permalink)
    await espera((120 + Math.random() * 180) * 1000)
  }
} finally {
  await ctx.close()
}
