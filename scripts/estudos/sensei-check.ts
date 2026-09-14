/**
 * Banco de ensaio do MTM Sensei (porte TS) com velas REAIS.
 *
 *   npx tsx scripts/estudos/sensei-check.ts [--tv <pasta com CSV do TradingView>]
 *
 * 1. Lê XAUUSD M15 e M5 (~1500 velas) da MESMA fonte do WebTrader: o histórico da MetaApi via uma
 *    conta provider (a rota /api/mtmfunded/simulado/velas não exporta helper, por isso a lógica é
 *    replicada aqui — com uma diferença: guardamos o tickVolume, que a rota deita fora).
 *    H4 para o filtro HTF e M1 para o delta real.
 * 2. Imprime os últimos 10 sinais e a checklist da última barra.
 * 3. Com --tv, corre também sobre os CSV do TradingView (OANDA:XAUUSD, exportados pelo MCP
 *    tradingview) e compara DEMA/ATR/RSI/ADX por vela comum entre as duas fontes e com uma
 *    implementação independente e ingénua (recursão direta, sem o código de lib/estudos).
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { calcularSensei } from '../../lib/estudos/sensei'
import type { ResultadoSensei, Vela } from '../../lib/estudos/sensei'

for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const MERCADO = 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai'
const TFMAP: Record<string, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '1h', H4: '4h' }

async function contaEFonte(symbol: string) {
  const { getSupabaseAdmin } = await import('../../lib/supabase-admin-client')
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('mtm_trading_accounts').select('metaapi_account_id').eq('tipo', 'provider').not('metaapi_account_id', 'is', null)
  const { data: s } = await sb.from('funded_symbols').select('simbolo_fonte').eq('symbol', symbol).maybeSingle()
  const fonte = String(s?.simbolo_fonte || symbol)
  const contas = [...new Set((data ?? []).map((d) => d.metaapi_account_id as string))]
  // A rota usa a PRIMEIRA conta provider. Aqui regista-se se essa serve e, se não, procura uma que sirva.
  for (const [k, conta] of contas.entries()) {
    for (const simb of [fonte, symbol]) {
      const url = `${MERCADO}/users/current/accounts/${conta}/historical-market-data/symbols/${encodeURIComponent(simb)}/timeframes/15m/candles?limit=2`
      const r = await fetch(url, { headers: { 'auth-token': process.env.METAAPI_TOKEN! } }).catch(() => null)
      if (r?.ok) {
        if (k > 0 || simb !== fonte) console.log(`AVISO: a 1.ª conta provider (${contas[0]?.slice(0, 8)}…) com ${fonte} não serve histórico; usada ${conta.slice(0, 8)}… com ${simb}`)
        return { conta, fonte: simb }
      }
    }
  }
  throw new Error('nenhuma conta provider serve histórico de ' + symbol)
}

async function velasMetaApi(conta: string, fonte: string, tf: string, total: number): Promise<Vela[]> {
  const out = new Map<number, Vela>()
  let ate = Date.now()
  while (out.size < total) {
    const url = `${MERCADO}/users/current/accounts/${conta}/historical-market-data/symbols/${encodeURIComponent(fonte)}/timeframes/${TFMAP[tf]}/candles?startTime=${new Date(ate).toISOString()}&limit=1000`
    const r = await fetch(url, { headers: { 'auth-token': process.env.METAAPI_TOKEN! } })
    if (!r.ok) throw new Error(`MetaApi ${tf} ${r.status} ${await r.text()}`)
    const lote = (await r.json()) as Array<Record<string, unknown>>
    if (!lote.length) break
    let minT = Infinity
    for (const v of lote) {
      const t = Math.floor(new Date(String(v.time)).getTime() / 1000)
      out.set(t, { t, o: +v.open!, h: +v.high!, l: +v.low!, c: +v.close!, v: Number(v.tickVolume ?? v.volume ?? 0) })
      minT = Math.min(minT, t)
    }
    if (lote.length < 2 || minT * 1000 >= ate) break
    ate = minT * 1000
  }
  return [...out.values()].sort((a, b) => a.t - b.t).slice(-total)
}

const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ')

function imprimir(nome: string, velas: Vela[], r: ResultadoSensei) {
  console.log(`\n══ ${nome}: ${velas.length} velas ${iso(velas[0].t)} → ${iso(velas[velas.length - 1].t)} | mintick ${r.mintick} | tf ${r.tfSegundos}s`)
  console.log(`   sinais: ${r.sinais.length} | estrutura: ${r.estrutura.length} | OB: ${r.orderBlocks.length}`)
  for (const s of r.sinais.slice(-10)) {
    const n = s.niveis
    console.log(`   ${iso(s.t)}  ${s.lado.padEnd(4)} «${s.texto}»  E ${n.entry}  SL ${n.sl}  TP ${n.tp1}/${n.tp2}/${n.tp3}/${n.tp4}`)
  }
  const u = r.ultima!
  const bias = u.bullScore >= u.bearScore
  const x = bias ? u.bull : u.bear
  const k = (b: boolean) => (b ? '✅' : '❌')
  console.log(`   CHECKLIST ${bias ? 'BULL' : 'BEAR'} ${bias ? u.bullScore : u.bearScore}/20 · ${r.inputs.tradeStyle} · ${u.phaseMode} (auto ${u.autoOn})`)
  console.log(`     TENDENCIA ${k(x.A1)} DEMA15>50 ${k(x.A2)} 50>238 ${k(x.A3)} Slope ${k(x.A5)} P>DEMA`)
  console.log(`     MOM/OF    ${k(u.bull.B1)} Vol ${k(x.B5)} OFΔ ${k(u.bull.B3)} ADX>${u.effAdx} ${k(x.C5)} Imbal`)
  console.log(`     ESTRUTURA ${k(x.C1)} OS ${k(x.C2)} CHoCH ${k(x.C3)} BOS ${k(x.C4)} POC`)
  console.log(`     FASE/VOL  ${k(x.D1)} Cloud ${k(x.D3)} Fase ${k(u.bull.D5)} Volsafe ${k(x.D4)} Pressao`)
  console.log(`     FILTROS   ${k(bias ? u.htfBuyOK : u.htfSellOK)} HTF ${k(u.inSess)} Sessao ${k(u.chopOK)} Anti-chop ${k(u.ltfValid)} OF-LTF`)
  console.log(`     GATILHO   ${(bias ? u.baseBuy : u.baseSell) ? 'ativo' : 'sem gatilho'} | cooldown ${u.cooldown ? 'ok' : u.cooldownRestante}`)
  console.log(`   CONFIRMACOES grupos bull ${u.grupos.bull.join('/')} bear ${u.grupos.bear.join('/')} | trade ${u.tradeAtiva ? `${u.curPos} ${u.entry} SL ${u.effSl}` : '— A aguardar sinal —'} | WR ${u.stWr.toFixed(1)}% ${u.stAvgR.toFixed(2)}R (${u.stTotal})`)
  console.log(`   último: DEMA15 ${r.series.dema15.at(-1)!.toFixed(3)} DEMA50 ${r.series.dema50.at(-1)!.toFixed(3)} DEMA238 ${r.series.dema238.at(-1)!.toFixed(3)} ATR ${u.atr.toFixed(3)} RSI ${u.rsi.toFixed(2)} ADX ${u.adx.toFixed(2)} HTF ${r.series.htfEma.at(-1)!.toFixed(3)}`)
}

// ── implementação independente (ingénua) para cruzar DEMA/ATR ──
function emaIngenua(x: number[], n: number): number[] {
  const out: number[] = []
  let prev = NaN
  let buf: number[] = []
  for (const v of x) {
    if (Number.isNaN(v)) { out.push(NaN); buf = []; prev = NaN; continue }
    if (Number.isNaN(prev)) {
      buf.push(v)
      if (buf.length > n) buf.shift()
      if (buf.length === n) prev = buf.reduce((a, b) => a + b, 0) / n
      out.push(prev)
    } else { prev = (2 / (n + 1)) * v + (1 - 2 / (n + 1)) * prev; out.push(prev) }
  }
  return out
}
function cruzarIngenuo(velas: Vela[], r: ResultadoSensei) {
  const c = velas.map((v) => v.c)
  const e1 = emaIngenua(c, 238)
  const e2 = emaIngenua(e1, 238)
  let maxD = 0
  e1.forEach((v, i) => { const d = 2 * v - e2[i]; if (!Number.isNaN(d)) maxD = Math.max(maxD, Math.abs(d - r.series.dema238[i])) })
  let prev = NaN
  let maxA = 0
  velas.forEach((v, i) => {
    const tr = i === 0 ? v.h - v.l : Math.max(v.h - v.l, Math.abs(v.h - velas[i - 1].c), Math.abs(v.l - velas[i - 1].c))
    if (i === 13) prev = velas.slice(0, 14).reduce((s, w, j) => s + (j === 0 ? w.h - w.l : Math.max(w.h - w.l, Math.abs(w.h - velas[j - 1].c), Math.abs(w.l - velas[j - 1].c))), 0) / 14
    else if (i > 13) prev = (prev * 13 + tr) / 14
    if (i >= 13) maxA = Math.max(maxA, Math.abs(prev - r.series.atr[i]))
  })
  console.log(`   independente: |ΔDEMA238| máx ${maxD.toExponential(2)} | |ΔATR14| máx ${maxA.toExponential(2)}`)
}

function lerCsvTv(f: string): Vela[] {
  return readFileSync(f, 'utf8').trim().split('\n').slice(1).map((ln) => {
    const [t, o, h, l, c, v] = ln.split(',')
    return { t: Date.parse(t.replace(' ', 'T') + 'Z') / 1000, o: +o, h: +h, l: +l, c: +c, v: +v }
  })
}

function compararFontes(nome: string, a: { velas: Vela[]; r: ResultadoSensei }, b: { velas: Vela[]; r: ResultadoSensei }) {
  const ib = new Map(b.velas.map((v, i) => [v.t, i]))
  const campos = ['dema15', 'dema50', 'dema238', 'atr', 'rsi', 'adx'] as const
  const soma: Record<string, number[]> = {}
  let comuns = 0
  let offsetT = 0
  // a MetaApi dá hora do servidor em UTC; se não houver velas comuns tenta desvios de hora inteira
  for (const off of [0, 3600, -3600, 7200, -7200, 10800, -10800]) {
    const n = a.velas.filter((v) => ib.has(v.t + off)).length
    if (n > comuns) { comuns = n; offsetT = off }
  }
  let scoreIgual = 0
  let scoreTot = 0
  a.velas.forEach((v, i) => {
    const j = ib.get(v.t + offsetT)
    if (j == null) return
    for (const f of campos) {
      const x = a.r.series[f][i], y = b.r.series[f][j]
      if (Number.isNaN(x) || Number.isNaN(y)) continue
      ;(soma[f] ??= []).push(Math.abs(x - y))
    }
    if (i > 600) { scoreTot++; if (a.r.series.bullScore[i] === b.r.series.bullScore[j]) scoreIgual++ }
  })
  console.log(`\n══ ${nome}: ${comuns} velas comuns (desvio de hora ${offsetT / 3600}h)`)
  for (const f of campos) {
    const d = soma[f] ?? []
    if (!d.length) continue
    const med = d.reduce((s, x) => s + x, 0) / d.length
    console.log(`   ${f.padEnd(8)} |Δ| médio ${med.toFixed(4)}  máx ${Math.max(...d).toFixed(4)}`)
  }
  console.log(`   bull_score igual em ${scoreIgual}/${scoreTot} velas (${((100 * scoreIgual) / Math.max(1, scoreTot)).toFixed(1)}%)`)
  const sa = new Set(a.r.sinais.map((s) => `${s.t + offsetT}${s.lado}`))
  const sb = b.r.sinais.filter((s) => s.t >= a.velas[600].t + offsetT && s.t <= a.velas.at(-1)!.t + offsetT)
  console.log(`   sinais TradingView na janela comum: ${sb.length}; também na MetaApi: ${sb.filter((s) => sa.has(`${s.t}${s.lado}`)).length}`)
}

async function main() {
  const tvDir = process.argv.includes('--tv') ? process.argv[process.argv.indexOf('--tv') + 1] : null
  const { conta, fonte } = await contaEFonte('XAUUSD')
  console.log(`fonte MetaApi: conta ${conta?.slice(0, 8)}… símbolo ${fonte}`)
  const [m15, m5, h4, m1] = await Promise.all([
    velasMetaApi(conta, fonte, 'M15', 1500),
    velasMetaApi(conta, fonte, 'M5', 1500),
    velasMetaApi(conta, fonte, 'H4', 400),
    velasMetaApi(conta, fonte, 'M1', 3000),
  ])
  const extra = { velasHTF: h4, velasLTF: m1 }
  const r15 = calcularSensei(m15, { simbolo: 'XAUUSD' }, extra)
  imprimir('MetaApi XAUUSD M15', m15, r15)
  cruzarIngenuo(m15, r15)
  const r5 = calcularSensei(m5, { simbolo: 'XAUUSD' }, extra)
  imprimir('MetaApi XAUUSD M5', m5, r5)
  const r15s = calcularSensei(m15, { simbolo: 'XAUUSD', allowSell: true }, extra)
  console.log(`\n   (com allowSell=true o M15 dá ${r15s.sinais.length} sinais: ${r15s.sinais.slice(-5).map((s) => `${iso(s.t)} ${s.lado} ${s.texto}`).join(' | ')})`)

  if (tvDir && existsSync(`${tvDir}/OANDAXAUUSD_15m.csv`)) {
    const tv15 = lerCsvTv(`${tvDir}/OANDAXAUUSD_15m.csv`)
    const tvh4 = lerCsvTv(`${tvDir}/OANDAXAUUSD_4h.csv`)
    const tvm1 = existsSync(`${tvDir}/OANDAXAUUSD_1.csv`) ? lerCsvTv(`${tvDir}/OANDAXAUUSD_1.csv`) : undefined
    const rtv = calcularSensei(tv15, { simbolo: 'XAUUSD' }, { velasHTF: tvh4, velasLTF: tvm1 })
    imprimir('TradingView OANDA:XAUUSD M15 (dados TV, motor TS)', tv15, rtv)
    cruzarIngenuo(tv15, rtv)
    compararFontes('M15 MetaApi vs OANDA (mesmo motor)', { velas: m15, r: r15 }, { velas: tv15, r: rtv })
    if (existsSync(`${tvDir}/OANDAXAUUSD_5m.csv`)) {
      const tv5 = lerCsvTv(`${tvDir}/OANDAXAUUSD_5m.csv`)
      const rtv5 = calcularSensei(tv5, { simbolo: 'XAUUSD' }, { velasHTF: tvh4, velasLTF: tvm1 })
      imprimir('TradingView OANDA:XAUUSD M5', tv5, rtv5)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
