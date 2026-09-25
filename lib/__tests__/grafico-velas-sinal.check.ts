/**
 * Gráfico de velas dos alertas MTM (regressão de 24/09).
 *
 * O que partiu: a imagem do alerta vinha do chart-img e esse serviço tem quota DIÁRIA por plano
 * (BASIC 50/dia, PRO 500/dia). Com ~300 entradas/dia a quota esgota-se e o chart-img responde
 * 429 «Limit Exceeded» → todos os alertas caíam no cartão sintético /api/og/signal, sem velas.
 *
 * Estes testes fixam o degrau novo: mapeamentos de símbolo/timeframe, a recusa de uma referência
 * que não ancora (melhor nada do que o instrumento errado) e o SVG a sair com velas e com as
 * linhas Entry/SL/TP. A rede é simulada — o teste não depende do Yahoo nem da Binance.
 *
 * Correr: npx tsx lib/__tests__/grafico-velas-sinal.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VelaRef } from '@/lib/mercado/referencias'
import { limparCacheReferencias } from '@/lib/mercado/velas-referencia'
import { VELAS_MINIMAS, simboloBase, svgVelasSinal, tfParaRef, velasDoSinal } from '@/lib/sinais/grafico-velas'

let ok = 0, ko = 0
function t(nome: string, real: unknown, esperado: unknown) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado)
  if (bate) ok++; else { ko++; console.log(`  ✗ ${nome}\n      esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`) }
}
const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

// ─── velas simuladas ─────────────────────────────────────────────────────────
const SEG = 900
// Instante do sinal: há 6 h, alinhado a M15 (o Yahoo só serve 15m dos últimos ~59 dias, por isso
// uma data fixa tornava o teste caduco).
const T0 = Math.floor((Math.floor(Date.now() / 1000) - 6 * 3600) / SEG) * SEG

/** Série em torno de `base`, com a vela que contém T0 a fechar exatamente em `base`. */
function serie(base: number, n = 110, desvio = 0.001): VelaRef[] {
  const velas: VelaRef[] = []
  const inicio = T0 - (n - 36) * SEG
  for (let i = 0; i < n; i++) {
    const t = inicio + i * SEG
    const onda = Math.sin(i / 7) * base * desvio
    const c = t === T0 - (T0 % SEG) + (T0 % SEG) ? base : base + onda
    const o = base + Math.sin((i - 1) / 7) * base * desvio
    velas.push({ t, o, h: Math.max(o, c) * (1 + desvio / 3), l: Math.min(o, c) * (1 - desvio / 3), c, v: 100 })
  }
  // a vela que contém T0 fecha no preço-âncora (é isso que o fatorAncorado lê)
  const idx = velas.findLastIndex((v) => v.t <= T0)
  if (idx >= 0) velas[idx] = { ...velas[idx], c: base, h: Math.max(velas[idx].h, base), l: Math.min(velas[idx].l, base) }
  return velas
}

type Resposta = VelaRef[] | 'vazio'
let plano: Record<string, Resposta> = {}

const fetchOriginal = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const chave = Object.keys(plano).find((k) => url.includes(k))

  const r = chave ? plano[chave] : 'vazio'
  if (r === 'vazio' || !chave) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  const corpo = url.includes('finance.yahoo.com')
    ? {
        chart: {
          result: [{
            timestamp: r.map((v) => v.t),
            indicators: { quote: [{ open: r.map((v) => v.o), high: r.map((v) => v.h), low: r.map((v) => v.l), close: r.map((v) => v.c), volume: r.map((v) => v.v) }] },
          }],
        },
      }
    : r.map((v) => [v.t * 1000, String(v.o), String(v.h), String(v.l), String(v.c), String(v.v)])
  return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

const sinalBase = {
  ticker: 'EURJPY',
  timeframe: '15',
  direcao: 'buy' as const,
  entry: 180.69,
  sl: 180.589,
  tps: [180.89, 181.091, 181.292],
  emSeg: T0,
  alertName: 'MTMScanner',
}

async function main() {
  // ─── mapeamentos ───────────────────────────────────────────────────────────
  t('timeframe 15 → M15', tfParaRef('15'), 'M15')
  t('timeframe 60 → H1', tfParaRef('60'), 'H1')
  t('timeframe 240 → H4', tfParaRef('240'), 'H4')
  t('timeframe 1D → D1', tfParaRef('1D'), 'D1')
  t('timeframe vazio → H1', tfParaRef(''), 'H1')
  t('perpétuo perde o .P', simboloBase('ETHUSDT.P'), 'ETHUSDT')
  t('prefixo da bolsa sai', simboloBase('OANDA:XAUUSD'), 'XAUUSD')
  t('NATURALGAS vai ao gás natural', simboloBase('NATURALGAS'), 'GAS')

  // ─── forex: referência ao nosso nível, desenha mesmo sem âncora perfeita ───
  limparCacheReferencias(); plano = { 'EURJPY%3DX': serie(180.69) }
  const fx = await velasDoSinal(sinalBase)
  t('forex traz velas', fx.length >= VELAS_MINIMAS, true)
  t('forex fica no nível do sinal', Math.abs(fx[fx.length - 1].c - 180.69) < 1, true)

  // ─── ouro: a referência (GC=F) está noutro nível → tem de ser reescalada ────
  limparCacheReferencias(); plano = { 'PAXGUSDT': 'vazio', 'GC%3DF': serie(4274.31 * 1.004) }
  const xau = await velasDoSinal({ ...sinalBase, ticker: 'XAUUSD', direcao: 'sell', entry: 4274.31, sl: 4285.134, tps: [4252.66, 4231.011, 4209.362] })
  t('ouro traz velas', xau.length >= VELAS_MINIMAS, true)
  const perto = Math.abs(xau.findLast((v) => v.t <= T0)!.c - 4274.31) < 0.5
  t('ouro ancorado à entrada do sinal', perto, true)

  // ─── referência fora do nosso nível e sem âncora válida → recusada ──────────
  limparCacheReferencias(); plano = { 'PAXGUSDT': 'vazio', 'GC%3DF': serie(4274.31 * 1.6) }
  const disparatado = await velasDoSinal({ ...sinalBase, ticker: 'XAUUSD', entry: 4274.31, sl: 4285.134, tps: [] })
  t('nível disparatado é recusado (melhor nada)', disparatado.length, 0)

  // ─── sem referência no catálogo → sem velas, sem rebentar ──────────────────
  limparCacheReferencias(); plano = {}
  t('símbolo desconhecido não rebenta', (await velasDoSinal({ ...sinalBase, ticker: 'ZZZQQQ' })).length, 0)

  // ─── SVG ───────────────────────────────────────────────────────────────────
  const svg = svgVelasSinal(sinalBase, fx)
  t('sai um SVG', svg.startsWith('<svg') && svg.endsWith('</svg>'), true)
  t('desenha velas a sério', (svg.match(/<rect /g) || []).length > 50, true)
  t('tem a linha da entrada', svg.includes('ENTRADA 180.690'), true)
  t('tem a linha do stop', svg.includes('SL 180.589'), true)
  t('tem os três alvos', ['TP1', 'TP2', 'TP3'].every((k) => svg.includes(k)), true)
  t('tem o símbolo e a direção', svg.includes('EURJPY') && svg.includes('COMPRA'), true)
  t('venda escreve VENDA', svgVelasSinal({ ...sinalBase, direcao: 'sell' }, fx).includes('VENDA'), true)
  t('marca MTM no cabeçalho', svg.includes('MORE THAN MONEY'), true)
  t('nome da estratégia escapado, sem HTML solto', svgVelasSinal({ ...sinalBase, alertName: 'A & <b>B</b>' }, fx).includes('A &amp; &lt;b&gt;B&lt;/b&gt;'), true)

  // ─── a rota tem mesmo os três degraus ──────────────────────────────────────
  const rota = ler('app/api/signals/chart-image/route.tsx')
  t('rota pede velas nossas quando o chart-img falha', /velasDoSinal\(/.test(rota), true)
  t('rota devolve SVG antes de cair no cartão sintético', rota.indexOf('image/svg+xml') < rota.indexOf('NextResponse.redirect(ogUrl'), true)
  const libImg = ler('lib/chart-image.ts')
  t('429 põe o chart-img de quarentena', /res\.status === 429/.test(libImg), true)

  globalThis.fetch = fetchOriginal
  console.log(`\n${ok} passaram, ${ko} falharam`)
  process.exit(ko ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
