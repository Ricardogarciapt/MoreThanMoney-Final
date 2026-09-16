/**
 * PERFIL DO BREAK-EVEN — MTM Auto Edge / King / Wolf (traders PrimeVerse fxedge, kingfkg, g_wolf).
 *
 *   npx tsx scripts/estudos/perfil-pv-traders.ts               # usa a cache
 *   npx tsx scripts/estudos/perfil-pv-traders.ts --refrescar   # velas e journal de novo
 *
 * SÓ LEITURA. Não escreve em tabela nenhuma, não mexe no relay, não usa créditos MetaApi.
 *
 * A PERGUNTA: o dono considera o nosso TRAILING bom (arranca à distância do TP1, segue a 0,5R).
 * Esse trailing fica FIXO. O que se varre é o BREAK-EVEN — onde arma (TP1 / TP2 / TP3 / fracção do
 * risco / nunca) — com as parciais actuais (50% TP1, 25% TP2). Mostram-se duas variantes de
 * trailing só como referência.
 *
 * O MOTOR é o de produção, não uma cópia: `gestaoDoSinal` + `niveisAncorados` + `loteParaConta`
 * (lib/mtmfunded/estrategias-sinais/calculo.ts) e `decidirGestao` (lib/mtmfunded/simulado/
 * avancadas.ts), com a ordem por tick de lib/mtmfunded/reconstituicao.ts (SL → gestão → TP) e a
 * regra da vela (extremo adverso primeiro: o stop ganha na mesma vela). Há uma verificação no fim
 * que compara este ciclo com `replicarSinal` nos casos em M1.
 *
 * DOIS REGIMES DE CONTA, porque o motor faz coisas diferentes:
 *  · 0,01 lote (conta de 1 000–1 999): não há parciais (50% de 0,01 fica abaixo do lote mínimo),
 *    por isso o «BE no TP1» vira `be_gatilho = distância ao TP1`. É o regime das contas do dono.
 *  · 0,10 lote (conta da casa de 10 000): 50% no TP1, 25% no TP2 (0,02), BE ao atingir o TP1.
 *
 * DE ONDE VÊM OS DADOS
 *  · setups: `chat_messages` (cartão «📡 PrimeVerse · trader», com entrada/SL/TP1..TP5) — é o que
 *    a rota /api/telegram/primeverse-exec grava de cada «NEW SIGNAL ALERT».
 *  · entradas (ENTRY HIT do trader): as linhas «✅ ENTRY HIT · … · trader» do chat (símbolo,
 *    direcção e SL — emparelhamento exacto) + as respostas «exec:» do journal do pv-relay (VPS),
 *    que também apanham as que o chat não tem. Estas últimas emparelham-se pelo preço: o ENTRY
 *    HIT quer dizer que o preço estava na entrada naquele minuto.
 *  · anúncios de TP do trader: linhas «SHADOW TP_HIT» do journal (15/09 19:43 → 16/09 18:19, as
 *    únicas com o nível). O histórico do canal não está acessível daqui.
 *  · velas: TradingView (~/tradingview-mcp/src/tvfeed.js). M1 desde ~06/09, M5 desde ~16/08 (ouro)
 *    e ~23/08 (US30). Usa-se M1 quando há; senão M5 (resolução pior — ver a tabela de controlo).
 *    OANDA:XAUUSD · CAPITALCOM:US30 · CAPITALCOM:US100.
 *
 * DESFASAMENTO DO FEED: o US30 do CAPITALCOM anda ~30 pontos ao lado da corretora do trader. Aqui
 * a posição abre ao preço do FEED no minuto do ENTRY HIT e os níveis do sinal são ANCORADOS a esse
 * preço (`niveisAncorados`, como o motor ao vivo) — o resultado em R não depende do desfasamento.
 * O desfasamento só entra no emparelhamento pelo preço, e é estimado pelos casos exactos do chat.
 *
 * O QUE FICA DE FORA (e puxa os números num sentido conhecido):
 *  · os fechos e BE ANUNCIADOS pelo trader (`seguirFechosDaFonte`) — não há histórico fiável
 *    deles com a hora e o setup; a replicação é só pelo preço, com janela de 72 h;
 *  · posições que nascem com o mercado a fechar/abrir (buracos de velas) — descartadas.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { createRequire } from 'module'
import { execSync } from 'child_process'
import { pipSizeForSymbol } from '../../lib/mtmcopy/trade-outcome'
import {
  CONFIG_PADRAO, gestaoDoSinal, loteParaConta, niveisAncorados, type ConfigSinais,
} from '../../lib/mtmfunded/estrategias-sinais/calculo'
import { decidirGestao, GESTAO_VAZIA, type Gestao } from '../../lib/mtmfunded/simulado/avancadas'
import {
  precoComSpread, precoDeAbertura, tocaSl, tocaTp, type Direcao, type Simbolo,
} from '../../lib/mtmfunded/simulado/matematica'
import { replicarSinal, ehErro } from '../../lib/mtmfunded/reconstituicao'

const requireCjs = createRequire(__filename)
for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const REFRESCAR = process.argv.includes('--refrescar')
const CACHE = resolve(__dirname, '../.cache-velas')
const JOURNAL = join(CACHE, 'pv-relay-journal.txt')
const SAIDA = resolve(__dirname, '../../docs/analise-perfil-pv-traders.md')
const JANELA_MS = 72 * 3600_000
const TRADERS = ['fxedge', 'kingfkg', 'g_wolf'] as const
const ESTRATEGIA: Record<string, string> = { fxedge: 'MTM Auto Edge', kingfkg: 'MTM Auto King', g_wolf: 'MTM Auto Wolf' }
const TV: Record<string, string> = { XAUUSD: 'OANDA:XAUUSD', US30: 'CAPITALCOM:US30', NAS100: 'CAPITALCOM:US100' }

interface Vela { t: number; o: number; h: number; l: number; c: number }

// ─────────────────────────────────────────────────────────────────────────────
// Base (só leitura, REST)
// ─────────────────────────────────────────────────────────────────────────────

async function rest(tabela: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const out: Record<string, unknown>[] = []
  for (let p = 0; ; p++) {
    const q = new URLSearchParams({ ...params, offset: String(p * 1000), limit: '1000' })
    const r = await fetch(`${url}/rest/v1/${tabela}?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!r.ok) throw new Error(`supabase ${tabela} ${r.status}: ${await r.text()}`)
    const lote = (await r.json()) as Record<string, unknown>[]
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setups e entradas
// ─────────────────────────────────────────────────────────────────────────────

interface Setup {
  id: string; em: number; trader: string; symbol: string; direcao: Direcao
  entrada: number; sl: number; tps: number[]
}

function lerSetup(id: string, em: number, c: string): Setup | null {
  const tr = /PrimeVerse · ([A-Za-z0-9_\-.]+)/.exec(c)
  const cab = /^\S+\s+([A-Z0-9]+)\s+(BUY|SELL)/m.exec(c)
  const ent = /Entrada:\s*([0-9.]+)/.exec(c)
  const sl = /SL:\s*([0-9.]+)/.exec(c)
  if (!tr || !cab || !ent || !sl) return null
  const direcao: Direcao = cab[2] === 'SELL' ? 'sell' : 'buy'
  const entrada = Number(ent[1])
  const s = Number(sl[1])
  const sinal = direcao === 'buy' ? 1 : -1
  if (!(entrada > 0) || !(s > 0) || (entrada - s) * sinal <= 0) return null
  const tps = [...c.matchAll(/TP\d:\s*([0-9.]+)/g)].map((m) => Number(m[1])).filter((x) => (x - entrada) * sinal > 0)
  if (!tps.length) return null
  return { id, em, trader: tr[1].toLowerCase(), symbol: cab[1], direcao, entrada, sl: s, tps }
}

type Classe = 'metal' | 'indice' | 'cripto' | '?'
const classeDoSimbolo = (s: string): Classe => (/XAU/.test(s) ? 'metal' : /US30|NAS100/.test(s) ? 'indice' : /BTC|ETH/.test(s) ? 'cripto' : '?')
const classeDoChat = (slug: string): Classe => (slug === 'sinais-scanner-mtm' ? 'metal' : slug === 'trade-ideas' ? 'indice' : slug === 'cripto-perps' ? 'cripto' : '?')

interface Entrada {
  em: number
  trader: string | null
  classe: Classe
  symbol: string | null
  direcao: Direcao | null
  sl: number | null
  origem: 'chat' | 'journal'
}

function lerJournal(): string[] {
  if (REFRESCAR || !existsSync(JOURNAL)) {
    mkdirSync(CACHE, { recursive: true })
    const txt = execSync(
      `ssh mtm-stream 'sudo journalctl -u pv-relay --no-pager -o short-iso-precise | grep -E "exec:|SHADOW" | grep -v "\\"kind\\": \\"setup\\"" | sed -E "s/^([^ ]+) [^:]+: /\\1 /"'`,
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    writeFileSync(JOURNAL, txt)
  }
  return readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean)
}

/** As respostas «exec:» de um ENTRY HIT (não têm `kind`; as de seguimentos têm). */
function entradasDoJournal(linhas: string[]): Entrada[] {
  const out: Entrada[] = []
  for (const l of linhas) {
    const m = /^(\S+) exec: (.*)$/.exec(l)
    if (!m) continue
    const j = m[2]
    if (/"kind":/.test(j)) continue
    const routed = /"routed": "([^"]+)"/.exec(j)?.[1] ?? null
    const symbol = /"symbol": "([A-Z0-9]+)"/.exec(j)?.[1] ?? null
    let trader = /"trader": "([^"]+)"/.exec(j)?.[1] ?? null
    const est = /"estrategia": "mtm-auto-(edge|king|wolf)"/.exec(j)?.[1]
    if (!trader && est) trader = { edge: 'fxedge', king: 'kingfkg', wolf: 'g_wolf' }[est] ?? null
    const classe = symbol ? classeDoSimbolo(symbol) : routed ? classeDoChat(routed) : '?'
    if (classe === '?') continue
    out.push({ em: new Date(m[1]).getTime(), trader, classe, symbol, direcao: null, sl: null, origem: 'journal' })
  }
  return out
}

interface AnuncioTp { em: number; trader: string; symbol: string; direcao: Direcao; entrada: number; sl: number; nivel: number | 'SL' }

function anunciosDoJournal(linhas: string[]): AnuncioTp[] {
  const out: AnuncioTp[] = []
  for (const l of linhas) {
    const m = /^(\S+) \[pv-relay\] SHADOW (TP_HIT|SL_HIT) \([^)]*\): (\{.*\})$/.exec(l)
    if (!m) continue
    try {
      const j = JSON.parse(m[3]) as { trader: string; symbol: string; direction: Direcao; entry: number; sl: number; level?: number }
      out.push({ em: new Date(m[1]).getTime(), trader: j.trader, symbol: j.symbol, direcao: j.direction, entrada: j.entry, sl: j.sl, nivel: m[2] === 'SL_HIT' ? 'SL' : Number(j.level) })
    } catch { /* linha cortada */ }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Velas
// ─────────────────────────────────────────────────────────────────────────────

async function velas(symbol: string, tf: '1' | '5'): Promise<Vela[]> {
  mkdirSync(CACHE, { recursive: true })
  const f = join(CACHE, `pv_${symbol}_${tf}m.json`)
  if (!REFRESCAR && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as Vela[]
  const { getHistory } = requireCjs('/Users/ricardogarcia/tradingview-mcp/src/tvfeed.js') as {
    getHistory: (o: { symbol: string; interval: string; nBars: number; timeoutMs?: number }) => Promise<{ bars: { time: number; open: number; high: number; low: number; close: number }[] }>
  }
  const r = await getHistory({ symbol: TV[symbol], interval: tf, nBars: 20000, timeoutMs: 180000 })
  const v = r.bars.map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }))
  writeFileSync(f, JSON.stringify(v))
  return v
}

/** Índice da vela que contém `seg` (velas de `passo` segundos), ou -1. */
function indiceDa(vs: Vela[], seg: number, passo: number): number {
  let lo = 0, hi = vs.length - 1, r = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (vs[m].t <= seg) { r = m; lo = m + 1 } else hi = m - 1
  }
  return r >= 0 && seg - vs[r].t < passo ? r : -1
}

// ─────────────────────────────────────────────────────────────────────────────
// Emparelhar ENTRY HIT → setup
// ─────────────────────────────────────────────────────────────────────────────

interface Caso {
  setup: Setup
  entradaEm: number
  origem: 'chat' | 'journal'
  tf: '1' | '5'
  velas: Vela[]
  i0: number
  /** feed − corretora do trader, neste caso (preço de fecho da vela − entrada do sinal) */
  desvio: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Replicação (motor de produção)
// ─────────────────────────────────────────────────────────────────────────────

type Motivo = 'sl' | 'be' | 'trailing' | 'tp' | 'tempo'

interface Res {
  R: number
  motivo: Motivo
  saidaEm: number
  /** maior TP (1..n) que o preço tocou antes do SL original (na janela) */
  tpMaxPreco: number
  mfeR: number
  /** depois da nossa saída, o preço foi ao TP seguinte ao que tínhamos visto, antes do SL original? */
  foiAoTpSeguinte: boolean
  precoEntrada: number
  slFinal: number | null
}

const ticks = (v: Vela, d: Direcao) => (d === 'buy' ? [v.l, v.h, v.c] : [v.h, v.l, v.c])

function replicar(c: Caso, s: Simbolo, saldo: number, cfg: ConfigSinais): Res | null {
  const { setup } = c
  const d = setup.direcao
  const sinal = d === 'buy' ? 1 : -1
  const precoBase = precoComSpread(s, c.velas[c.i0].c)
  const precoEntrada = precoDeAbertura(d, precoBase)
  const volume = loteParaConta(saldo, cfg, s)
  const niveis = niveisAncorados({ direcao: d, entrada: setup.entrada, sl: setup.sl, tps: setup.tps }, precoEntrada, s.digits)
  if (niveis.sl == null || !niveis.tps.length) return null
  const { gestao, tpFinal } = gestaoDoSinal({ simbolo: s, direcao: d, precoExecucao: precoEntrada, volume, sl: niveis.sl, tps: niveis.tps, cfg })
  const estado: Gestao = { ...GESTAO_VAZIA, ...gestao, volume_inicial: volume, tps: gestao.tps ? gestao.tps.map((t) => ({ ...t })) : null }
  const risco = Math.abs(precoEntrada - niveis.sl)
  const slOriginal = niveis.sl
  let sl: number | null = niveis.sl
  let ultimoMotivoSl: Motivo = 'sl'
  let vivo = volume
  let ganho = 0 // Σ volume × diferença de preço
  let fecho: { motivo: Motivo; em: number } | null = null
  const fimSeg = (setup.em > 0 ? c.entradaEm : c.entradaEm) / 1000 + JANELA_MS / 1000
  const mapa = (p: ReturnType<typeof precoComSpread>) => ({ [s.symbol]: p })

  let j = c.i0 + 1
  for (; j < c.velas.length; j++) {
    const v = c.velas[j]
    if (v.t > fimSeg) break
    for (const medio of ticks(v, d)) {
      const preco = precoComSpread(s, medio)
      const pos = { symbol: s.symbol, direcao: d, volume: vivo, preco_entrada: precoEntrada, sl, tp: tpFinal, comissao: 0, swap: 0 }
      if (tocaSl(pos, preco)) {
        ganho += vivo * ((sl as number) - precoEntrada) * sinal
        fecho = { motivo: ultimoMotivoSl, em: v.t * 1000 }
        break
      }
      const g = decidirGestao({ ...pos, id: setup.id, gestao: estado }, s, preco, mapa(preco))
      for (const p of g.parciais) {
        ganho += p.volume * (p.preco - precoEntrada) * sinal
        vivo = Math.round((vivo - p.volume) * 100) / 100
      }
      if (g.tps) estado.tps = g.tps.map((t) => ({ ...t }))
      estado.be_feito = g.beFeito
      if (g.novoSl != null) { sl = g.novoSl; ultimoMotivoSl = g.motivoSl === 'break_even' ? 'be' : 'trailing' }
      if (vivo <= 0) { fecho = { motivo: 'tp', em: v.t * 1000 }; break }
      if (tocaTp({ ...pos, volume: vivo, sl }, preco)) {
        ganho += vivo * ((tpFinal as number) - precoEntrada) * sinal
        fecho = { motivo: 'tp', em: v.t * 1000 }
        break
      }
    }
    if (fecho) break
  }
  if (!fecho) {
    // fim da janela (ou do histórico): fecha ao último fecho
    const ult = c.velas[Math.min(j, c.velas.length) - 1]
    const p = precoComSpread(s, ult.c)
    ganho += vivo * ((d === 'buy' ? p.bid : p.ask) - precoEntrada) * sinal
    fecho = { motivo: 'tempo', em: ult.t * 1000 }
  }

  // Caminho do preço sem gestão nenhuma (SL original) — MFE e até que TP foi.
  let mfe = 0
  let tpMax = 0
  let tpMaxNaSaida = 0
  let foiAoSeguinte = false
  for (let k = c.i0 + 1; k < c.velas.length; k++) {
    const v = c.velas[k]
    if (v.t > fimSeg) break
    const adv = precoComSpread(s, d === 'buy' ? v.l : v.h)
    const fav = precoComSpread(s, d === 'buy' ? v.h : v.l)
    const xAdv = d === 'buy' ? adv.bid : adv.ask
    if ((xAdv - slOriginal) * sinal <= 0) break
    const xFav = d === 'buy' ? fav.bid : fav.ask
    mfe = Math.max(mfe, ((xFav - precoEntrada) * sinal) / risco)
    for (let n = tpMax; n < niveis.tps.length; n++) {
      if ((xFav - niveis.tps[n]) * sinal >= 0) tpMax = n + 1
      else break
    }
    if (v.t * 1000 <= fecho.em) tpMaxNaSaida = tpMax
    else if (tpMax > tpMaxNaSaida && fecho.motivo !== 'tp') foiAoSeguinte = true
  }

  return {
    R: ganho / (volume * risco),
    motivo: fecho.motivo,
    saidaEm: fecho.em,
    tpMaxPreco: tpMax,
    mfeR: mfe,
    foiAoTpSeguinte: foiAoSeguinte,
    precoEntrada,
    slFinal: sl,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Perfis
// ─────────────────────────────────────────────────────────────────────────────

interface Perfil { nome: string; cfg: (c: Caso) => ConfigSinais; referencia?: boolean }

const pipsAte = (c: Caso, n: number): number => {
  const tp = c.setup.tps[Math.min(n, c.setup.tps.length) - 1]
  return Math.abs(tp - c.setup.entrada) / pipSizeForSymbol(c.setup.symbol)
}

const ACTUAL = 'BE no TP1 (actual)'
const SEM_BE = 'sem BE'
const PERFIS: Perfil[] = [
  { nome: ACTUAL, cfg: () => ({ ...CONFIG_PADRAO }) },
  { nome: 'BE no TP2', cfg: (c) => ({ ...CONFIG_PADRAO, beGatilhoPips: pipsAte(c, 2) }) },
  { nome: 'BE no TP3', cfg: (c) => ({ ...CONFIG_PADRAO, beGatilhoPips: pipsAte(c, 3) }) },
  ...[0.3, 0.5, 0.75, 1].map((f) => ({ nome: `BE a ${f.toFixed(2)}R`, cfg: () => ({ ...CONFIG_PADRAO, beFracaoDoRisco: f }) })),
  { nome: SEM_BE, cfg: () => ({ ...CONFIG_PADRAO, beNoTp1: false }) },
  { nome: 'ref · BE TP1, sem trailing', cfg: () => ({ ...CONFIG_PADRAO, semTrailing: true }), referencia: true },
  { nome: 'ref · BE TP1, trailing arranca a 1R', cfg: () => ({ ...CONFIG_PADRAO, trailingInicioFracaoDoRisco: 1 }), referencia: true },
  { nome: 'ref · sem BE e sem trailing', cfg: () => ({ ...CONFIG_PADRAO, beNoTp1: false, semTrailing: true }), referencia: true },
]

// ─────────────────────────────────────────────────────────────────────────────
// Estatística e tabelas
// ─────────────────────────────────────────────────────────────────────────────

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—')
const sinalR = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${f(x, d)}`
function percentil(xs: number[], p: number): number {
  if (!xs.length) return NaN
  const o = [...xs].sort((a, b) => a - b)
  const i = (o.length - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  return o[lo] + (o[hi] - o[lo]) * (i - lo)
}

interface Linha { nome: string; n: number; win: number; rTot: number; rMed: number; salvou: number; cortou: number; cortouAntesTp: number; motivos: Record<Motivo, number>; dMed: number; t: number }

function medir(p: Perfil, casos: Caso[], res: Map<string, Res>[], base: Map<string, Res>, actual: Map<string, Res>, idx: number): Linha {
  const m = res[idx]
  const rs: number[] = []
  const motivos: Record<Motivo, number> = { sl: 0, be: 0, trailing: 0, tp: 0, tempo: 0 }
  let salvou = 0, cortou = 0, cortouAntesTp = 0
  const difs: number[] = []
  for (const c of casos) {
    const r = m.get(c.setup.id)
    const b = base.get(c.setup.id)
    const a = actual.get(c.setup.id)
    if (!r || !b || !a) continue
    rs.push(r.R)
    motivos[r.motivo]++
    if (p.nome !== SEM_BE) {
      if (r.R > b.R + 0.02) salvou++
      else if (r.R < b.R - 0.02) {
        cortou++
        if (r.foiAoTpSeguinte) cortouAntesTp++
      }
    }
    difs.push(r.R - a.R)
  }
  const n = rs.length
  const rTot = rs.reduce((x, y) => x + y, 0)
  const dMed = difs.reduce((x, y) => x + y, 0) / (difs.length || 1)
  const sd = Math.sqrt(difs.reduce((x, y) => x + (y - dMed) ** 2, 0) / Math.max(1, difs.length - 1))
  const t = sd > 0 ? dMed / (sd / Math.sqrt(difs.length)) : 0
  return { nome: p.nome, n, win: rs.filter((x) => x > 0.02).length / (n || 1), rTot, rMed: rTot / (n || 1), salvou, cortou, cortouAntesTp, motivos, dMed, t }
}

function tabela(ls: Linha[]): string {
  const cab = '| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |'
  const sep = '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'
  const corpo = ls.map((l) => `| ${l.nome} | ${l.n} | ${f(l.win * 100, 0)}% | ${sinalR(l.rTot, 1)} | ${sinalR(l.rMed, 3)} | ${l.nome === ACTUAL ? '—' : `${sinalR(l.dMed, 3)} (${f(l.t, 1)})`} | ${l.nome === SEM_BE ? '—' : l.salvou} | ${l.nome === SEM_BE ? '—' : l.cortou} | ${l.nome === SEM_BE ? '—' : l.cortouAntesTp} | ${l.motivos.sl}/${l.motivos.be}/${l.motivos.trailing}/${l.motivos.tp}/${l.motivos.tempo} |`)
  return [cab, sep, ...corpo].join('\n')
}

const dataPt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('· a ler setups e entradas…')
  const [linhasSetup, linhasHit, simbolosDb] = await Promise.all([
    rest('chat_messages', { select: 'id,created_at,content', content: 'like.*PrimeVerse · *', order: 'created_at.asc' }),
    rest('chat_messages', { select: 'id,created_at,content', content: 'like.✅ ENTRY HIT ·*', order: 'created_at.asc' }),
    rest('funded_symbols', { select: '*', symbol: 'in.(XAUUSD,US30,NAS100)' }),
  ])
  const simbolos: Record<string, Simbolo> = {}
  for (const r of simbolosDb) {
    simbolos[String(r.symbol)] = {
      symbol: String(r.symbol), classe: r.classe as Simbolo['classe'], moeda_lucro: (r.moeda_lucro as string) ?? null,
      digits: Number(r.digits), contract_size: Number(r.contract_size), pip_size: Number(r.pip_size),
      spread_pontos: Number(r.spread_pontos), comissao_lote: Number(r.comissao_lote), volume_min: Number(r.volume_min),
      volume_step: Number(r.volume_step), volume_max: Number(r.volume_max), alavancagem_max: Number(r.alavancagem_max),
    }
  }

  const setups: Setup[] = linhasSetup
    .map((r) => lerSetup(String(r.id), new Date(String(r.created_at)).getTime(), String(r.content)))
    .filter((x): x is Setup => x != null)

  const entradasChat: Entrada[] = []
  for (const r of linhasHit) {
    const c = String(r.content)
    const m = /ENTRY HIT · ([A-Z0-9]+) \S+ (COMPRA|VENDA) · ([A-Za-z0-9_\-.]+)/.exec(c)
    if (!m) continue
    const sl = /SL:\s*([0-9.]+)/.exec(c)
    entradasChat.push({
      em: new Date(String(r.created_at)).getTime(), trader: m[3].toLowerCase(), classe: classeDoSimbolo(m[1]),
      symbol: m[1], direcao: m[2] === 'COMPRA' ? 'buy' : 'sell', sl: sl ? Number(sl[1]) : null, origem: 'chat',
    })
  }
  const journal = lerJournal()
  const entradasJ = entradasDoJournal(journal)
  // O mesmo ENTRY HIT aparece nas duas fontes (a linha do chat é gravada segundos antes do «exec:»).
  const entradas: Entrada[] = [...entradasChat]
  let duplicadas = 0
  for (const e of entradasJ) {
    const igual = entradasChat.find((c) => c.classe === e.classe && Math.abs(c.em - e.em) <= 20_000 && (!e.trader || e.trader === c.trader))
    if (igual) { duplicadas++; continue }
    entradas.push(e)
  }
  entradas.sort((a, b) => a.em - b.em)

  console.log('· a ler velas…')
  const V: Record<string, { m1: Vela[]; m5: Vela[] }> = {}
  for (const sym of Object.keys(TV)) V[sym] = { m1: await velas(sym, '1'), m5: await velas(sym, '5') }

  /** feed no instante (fecho da vela que o contém), M1 se houver, senão M5 */
  const velaEm = (sym: string, ms: number): { tf: '1' | '5'; vs: Vela[]; i: number } | null => {
    const seg = Math.floor(ms / 1000)
    const i1 = indiceDa(V[sym].m1, seg, 60)
    if (i1 >= 0) return { tf: '1', vs: V[sym].m1, i: i1 }
    const i5 = indiceDa(V[sym].m5, seg, 300)
    if (i5 >= 0) return { tf: '5', vs: V[sym].m5, i: i5 }
    return null
  }

  // 1) emparelhamento exacto (chat): trader + símbolo + direcção + SL, setup mais recente antes.
  const usados = new Set<string>()
  const casos: Caso[] = []
  const descartes: { em: number; trader: string; motivo: string }[] = []
  const desvios: Record<string, number[]> = {}
  const pendentesJ: Entrada[] = []
  for (const e of entradas) {
    if (e.origem !== 'chat') { pendentesJ.push(e); continue }
    const cand = setups
      .filter((s) => !usados.has(s.id) && s.trader === e.trader && s.symbol === e.symbol && s.direcao === e.direcao && (e.sl == null || Math.abs(s.sl - e.sl) < 1e-6) && s.em <= e.em + 5_000 && e.em - s.em < 7 * 86400_000)
      .sort((a, b) => b.em - a.em)[0]
    if (!cand) { if (TRADERS.includes(e.trader as never)) descartes.push({ em: e.em, trader: String(e.trader), motivo: 'ENTRY HIT do chat sem setup no chat' }); continue }
    usados.add(cand.id)
    if (!TV[cand.symbol]) continue
    const v = velaEm(cand.symbol, e.em)
    if (!v) { if (TRADERS.includes(cand.trader as never)) descartes.push({ em: e.em, trader: cand.trader, motivo: `sem velas de ${cand.symbol} nesse minuto` }); continue }
    const desvio = v.vs[v.i].c - cand.entrada
    ;(desvios[cand.symbol] ??= []).push(desvio)
    casos.push({ setup: cand, entradaEm: e.em, origem: 'chat', tf: v.tf, velas: v.vs, i0: v.i, desvio })
  }
  const desvioMediano: Record<string, number> = {}
  for (const [s, xs] of Object.entries(desvios)) desvioMediano[s] = percentil(xs, 0.5)

  // 2) journal: o setup (em aberto, mesma classe e trader se conhecido) cuja entrada estava dentro
  //    da vela do ENTRY HIT (com o desfasamento mediano do feed). Ambíguo → fica de fora.
  let ambiguas = 0
  for (const e of pendentesJ) {
    const cands = setups.filter((s) => {
      if (usados.has(s.id) || classeDoSimbolo(s.symbol) !== e.classe || !TV[s.symbol]) return false
      if (e.trader && s.trader !== e.trader) return false
      if (s.em > e.em + 5_000 || e.em - s.em > 7 * 86400_000) return false
      const v = velaEm(s.symbol, e.em)
      if (!v) return false
      const off = desvioMediano[s.symbol] ?? 0
      const lo = v.vs[v.i].l - off, hi = v.vs[v.i].h - off
      const tol = 0.15 * Math.abs(s.entrada - s.sl)
      return s.entrada >= lo - tol && s.entrada <= hi + tol
    })
    if (!cands.length) {
      if (e.trader && TRADERS.includes(e.trader as never)) descartes.push({ em: e.em, trader: e.trader, motivo: 'ENTRY HIT do journal sem setup compatível pelo preço (ou sem velas)' })
      continue
    }
    const traders = new Set(cands.map((c) => c.trader))
    const escolhido = cands.sort((a, b) => b.em - a.em)[0]
    if (traders.size > 1 || cands.filter((c) => c.symbol === escolhido.symbol && c.direcao === escolhido.direcao && Math.abs(c.entrada - escolhido.entrada) > 0.3 * Math.abs(escolhido.entrada - escolhido.sl)).length) {
      ambiguas++
      if ([...traders].some((t) => TRADERS.includes(t as never))) descartes.push({ em: e.em, trader: [...traders].join('/'), motivo: 'ENTRY HIT do journal ambíguo (vários setups possíveis)' })
      continue
    }
    usados.add(escolhido.id)
    const v = velaEm(escolhido.symbol, e.em)!
    casos.push({ setup: escolhido, entradaEm: e.em, origem: 'journal', tf: v.tf, velas: v.vs, i0: v.i, desvio: v.vs[v.i].c - escolhido.entrada })
  }

  const nossos = casos.filter((c) => TRADERS.includes(c.setup.trader as never)).sort((a, b) => a.entradaEm - b.entradaEm)
  console.log(`· ${nossos.length} trades dos 3 traders (${duplicadas} ENTRY HIT em duplicado chat/journal, ${ambiguas} ambíguos)`)

  // Verificação: o ciclo daqui = replicarSinal (M1, 0,10 lote, perfil actual).
  let conferidos = 0, divergentes = 0
  for (const c of nossos.filter((x) => x.tf === '1')) {
    const s = simbolos[c.setup.symbol]
    const meu = replicar(c, s, 10_000, CONFIG_PADRAO)
    const ref = replicarSinal({
      sinal: { id: c.setup.id, referencia: 'x', symbol: s.symbol, direcao: c.setup.direcao, entrada: c.setup.entrada, sl: c.setup.sl, tps: c.setup.tps, entradaEm: c.velas[c.i0].t * 1000 + 1, fechoDaFonteEm: null },
      simbolo: s, saldo: 10_000, cfg: CONFIG_PADRAO, velas: c.velas, ate: c.entradaEm + JANELA_MS,
    })
    if (!meu || ehErro(ref) || !ref.fecho) continue
    conferidos++
    if (Math.abs(ref.slFinal! - (meu.slFinal ?? NaN)) > 1e-6 && meu.motivo !== 'tp') divergentes++
  }
  console.log(`· conferência com replicarSinal: ${conferidos} casos, ${divergentes} divergentes`)

  // Replicar tudo
  const regimes = [{ nome: '0,01 lote (contas de 1 000 — sem parciais)', saldo: 1_000 }, { nome: '0,10 lote (conta da casa de 10 000 — 50% TP1 / 25% TP2)', saldo: 10_000 }]
  const resultados: Map<string, Res>[][] = regimes.map((rg) => PERFIS.map((p) => {
    const m = new Map<string, Res>()
    for (const c of nossos) {
      const r = replicar(c, simbolos[c.setup.symbol], rg.saldo, p.cfg(c))
      if (r) m.set(c.setup.id, r)
    }
    return m
  }))
  const iActual = PERFIS.findIndex((p) => p.nome === ACTUAL)
  const iSemBe = PERFIS.findIndex((p) => p.nome === SEM_BE)

  const anuncios = anunciosDoJournal(journal)

  // ── relatório ──────────────────────────────────────────────────────────────
  const md: string[] = []
  md.push('# Perfil do break-even — MTM Auto Edge / King / Wolf', '')
  md.push(`Gerado por \`scripts/estudos/perfil-pv-traders.ts\` em ${dataPt(Date.now())} UTC. Só leitura.`, '')
  md.push('> **Ressalva primeiro.** A amostra é de semanas, não de meses, e cada trade é replicado em velas do TradingView — não são fills reais. Nenhuma diferença abaixo é estatisticamente sólida se o t da coluna «Δ vs actual» estiver entre −2 e +2. Os fechos e BE anunciados pelo trader não entram (não há histórico fiável com hora e setup).', '')
  md.push('## Como se mediu', '')
  md.push('- **Gestão actual** (confirmada em `mtmauto_providers.sinais_config` das três — igual a `CONFIG_PADRAO`): saídas 50% no TP1 e 25% no TP2; BE no TP1 com +2 pips; trailing a 0,5×risco, a arrancar à distância do TP1. Numa conta de 0,01 lote não há parciais e o BE passa a `be_gatilho` = distância ao TP1.')
  md.push('- **Motor de produção**: `niveisAncorados` + `gestaoDoSinal` + `decidirGestao`; ordem SL → gestão → TP por tick; o stop ganha na mesma vela; a posição abre ao fecho da vela do ENTRY HIT (+spread) e só é avaliada a partir da vela seguinte; janela de 72 h (depois fecha a mercado, «tempo»).')
  md.push(`- **Conferência** com \`replicarSinal\` (lib/mtmfunded/reconstituicao.ts) nos casos em M1: ${conferidos} casos, ${divergentes} com SL final diferente.`)
  md.push('- **R** = soma das partes (volume × diferença de preço, spread incluído) ÷ (volume inicial × risco ancorado). **% vit.** = R > +0,02.')
  md.push('- **salvou / cortou**: trade a trade contra «sem BE» (o mesmo trailing): o perfil deu mais (salvou) ou menos (cortou) R. **…e o preço foi ao TP seguinte**: dos cortados, quantos viram o preço chegar, depois da nossa saída e antes do SL original, a um TP acima do último que tinham visto.')
  md.push('- **Δ vs actual (t)**: diferença média de R por trade contra o perfil actual, emparelhada, e o t dessa média. |t| < 2 = não se distingue do ruído.', '')

  md.push('## Amostra e janela', '')
  md.push(`- Setups PrimeVerse no chat (todos os traders): ${setups.length}. ENTRY HIT: ${entradasChat.length} no chat + ${entradasJ.length} no journal (${duplicadas} são o mesmo evento). Journal ambíguo: ${ambiguas}.`)
  md.push(`- Desfasamento mediano feed − entrada do sinal no minuto do ENTRY HIT (casos exactos do chat): ${Object.entries(desvioMediano).map(([s, x]) => `${s} ${sinalR(x, 2)} (n=${desvios[s].length}, p10–p90 ${f(percentil(desvios[s], 0.1))}…${f(percentil(desvios[s], 0.9))})`).join(' · ')}. Os níveis são ancorados ao preço do feed, por isso o R não depende disto; só o emparelhamento pelo preço depende.`, '')
  md.push('**Porque é que várias linhas das tabelas saem iguais a «sem BE».** O trailing actual arranca à distância do TP1 e segue a 0,5R: quando o preço chega a +0,5R (+ a folga de 2 pips), o próprio trailing já pôs o stop na entrada. Um BE que arme DEPOIS disso (TP2, TP3, 0,75R, 1R — e o 0,5R quase sempre) nunca mexe no stop. Com este trailing fixo, a única decisão real sobre o BE é **se protege a faixa entre o TP1 e +0,5R** (BE no TP1 / 0,3R) **ou não** (todo o resto).', '')
  md.push(`**Índices da Edge:** desde 20/08 o relay registou ${entradasJ.filter((e) => e.classe === 'indice' && e.em >= Date.UTC(2026, 7, 20)).length} ENTRY HIT de índices (o chat tem ${entradasChat.filter((e) => e.classe === 'indice').length}), contra ${setups.filter((s) => s.trader === 'fxedge' && classeDoSimbolo(s.symbol) === 'indice' && s.em >= Date.UTC(2026, 7, 20)).length} setups de US30/NAS100 do fxedge. Sem ENTRY HIT a estratégia não abre — ao vivo, a Edge é praticamente só ouro — e aqui não há amostra de índices para medir.`, '')
  md.push('| estratégia | trader | trades | janela | XAUUSD / US30 / NAS100 | fonte (chat / journal) | M1 / M5 | risco mediano |', '|---|---|---:|---|---|---|---|---|')
  for (const t of TRADERS) {
    const cs = nossos.filter((c) => c.setup.trader === t)
    const porS = ['XAUUSD', 'US30', 'NAS100'].map((s) => cs.filter((c) => c.setup.symbol === s).length).join(' / ')
    const risco = ['XAUUSD', 'US30', 'NAS100'].map((s) => {
      const xs = cs.filter((c) => c.setup.symbol === s).map((c) => Math.abs(c.setup.entrada - c.setup.sl) / pipSizeForSymbol(s))
      return xs.length ? `${s} ${f(percentil(xs, 0.5), 0)} ${s === 'XAUUSD' ? 'pips' : 'pts'}` : null
    }).filter(Boolean).join(' · ')
    md.push(`| ${ESTRATEGIA[t]} | ${t} | ${cs.length} | ${cs.length ? `${dataPt(cs[0].entradaEm).slice(0, 10)} → ${dataPt(cs[cs.length - 1].entradaEm).slice(0, 10)}` : '—'} | ${porS} | ${cs.filter((c) => c.origem === 'chat').length} / ${cs.filter((c) => c.origem === 'journal').length} | ${cs.filter((c) => c.tf === '1').length} / ${cs.filter((c) => c.tf === '5').length} | ${risco || '—'} |`)
  }
  md.push('')
  const porMotivo = new Map<string, number>()
  for (const d of descartes) porMotivo.set(`${d.trader} · ${d.motivo}`, (porMotivo.get(`${d.trader} · ${d.motivo}`) ?? 0) + 1)
  if (porMotivo.size) {
    md.push('**Fora da amostra:**', '')
    for (const [k, n] of porMotivo) md.push(`- ${k}: ${n}`)
    md.push('')
  }

  for (const t of TRADERS) {
    const cs = nossos.filter((c) => c.setup.trader === t)
    md.push(`## ${ESTRATEGIA[t]} (${t}) — ${cs.length} trades`, '')
    if (cs.length < 5) { md.push('Amostra insuficiente para medir.', ''); continue }

    // perfil do caminho do preço (independente da gestão)
    const base = resultados[1][iActual]
    const mfe = cs.map((c) => base.get(c.setup.id)?.mfeR).filter((x): x is number => x != null)
    const tpMax = cs.map((c) => base.get(c.setup.id)?.tpMaxPreco).filter((x): x is number => x != null)
    const nTps = percentil(cs.map((c) => c.setup.tps.length), 0.5)
    const distTp = (i: number) => percentil(cs.filter((c) => c.setup.tps[i] != null).map((c) => Math.abs(c.setup.tps[i] - c.setup.entrada) / Math.abs(c.setup.entrada - c.setup.sl)), 0.5)
    md.push(`**Alvos do sinal** (mediana, em R): ${[0, 1, 2, 3, 4].map((i) => `TP${i + 1} ${f(distTp(i))}R`).join(' · ')} — ${f(nTps, 0)} alvos por sinal.`, '')
    md.push(`**MFE antes do SL original** (em R): p25 ${f(percentil(mfe, 0.25))} · p50 ${f(percentil(mfe, 0.5))} · p75 ${f(percentil(mfe, 0.75))} · p90 ${f(percentil(mfe, 0.9))}.`, '')
    const dist = [0, 1, 2, 3, 4, 5].map((k) => tpMax.filter((x) => x === k).length)
    md.push('**Até que TP o preço foi antes do SL original** (72 h):', '')
    md.push('| último TP tocado | nenhum | TP1 | TP2 | TP3 | TP4 | TP5 |', '|---|---:|---:|---:|---:|---:|---:|')
    md.push(`| trades | ${dist.join(' | ')} |`)
    md.push(`| % acumulada «chegou pelo menos a» | 100% | ${[1, 2, 3, 4, 5].map((k) => `${f((tpMax.filter((x) => x >= k).length / (tpMax.length || 1)) * 100, 0)}%`).join(' | ')} |`, '')
    const an = anuncios.filter((a) => a.trader === t)
    if (an.length) {
      const porSetup = new Map<string, AnuncioTp[]>()
      for (const a of an) {
        const k = `${a.symbol}:${a.direcao}:${a.entrada}:${a.sl}`
        porSetup.set(k, [...(porSetup.get(k) ?? []), a])
      }
      md.push(`**Anunciado pelo trader** (journal, só 15/09 19:43 → 16/09 18:19): ${[...porSetup.entries()].map(([k, xs]) => `${k.split(':').slice(0, 2).join(' ')} @${k.split(':')[2]} → ${xs.map((x) => (x.nivel === 'SL' ? 'SL' : `TP${x.nivel}`)).join(', ')}`).join(' · ')}.`, '')
    }

    for (const [ri, rg] of regimes.entries()) {
      md.push(`### ${rg.nome}`, '')
      const ls = PERFIS.map((p, i) => medir(p, cs, resultados[ri], resultados[ri][iSemBe], resultados[ri][iActual], i))
      md.push(tabela(ls), '')
    }

    // por símbolo (Edge tem ouro e índices)
    const simbolosDoTrader = [...new Set(cs.map((c) => c.setup.symbol))]
    if (simbolosDoTrader.length > 1) {
      md.push('### Por símbolo (0,01 lote, R médio por trade)', '')
      md.push(`| perfil | ${simbolosDoTrader.map((s) => `${s} (n=${cs.filter((c) => c.setup.symbol === s).length})`).join(' | ')} |`, `|---|${simbolosDoTrader.map(() => '---:').join('|')}|`)
      for (const [i, p] of PERFIS.entries()) {
        if (p.referencia) continue
        md.push(`| ${p.nome} | ${simbolosDoTrader.map((s) => sinalR(medir(p, cs.filter((c) => c.setup.symbol === s), resultados[0], resultados[0][iSemBe], resultados[0][iActual], i).rMed, 3)).join(' | ')} |`)
      }
      md.push('')
    }

    // controlo de resolução e estabilidade
    const m1 = cs.filter((c) => c.tf === '1')
    const meio = cs[Math.floor(cs.length / 2)]?.entradaEm ?? 0
    md.push('### Controlo (0,01 lote, R médio por trade)', '')
    md.push(`| perfil | só M1 (n=${m1.length}) | 1.ª metade (n=${cs.filter((c) => c.entradaEm < meio).length}) | 2.ª metade (n=${cs.filter((c) => c.entradaEm >= meio).length}) |`, '|---|---:|---:|---:|')
    for (const [i, p] of PERFIS.entries()) {
      if (p.referencia) continue
      const r = (sub: Caso[]) => (sub.length ? sinalR(medir(p, sub, resultados[0], resultados[0][iSemBe], resultados[0][iActual], i).rMed, 3) : '—')
      md.push(`| ${p.nome} | ${r(m1)} | ${r(cs.filter((c) => c.entradaEm < meio))} | ${r(cs.filter((c) => c.entradaEm >= meio))} |`)
    }
    md.push('')
  }

  // ── posições reais das estratégias (não as RECONST) ────────────────────────
  const reais = await rest('funded_positions', {
    select: 'account_id,symbol,direcao,volume,volume_inicial,preco_entrada,sl,tp,preco_fecho,pnl,motivo_fecho,aberta_em,fechada_em,comentario,be_gatilho,be_offset,be_no_tp1,be_feito,trailing_ativacao,trailing_distancia,tps,risco_inicial',
    comentario: 'in.(MTM Auto Edge,MTM Auto King,MTM Auto Wolf)',
    order: 'aberta_em.asc',
  })
  md.push('## Posições reais (funded_positions, comentário «MTM Auto …»)', '')
  md.push('As linhas «RECONST · …» das contas do dono são histórico reconstituído com uma configuração anterior e não entram aqui. Uma posição com parciais aparece em várias linhas (a parte fechada fica com `motivo_fecho = tp_parcial`).', '')
  md.push('| conta | estratégia | aberta → fechada (UTC) | vol. | entrada | SL final | TP | fecho | motivo | pnl | BE (gatilho/offset/no TP1/feito) | trailing (arranque/distância) | máx. favorável no feed até ao fecho |', '|---|---|---|---:|---:|---:|---:|---:|---|---:|---|---|---:|')
  for (const r of reais) {
    const sym = String(r.symbol)
    let maxFav = '—'
    if (V[sym]) {
      const ab = new Date(String(r.aberta_em)).getTime() / 1000
      const fe = new Date(String(r.fechada_em ?? Date.now())).getTime() / 1000
      const xs = V[sym].m1.filter((v) => v.t >= Math.floor(ab / 60) * 60 && v.t <= fe)
      if (xs.length) maxFav = String(r.direcao) === 'buy' ? `${Math.max(...xs.map((v) => v.h))} (máx.)` : `${Math.min(...xs.map((v) => v.l))} (mín.)`
    }
    md.push(`| ${String(r.account_id).slice(0, 8)} | ${r.comentario} | ${dataPt(new Date(String(r.aberta_em)).getTime()).slice(5)} → ${r.fechada_em ? new Date(String(r.fechada_em)).toISOString().slice(11, 19) : 'aberta'} | ${r.volume}${r.volume_inicial ? ` de ${r.volume_inicial}` : ''} | ${r.preco_entrada} | ${r.sl} | ${r.tp} | ${r.preco_fecho ?? '—'} | ${r.motivo_fecho ?? '—'} | ${r.pnl ?? '—'} | ${r.be_gatilho ?? '—'}/${r.be_offset ?? '—'}/${r.be_no_tp1 ? 'sim' : 'não'}/${r.be_feito ? 'sim' : 'não'} | ${r.trailing_ativacao ?? '—'}/${r.trailing_distancia ?? '—'} | ${maxFav} |`)
  }
  md.push('')

  // ── o caso que motivou o estudo ────────────────────────────────────────────
  {
    const janela = (sym: string, de: string, ate: string) => V[sym].m1.filter((v) => v.t >= Date.parse(de) / 1000 && v.t <= Date.parse(ate) / 1000)
    const ouroAte = janela('XAUUSD', '2026-09-16T19:48:00Z', '2026-09-16T19:52:00Z')
    const ouroDepois = janela('XAUUSD', '2026-09-16T19:52:00Z', '2026-09-16T19:56:00Z')
    const ouroFecho = janela('XAUUSD', '2026-09-16T19:52:00Z', '2026-09-16T20:26:00Z')
    const us30 = janela('US30', '2026-09-16T19:53:00Z', '2026-09-16T19:56:00Z')
    if (ouroAte.length && ouroDepois.length && us30.length) {
      md.push('## O caso de 16/09 19:48 (Edge, conta 6e06d33e)', '')
      md.push('- **Sinal** fxedge: compra XAUUSD, entrada 4268, SL 4258 (100 pips), TP1…TP5 = 4271 / 4274 / 4277 / 4280 / 4283 (+30 pips cada, TP1 = 0,3R).')
      md.push('- **Abertura** 19:48:00 a 4266,06 (o ENTRY HIT chegou com o preço 1,94 abaixo da entrada). Níveis ancorados: SL 4256,06, TPs 4269,06…4281,06.')
      md.push('- **Gestão gravada** (0,01 lote → sem parciais): `be_gatilho` 3,00 (= distância ao TP1) com `be_offset` 0,20; `trailing_ativacao` 3,00 e `trailing_distancia` 5,00 (= 0,5 × risco de 10,00).')
      md.push(`- **O que fechou**: não foi o BE (esse põe o stop em 4266,26). O stop final 4270,94 = 4275,94 − 5,00: o **trailing** seguiu o bid até 4275,94 (feed: máximo ${Math.max(...ouroAte.map((v) => v.h))} entre 19:48 e 19:51) e o preço voltou a 4270,94 às 19:52:02 → +4,88 USD = **+0,49R**. A conta da casa (0,10) fez o mesmo com parciais: 0,05 no TP1, 0,02 no TP2, 0,03 no trailing = +41,64 USD (+0,42R).`)
      md.push(`- **O que o preço fez a seguir**: entre 19:52 e 19:56 o ouro andou entre ${Math.min(...ouroDepois.map((v) => v.l))} e ${Math.max(...ouroDepois.map((v) => v.h))}; o TP3 (4277) e o TP4 (4280) do trader **nunca foram tocados no feed** nessa tarde. Até ao «CLOSED» do trader (20:26) o ouro desceu a ${Math.min(...ouroFecho.map((v) => v.l))} — a um passo do SL dele (4258). Quem ficasse até ao fecho do trader (≈4259) saía perto de −0,7R na nossa entrada.`)
      md.push(`- **Os «TP HIT» das 19:53–19:55**: o journal tem 5 respostas \`tp_hit\` da Edge nesses minutos, mas não guarda o símbolo. No mesmo intervalo o **US30 do mesmo trader** (compra 51420 às 19:49, TPs a +30 pontos) subia no feed de ${Math.min(...us30.map((v) => v.l))} a ${Math.max(...us30.map((v) => v.h))} — com o desfasamento de ~+35 pontos da corretora dele, isso atravessa o TP1–TP3 do US30. É muito provável que pelo menos parte desses anúncios seja do US30 e não do ouro. O US30 não abriu na Edge (não houve ENTRY HIT).`)
      md.push('- **Conclusão do caso**: a nossa gestão não saiu cedo em relação ao preço — saiu perto do topo do movimento. O BE não entrou na decisão.', '')
    }
  }

  // ── os anúncios de TP do trader batem com o preço? ─────────────────────────
  if (anuncios.length) {
    md.push('## Os «TP HIT» do trader contra o preço do feed', '')
    md.push('Para cada anúncio com nível (journal, «SHADOW TP_HIT»): o melhor preço do feed M1 entre o setup e o anúncio, e se esse preço chegou ao nível anunciado. No US30 o feed anda ~30 pontos ao lado da corretora do trader, por isso lá a coluna «chegou?» vale pouco.', '')
    md.push('| anúncio (UTC) | trader | setup | nível | preço do nível | melhor preço no feed até ao anúncio | chegou? |', '|---|---|---|---|---:|---:|---|')
    for (const a of anuncios) {
      const st = setups.filter((s) => s.trader === a.trader && s.symbol === a.symbol && s.direcao === a.direcao && s.entrada === a.entrada && s.sl === a.sl && s.em <= a.em).sort((x, y) => y.em - x.em)[0]
      if (!st || !V[a.symbol] || a.nivel === 'SL') continue
      const nivel = st.tps[a.nivel - 1]
      const xs = V[a.symbol].m1.filter((v) => v.t * 1000 >= st.em - 60_000 && v.t * 1000 <= a.em)
      if (!xs.length || nivel == null) continue
      const melhor = a.direcao === 'buy' ? Math.max(...xs.map((v) => v.h)) : Math.min(...xs.map((v) => v.l))
      const chegou = (melhor - nivel) * (a.direcao === 'buy' ? 1 : -1) >= 0
      md.push(`| ${dataPt(a.em)} | ${a.trader} | ${a.symbol} ${a.direcao} @${a.entrada} | TP${a.nivel} | ${nivel} | ${melhor} | ${chegou ? 'sim' : '**não**'} |`)
    }
    md.push('')
  }

  // Lista dos trades (auditável)
  md.push('## Anexo — trades replicados (0,01 lote)', '')
  md.push('| entrada (UTC) | trader | símbolo | dir. | entrada / SL / último TP | fonte | tf | MFE R | TP máx. | actual R (saída) | sem BE R | BE 0,50R R |', '|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|')
  const i50 = PERFIS.findIndex((p) => p.nome === 'BE a 0.50R')
  for (const c of nossos) {
    const a = resultados[0][iActual].get(c.setup.id)
    const b = resultados[0][iSemBe].get(c.setup.id)
    const h = resultados[0][i50].get(c.setup.id)
    if (!a || !b || !h) continue
    md.push(`| ${dataPt(c.entradaEm)} | ${c.setup.trader} | ${c.setup.symbol} | ${c.setup.direcao} | ${c.setup.entrada} / ${c.setup.sl} / ${c.setup.tps[c.setup.tps.length - 1]} | ${c.origem} | M${c.tf} | ${f(a.mfeR)} | ${a.tpMaxPreco} | ${sinalR(a.R)} (${a.motivo}) | ${sinalR(b.R)} (${b.motivo}) | ${sinalR(h.R)} (${h.motivo}) |`)
  }
  md.push('')

  mkdirSync(resolve(__dirname, '../../docs'), { recursive: true })
  writeFileSync(SAIDA, md.join('\n'))
  console.log(`→ ${SAIDA}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
