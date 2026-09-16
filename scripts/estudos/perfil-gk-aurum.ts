/**
 * PERFIL DE BREAK-EVEN + TRAILING — GoldKiller e Aurum Flow, medido em velas reais.
 *
 *   npx tsx scripts/estudos/perfil-gk-aurum.ts            # tudo
 *   npx tsx scripts/estudos/perfil-gk-aurum.ts --so gk    # só GoldKiller
 *   npx tsx scripts/estudos/perfil-gk-aurum.ts --so aurum
 *   npx tsx scripts/estudos/perfil-gk-aurum.ts --refrescar-velas
 *
 * SÓ LEITURA. Não escreve uma linha em `mtmauto_providers` nem em nenhuma outra tabela — a decisão
 * do perfil é do dono. O que este script faz é pôr números em cima da mesa.
 *
 * DE ONDE VÊM OS DADOS
 *  · sinais: `tradingview_signals` (signal_kind='entry'), com entrada/SL/TP1..TP4 do `raw_payload`.
 *    A coluna `price` está vazia em 96% das linhas; o preço anunciado vive no jsonb.
 *  · velas: TradingView pelo mesmo cliente que o MCP usa (~/tradingview-mcp/src/tvfeed.js), M15,
 *    com paginação (`request_more_data`) — dá ~01/07/2026 até hoje, o que cobre TODO o histórico
 *    das duas estratégias. Em M5 o feed só chega a ~1 mês, por isso M15 é a escolha.
 *    As velas ficam em cache em scripts/.cache-velas/ para a corrida ser repetível.
 *
 * CONVENÇÕES DA REPLICAÇÃO — as mesmas de lib/mtmfunded/reconstituicao.ts:
 *  1. Dentro de uma vela o extremo ADVERSO vem primeiro (compra: mínimo → máximo → fecho). Se a
 *     mesma vela toca stop e alvo, GANHA O STOP.
 *  2. A vela do sinal não é avaliada: mede-se a partir da PRIMEIRA vela que ABRE depois do alerta.
 *     Sem isto estaríamos a ler preço que, no instante do sinal, ainda não existia.
 *  3. Ordem dentro de cada tick, igual ao motor: SL → gestão (parciais → break-even → trailing) → TP.
 *  4. O trailing e o break-even só APERTAM, e o trailing anda aos saltos de max(1 pip, distância/10),
 *     como `passoTrailing` em lib/mtmfunded/simulado/avancadas.ts.
 *  5. Spread simulado à volta do preço médio da vela (`precoComSpread`): entra-se no lado caro e
 *     sai-se no lado barato. XAUUSD 0,32 $ e US30 3,60 pontos são os valores de `funded_symbols`;
 *     nos perpétuos usa-se 0,05% do preço (taxa taker da Bybit nos dois lados), que não existe na
 *     tabela.
 *  6. Unidades: `pipSizeForSymbol` de lib/mtmcopy/trade-outcome — ouro 0,1, cripto e índices em
 *     PONTOS. O Aurum é lido em R (fracções do risco inicial), nunca em pips absolutos: 40
 *     perpétuos com preços de 0,07 $ a 120 000 $ não partilham escala nenhuma.
 *
 * O MODELO DA POSIÇÃO é o do motor: 50% no TP1, 25% no TP2 e o resto corre até ao último TP com
 * break-even e trailing. Conta grande o suficiente para fazer as partes (numa conta de 0,01 lote
 * não há parciais e o motor cai no BE por distância — isso está fora deste estudo).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { createRequire } from 'module'
import { pipSizeForSymbol } from '../../lib/mtmcopy/trade-outcome'
import {
  percentil, piorSequencia, replicar as replicarBase,
  type Direcao, type Perfil, type Resultado, type Sinal, type Vela,
} from '../../lib/estudos/replay-velas'

const requireCjs = createRequire(__filename)

for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const CACHE = resolve(__dirname, '../.cache-velas')
/** M15 é o que cobre todo o histórico; M5 (--tf 5m) só chega a ~1 mês e serve de controlo do viés. */
const TF = process.argv.includes('--tf') ? process.argv[process.argv.indexOf('--tf') + 1] : '15m'
const SAIDA = resolve(__dirname, `../../docs/analise-perfil-gk-aurum${TF === '15m' ? '' : `-${TF}`}.md`)
/** 3 dias. O GoldKiller é de 5/15m e o Aurum de 15/60m: o que não resolve em 3 dias já não é o trade. */
const JANELA_BARRAS = TF === '5m' ? 864 : 288

// ─────────────────────────────────────────────────────────────────────────────
// Sinais
// ─────────────────────────────────────────────────────────────────────────────

async function lerSinais(alertName: string): Promise<Record<string, unknown>[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local')
  const out: Record<string, unknown>[] = []
  for (let pagina = 0; ; pagina++) {
    const q = new URLSearchParams({
      select: 'id,received_at,ticker,action,raw_payload',
      alert_name: `eq.${alertName}`,
      signal_kind: 'eq.entry',
      order: 'received_at.asc',
      offset: String(pagina * 1000),
      limit: '1000',
    })
    const r = await fetch(`${url}/rest/v1/tradingview_signals?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
    const lote = (await r.json()) as Record<string, unknown>[]
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

/** ticker do sinal → candidatos EXCHANGE:SYMBOL do TradingView, por ordem de preferência. */
function candidatosTv(ticker: string): string[] {
  const t = ticker.toUpperCase()
  if (t === 'XAUUSD') return ['OANDA:XAUUSD']
  if (t === 'US30') return ['CAPITALCOM:US30', 'OANDA:US30USD', 'TVC:DJI']
  if (t === 'NAS100') return ['CAPITALCOM:US100']
  if (/^(USDJPY|USDCAD|EURUSD|GBPUSD)$/.test(t)) return [`OANDA:${t}`]
  if (t.endsWith('.P')) return [`BYBIT:${t}`, `BINANCE:${t}`, `BYBIT:${t.slice(0, -2)}`]
  if (/USDT$/.test(t)) return [`BYBIT:${t}.P`, `BINANCE:${t}`]
  return [t]
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

interface Descartado { id: string; ticker: string; motivo: string }

function prepararSinais(linhas: Record<string, unknown>[], descartes: Descartado[]): Sinal[] {
  const out: Sinal[] = []
  for (const l of linhas) {
    const p = (l.raw_payload ?? {}) as Record<string, unknown>
    const ticker = String(l.ticker ?? p.ticker ?? '')
    const id = String(l.id)
    const dir = String(l.action ?? p.action ?? '').toLowerCase()
    const direcao: Direcao | null = dir === 'buy' ? 'buy' : dir === 'sell' ? 'sell' : null
    const entrada = num(p.entry)
    const sl = num(p.sl)
    if (!direcao) { descartes.push({ id, ticker, motivo: 'sem direcção' }); continue }
    if (!entrada || !sl) { descartes.push({ id, ticker, motivo: 'sem entrada ou sem stop' }); continue }
    const sinal = direcao === 'buy' ? 1 : -1
    if ((entrada - sl) * sinal <= 0) { descartes.push({ id, ticker, motivo: 'stop do lado errado' }); continue }
    const tps = [p.tp1, p.tp2, p.tp3, p.tp4]
      .map(num)
      .filter((x): x is number => x != null && (x - entrada) * sinal > 0)
    if (!tps.length) { descartes.push({ id, ticker, motivo: 'sem nenhum alvo do lado certo' }); continue }
    tps.sort((a, b) => (a - b) * sinal)
    out.push({ id, em: new Date(String(l.received_at)).getTime(), ticker, tv: candidatosTv(ticker)[0], direcao, entrada, sl, tps })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Velas
// ─────────────────────────────────────────────────────────────────────────────

const velasEmMemoria = new Map<string, Vela[] | null>()

async function velasDe(ticker: string, refrescar: boolean): Promise<{ velas: Vela[] | null; tv: string | null; erro?: string }> {
  if (velasEmMemoria.has(ticker)) {
    const v = velasEmMemoria.get(ticker) ?? null
    return { velas: v, tv: v ? (velasEmMemoria.get(`${ticker}::tv`) as unknown as string) ?? null : null }
  }
  mkdirSync(CACHE, { recursive: true })
  const ficheiro = join(CACHE, `${ticker.replace(/[^A-Z0-9]/gi, '_')}_${TF}.json`)
  if (!refrescar && existsSync(ficheiro)) {
    const g = JSON.parse(readFileSync(ficheiro, 'utf8')) as { tv: string; bars: Vela[] }
    velasEmMemoria.set(ticker, g.bars)
    velasEmMemoria.set(`${ticker}::tv`, g.tv as unknown as Vela[])
    return { velas: g.bars, tv: g.tv }
  }
  const { getHistory } = requireCjs('/Users/ricardogarcia/tradingview-mcp/src/tvfeed.js') as {
    getHistory: (o: { symbol: string; interval: string; nBars: number; timeoutMs?: number }) => Promise<{ bars: { time: number; open: number; high: number; low: number; close: number }[] }>
  }
  let ultimoErro = ''
  for (const tv of candidatosTv(ticker)) {
    try {
      const r = await getHistory({ symbol: tv, interval: TF, nBars: 20000, timeoutMs: 180000 })
      if (!r.bars?.length) { ultimoErro = `${tv}: zero velas`; continue }
      const bars: Vela[] = r.bars.map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }))
      writeFileSync(ficheiro, JSON.stringify({ tv, bars }))
      velasEmMemoria.set(ticker, bars)
      velasEmMemoria.set(`${ticker}::tv`, tv as unknown as Vela[])
      return { velas: bars, tv }
    } catch (e) {
      ultimoErro = `${tv}: ${(e as Error).message.slice(0, 80)}`
    }
  }
  velasEmMemoria.set(ticker, null)
  return { velas: null, tv: null, erro: ultimoErro }
}

// Replicação e estatística: lib/estudos/replay-velas.ts (partilhado com a sombra das estratégias).
const replicar = (s: Sinal, velas: Vela[], perfil: Perfil | null) => replicarBase(s, velas, perfil, { janelaBarras: JANELA_BARRAS })

const f = (x: number, c = 2) => (Number.isFinite(x) ? x.toFixed(c) : 'na')

interface Linha {
  perfil: string
  n: number
  vitorias: number
  rTotal: number
  rMedio: number
  /** meia-largura do intervalo de 95% do R médio (1,96 × erro padrão) */
  ic95: number
  pior: number
  salvou: number
  cortou: number
  rs: number[]
}

type Caso = { s: Sinal; velas: Vela[] }

/**
 * Mede um perfil sobre todos os casos. `porCaso` devolve o perfil a aplicar a cada sinal — é uma
 * função e não um valor porque os gatilhos em pips têm de ser convertidos em R sinal a sinal (o
 * risco do GoldKiller andou entre 84 e 169 pips consoante o mês).
 */
function medir(nome: string, casos: Caso[], baseline: Map<string, Resultado>, porCaso: (c: Caso) => Perfil | null): Linha {
  const rs: number[] = []
  let salvou = 0
  let cortou = 0
  for (const c of casos) {
    const r = replicar(c.s, c.velas, porCaso(c))
    if ('erro' in r) continue
    rs.push(r.R)
    const b = baseline.get(c.s.id)
    if (b) {
      if (b.R < 0 && r.R > b.R + 1e-9) salvou++
      if (r.R < b.R - 1e-9) cortou++
    }
  }
  const n = rs.length
  const total = rs.reduce((a, b) => a + b, 0)
  const media = n ? total / n : NaN
  const variancia = n > 1 ? rs.reduce((a, x) => a + (x - media) ** 2, 0) / (n - 1) : NaN
  return {
    perfil: nome,
    n,
    vitorias: n ? (100 * rs.filter((x) => x > 0).length) / n : NaN,
    rTotal: total,
    rMedio: media,
    ic95: n > 1 ? 1.96 * Math.sqrt(variancia / n) : NaN,
    pior: piorSequencia(rs),
    salvou,
    cortou,
    rs,
  }
}

const SEM_GESTAO = 'sem gestão (só parciais + SL + TP final)'

const avaliarPerfil = (perfil: Perfil | null, casos: Caso[], baseline: Map<string, Resultado>): Linha =>
  medir(perfil?.nome ?? SEM_GESTAO, casos, baseline, () => perfil)

/** Um perfil escrito em pips, traduzido para R sinal a sinal. */
const emPipsPorCaso = (bePips: number | null, arrPips: number | null, distPips: number) => (c: Caso): Perfil => {
  const pip = pipSizeForSymbol(c.s.ticker)
  const Rp = Math.abs(c.s.entrada - c.s.sl)
  return {
    nome: '',
    beR: bePips == null ? null : (bePips * pip) / Rp,
    beOffsetR: (2 * pip) / Rp,
    trailArranqueR: arrPips == null ? null : (arrPips * pip) / Rp,
    trailDistanciaR: (distPips * pip) / Rp,
  }
}

function tabela(linhas: Linha[]): string {
  const cab = '| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |'
  const sep = '|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  const corpo = linhas.map((l) =>
    `| ${l.perfil} | ${l.n} | ${f(l.vitorias, 1)}% | ${l.rTotal >= 0 ? '+' : ''}${f(l.rTotal, 1)} | ${l.rMedio >= 0 ? '+' : ''}${f(l.rMedio, 3)} | ±${f(l.ic95, 3)} | ${f(l.pior, 1)} | ${l.salvou} | ${l.cortou} |`)
  return [cab, sep, ...corpo].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Corrida
// ─────────────────────────────────────────────────────────────────────────────

interface Estudo {
  chave: 'gk' | 'aurum'
  titulo: string
  alertName: string
  /** unidades do sweep: pips (GoldKiller, um só símbolo) ou R (Aurum, 40 perpétuos) */
  emPips: boolean
}

const ESTUDOS: Estudo[] = [
  { chave: 'gk', titulo: 'GoldKiller (XAUUSD)', alertName: 'GoldKiller', emPips: true },
  { chave: 'aurum', titulo: 'Aurum Flow (perpétuos + índices)', alertName: 'MTM Perps Aurum Flow', emPips: false },
]

/** Perfis em R — os que o dono pediu para o Aurum, e que servem de leitura comum às duas. */
function perfisEmR(): { be: Perfil[]; trail: Perfil[]; combinados: Perfil[] } {
  const be: Perfil[] = [null, 0.3, 0.5, 0.75, 1].map((x) =>
    x === null
      ? { nome: 'sem break-even', beR: null, beOffsetR: 0, trailArranqueR: null, trailDistanciaR: 0.5 }
      : { nome: `BE ${f(x, 2)}R`, beR: x, beOffsetR: 0.05, trailArranqueR: null, trailDistanciaR: 0.5 })
  const trail: Perfil[] = []
  for (const a of [0.5, 0.75, 1, 1.5]) {
    for (const d of [0.25, 0.5, 0.75, 1]) {
      trail.push({ nome: `trailing arranca ${f(a, 2)}R · dist ${f(d, 2)}R`, beR: null, beOffsetR: 0, trailArranqueR: a, trailDistanciaR: d })
    }
  }
  const combinados: Perfil[] = []
  for (const b of [0.3, 0.5, 0.75, 1]) {
    for (const a of [0.75, 1, 1.5]) {
      for (const d of [0.5, 0.75]) {
        combinados.push({ nome: `BE ${f(b, 2)}R + trailing ${f(a, 2)}R/${f(d, 2)}R`, beR: b, beOffsetR: 0.05, trailArranqueR: a, trailDistanciaR: d })
      }
    }
  }
  return { be, trail, combinados }
}

async function main() {
  const so = process.argv.includes('--so') ? process.argv[process.argv.indexOf('--so') + 1] : null
  const refrescar = process.argv.includes('--refrescar-velas')
  const md: string[] = ['# Perfil de break-even e trailing — GoldKiller e Aurum Flow', '']
  md.push(`Corrido a ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · velas ${TF} do TradingView · janela de ${JANELA_BARRAS} barras (3 dias) por sinal.`, '')
  md.push('> Só leitura: nada foi escrito em `mtmauto_providers` nem em nenhuma outra tabela.', '')
  // A leitura dos números é escrita à mão e vive num ficheiro à parte, para uma nova corrida não a
  // apagar. As tabelas são geradas; a leitura é uma opinião, e deve dar para distinguir as duas.
  const leitura = resolve(__dirname, '../../docs/analise-perfil-gk-aurum-leitura.md')
  if (TF === '15m' && existsSync(leitura)) md.push(readFileSync(leitura, 'utf8').trim(), '')

  for (const est of ESTUDOS) {
    if (so && so !== est.chave) continue
    console.log(`\n══════ ${est.titulo}`)
    const linhas = await lerSinais(est.alertName)
    const descartes: Descartado[] = []
    const sinais = prepararSinais(linhas, descartes)
    console.log(`   ${linhas.length} entradas na base · ${sinais.length} com entrada/SL/alvos utilizáveis`)

    const tickers = [...new Set(sinais.map((s) => s.ticker))]
    const semVelas: string[] = []
    for (const t of tickers) {
      const r = await velasDe(t, refrescar)
      if (!r.velas) { semVelas.push(`${t} (${r.erro ?? 'sem velas'})`); console.log(`   ✗ ${t}: ${r.erro}`) }
      else console.log(`   ✓ ${t} → ${r.tv}: ${r.velas.length} velas desde ${new Date(r.velas[0].t * 1000).toISOString().slice(0, 10)}`)
    }

    const casos: { s: Sinal; velas: Vela[] }[] = []
    for (const s of sinais) {
      const r = await velasDe(s.ticker, false)
      if (!r.velas) { descartes.push({ id: s.id, ticker: s.ticker, motivo: 'símbolo sem velas no TradingView' }); continue }
      const teste = replicar(s, r.velas, null)
      if ('erro' in teste) { descartes.push({ id: s.id, ticker: s.ticker, motivo: teste.erro }); continue }
      casos.push({ s, velas: r.velas })
    }

    // baseline + caminho (MFE/MAE)
    const baseline = new Map<string, Resultado>()
    const mfes: number[] = []
    const maes: number[] = []
    const mfePips: number[] = []
    const rPips: number[] = []
    let bateuSl = 0
    let bateuTp1 = 0
    let ficouAberta = 0
    for (const c of casos) {
      const r = replicar(c.s, c.velas, null) as Resultado
      baseline.set(c.s.id, r)
      mfes.push(r.mfeR)
      maes.push(r.maeR)
      const pip = pipSizeForSymbol(c.s.ticker)
      const Rp = Math.abs(c.s.entrada - c.s.sl)
      rPips.push(Rp / pip)
      mfePips.push((r.mfeR * Rp) / pip)
      if (r.motivo === 'sl') bateuSl++
      if (r.motivo === 'tp') bateuTp1++
      if (r.motivo === 'aberta') ficouAberta++
    }

    // Resolução: uma vela de M15 é grossa. Um trailing com distância MENOR do que a amplitude
    // típica de uma vela não é mensurável nesta escala — o modelo deixa o trailing subir até ao
    // extremo da vela e só o pára na vela seguinte, o que sobrestima perfis muito apertados.
    const amplitudePips: number[] = []
    const amplitudeR: number[] = []
    for (const c of casos) {
      const pip = pipSizeForSymbol(c.s.ticker)
      const Rp = Math.abs(c.s.entrada - c.s.sl)
      const i0 = c.velas.findIndex((v) => v.t * 1000 >= c.s.em)
      const amostra = c.velas.slice(Math.max(0, i0), i0 + 32).map((v) => v.h - v.l)
      if (!amostra.length) continue
      const med = percentil(amostra, 0.5)
      amplitudePips.push(med / pip)
      amplitudeR.push(med / Rp)
    }

    const janelaMedida = casos.length
      ? `${new Date(Math.min(...casos.map((c) => c.s.em))).toISOString().slice(0, 10)} → ${new Date(Math.max(...casos.map((c) => c.s.em))).toISOString().slice(0, 10)}`
      : '—'

    md.push(`## ${est.titulo}`, '')
    md.push(`**Janela medida:** ${janelaMedida} · **sinais medidos:** ${casos.length} de ${linhas.length} entradas na base.`, '')
    const porMotivo = new Map<string, number>()
    for (const d of descartes) porMotivo.set(d.motivo, (porMotivo.get(d.motivo) ?? 0) + 1)
    md.push('**Ficaram de fora:**', '')
    for (const [m, n] of [...porMotivo].sort((a, b) => b[1] - a[1])) md.push(`- ${n} — ${m}`)
    if (semVelas.length) md.push(`- símbolos sem velas: ${semVelas.join(', ')}`)
    md.push('')

    md.push('### 1. Distribuição do MFE (excursão máxima a favor antes do stop)', '')
    md.push('| medida | p25 | p50 | p75 | p90 |', '|---|---:|---:|---:|---:|')
    md.push(`| MFE em R | ${f(percentil(mfes, 0.25))} | ${f(percentil(mfes, 0.5))} | ${f(percentil(mfes, 0.75))} | ${f(percentil(mfes, 0.9))} |`)
    if (est.emPips) {
      md.push(`| MFE em pips | ${f(percentil(mfePips, 0.25), 1)} | ${f(percentil(mfePips, 0.5), 1)} | ${f(percentil(mfePips, 0.75), 1)} | ${f(percentil(mfePips, 0.9), 1)} |`)
      md.push(`| risco inicial R em pips | ${f(percentil(rPips, 0.25), 1)} | ${f(percentil(rPips, 0.5), 1)} | ${f(percentil(rPips, 0.75), 1)} | ${f(percentil(rPips, 0.9), 1)} |`)
    }
    md.push(`| MAE em R | ${f(percentil(maes, 0.25))} | ${f(percentil(maes, 0.5))} | ${f(percentil(maes, 0.75))} | ${f(percentil(maes, 0.9))} |`)
    md.push('')
    md.push(`Sem gestão nenhuma: ${bateuSl} bateram no stop, ${bateuTp1} fecharam nos alvos, ${ficouAberta} ainda estavam abertas ao fim de 3 dias.`, '')
    const acimaDe = (r: number) => `${((100 * mfes.filter((x) => x >= r).length) / (mfes.length || 1)).toFixed(0)}%`
    md.push(`Fracção de sinais que chegou a estar em lucro de ${[0.3, 0.5, 0.75, 1, 1.5, 2].map((r) => `**${r}R**: ${acimaDe(r)}`).join(' · ')}.`, '')
    const distR = (i: number) => casos
      .map((c) => (c.s.tps[i] == null ? null : Math.abs(c.s.tps[i] - c.s.entrada) / Math.abs(c.s.entrada - c.s.sl)))
      .filter((x): x is number => x != null)
    const distFinal = casos.map((c) => Math.abs(c.s.tps[c.s.tps.length - 1] - c.s.entrada) / Math.abs(c.s.entrada - c.s.sl))
    md.push('**A que distância ficam os alvos do próprio sinal** (em R, mediana): ' +
      `TP1 ${f(percentil(distR(0), 0.5))}R · TP2 ${f(percentil(distR(1), 0.5))}R · último alvo ${f(percentil(distFinal, 0.5))}R. ` +
      'É o último alvo que manda no pedaço que corre — quanto mais longe estiver, mais o desfecho do resto da posição é decidido pelo trailing e não pelo alvo.', '')
    md.push(`**Resolução:** a vela de ${TF} tem uma amplitude mediana de ${est.emPips ? `${f(percentil(amplitudePips, 0.5), 1)} pips = ` : ''}**${f(percentil(amplitudeR, 0.5))}R**. Qualquer gatilho ou distância abaixo disto está a ser medido com uma régua maior do que a coisa que se mede: os números saem optimistas e não se deve configurar por eles.`, '')

    const { be, trail, combinados } = perfisEmR()
    const base = avaliarPerfil(null, casos, baseline)

    md.push('### 2. Varredura — break-even sozinho', '')
    md.push(tabela([base, ...be.filter((p) => p.beR != null).map((p) => avaliarPerfil(p, casos, baseline))]), '')

    md.push('### 3. Varredura — trailing sozinho', '')
    md.push(tabela([base, ...trail.map((p) => avaliarPerfil(p, casos, baseline))]), '')

    md.push('### 4. Varredura — break-even + trailing', '')
    const comb = combinados.map((p) => avaliarPerfil(p, casos, baseline)).sort((a, b) => b.rTotal - a.rTotal)
    md.push(tabela([base, ...comb]), '')

    if (est.emPips) {
      // O GoldKiller é um símbolo só: o dono configura-o em pips, por isso a mesma varredura em pips.
      const medianaR = percentil(rPips, 0.5)
      md.push('### 5. O mesmo em pips (o GoldKiller é um símbolo só)', '')
      md.push(`O risco inicial mediano é de **${f(medianaR, 1)} pips**, por isso 1R ≈ ${f(medianaR, 0)} pips — mas esse número ANDOU: 84 pips em julho, 89 em agosto, 169 em setembro. Os gatilhos em pips abaixo estão convertidos em R sinal a sinal, com o risco daquele sinal.`, '')
      md.push(tabela([base, ...[10, 15, 20, 25, 30, 40, 50].map((pips) =>
        medir(`BE ${pips} pips (+2 de folga)`, casos, baseline, emPipsPorCaso(pips, null, 0)))]), '')

      md.push('### 6. Trailing em pips', '')
      const linhasTrail: Linha[] = [base]
      for (const arr of [20, 30, 40, 60]) {
        for (const dist of [10, 15, 20, 30]) {
          linhasTrail.push(medir(`trailing ${arr}/${dist} pips`, casos, baseline, emPipsPorCaso(null, arr, dist)))
        }
      }
      md.push(tabela(linhasTrail), '')

      md.push('### 7. Os dois juntos, em pips', '')
      const linhasComb: Linha[] = []
      for (const bePips of [15, 20, 25, 30, 40]) {
        for (const arr of [30, 40, 60]) {
          for (const dist of [15, 20]) {
            linhasComb.push(medir(`BE ${bePips} + trailing ${arr}/${dist}`, casos, baseline, emPipsPorCaso(bePips, arr, dist)))
          }
        }
      }
      linhasComb.sort((a, b) => b.rTotal - a.rTotal)
      md.push(tabela([base, ...linhasComb]), '')
    }

    // ── estabilidade: o mesmo perfil, mês a mês ──────────────────────────────
    // Um perfil que só ganha num mês não é um perfil, é uma coincidência. Esta tabela é a única
    // resposta honesta à pergunta «e isto aguenta-se?» com uma amostra de 2 meses.
    md.push(`### ${est.emPips ? 8 : 5}. Estabilidade mês a mês (R médio por mês)`, '')
    const meses = [...new Set(casos.map((c) => new Date(c.s.em).toISOString().slice(0, 7)))].sort()
    const paraTestar: { nome: string; porCaso: (c: Caso) => Perfil | null }[] = [
      { nome: SEM_GESTAO, porCaso: () => null },
      ...[0.3, 0.5, 0.75].map((b) => ({
        nome: `BE ${f(b, 2)}R`,
        porCaso: () => ({ nome: '', beR: b, beOffsetR: 0.05, trailArranqueR: null, trailDistanciaR: 0.5 }) as Perfil,
      })),
      ...[[0.75, 0.5], [1, 0.5]].map(([a, d]) => ({
        nome: `BE 0.50R + trailing ${f(a, 2)}R/${f(d, 2)}R`,
        porCaso: () => ({ nome: '', beR: 0.5, beOffsetR: 0.05, trailArranqueR: a, trailDistanciaR: d }) as Perfil,
      })),
    ]
    md.push(`| perfil | ${meses.map((m) => `${m} (n)`).join(' | ')} |`, `|---|${meses.map(() => '---:').join('|')}|`)
    for (const t of paraTestar) {
      const celulas = meses.map((m) => {
        const sub = casos.filter((c) => new Date(c.s.em).toISOString().slice(0, 7) === m)
        const l = medir(t.nome, sub, baseline, t.porCaso)
        return `${l.rMedio >= 0 ? '+' : ''}${f(l.rMedio, 3)} (${l.n})`
      })
      md.push(`| ${t.nome} | ${celulas.join(' | ')} |`)
    }
    md.push('')

    console.log(`   medidos ${casos.length} · descartados ${descartes.length}`)
  }

  mkdirSync(resolve(__dirname, '../../docs'), { recursive: true })
  writeFileSync(SAIDA, md.join('\n'))
  console.log(`\n→ ${SAIDA}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
