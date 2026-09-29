/**
 * QUE ESTRATÉGIAS MANTER ACTIVAS — as sete fontes lado a lado, com a MESMA régua.
 *
 * Correr:  npx tsx scripts/estudos/fontes-1000-29-09.ts
 *          npx tsx scripts/estudos/fontes-1000-29-09.ts --scanner   (varredura de alvos/stops)
 *
 * ── SÓ LEITURA. Nenhum INSERT, nenhum UPDATE, nenhuma alteração de configuração. ───────────────
 *
 * A REGRA QUE O DONO DEU (e que é igual para todas as fontes, sem excepção):
 *   conta 1000 $ · lote FIXO 0,01 · break-even no Exit 1 · deixar rolar até ao alvo final ou ao stop.
 * E corre-se DUAS vezes: sem custos, e com custos. O número com custos é o que decide.
 *
 * ── PORQUÊ ESTE SCRIPT E NÃO O `mtmcopy_signal_tracking` DIRECTO ────────────────────────────────
 * O tracker guarda o DESFECHO que a nossa gestão produziu, mas (a) esmaga o `sl` com o break-even
 * em 156 das 1 339 linhas, o que apaga o risco original, e (b) não tem custos nenhuns. Aqui
 * replica-se cada sinal em velas M15 reais, com a mesma máquina que já julgou o GoldKiller e a
 * Aurum (lib/estudos/replay-velas.ts), o que torna as sete fontes comparáveis entre si.
 *
 * ── O BALDE `source_key` NÃO É A FONTE ──────────────────────────────────────────────────────────
 * `source_key` vem do CANAL (lib/mtmcopy/t2t-source.ts → t2tSourceKey), não de quem escreveu o
 * sinal. Num canal partilhado tudo fica marcado com a chave daquele canal. Confirmado:
 *   · `aurum` (29 linhas) tem lá dentro 16 da Aurum Flow ORB a sério (ETHUSDT), 5 do «MTM Sensei X»
 *     e 8 de ideias manuais — as duas últimas em BTCUSD e ambas muito negativas. Dizer «a Aurum
 *     perde» a partir deste balde é matar a fonte errada.
 *   · `primeverse` (495 linhas) é um AGREGADOR: os sinais trazem «📡 PrimeVerse · <trader>» no
 *     texto e há dezenas de traders lá dentro, mais três mestres nossas (Edge/King/Wolf).
 * Por isso este script atribui cada linha à fonte VERDADEIRA — por `raw_payload->>'strategy'` do
 * alerta TradingView quando existe, senão pela marca no texto da mensagem — e imprime a composição
 * de cada balde ANTES de qualquer recomendação.
 *
 * ── CUSTOS ──────────────────────────────────────────────────────────────────────────────────────
 * O dono pediu «1 pip de spread». Um pip aqui é o `pipSizeForSymbol` de lib/mtmcopy/trade-outcome
 * (cripto e índices em PONTOS), meio pip de cada lado: entra-se no lado caro, sai-se no barato.
 * Para os perpétuos isso não chega: a taxa taker da Bybit é 0,11% ida-e-volta (NÃO os 0,05% da
 * constante CUSTO_PERP de lib/estudos/replay-velas.ts, que está a ser usada por estudos já
 * publicados e por isso não se lhe toca aqui).
 *
 * ── PRESSUPOSTOS, TODOS DECLARADOS ──────────────────────────────────────────────────────────────
 *  1. Velas M15 da TradingView. Uma vela de 15 min é grosseira para um stop de 5 pips: dentro dela
 *     assume-se sempre a ordem mais desfavorável (stop antes de alvo). Logo os números do Scanner
 *     são, se alguma coisa, OPTIMISTAS quanto ao número de trades que sobrevivem e PESSIMISTAS
 *     quanto às que tocam alvo no mesmo movimento. Está no lado seguro.
 *  2. Janela de 3 dias (288 velas) por sinal; o que sobrar fecha-se a mercado no fim.
 *  3. Parciais 50%/25% nos dois primeiros alvos e o resto no alvo final — é o que o motor faz
 *     (`saidas_pct` das contas). A variante SEM parciais corre também, como sensibilidade.
 *  4. O `james` (Forex Swings) não tem preço de entrada gravado em lado nenhum: entra-se à
 *     ABERTURA da primeira vela depois do sinal, que é o que uma ordem a mercado faz.
 *  5. Valor do ponto a 0,01 lote vem de `funded_symbols.contract_size`; os pares cotados fora do
 *     dólar convertem-se por uma taxa média fixa do período (tabela FX abaixo). O erro disto é de
 *     poucos por cento e NÃO troca o sinal de nenhuma linha.
 *  6. Ideias descartadas (nunca accionadas) não entram na contabilidade — não houve trade.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { replicar as replicarBase, type Perfil, type Sinal, type Vela } from '../../lib/estudos/replay-velas'
import { pipSizeForSymbol } from '../../lib/mtmcopy/trade-outcome'

const RAIZ = join(__dirname, '..', '..')
try {
  process.loadEnvFile(join(RAIZ, '.env.local'))
} catch {
  /* usa o ambiente */
}

const requireCjs = createRequire(__filename)
const CACHE = resolve(__dirname, '../.cache-velas')
const TF = '15'
const JANELA_BARRAS = 288 // 3 dias em M15
const SEGUNDOS_VELA = 900
const CONTA = 1000
const LOTE = 0.01
/** Taxa taker REAL da Bybit, ida-e-volta. A constante CUSTO_PERP do lib está a 0,05% e é metade disto. */
const TAXA_PERP_IDA_VOLTA = 0.0011

// ── ligação ──────────────────────────────────────────────────────────────────────────────────────

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !CHAVE) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

type Linha = Record<string, unknown>

/** Lê uma tabela em páginas — as tabelas de sinais não cabem no limite de 1000 do PostgREST. */
async function lerTudo(tabela: string, colunas: string, extra = ''): Promise<Linha[]> {
  const out: Linha[] = []
  const passo = 1000
  for (let i = 0; ; i += passo) {
    const q = `select=${encodeURIComponent(colunas)}${extra}`
    const r = await fetch(`${URL}/rest/v1/${tabela}?${q}`, {
      headers: {
        apikey: CHAVE,
        Authorization: `Bearer ${CHAVE}`,
        Range: `${i}-${i + passo - 1}`,
        'Range-Unit': 'items',
      },
    })
    if (!r.ok) throw new Error(`${tabela}: ${r.status} ${await r.text()}`)
    const lote = (await r.json()) as Linha[]
    out.push(...lote)
    if (lote.length < passo) break
  }
  return out
}

// ── símbolos: pip, valor do ponto, candidatos de velas ───────────────────────────────────────────

/** Taxas médias do período 25/08→29/09 (quanto vale 1 unidade da moeda de cotação, em USD). */
const FX_PARA_USD: Record<string, number> = {
  USD: 1, JPY: 1 / 150, CAD: 1 / 1.39, CHF: 1 / 0.80, GBP: 1.34, AUD: 0.66, NZD: 0.58, EUR: 1.17,
}

/** contract_size de `funded_symbols`, copiado aqui para o script ser auditável sozinho. */
const CONTRACT_SIZE: Record<string, number> = { XAUUSD: 100, US30: 1, NAS100: 1, BTCUSD: 1, ETHUSDT: 1 }

function moedaCotacao(sym: string): string {
  const s = sym.toUpperCase()
  if (/^XAU|^XAG|USD$/.test(s.slice(-3)) || s === 'US30' || s === 'NAS100') return 'USD'
  if (s.length === 6) return s.slice(3)
  return 'USD'
}

/** Quanto vale, em USD, 1,00 de movimento de PREÇO a 0,01 lote. */
function usdPorUnidadeDePreco(sym: string): number {
  const s = sym.toUpperCase()
  const contrato = CONTRACT_SIZE[s] ?? (s.length === 6 ? 100000 : 1)
  return contrato * LOTE * (FX_PARA_USD[moedaCotacao(s)] ?? 1)
}

function candidatosTv(ticker: string): string[] {
  const t = ticker.toUpperCase()
  if (t === 'XAUUSD' || t === 'LLLGOLD') return ['OANDA:XAUUSD']
  if (t === 'US30') return ['CAPITALCOM:US30', 'OANDA:US30USD', 'TVC:DJI']
  if (t === 'NAS100') return ['CAPITALCOM:US100', 'OANDA:NAS100USD']
  if (t === 'BTCUSD') return ['BYBIT:BTCUSDT', 'BINANCE:BTCUSDT']
  if (t === 'ETHUSDT') return ['BYBIT:ETHUSDT.P', 'BYBIT:ETHUSDT', 'BINANCE:ETHUSDT']
  if (/^[A-Z]{6}$/.test(t)) return [`OANDA:${t}`, `FX:${t}`]
  return [`OANDA:${t}`]
}

const mem = new Map<string, Vela[] | null>()

async function velasDe(ticker: string): Promise<Vela[] | null> {
  const chave = ticker.toUpperCase()
  if (mem.has(chave)) return mem.get(chave) ?? null
  mkdirSync(CACHE, { recursive: true })
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

// ── atribuição: de que fonte é MESMO esta linha ──────────────────────────────────────────────────

interface Ideia {
  id: string
  balde: string // o source_key, que é o CANAL
  fonte: string // a fonte verdadeira, depois de desmisturar
  simbolo: string
  direcao: 'buy' | 'sell'
  em: number
  entrada: number | null
  sl: number
  tps: number[]
  descartada: boolean
  /** null = plausível; texto = porque é que a linha foi posta de parte */
  rejeitada: string | null
}

/**
 * PORTÃO DE PLAUSIBILIDADE — sem isto o quadro é uma mentira.
 *
 * A tabela tem linhas com níveis impossíveis: um Premium em XAUUSD com 40 995 $ de risco (stop a
 * zero, provável falha do parser da zona) e um Sensei com 9 882 $. Uma única dessas linhas, a lote
 * fixo, vale dezenas de milhares de dólares e domina a fonte inteira — foi exactamente o que fez o
 * `premium` aparecer a +41 693 $ e o `sensei` a −39 287 $ na primeira corrida deste script.
 *
 * A régua: o risco tem de ser pelo menos 1 pip e no máximo 3% do preço de entrada. O alvo final
 * tem tecto de 6% em forex, metais e índices — e de 40% em cripto, porque a escada da Aurum Flow
 * ORB em ETHUSDT vai legitimamente a TP4 entre 8% e 35% e um tecto único cortava-a fora do estudo
 * (cortou, na primeira corrida: 10 dos 16 sinais). Nada de real fica de fora — um stop de 3% no
 * ouro a 4 400 $ são 132 $, muito acima do maior stop honesto de qualquer destas fontes. O que cai
 * é só lixo de parsing, e conta-se quanto caiu por fonte para o número ser auditável.
 */
function plausivel(simbolo: string, entrada: number | null, sl: number, tps: number[]): string | null {
  if (entrada == null) return null // o james entra a mercado; valida-se depois, com a vela
  const risco = Math.abs(entrada - sl)
  if (!(risco > 0)) return 'risco zero (stop esmagado pelo break-even, sem sl_original)'
  if (risco < pipSizeForSymbol(simbolo)) return 'risco abaixo de 1 pip'
  if (risco > 0.03 * Math.abs(entrada)) return 'risco acima de 3% do preço'
  const cripto = /USDT$|^BTC|^ETH/.test(simbolo.toUpperCase())
  const tecto = cripto ? 0.4 : 0.06
  const alvo = tps[tps.length - 1]
  if (alvo != null && Math.abs(alvo - entrada) > tecto * Math.abs(entrada)) {
    return `alvo acima de ${(tecto * 100).toFixed(0)}% do preço`
  }
  return null
}

/**
 * Desmistura o balde. Ordem de confiança: a estratégia declarada pelo alerta TradingView manda,
 * porque é o próprio emissor a assinar; só depois a marca no texto; só depois o nome do canal.
 */
function fonteVerdadeira(balde: string, estrategiaTv: string | null, conteudo: string): string {
  if (estrategiaTv) {
    const e = estrategiaTv.trim()
    if (/aurum/i.test(e)) return 'aurum'
    if (/sensei/i.test(e)) return 'sensei'
    if (/goldkiller/i.test(e)) return 'goldkiller'
    if (/scanner/i.test(e)) return 'mtmscanner'
    return e.toLowerCase()
  }
  const mestre = conteudo.match(/📌\s*(MTM Auto [A-Za-zÀ-ÿ ]+?)\s*·/)
  if (mestre) return `mestre:${mestre[1].trim().replace(/^MTM Auto /, '').toLowerCase()}`
  const pv = conteudo.match(/📡\s*PrimeVerse\s*·\s*([^\s\n]+)/)
  if (pv) return `primeverse:${pv[1].trim().toLowerCase()}`
  if (/Forex Swings/i.test(conteudo)) return 'james'
  return balde
}

// ── replay ───────────────────────────────────────────────────────────────────────────────────────

/** A regra do dono: break-even no Exit 1, e depois deixar rolar. Sem trailing — o trailing é outra pergunta. */
const PERFIL_DONO: Perfil = {
  nome: 'BE no Exit 1 · deixar rolar',
  beR: null,
  beOffsetR: 0,
  trailArranqueR: null,
  trailDistanciaR: 0,
  beNoTp1: true,
  partes: [0.5, 0.25],
}
const PERFIL_SEM_PARCIAIS: Perfil = { ...PERFIL_DONO, partes: [] }

/** Meio spread em preço. `custos=false` mede o sinal puro; `true` cobra 1 pip (ou a taxa da Bybit). */
function meioSpread(sym: string, preco: number, custos: boolean): number {
  if (!custos) return 0
  const s = sym.toUpperCase()
  // Perpétuos: a taxa taker é uma percentagem do NOCIONAL, não um pip.
  if (/USDT$/.test(s)) return (preco * TAXA_PERP_IDA_VOLTA) / 2
  return pipSizeForSymbol(s) / 2
}

interface Resultado {
  ideia: Ideia
  usd: number
  R: number
  motivo: string
  fechoEm: number
}

function correr(ideia: Ideia, velas: Vela[], perfil: Perfil, custos: boolean, tpsAlt?: number[], slAlt?: number): Resultado | null {
  // O james não tem entrada gravada: entra-se à abertura da primeira vela depois do alerta.
  let entrada = ideia.entrada
  let em = ideia.em
  if (entrada == null) {
    const v = velas.find((b) => b.t * 1000 >= ideia.em)
    if (!v) return null
    entrada = v.o
    em = v.t * 1000
  } else {
    // PREENCHIMENTO A SÉRIO. Fontes como o Premium anunciam uma ZONA («Gold Buy Zone 4464-4458»)
    // que o mercado pode nunca visitar. Dar a trade por aberta ao preço anunciado é oferecer uma
    // entrada melhor do que a que houve — é o mesmo vício de preço que já se apanhou no motor
    // simulado (lib/pips-proof.ts, FRONTEIRA_VIES_PRECO), e sozinho punha o Premium a +124%.
    // Aqui a ordem só enche quando o preço TOCA a entrada dentro da janela; se não tocar, não há
    // trade nenhuma e o sinal não entra na contabilidade.
    const i0 = velas.findIndex((b) => b.t * 1000 >= ideia.em)
    if (i0 < 0) return null
    let cheia = -1
    for (let i = i0; i < Math.min(velas.length, i0 + JANELA_BARRAS); i++) {
      if (velas[i].l <= entrada && entrada <= velas[i].h) { cheia = i; break }
    }
    if (cheia < 0) return null
    em = velas[cheia].t * 1000
  }
  const sl = slAlt ?? ideia.sl
  const tps = tpsAlt ?? ideia.tps
  if (!tps.length) return null
  const s: Sinal = { id: ideia.id, em, ticker: ideia.simbolo, tv: '', direcao: ideia.direcao, entrada, sl, tps }
  const r = replicarBase(s, velas, perfil, {
    janelaBarras: JANELA_BARRAS,
    segundosVela: SEGUNDOS_VELA,
    meio: meioSpread(ideia.simbolo, entrada, custos),
  })
  if ('erro' in r) return null
  const riscoPreco = Math.abs(entrada - sl)
  const usd = r.R * riscoPreco * usdPorUnidadeDePreco(ideia.simbolo)
  return { ideia, usd, R: r.R, motivo: r.motivo, fechoEm: r.fechoEm }
}

// ── quadros ──────────────────────────────────────────────────────────────────────────────────────

const f = (v: number | null, c = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(c))

function quadro(titulo: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const todas = [cabecalho, ...linhas.map((l) => l.map((c) => (c == null ? '—' : String(c))))]
  const larg = cabecalho.map((_, i) => Math.max(...todas.map((l) => (l[i] ?? '').length)))
  console.log(`\n${titulo}`)
  console.log(
    todas
      .map(
        (l, idx) =>
          l.map((c, i) => (i === 0 ? c.padEnd(larg[i]) : c.padStart(larg[i]))).join('  ') +
          (idx === 0 ? `\n${larg.map((w) => '─'.repeat(w)).join('  ')}` : ''),
      )
      .join('\n'),
  )
}

interface Resumo {
  n: number
  usd: number
  ganhos: number
  piorQueda: number
}

function resumir(rs: Resultado[]): Resumo {
  const ord = [...rs].sort((a, b) => a.fechoEm - b.fechoEm)
  let saldo = 0
  let pico = 0
  let pior = 0
  let ganhos = 0
  for (const r of ord) {
    saldo += r.usd
    if (r.usd > 1e-9) ganhos++
    if (saldo > pico) pico = saldo
    if (saldo - pico < pior) pior = saldo - pico
  }
  return { n: ord.length, usd: saldo, ganhos, piorQueda: pior }
}

// ── principal ────────────────────────────────────────────────────────────────────────────────────

async function ideias(): Promise<Ideia[]> {
  const tracking = await lerTudo(
    'mtmcopy_signal_tracking',
    'id,chat_message_id,source_key,symbol,direction,entry,sl,sl_original,tps,created_at,outcome_label',
  )
  const mensagens = new Map<string, string>()
  for (const m of await lerTudo('chat_messages', 'id,content', '&content=not.is.null')) {
    mensagens.set(String(m.id), String(m.content ?? ''))
  }
  const estrategias = new Map<string, string>()
  for (const t of await lerTudo('tradingview_signals', 'chat_message_id,alert_name,raw_payload', '&chat_message_id=not.is.null')) {
    const p = t.raw_payload as Record<string, unknown> | null
    const e = (p?.strategy as string | undefined) ?? (t.alert_name as string | undefined)
    if (e) estrategias.set(String(t.chat_message_id), e)
  }

  const out: Ideia[] = []
  for (const l of tracking) {
    const cmid = l.chat_message_id ? String(l.chat_message_id) : null
    const conteudo = cmid ? (mensagens.get(cmid) ?? '') : ''
    const estrategiaTv = cmid ? (estrategias.get(cmid) ?? null) : null
    const balde = String(l.source_key ?? '(sem fonte)')
    // O `sl` é esmagado pelo break-even em algumas linhas; `sl_original` (migração 148) é o verdadeiro.
    const sl = Number(l.sl_original ?? l.sl)
    const entryRaw = l.entry == null ? null : Number(l.entry)
    const tps = ((l.tps as number[] | null) ?? []).map(Number).filter((n) => Number.isFinite(n))
    const dir = String(l.direction ?? '').toLowerCase()
    if (!Number.isFinite(sl) || (dir !== 'buy' && dir !== 'sell')) continue
    out.push({
      id: String(l.id),
      balde,
      fonte: fonteVerdadeira(balde, estrategiaTv, conteudo),
      simbolo: String(l.symbol ?? '').toUpperCase(),
      direcao: dir,
      em: Date.parse(String(l.created_at)),
      entrada: entryRaw,
      sl,
      tps,
      descartada: String(l.outcome_label ?? '') === 'Ideia descartada',
      rejeitada: plausivel(String(l.symbol ?? '').toUpperCase(), entryRaw, sl, tps),
    })
  }
  return out
}

/** Quadro 0: de que é feito cada balde. Isto vem SEMPRE antes de qualquer recomendação. */
function quadroComposicao(todas: Ideia[]) {
  const por = new Map<string, Map<string, { n: number; syms: Set<string> }>>()
  for (const i of todas) {
    const m = por.get(i.balde) ?? new Map()
    const e = m.get(i.fonte) ?? { n: 0, syms: new Set<string>() }
    e.n++
    e.syms.add(i.simbolo)
    m.set(i.fonte, e)
    por.set(i.balde, m)
  }
  const linhas: (string | number | null)[][] = []
  for (const [balde, m] of [...por].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = [...m.values()].reduce((s, e) => s + e.n, 0)
    for (const [fonte, e] of [...m].sort((a, b) => b[1].n - a[1].n)) {
      linhas.push([balde, fonte, e.n, `${((100 * e.n) / total).toFixed(0)}%`, [...e.syms].sort().join(',').slice(0, 42)])
    }
  }
  quadro('COMPOSIÇÃO DOS BALDES — quanto de cada balde é mesmo a fonte que o nome diz',
    ['balde (canal)', 'fonte verdadeira', 'n', 'peso', 'símbolos'], linhas)
}

async function principal() {
  const todas = await ideias()
  console.error(`linhas de tracking: ${todas.length}`)
  quadroComposicao(todas)

  // Quadro do portão: quanto é que cada fonte perde por níveis impossíveis. Um número grande aqui
  // é, por si só, um defeito de parsing a reportar — não é ruído a esconder.
  const rejeitadas = todas.filter((i) => !i.descartada && i.rejeitada)
  const porMotivo = new Map<string, number>()
  for (const i of rejeitadas) porMotivo.set(`${i.balde} · ${i.rejeitada}`, (porMotivo.get(`${i.balde} · ${i.rejeitada}`) ?? 0) + 1)
  quadro('PORTÃO DE PLAUSIBILIDADE — linhas postas de parte por níveis impossíveis',
    ['balde · motivo', 'n'], [...porMotivo].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n]))

  const vivas = todas.filter((i) => !i.descartada && !i.rejeitada)
  const simbolos = [...new Set(vivas.map((i) => i.simbolo))]
  console.error(`\na carregar velas de ${simbolos.length} símbolos…`)
  for (const s of simbolos) await velasDe(s)

  const chave = (i: Ideia) => (i.balde === 'aurum' || i.balde === 'primeverse' ? i.fonte : i.balde)

  const correrTudo = (perfil: Perfil, custos: boolean) => {
    const por = new Map<string, Resultado[]>()
    let semVelas = 0
    for (const i of vivas) {
      const v = mem.get(i.simbolo)
      if (!v) { semVelas++; continue }
      const r = correr(i, v, perfil, custos)
      if (!r) { semVelas++; continue }
      const k = chave(i)
      por.set(k, [...(por.get(k) ?? []), r])
    }
    return { por, semVelas }
  }

  // ── o quadro que decide ────────────────────────────────────────────────────────────────────────
  const sem = correrTudo(PERFIL_DONO, false)
  const com = correrTudo(PERFIL_DONO, true)
  const semP = correrTudo(PERFIL_SEM_PARCIAIS, true)

  const chaves = [...new Set([...sem.por.keys(), ...com.por.keys()])]
  const linhas = chaves
    .map((k) => {
      const a = resumir(sem.por.get(k) ?? [])
      const b = resumir(com.por.get(k) ?? [])
      const c = resumir(semP.por.get(k) ?? [])
      return { k, a, b, c }
    })
    .filter((x) => x.a.n >= 1)
    .sort((x, y) => y.b.usd - x.b.usd)

  quadro(
    `RESULTADO POR FONTE — conta 1000 $, lote fixo 0,01, BE no Exit 1, deixar rolar\n` +
      `(velas M15 · janela 3 dias · custo = 1 pip ida-e-volta, perpétuos a ${(TAXA_PERP_IDA_VOLTA * 100).toFixed(2)}%)`,
    ['fonte', 'trades', 'sem custos $', 'final $', 'COM custos $', 'final $', '%', 'acerto', 'pior queda $', 'sem parciais $'],
    linhas.map((x) => [
      x.k,
      x.b.n,
      f(x.a.usd),
      f(CONTA + x.a.usd),
      f(x.b.usd),
      f(CONTA + x.b.usd),
      f((100 * x.b.usd) / CONTA, 1),
      `${((100 * x.b.ganhos) / Math.max(1, x.b.n)).toFixed(0)}%`,
      f(x.b.piorQueda),
      f(x.c.usd),
    ]),
  )

  // O quadro das SETE fontes que o dono nomeou, para a decisão. O de cima fica por baixo dele e
  // serve para não se matar a fonte errada quando o balde é misturado.
  const SETE = ['premium', 'primeverse', 'sensei', 'goldkiller', 'mtmscanner', 'aurum', 'james'] as const
  const rollup = SETE.map((nome) => {
    const juntaSem: Resultado[] = []
    const juntaCom: Resultado[] = []
    for (const [k, rs] of sem.por) if (k === nome || k.startsWith(`${nome}:`)) juntaSem.push(...rs)
    for (const [k, rs] of com.por) if (k === nome || k.startsWith(`${nome}:`)) juntaCom.push(...rs)
    // As mestres nossas (Edge/King/Wolf) publicam no canal do PrimeVerse mas NÃO são o PrimeVerse.
    // Ficam de fora do rollup e aparecem só no quadro de cima — juntá-las aqui era medir a fonte
    // errada, que é exactamente o risco deste balde.
    return { nome, a: resumir(juntaSem), b: resumir(juntaCom) }
  }).sort((x, y) => y.b.usd - x.b.usd)

  quadro(
    'AS SETE FONTES, como o dono as nomeou (as mestres nossas Edge/King/Wolf NÃO entram no PrimeVerse)',
    ['fonte', 'trades', 'sem custos $', 'final $', 'COM custos $', 'final $', '%', 'acerto', 'pior queda $'],
    rollup.map((x) => [
      x.nome, x.b.n, f(x.a.usd), f(CONTA + x.a.usd), f(x.b.usd), f(CONTA + x.b.usd),
      f((100 * x.b.usd) / CONTA, 1), `${((100 * x.b.ganhos) / Math.max(1, x.b.n)).toFixed(0)}%`, f(x.b.piorQueda),
    ]),
  )

  const totalSem = linhas.reduce((s, x) => s + x.a.usd, 0)
  const totalCom = linhas.reduce((s, x) => s + x.b.usd, 0)
  console.log(
    `\nConjunto (uma conta de 1000 $ a aceitar TUDO): sem custos ${f(CONTA + totalSem)} $ · ` +
      `com custos ${f(CONTA + totalCom)} $ · o custo pesa ${f(totalSem - totalCom)} $.`,
  )
  console.log(`Sinais sem velas / não replicáveis: ${com.semVelas} de ${vivas.length}.`)

  if (process.argv.includes('--scanner')) varreduraScanner(vivas)
}

// ── TAREFA 2: o Scanner com alvos e stops maiores ────────────────────────────────────────────────

/**
 * O Scanner tem stop mediano de 5 pips e o spread come-o. A pergunta é se existe um ponto — em
 * múltiplos do RISCO ORIGINAL, não em pips absolutos — a partir do qual ele passa a valer a pena
 * COM custos. Varre-se o stop (×0,5 a ×6 do risco original) contra o alvo final (×1 a ×8 desse
 * stop novo). Se nenhuma célula for positiva, a resposta é que esse ponto não existe.
 */
function varreduraScanner(vivas: Ideia[]) {
  const alvo = vivas.filter((i) => i.balde === 'mtmscanner' && i.entrada != null && i.tps.length)
  console.log(`\n\n══ MTM SCANNER · varredura de stops e alvos (${alvo.length} sinais, tudo COM custos) ══`)

  const multStop = [0.5, 1, 1.5, 2, 3, 4, 6]
  const multAlvo = [1, 1.5, 2, 3, 4, 6, 8]
  const linhas: (string | number | null)[][] = []
  for (const ms of multStop) {
    const cels: (string | number | null)[] = [`stop ×${ms}`]
    for (const ma of multAlvo) {
      const rs: Resultado[] = []
      for (const i of alvo) {
        const v = mem.get(i.simbolo)
        if (!v || i.entrada == null) continue
        const sinal = i.direcao === 'buy' ? 1 : -1
        const risco0 = Math.abs(i.entrada - i.sl)
        const slNovo = i.entrada - sinal * risco0 * ms
        const tpNovo = i.entrada + sinal * risco0 * ms * ma
        // Sem parciais: a pergunta é sobre a geometria alvo/stop, não sobre a escada de saídas.
        const r = correr(i, v, { ...PERFIL_DONO, partes: [] }, true, [tpNovo], slNovo)
        if (r) rs.push(r)
      }
      cels.push(f(resumir(rs).usd, 0))
    }
    linhas.push(cels)
  }
  quadro(
    'Resultado em $ numa conta de 1000 $ (lote 0,01) · linhas = stop em múltiplos do risco original · colunas = alvo em múltiplos do stop novo',
    ['', ...multAlvo.map((m) => `alvo ×${m}`)],
    linhas,
  )

  // A mesma varredura, mas com o stop em múltiplos do ATR(14) em M15 à hora do sinal — que é a
  // outra forma que o dono pediu. Serve de controlo: se o ATR desse um resultado diferente do
  // risco original, era sinal de que o stop do Scanner não acompanha a volatilidade.
  const multAtr = [0.5, 1, 1.5, 2, 3, 4]
  const linhasAtr: (string | number | null)[][] = []
  for (const ka of multAtr) {
    const cels: (string | number | null)[] = [`stop ${ka}×ATR`]
    for (const ma of multAlvo) {
      const rs: Resultado[] = []
      for (const i of alvo) {
        const v = mem.get(i.simbolo)
        if (!v || i.entrada == null) continue
        const atr = atrNoSinal(v, i.em)
        if (!(atr > 0)) continue
        const sinal = i.direcao === 'buy' ? 1 : -1
        const dist = atr * ka
        const r = correr(i, v, { ...PERFIL_DONO, partes: [] }, true, [i.entrada + sinal * dist * ma], i.entrada - sinal * dist)
        if (r) rs.push(r)
      }
      cels.push(f(resumir(rs).usd, 0))
    }
    linhasAtr.push(cels)
  }
  quadro(
    'O mesmo, com o stop em múltiplos do ATR(14) em M15 à hora do sinal',
    ['', ...multAlvo.map((m) => `alvo ×${m}`)],
    linhasAtr,
  )
}

/** ATR(14) em M15 na vela imediatamente anterior ao sinal. 0 quando não há histórico bastante. */
function atrNoSinal(velas: Vela[], em: number): number {
  const i = velas.findIndex((b) => b.t * 1000 >= em)
  if (i < 15) return 0
  let tr = 0
  for (let k = i - 14; k < i; k++) {
    const p = velas[k - 1]
    tr += Math.max(velas[k].h - velas[k].l, Math.abs(velas[k].h - p.c), Math.abs(velas[k].l - p.c))
  }
  return tr / 14
}

principal().catch((e) => {
  console.error(e)
  process.exit(1)
})
