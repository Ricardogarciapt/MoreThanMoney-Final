/**
 * BACKTEST dos gatilhos de scalping (os estudos da casa) com velas REAIS da Bybit.
 *
 *   npx tsx lib/cripto/scalp-backtest.ts                 # BTC, ETH, SOL · 5 min · 30 dias
 *   npx tsx lib/cripto/scalp-backtest.ts 1 14 BTCUSDT    # 1 min · 14 dias · só BTC
 *
 * Usa o MESMO código que o agente corre ao vivo (lib/cripto/scalp.ts) e os custos do papel
 * (taxa taker dos perps nos dois lados). Só lê a API pública da Bybit: sem chaves, sem ordens.
 * Escreve o resumo em JSON na pasta temporária do sistema (o caminho sai no fim).
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ESTUDOS_SCALP, resumirBacktest, simularScalp, sinaisScalp, type ResumoBacktest } from './scalp'
import type { Vela } from './tipos'

const [intervaloArg, diasArg, ...simbolosArg] = process.argv.slice(2)
const INTERVALO = Number(intervaloArg ?? 5)
const DIAS = Number(diasArg ?? 30)
const SIMBOLOS = simbolosArg.length ? simbolosArg : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
/** ~4 h em velas: um scalp que não resolveu nisto já não é scalp. */
const VELAS_MAX = Math.round(240 / INTERVALO)

async function velasHistoricas(symbol: string): Promise<Vela[]> {
  const fim = Date.now()
  const inicio = fim - DIAS * 86_400_000
  const passo = INTERVALO * 60_000
  const mapa = new Map<number, Vela>()
  let ate = fim
  while (ate > inicio) {
    const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${INTERVALO}&end=${ate}&limit=1000`
    const j = (await (await fetch(url)).json()) as { result?: { list?: string[][] } }
    const l = j.result?.list ?? []
    if (!l.length) break
    for (const x of l) {
      const t = Number(x[0])
      if (t >= inicio) mapa.set(t, { t, o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })
    }
    ate = Number(l[l.length - 1][0]) - passo
    await new Promise((r) => setTimeout(r, 120))
  }
  // A vela em curso fica de fora: o agente só decide com velas fechadas.
  return [...mapa.values()].sort((a, b) => a.t - b.t).filter((v) => v.t + passo <= fim)
}

const f = (x: number | null, d = 2) => (x == null ? '—' : x.toFixed(d))

async function main() {
  const porSimbolo: Record<string, ResumoBacktest[]> = {}
  const todos: Parameters<typeof resumirBacktest>[0] = []
  for (const s of SIMBOLOS) {
    const velas = await velasHistoricas(s)
    const sinais = sinaisScalp(velas, s)
    const trades = simularScalp(velas, sinais, { mercado: 'perp', velasMax: VELAS_MAX, umaDeCadaVez: true })
    todos.push(...trades)
    porSimbolo[s] = ESTUDOS_SCALP.map((t) => resumirBacktest(trades, t))
    console.log(`\n${s} · ${INTERVALO} min · ${velas.length} velas (${DIAS} dias)`)
    console.log('estudo               trades  acerto  R médio  % médio  % total  DD (R)  factor')
    for (const r of porSimbolo[s]) {
      console.log(`${r.tipo.padEnd(20)} ${String(r.n).padStart(6)}  ${r.acerto == null ? '   —' : `${(r.acerto * 100).toFixed(0).padStart(3)}%`}  ${f(r.rMedio, 3).padStart(7)}  ${f(r.pctMedio, 3).padStart(7)}  ${f(r.pctTotal).padStart(7)}  ${f(r.drawdownR, 1).padStart(6)}  ${f(r.factorLucro).padStart(6)}`)
    }
  }
  const total = ESTUDOS_SCALP.map((t) => resumirBacktest(todos, t))
  console.log(`\nTODOS (${SIMBOLOS.join(', ')})`)
  for (const r of total) {
    const veredicto = r.n < 20 ? 'amostra curta' : (r.rMedio ?? 0) > 0 && (r.factorLucro ?? 0) > 1.1 ? 'candidato a papel' : 'desligar'
    console.log(`${r.tipo.padEnd(20)} n=${r.n} acerto=${r.acerto == null ? '—' : (r.acerto * 100).toFixed(0) + '%'} R=${f(r.rMedio, 3)} PF=${f(r.factorLucro)} → ${veredicto}`)
  }
  const saida = join(tmpdir(), 'cripto-scalp-backtest.json')
  console.log(`\nResumo em ${saida}`)
  writeFileSync(
    saida,
    JSON.stringify({ em: new Date().toISOString(), intervaloMin: INTERVALO, dias: DIAS, velasMax: VELAS_MAX, simbolos: SIMBOLOS, porSimbolo, total }, null, 2),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
