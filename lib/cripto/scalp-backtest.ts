/**
 * BACKTEST dos gatilhos de scalping (os estudos da casa) com velas REAIS da Bybit.
 *
 *   npx tsx lib/cripto/scalp-backtest.ts                 # BTC, ETH, SOL · 5 min · 30 dias
 *   npx tsx lib/cripto/scalp-backtest.ts 1 14 BTCUSDT    # 1 min · 14 dias · só BTC
 *   npx tsx lib/cripto/scalp-backtest.ts 1 14 volateis   # 1 min · 14 dias · os 5 perps mais voláteis agora
 *
 * Corre sempre duas vezes: sem filtro e com o filtro de ALTA VOLATILIDADE (regime), como ao vivo.
 *
 * Usa o MESMO código que o agente corre ao vivo (lib/cripto/scalp.ts) e os custos do papel
 * (taxa taker dos perps nos dois lados). Só lê a API pública da Bybit: sem chaves, sem ordens.
 * Escreve o resumo em JSON na pasta temporária do sistema (o caminho sai no fim).
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { perpsVolateis } from './fontes'
import { ESTUDOS_SCALP, REGIME_PADRAO, resumirBacktest, simularScalp, sinaisScalp, type Regime, type ResumoBacktest } from './scalp'
import type { Vela } from './tipos'

const [intervaloArg, diasArg, ...simbolosArg] = process.argv.slice(2)
const INTERVALO = Number(intervaloArg ?? 5)
const DIAS = Number(diasArg ?? 30)
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
  const simbolos = simbolosArg[0] === 'volateis' ? await perpsVolateis(5) : simbolosArg.length ? simbolosArg : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
  const historicos = new Map<string, Vela[]>()
  for (const s of simbolos) historicos.set(s, await velasHistoricas(s))
  const resultado: Record<string, { porSimbolo: Record<string, ResumoBacktest[]>; total: ResumoBacktest[] }> = {}
  for (const [nome, regime] of [['sem filtro', null], [`regime ATR ≥ ${REGIME_PADRAO.k}× mediana`, REGIME_PADRAO]] as [string, Regime | null][]) {
    const porSimbolo: Record<string, ResumoBacktest[]> = {}
    const todos: Parameters<typeof resumirBacktest>[0] = []
    console.log(`\n════ ${nome} · ${INTERVALO} min · ${DIAS} dias · ${simbolos.join(', ')}`)
    for (const s of simbolos) {
      const velas = historicos.get(s)!
      const trades = simularScalp(velas, sinaisScalp(velas, s, ESTUDOS_SCALP, regime), { mercado: 'perp', velasMax: VELAS_MAX, umaDeCadaVez: true })
      todos.push(...trades)
      porSimbolo[s] = ESTUDOS_SCALP.map((t) => resumirBacktest(trades, t))
    }
    console.log('estudo               trades  acerto  R médio  % médio  % total  DD (R)  factor  veredicto')
    const total = ESTUDOS_SCALP.map((t) => resumirBacktest(todos, t))
    for (const r of total) {
      const veredicto = r.n < 20 ? 'amostra curta' : (r.rMedio ?? 0) > 0 && (r.factorLucro ?? 0) > 1.1 ? 'candidato a papel' : 'sem vantagem'
      console.log(`${r.tipo.padEnd(20)} ${String(r.n).padStart(6)}  ${r.acerto == null ? '   —' : `${(r.acerto * 100).toFixed(0).padStart(3)}%`}  ${f(r.rMedio, 3).padStart(7)}  ${f(r.pctMedio, 3).padStart(7)}  ${f(r.pctTotal).padStart(7)}  ${f(r.drawdownR, 1).padStart(6)}  ${f(r.factorLucro).padStart(6)}  ${veredicto}`)
    }
    resultado[nome] = { porSimbolo, total }
  }
  const saida = join(tmpdir(), 'cripto-scalp-backtest.json')
  writeFileSync(saida, JSON.stringify({ em: new Date().toISOString(), intervaloMin: INTERVALO, dias: DIAS, velasMax: VELAS_MAX, simbolos, resultado }, null, 2))
  console.log(`\nResumo em ${saida}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
