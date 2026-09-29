/**
 * MTM SCANNER — EXISTE BORDA EM ALGUM SUBCONJUNTO?
 *
 *   npx tsx scripts/estudos/mtmscanner-borda-29-09.ts
 *
 * ── SÓ LEITURA. Nenhum INSERT, nenhum UPDATE, nenhuma alteração de configuração. ───────────────
 *
 * ── PORQUÊ UMA TERCEIRA MEDIÇÃO, E PORQUÊ NÃO É MAIS DO MESMO ───────────────────────────────────
 * Já existem duas. `docs/sombra-mtm-scanner.md` mede a GESTÃO de hoje (−0,102R/trade). A varredura
 * de `fontes-1000-29-09.ts --scanner` mede 98 combinações de stop e alvo, todas negativas. As duas
 * respondem à mesma pergunta — «que stop e que alvo?» — e nenhuma responde à pergunta que está por
 * baixo: **o preço continua, ou não continua, depois do sinal?**
 *
 * Enquanto a régua for «stop X, alvo Y», qualquer número é uma mistura de (a) o sinal ter valor e
 * (b) a gestão ser boa. Aqui separa-se: mede-se o RETORNO FUTURO CRU a horizontes fixos, com o
 * sinal da direcção, normalizado pelo ATR(14) da altura. Sem stop, sem alvo, sem parciais, sem
 * trailing. Se a média desse retorno for zero ou negativa em TODOS os horizontes, então nenhuma
 * gestão salva a estratégia, e as 98 combinações negativas deixam de ser um mistério: não há nada
 * para gerir. Se for positiva nalgum horizonte, sabe-se exactamente onde procurar a gestão.
 *
 * É a régua certa também por outra razão: é ADIMENSIONAL. Em ATR, um retorno de +0,3 quer dizer a
 * mesma coisa num EURUSD e num GBPJPY — ao contrário de pips, que a casa já sabe que mentem
 * (`pipSizeForSymbol`, docs/analise-perfil-gk-aurum.md).
 *
 * ── PRESSUPOSTOS, TODOS DECLARADOS ──────────────────────────────────────────────────────────────
 *  1. Entrada = ABERTURA da vela SEGUINTE ao sinal. É o que uma ordem a mercado faz, e não exige
 *     que o preço toque o valor anunciado — a regra da casa depois do caso da fonte a +124%.
 *  2. Velas M15 da TradingView (OANDA para os pares). O Scanner é M15; o instante do sinal é
 *     mapeado à última vela FECHADA antes dele.
 *  3. ATR(14) em M15 calculado sobre as 14 velas ATÉ à vela do sinal (inclusive). É a mesma janela
 *     que o indicador teria visto.
 *  4. Custo: meio spread de entrada + meio de saída, com o spread da classe (1,2 pips nos majors,
 *     2,5 nos cruzados — a mesma régua de `docs/sombra-mtm-scanner.md`), convertido a ATR. É
 *     cobrado à parte, para se ver o bruto e o líquido lado a lado.
 *  5. Os sinais NÃO são independentes: o Scanner dispara em 15 pares ao mesmo tempo e várias vezes
 *     no mesmo par. O intervalo de confiança é calculado com erro-padrão AGRUPADO POR DIA (cada dia
 *     é um cluster), que é a correcção honesta. O IC ingénuo aparece ao lado, para se ver a
 *     diferença.
 *  6. Comparações múltiplas: procuram-se ~19 símbolos × 24 horas × alguns regimes. Com ~60
 *     comparações, três a p<0,05 aparecem por puro acaso. Por isso imprime-se, para cada corte, o
 *     número de comparações feitas e o limiar de Bonferroni correspondente. Nenhum subconjunto é
 *     recomendado se não passar esse limiar.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Vela } from '../../lib/estudos/replay-velas'
import { DEFAULT_SIGNAL_RULES, type SignalRules } from '../../lib/mtmcopy/signal-rules'
import { teriaExecutado, type Interruptores, type LinhaSinal } from '../../lib/mtmauto/sombra/scanner'

const RAIZ = join(__dirname, '..', '..')
try {
  process.loadEnvFile(join(RAIZ, '.env.local'))
} catch {
  /* usa o ambiente */
}

const requireCjs = createRequire(__filename)
const CACHE = resolve(__dirname, '../.cache-velas')
const TF = '15'
const SAIDA = resolve(RAIZ, 'docs/mtmscanner-borda.md')
const DESDE = '2026-07-01'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !CHAVE) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

/** Horizontes em velas de 15 m. 4 = 1 h · 16 = 4 h · 96 = 1 dia · 288 = 3 dias. */
const HORIZONTES = [1, 2, 4, 8, 16, 32, 96, 288] as const

// ── leitura ──────────────────────────────────────────────────────────────────────────────────────

async function lerSinais(): Promise<LinhaSinal[]> {
  const out: LinhaSinal[] = []
  for (let pagina = 0; ; pagina++) {
    const q = new URLSearchParams({
      select: 'id,received_at,ticker,action,raw_payload',
      alert_name: 'eq.MTMScanner',
      signal_kind: 'eq.entry',
      received_at: `gte.${DESDE}`,
      order: 'received_at.asc,id.asc',
      offset: String(pagina * 1000),
      limit: '1000',
    })
    const r = await fetch(`${URL}/rest/v1/tradingview_signals?${q}`, {
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
    })
    if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
    const lote = (await r.json()) as LinhaSinal[]
    out.push(...lote)
    process.stderr.write(`\r  sinais lidos: ${out.length}`)
    if (lote.length < 1000) {
      process.stderr.write('\n')
      return out
    }
  }
}

const mem = new Map<string, Vela[] | null>()

function candidatosTv(ticker: string): string[] {
  const t = ticker.toUpperCase()
  if (t === 'XAUUSD') return ['OANDA:XAUUSD']
  if (/^[A-Z]{6}$/.test(t)) return [`OANDA:${t}`, `FX:${t}`]
  return [`OANDA:${t}`]
}

async function velasDe(ticker: string): Promise<Vela[] | null> {
  const chave = ticker.toUpperCase()
  if (mem.has(chave)) return mem.get(chave) ?? null
  mkdirSync(CACHE, { recursive: true })
  // Reaproveita a cache de `fontes-1000-29-09.ts` — o mesmo dia, as mesmas velas.
  const ficheiro = join(CACHE, `${chave.replace(/[^A-Z0-9]/gi, '_')}_${TF}_2909.json`)
  if (existsSync(ficheiro)) {
    const g = JSON.parse(readFileSync(ficheiro, 'utf8')) as { tv: string; bars: Vela[] }
    mem.set(chave, g.bars)
    return g.bars
  }
  const { getHistory } = requireCjs('/Users/ricardogarcia/tradingview-mcp/src/tvfeed.js') as {
    getHistory: (o: { symbol: string; interval: string; nBars: number; timeoutMs?: number }) => Promise<{
      bars: { time: number; open: number; high: number; low: number; close: number }[]
    }>
  }
  for (const tv of candidatosTv(chave)) {
    try {
      const r = await getHistory({ symbol: tv, interval: TF, nBars: 20000, timeoutMs: 180000 })
      if (!r.bars?.length) continue
      const bars: Vela[] = r.bars.map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }))
      writeFileSync(ficheiro, JSON.stringify({ tv, bars }))
      mem.set(chave, bars)
      console.error(`  velas ${chave} ← ${tv} (${bars.length})`)
      return bars
    } catch {
      /* tenta o próximo candidato */
    }
  }
  console.error(`  SEM VELAS: ${chave}`)
  mem.set(chave, null)
  return null
}

// ── medida ───────────────────────────────────────────────────────────────────────────────────────

/** Índice da última vela que FECHOU antes (ou no instante) do sinal. */
function indiceDoSinal(velas: Vela[], em: number): number {
  let lo = 0
  let hi = velas.length - 1
  let r = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (velas[mid].t * 1000 <= em) {
      r = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return r
}

function atr14(velas: Vela[], i: number): number {
  if (i < 15) return NaN
  let tr = 0
  for (let k = i - 13; k <= i; k++) {
    const p = velas[k - 1]
    tr += Math.max(velas[k].h - velas[k].l, Math.abs(velas[k].h - p.c), Math.abs(velas[k].l - p.c))
  }
  return tr / 14
}

/** EMA200 do fecho em M15 — o regime local, sem sair do timeframe do Scanner. */
function ema(velas: Vela[], i: number, n: number): number {
  if (i < n * 2) return NaN
  const a = 2 / (n + 1)
  let e = 0
  for (let k = i - n * 2 + 1; k <= i - n + 1; k++) e += velas[k].c
  e /= n
  for (let k = i - n + 2; k <= i; k++) e = velas[k].c * a + e * (1 - a)
  return e
}

/** Meio spread em preço, a mesma régua de `docs/sombra-mtm-scanner.md`. */
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'])
function spreadPreco(sym: string): number {
  const s = sym.toUpperCase()
  const pip = /JPY$/.test(s) ? 0.01 : 0.0001
  return (MAJORS.has(s) ? 1.2 : 2.5) * pip
}

interface Caso {
  simbolo: string
  dir: 1 | -1
  dia: string
  horaUtc: number
  conf: number
  atrPct: number
  /** retorno futuro assinado, em ATR, por horizonte (bruto, sem custo) */
  ret: number[]
  /** máximo favorável / adverso em ATR dentro de 96 velas */
  mfe: number
  mae: number
  /** custo ida-e-volta em ATR */
  custoAtr: number
  /** regime: fecho do lado da direcção face à EMA200 M15 */
  regime: boolean
  passouGate: boolean
}

// ── estatística ──────────────────────────────────────────────────────────────────────────────────

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

/**
 * IC 95% com erro-padrão AGRUPADO POR DIA. Cada dia é um cluster: dentro de um dia os sinais do
 * Scanner são fortemente correlacionados (o mesmo movimento, 15 pares, dezenas de disparos).
 * Tratá-los como independentes estreita o intervalo por um factor de ~3 e faz aparecer borda onde
 * não há. Fórmula do estimador «cluster-robust» da média: var = Σ(Sc − nc·x̄)² / (N² ), com Sc a
 * soma do cluster c e nc o seu tamanho.
 */
function icAgrupado(xs: number[], clusters: string[]): { media: number; ic95: number; icIngenuo: number; nClusters: number } {
  const n = xs.length
  const m = media(xs)
  if (n < 2) return { media: m, ic95: NaN, icIngenuo: NaN, nClusters: 0 }
  const somas = new Map<string, { s: number; n: number }>()
  for (let i = 0; i < n; i++) {
    const c = somas.get(clusters[i]) ?? { s: 0, n: 0 }
    c.s += xs[i]
    c.n += 1
    somas.set(clusters[i], c)
  }
  let v = 0
  for (const c of somas.values()) v += (c.s - c.n * m) ** 2
  const G = somas.size
  // correcção de amostra finita habitual G/(G−1)
  const varMedia = G > 1 ? (v / (n * n)) * (G / (G - 1)) : NaN
  const vIng = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)
  return { media: m, ic95: 1.96 * Math.sqrt(varMedia), icIngenuo: 1.96 * Math.sqrt(vIng / n), nClusters: G }
}

const f = (x: number, c = 3) => (Number.isFinite(x) ? x.toFixed(c) : '—')
const sig = (x: number, c = 3) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(c) : '—')

// ── principal ────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const linhas: string[] = []
  const P = (x = '') => linhas.push(x)

  console.error('a ler sinais…')
  const brutos = await lerSinais()
  console.error(`  ${brutos.length} sinais de entrada do MTMScanner desde ${DESDE}`)

  // Gate de execução: as mesmas regras do webhook, com a exclusão do Scanner levantada. Lêem-se da
  // BASE (site_settings), não do default do repositório: o default tem `exec_sell_min_confirmations
  // = 3` e o que está vivo é 2 — com o default, ZERO vendas passavam e o estudo ficava só com
  // compras sem o dizer. Se a leitura falhar, cai no default e fica escrito no relatório.
  let regras: SignalRules = DEFAULT_SIGNAL_RULES
  let origemRegras = 'default do repositório (site_settings inacessível)'
  try {
    const r = await fetch(`${URL}/rest/v1/site_settings?select=value&key=eq.mtmcopy_signal_rules`, {
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
    })
    const j = (await r.json()) as { value?: Partial<SignalRules> }[]
    if (j?.[0]?.value) {
      regras = { ...DEFAULT_SIGNAL_RULES, ...j[0].value }
      origemRegras = 'site_settings (as que estão vivas)'
    }
  } catch {
    /* fica o default */
  }
  console.error(`  regras do gate: ${origemRegras} · venda exige ${regras.exec_sell_min_confirmations} confirmações`)
  const sw: Interruptores = { forex: true, sensei: true, sensei_entries: true }

  const simbolos = [...new Set(brutos.map((l) => String(l.ticker ?? '').toUpperCase()).filter(Boolean))]
  console.error(`  ${simbolos.length} símbolos: ${simbolos.join(' ')}`)
  for (const s of simbolos) await velasDe(s)

  const casos: Caso[] = []
  const semVelas = new Map<string, number>()
  let semIndice = 0
  for (const l of brutos) {
    const sym = String(l.ticker ?? '').toUpperCase()
    const dir = String(l.action ?? '').toLowerCase()
    if (dir !== 'buy' && dir !== 'sell') continue
    const velas = await velasDe(sym)
    if (!velas) {
      semVelas.set(sym, (semVelas.get(sym) ?? 0) + 1)
      continue
    }
    const em = Date.parse(l.received_at)
    const i = indiceDoSinal(velas, em)
    // precisa de história (EMA200) e de futuro (o horizonte mais curto)
    if (i < 420 || i + 1 >= velas.length) {
      semIndice++
      continue
    }
    const a = atr14(velas, i)
    if (!(a > 0)) {
      semIndice++
      continue
    }
    const sgn: 1 | -1 = dir === 'buy' ? 1 : -1
    const entrada = velas[i + 1].o // ordem a mercado na vela seguinte — não exige tocar nada
    const ret = HORIZONTES.map((h) => {
      const j = i + 1 + h
      return j < velas.length ? (sgn * (velas[j].c - entrada)) / a : NaN
    })
    let mfe = 0
    let mae = 0
    for (let k = i + 1; k <= Math.min(i + 96, velas.length - 1); k++) {
      const fav = sgn > 0 ? velas[k].h - entrada : entrada - velas[k].l
      const adv = sgn > 0 ? entrada - velas[k].l : velas[k].h - entrada
      if (fav / a > mfe) mfe = fav / a
      if (adv / a > mae) mae = adv / a
    }
    const e200 = ema(velas, i, 200)
    const p = (l.raw_payload ?? {}) as Record<string, unknown>
    const confObj = p.confirmations
    let conf = 0
    if (confObj && typeof confObj === 'object') conf = Object.values(confObj as object).filter((v) => v === true || v === 'true').length
    const d = new Date(em)
    casos.push({
      simbolo: sym,
      dir: sgn,
      dia: d.toISOString().slice(0, 10),
      horaUtc: d.getUTCHours(),
      conf,
      atrPct: (a / entrada) * 100,
      ret,
      mfe,
      mae,
      custoAtr: spreadPreco(sym) / a,
      regime: Number.isFinite(e200) ? sgn * (velas[i].c - e200) > 0 : false,
      passouGate: teriaExecutado(l, regras, sw).ok,
    })
  }
  console.error(`  ${casos.length} sinais medidos · ${semIndice} sem velas úteis · sem série: ${[...semVelas].map(([k, v]) => `${k}(${v})`).join(' ')}`)

  const gate = casos.filter((c) => c.passouGate)
  const clustersDe = (cs: Caso[]) => cs.map((c) => c.dia)

  // ── cabeçalho ──────────────────────────────────────────────────────────────────────────────────
  P('# MTM Scanner — existe borda em algum subconjunto?')
  P()
  P(`Corrido a ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · `
    + `\`npx tsx scripts/estudos/mtmscanner-borda-29-09.ts\` · velas M15 · sinais desde ${DESDE}.`)
  P()
  P('> Só leitura. Nada foi escrito em nenhuma tabela. A estratégia está em sombra (`ativo = false`).')
  P()
  P('**A pergunta.** As duas medições anteriores (`docs/sombra-mtm-scanner.md` e a varredura de 98')
  P('combinações de stop/alvo em `fontes-1000-29-09.ts --scanner`) mediram GESTÃO. Esta mede o')
  P('SINAL: qual é o retorno futuro cru, na direcção anunciada, normalizado pelo ATR(14) da altura,')
  P('sem stop nem alvo nenhum. Se for zero em todos os horizontes, nenhuma gestão pode salvar nada.')
  P()
  P(`**Amostra:** ${brutos.length} ideias lidas · ${casos.length} medidas em velas · `
    + `${gate.length} passariam o gate de execução de hoje (${((100 * gate.length) / Math.max(1, casos.length)).toFixed(1)}%).`)
  P()
  P(`**Regras do gate:** ${origemRegras} · venda exige ${regras.exec_sell_min_confirmations} confirmações.`)
  P()
  P('**Entrada:** abertura da vela SEGUINTE ao sinal (ordem a mercado). Não se exige que o preço')
  P('toque o valor anunciado — é a regra da casa desde o caso da fonte a +124%.')
  P()

  // ── 1. seguimento ──────────────────────────────────────────────────────────────────────────────
  P('## 1. O sinal tem seguimento? (retorno futuro cru, em ATR)')
  P()
  P('Cada coluna é o retorno médio, com o sinal da direcção, a N velas de 15 m da entrada, dividido')
  P('pelo ATR(14) da altura. `IC 95%` é o intervalo com erro-padrão AGRUPADO POR DIA; `IC ingénuo` é')
  P('o que sairia se se fingisse que os sinais são independentes — está lá para se ver quanto é que')
  P('essa mentira estreita o intervalo.')
  P()
  for (const [nome, cs] of [['todas as ideias', casos], ['só as que passam o gate', gate]] as const) {
    P(`### ${nome} (${cs.length} sinais, ${new Set(clustersDe(cs)).size} dias)`)
    P()
    P('| horizonte | n | retorno médio (ATR) | IC 95% agrupado | IC ingénuo | % acima de zero | contém o zero? |')
    P('|---|---:|---:|---:|---:|---:|---|')
    for (let h = 0; h < HORIZONTES.length; h++) {
      const pares = cs.map((c, i) => ({ x: c.ret[h], d: c.dia })).filter((p) => Number.isFinite(p.x))
      if (pares.length < 30) continue
      const r = icAgrupado(pares.map((p) => p.x), pares.map((p) => p.d))
      const acima = (100 * pares.filter((p) => p.x > 0).length) / pares.length
      const contem = !(Math.abs(r.media) > r.ic95)
      const lbl = HORIZONTES[h] >= 96 ? `${HORIZONTES[h]} velas (${(HORIZONTES[h] / 96).toFixed(0)} d)` : `${HORIZONTES[h]} velas (${((HORIZONTES[h] * 15) / 60).toFixed(1)} h)`
      P(`| ${lbl} | ${pares.length} | ${sig(r.media)} | ±${f(r.ic95)} | ±${f(r.icIngenuo)} | ${acima.toFixed(1)}% | ${contem ? 'sim' : '**NÃO**'} |`)
    }
    P()
  }

  // custo
  const custoMed = media(gate.map((c) => c.custoAtr))
  P(`**O custo, na mesma régua.** O meio-spread ida-e-volta vale em média **${f(custoMed)} ATR** por trade`)
  P('nos sinais que passam o gate. Qualquer retorno médio bruto abaixo disso é negativo depois de custos.')
  P()

  // ── 2. MFE/MAE ─────────────────────────────────────────────────────────────────────────────────
  P('## 2. Até onde o preço chega, e até onde vai contra (96 velas = 1 dia)')
  P()
  P('Se o sinal tivesse valor direccional, o MFE mediano seria maior que o MAE mediano. Mede-se nos')
  P('dois, em ATR, porque é a assimetria que uma gestão poderia explorar.')
  P()
  const pc = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }
  P('| conjunto | n | MFE p25 | p50 | p75 | MAE p25 | p50 | p75 | MFE−MAE mediano |')
  P('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const [nome, cs] of [['todas as ideias', casos], ['passam o gate', gate], ['gate + compras', gate.filter((c) => c.dir > 0)], ['gate + vendas', gate.filter((c) => c.dir < 0)]] as const) {
    if (cs.length < 30) continue
    const mfe = cs.map((c) => c.mfe)
    const mae = cs.map((c) => c.mae)
    P(`| ${nome} | ${cs.length} | ${f(pc(mfe, 0.25), 2)} | ${f(pc(mfe, 0.5), 2)} | ${f(pc(mfe, 0.75), 2)} | ${f(pc(mae, 0.25), 2)} | ${f(pc(mae, 0.5), 2)} | ${f(pc(mae, 0.75), 2)} | ${sig(pc(mfe, 0.5) - pc(mae, 0.5), 2)} |`)
  }
  P()

  // ── 3. cortes ──────────────────────────────────────────────────────────────────────────────────
  /** Horizonte de referência para procurar subconjuntos: 16 velas = 4 h. */
  const H_REF = HORIZONTES.indexOf(16)

  function tabelaCorte(titulo: string, chave: (c: Caso) => string, cs: Caso[], minimo: number, nota: string) {
    const m = new Map<string, Caso[]>()
    for (const c of cs) {
      const k = chave(c)
      const l = m.get(k)
      if (l) l.push(c)
      else m.set(k, [c])
    }
    const grupos = [...m].filter(([, l]) => l.length >= minimo).sort((a, b) => a[0].localeCompare(b[0]))
    const nComp = grupos.length
    const limiar = nComp > 0 ? 1.96 * Math.sqrt(2 * Math.log(2 * nComp)) / 1.96 : 1 // factor de alargamento ~Bonferroni
    P(`### ${titulo}`)
    P()
    P(nota)
    P()
    P(`Comparações feitas: **${nComp}**. Para uma delas contar como real depois de Bonferroni, a média`)
    P(`tem de estar a mais de **${f(limiar, 2)}×** o seu IC 95% de zero — não basta o IC não conter o zero.`)
    P()
    P('| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |')
    P('|---|---:|---:|---:|---:|---:|---:|---|')
    const sobrevivem: string[] = []
    for (const [k, l] of grupos) {
      const xs = l.map((c) => c.ret[H_REF]).filter(Number.isFinite)
      const ds = l.filter((c) => Number.isFinite(c.ret[H_REF])).map((c) => c.dia)
      if (xs.length < minimo) continue
      const r = icAgrupado(xs, ds)
      const cst = media(l.map((c) => c.custoAtr))
      const liq = r.media - cst
      const passa = Number.isFinite(r.ic95) && Math.abs(r.media) > limiar * r.ic95 && liq > 0
      if (passa) sobrevivem.push(k)
      P(`| ${k} | ${xs.length} | ${new Set(ds).size} | ${sig(r.media)} | ±${f(r.ic95)} | ${f(cst)} | ${sig(liq)} | ${passa ? '**SIM**' : 'não'} |`)
    }
    P()
    P(sobrevivem.length
      ? `**Sobrevivem:** ${sobrevivem.join(', ')}.`
      : '**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.')
    P()
    return sobrevivem
  }

  P('## 3. Existe subconjunto com borda?')
  P()
  P('Régua: retorno médio a 4 horas (16 velas), em ATR, com IC agrupado por dia, sobre os sinais que')
  P('passam o gate de execução. Um grupo só conta se (a) a média estiver longe de zero mesmo depois')
  P('de corrigir as comparações múltiplas e (b) o líquido de custos for positivo.')
  P()
  const vencedores: Record<string, string[]> = {}
  vencedores.simbolo = tabelaCorte('3.1 Por símbolo — dos pares, há algum que preste?', (c) => c.simbolo, gate, 40,
    'Um par «bom» por acaso é o resultado mais fácil de produzir num estudo destes. Daí o limiar.')
  vencedores.hora = tabelaCorte('3.2 Por hora UTC — das 24 horas, há alguma?', (c) => String(c.horaUtc).padStart(2, '0') + 'h', gate, 40,
    'As horas herdam a estrutura do dia de negociação; 24 comparações é muita corda.')
  vencedores.lado = tabelaCorte('3.3 Por lado', (c) => (c.dir > 0 ? 'compra' : 'venda'), gate, 40,
    'Só duas comparações — é o corte mais barato de todos.')
  vencedores.conf = tabelaCorte('3.4 Por número de confirmações', (c) => `${c.conf} confirmações`, gate, 40,
    'O gate já exige ≥2. A pergunta é se exigir mais compra alguma coisa.')
  vencedores.regime = tabelaCorte('3.5 Por regime (lado da EMA200 M15)', (c) => (c.regime ? 'a favor da EMA200' : 'contra a EMA200'), gate, 40,
    'A EMA200 em M15 é o regime local — o Scanner é de 15 m, não se sai do timeframe dele.')
  vencedores.vol = tabelaCorte('3.6 Por volatilidade (ATR% do preço)', (c) => (c.atrPct < 0.05 ? 'ATR < 0,05%' : c.atrPct < 0.08 ? 'ATR 0,05–0,08%' : c.atrPct < 0.12 ? 'ATR 0,08–0,12%' : 'ATR ≥ 0,12%'), gate, 40,
    'É o corte que decide se o custo mata o sinal: em ATR baixo, o spread pesa mais.')
  vencedores.sessao = tabelaCorte('3.7 Por sessão', (c) => (c.horaUtc < 7 ? 'Ásia (00–07h)' : c.horaUtc < 12 ? 'Londres (07–12h)' : c.horaUtc < 17 ? 'Nova Iorque (12–17h)' : 'fecho (17–24h)'), gate, 40,
    'Quatro comparações. É o corte com mais sentido mecânico dos que aqui estão.')

  // ── 4. o melhor cruzamento possível ────────────────────────────────────────────────────────────
  P('## 4. E se se juntar tudo o que parece melhor?')
  P()
  P('O teste mais duro que se pode fazer a uma estratégia sem borda: escolher, DEPOIS de ver os')
  P('números, o melhor valor de cada corte e cruzá-los todos. Se nem isto ficar positivo depois de')
  P('custos, está respondido. (E se ficar, é sobreajuste puro: foi escolhido a olhar para a resposta.)')
  P()
  const melhorDe = (chave: (c: Caso) => string, minimo: number) => {
    const m = new Map<string, Caso[]>()
    for (const c of gate) {
      const k = chave(c)
      const l = m.get(k)
      if (l) l.push(c)
      else m.set(k, [c])
    }
    let melhor = ''
    let mx = -Infinity
    for (const [k, l] of m) {
      if (l.length < minimo) continue
      const v = media(l.map((c) => c.ret[H_REF]).filter(Number.isFinite))
      if (v > mx) { mx = v; melhor = k }
    }
    return melhor
  }
  const bLado = melhorDe((c) => (c.dir > 0 ? 'compra' : 'venda'), 40)
  const bSessao = melhorDe((c) => (c.horaUtc < 7 ? 'Ásia (00–07h)' : c.horaUtc < 12 ? 'Londres (07–12h)' : c.horaUtc < 17 ? 'Nova Iorque (12–17h)' : 'fecho (17–24h)'), 40)
  const bRegime = melhorDe((c) => (c.regime ? 'a favor da EMA200' : 'contra a EMA200'), 40)
  const bVol = melhorDe((c) => (c.atrPct < 0.05 ? 'ATR < 0,05%' : c.atrPct < 0.08 ? 'ATR 0,05–0,08%' : c.atrPct < 0.12 ? 'ATR 0,08–0,12%' : 'ATR ≥ 0,12%'), 40)
  P(`Melhor lado: **${bLado}** · melhor sessão: **${bSessao}** · melhor regime: **${bRegime}** · melhor banda de volatilidade: **${bVol}**.`)
  P()
  const cruzado = gate.filter((c) =>
    (c.dir > 0 ? 'compra' : 'venda') === bLado
    && (c.horaUtc < 7 ? 'Ásia (00–07h)' : c.horaUtc < 12 ? 'Londres (07–12h)' : c.horaUtc < 17 ? 'Nova Iorque (12–17h)' : 'fecho (17–24h)') === bSessao
    && (c.regime ? 'a favor da EMA200' : 'contra a EMA200') === bRegime
    && (c.atrPct < 0.05 ? 'ATR < 0,05%' : c.atrPct < 0.08 ? 'ATR 0,05–0,08%' : c.atrPct < 0.12 ? 'ATR 0,08–0,12%' : 'ATR ≥ 0,12%') === bVol)
  P('| conjunto | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo | líquido |')
  P('|---|---:|---:|---:|---:|---:|---:|')
  for (const [nome, cs] of [['todos os que passam o gate', gate], ['o melhor de cada corte, cruzado (SOBREAJUSTADO)', cruzado]] as const) {
    const xs = cs.map((c) => c.ret[H_REF]).filter(Number.isFinite)
    if (!xs.length) continue
    const ds = cs.filter((c) => Number.isFinite(c.ret[H_REF])).map((c) => c.dia)
    const r = icAgrupado(xs, ds)
    const cst = media(cs.map((c) => c.custoAtr))
    P(`| ${nome} | ${xs.length} | ${new Set(ds).size} | ${sig(r.media)} | ±${f(r.ic95)} | ${f(cst)} | ${sig(r.media - cst)} |`)
  }
  P()

  // ── 5. fora da amostra ─────────────────────────────────────────────────────────────────────────
  P('## 5. O teste que ninguém consegue enganar: primeira metade contra segunda')
  P()
  P('Parte-se a janela ao meio pelo tempo. Se algum corte da secção 3 tiver borda a sério, o que for')
  P('bom na primeira metade tem de continuar bom na segunda. Se a ordem dos símbolos mudar ao acaso')
  P('entre as duas metades, o que a secção 3 encontrou foi ruído.')
  P()
  const dias = [...new Set(gate.map((c) => c.dia))].sort()
  const corte = dias[Math.floor(dias.length / 2)]
  const m1 = gate.filter((c) => c.dia < corte)
  const m2 = gate.filter((c) => c.dia >= corte)
  P(`Corte em **${corte}** — primeira metade ${m1.length} sinais, segunda ${m2.length}.`)
  P()
  const porSimbolo = (cs: Caso[]) => {
    const m = new Map<string, number[]>()
    for (const c of cs) {
      if (!Number.isFinite(c.ret[H_REF])) continue
      const l = m.get(c.simbolo) ?? []
      l.push(c.ret[H_REF])
      m.set(c.simbolo, l)
    }
    return m
  }
  const a1 = porSimbolo(m1)
  const a2 = porSimbolo(m2)
  const comuns = [...a1.keys()].filter((k) => a2.has(k) && a1.get(k)!.length >= 20 && a2.get(k)!.length >= 20).sort()
  P('| símbolo | n 1.ª | retorno 1.ª metade | n 2.ª | retorno 2.ª metade | mesmo sinal? |')
  P('|---|---:|---:|---:|---:|---|')
  let concordam = 0
  for (const k of comuns) {
    const v1 = media(a1.get(k)!)
    const v2 = media(a2.get(k)!)
    const ok = v1 * v2 > 0
    if (ok) concordam++
    P(`| ${k} | ${a1.get(k)!.length} | ${sig(v1)} | ${a2.get(k)!.length} | ${sig(v2)} | ${ok ? 'sim' : 'não'} |`)
  }
  P()
  P(`**${concordam} de ${comuns.length} símbolos** mantêm o sinal do retorno entre as duas metades.`)
  P('Ao acaso esperavam-se metade. Se o número for perto de metade, a ordenação por símbolo da')
  P('secção 3 não se repete e não serve para filtrar nada.')
  P()

  writeFileSync(SAIDA, linhas.join('\n') + '\n')
  console.error(`\nescrito: ${SAIDA}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
