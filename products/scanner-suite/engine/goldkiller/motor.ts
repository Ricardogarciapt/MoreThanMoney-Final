/**
 * MTM GoldKiller — motor (porte linha-a-linha do Pine v5 «MTM Gold Killer - Alertas»).
 *
 * Sem DOM, sem dependências. `calcularGoldKiller(velas, inputs, extra)` corre o script barra a barra
 * como o TradingView em histórico. O que o estudo faz, em português:
 *
 *  1. Um Supertrend (ATR 10 × 3) sobre a fonte HLCC4 — mas a DIREÇÃO decide-se pelo hl2, não pela fonte.
 *  2. Cada viragem do Supertrend fecha uma «perna». Da perna que acabou guarda-se quanto o preço andou
 *     a favor (alvo) e contra (drawdown) em percentagem da entrada (o fecho da viragem anterior).
 *  3. Em cada barra, os níveis são a entrada da perna atual × (1 + percentil das pernas passadas do
 *     mesmo lado): Gain/Drawdown 25/50/75/90/100 com os percentis 25·scale … 100·scale (20/40/60/72/80).
 *  4. BUY/SELL na viragem; o alerta leva entrada = Center Line, SL = Drawdown 50, TP1/2/3 = Gain 50/75/100.
 *
 * Particularidades do Pine replicadas de propósito (não são erros do porte):
 *  · `lower_band[1]`, `upper_band[1]`, `super_trend[1]` dentro da função são a história DAQUELA chamada
 *    (valor final da barra anterior); `nz()` põe 0 no aquecimento — por isso a banda de baixo fica a 0
 *    e a de cima a na até o ATR existir.
 *  · Comparações com na são falsas (`na > x`, `x == na`); no v5 `state != state[1]` na barra 0 é falso.
 *  · As pernas de BAIXA entram sempre (os dois ramos do `if unique … else …` fazem o mesmo unshift);
 *    as de ALTA só entram se o valor ainda não estiver no array (dedupe sempre, com ou sem `unique`).
 *  · `window > 0` tira UM elemento por barra (pop = o mais antigo, porque se insere com unshift).
 *  · Há SEIS chamadas de `target_percent` (custom_rank + 25/50/75/90/100), cada uma com os seus `var`.
 *    Todas correm em todas as barras com os mesmos dados (só o `rank` muda, e o rank só entra no
 *    percentil final), por isso os seis estados são idênticos barra a barra: aqui guarda-se UM estado
 *    e pede-se o percentil seis vezes. O teste compara com uma implementação de seis instâncias.
 *  · `stop` («Show Trailing Stop») e a variável `colour` existem no Pine mas não desenham nada.
 *
 * Anti-repaint: no TradingView a vela aberta pode virar o Supertrend a meio e desvirar (a etiqueta
 * aparece e some; o alerta é once_per_bar_close). Aqui a vela aberta NUNCA vira: repete o estado e os
 * níveis da última vela fechada. Sinais só em velas fechadas.
 */
import * as ta from '../comum/ta'
import { deduzirMintick, deduzirTf, ultimaVelaFechada } from '../comum/velas'
import { INPUTS_GOLDKILLER_DEFAULT } from './inputs'
import {
  PERCENTIS_GK,
  type AlertaGK,
  type DadosExtraGK,
  type InputsGoldKiller,
  type PercentilGK,
  type ResultadoGoldKiller,
  type SeriesNivel,
  type SinalGoldKiller,
  type Vela,
} from './tipos'

const { na } = ta

/** percent(current, previous) */
const percent = (atual: number, anterior: number) => (atual - anterior) / anterior
/** add_percent(source, percent) */
const addPercent = (fonte: number, pct: number) => fonte * (1 + pct)

// ─────────────────────────────────────────────────────────────────────────────
// Fonte «Smooth»: logistic_kernel(sinc_kernel(hlc3, 16, 1.5, 1.5), 16, 1.5, 1.5)
// ─────────────────────────────────────────────────────────────────────────────

const logistic = (x: number, largura: number) => 1 / (Math.exp(x / largura) + 2 + Math.exp(-x / largura))
const sinc = (x: number, largura: number) => (x === 0 ? 1 : Math.sin((Math.PI * x) / largura) / ((Math.PI * x) / largura))

/** for i = 0 to size: soma src[i]·w(i²/(h²·r)) / soma w — na enquanto faltar história (src[i] na). */
function kernel(src: number[], tamanho: number, h: number, r: number, w: (k: number, r: number) => number): number[] {
  const pesos: number[] = []
  for (let i = 0; i <= tamanho; i++) pesos.push(w((i * i) / (h * h * r), r))
  const somaPesos = pesos.reduce((a, b) => a + b, 0)
  return src.map((_, barra) => {
    let s = 0
    for (let i = 0; i <= tamanho; i++) {
      const x = barra - i >= 0 ? src[barra - i] : na
      s += x * pesos[i]
    }
    return s / somaPesos
  })
}

export function fonteSmooth(hlc3: number[]): number[] {
  return kernel(kernel(hlc3, 16, 1.5, 1.5, sinc), 16, 1.5, 1.5, logistic)
}

function serieFonte(velas: Vela[], fonte: InputsGoldKiller['source']): number[] {
  switch (fonte) {
    case 'Smooth': return fonteSmooth(velas.map((v) => ta.hlc3(v.h, v.l, v.c)))
    case 'Close': return velas.map((v) => v.c)
    case 'Open': return velas.map((v) => v.o)
    case 'High': return velas.map((v) => v.h)
    case 'Low': return velas.map((v) => v.l)
    case 'Hl2': return velas.map((v) => ta.hl2(v.h, v.l))
    case 'HLC3': return velas.map((v) => ta.hlc3(v.h, v.l, v.c))
    case 'OHLC4': return velas.map((v) => ta.ohlc4(v.o, v.h, v.l, v.c))
    case 'HLCC4':
    default: return velas.map((v) => ta.hlcc4(v.h, v.l, v.c))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// supertrend(src, factor, atrPeriod)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupertrendGK { valor: number[]; baixa: boolean[]; atr: number[] }

export function supertrendGK(velas: Vela[], src: number[], fator: number, periodo: number): SupertrendGK {
  const N = velas.length
  const atr = ta.atr(velas.map((v) => v.h), velas.map((v) => v.l), velas.map((v) => v.c), periodo)
  const valor = new Array<number>(N).fill(na)
  const baixa = new Array<boolean>(N).fill(true)
  let lowerAnt = na // lower_band[1] (valor final)
  let upperAnt = na
  let stAnt = na // super_trend[1]
  for (let i = 0; i < N; i++) {
    const hl2 = ta.hl2(velas[i].h, velas[i].l)
    const hl2Ant = i > 0 ? ta.hl2(velas[i - 1].h, velas[i - 1].l) : na
    let upper = src[i] + fator * atr[i]
    let lower = src[i] - fator * atr[i]
    const pl = ta.nz(lowerAnt)
    const pu = ta.nz(upperAnt)
    // Pine: lower_band := lower_band > prev_lower_band or hl2[1] < prev_lower_band ? lower_band : prev_lower_band
    lower = lower > pl || hl2Ant < pl ? lower : pl
    upper = upper < pu || hl2Ant > pu ? upper : pu
    let dir: boolean
    if (i === 0 || Number.isNaN(atr[i - 1])) dir = true
    else if (stAnt === pu) dir = hl2 > upper ? false : true // `na == x` é falso: NaN === x também
    else dir = hl2 < lower ? true : false
    const st = !dir ? lower : upper
    valor[i] = st
    baixa[i] = dir
    lowerAnt = lower
    upperAnt = upper
    stAnt = st
  }
  return { valor, baixa, atr }
}

// ─────────────────────────────────────────────────────────────────────────────
// target_percent — o estado das pernas
// ─────────────────────────────────────────────────────────────────────────────

/** Os `var` de UMA chamada de target_percent (mais as cópias ordenadas para os percentis). */
class EstadoPernas {
  bullT: number[] = []
  bearT: number[] = []
  bullD: number[] = []
  bearD: number[] = []
  // array.max(high_prices) / array.min(low_prices) — basta o extremo corrido
  maxH = -Infinity
  minL = Infinity
  entry: number
  private ordenados: { bullT: number[]; bearT: number[]; bullD: number[]; bearD: number[] } | null = null
  private stats: { mBullT: number; mBearT: number; mBullD: number; mBearD: number; sBullT: number; sBearT: number; sBullD: number; sBearD: number } | null = null

  constructor(fechoInicial: number, private window: number, private unique: boolean) {
    this.entry = fechoInicial // var float entry = close (barra 0)
  }

  /** Uma barra: push high/low, viragens, window. */
  barra(h: number, l: number, c: number, viragemAlta: boolean, viragemBaixa: boolean) {
    this.maxH = Math.max(this.maxH, h)
    this.minL = Math.min(this.minL, l)
    let mudou = false
    if (viragemAlta) {
      // self.flag(true): acabou uma perna de BAIXA
      const alvo = percent(this.minL, this.entry)
      const dd = percent(this.maxH, this.entry)
      // `if not includes and unique → unshift else → unshift`: entra sempre
      if (!this.bearT.includes(alvo) && this.unique) this.bearT.unshift(alvo)
      else this.bearT.unshift(alvo)
      if (!this.bearD.includes(dd) && this.unique) this.bearD.unshift(dd)
      else this.bearD.unshift(dd)
      this.maxH = -Infinity
      this.minL = Infinity
      this.entry = c
      mudou = true
    }
    if (viragemBaixa) {
      // self.flag(false): acabou uma perna de ALTA — só entra se o valor for novo
      const alvo = percent(this.maxH, this.entry)
      const dd = percent(this.minL, this.entry)
      if (!this.bullT.includes(alvo)) this.bullT.unshift(alvo)
      if (!this.bullD.includes(dd)) this.bullD.unshift(dd)
      this.maxH = -Infinity
      this.minL = Infinity
      this.entry = c
      mudou = true
    }
    if (this.window > 0 && this.bullT.length > this.window) {
      this.bullT.pop()
      this.bullD.pop() // no Pine um pop num array vazio dá erro; aqui não faz nada
      mudou = true
    }
    if (this.window > 0 && this.bearT.length > this.window) {
      this.bearT.pop()
      this.bearD.pop()
      mudou = true
    }
    if (mudou) { this.ordenados = null; this.stats = null }
  }

  private ord() {
    const s = (a: number[]) => a.slice().sort((x, y) => x - y)
    return (this.ordenados ??= { bullT: s(this.bullT), bearT: s(this.bearT), bullD: s(this.bullD), bearD: s(this.bearD) })
  }
  private est() {
    return (this.stats ??= {
      mBullT: ta.mediaArray(this.bullT), mBearT: ta.mediaArray(this.bearT), mBullD: ta.mediaArray(this.bullD), mBearD: ta.mediaArray(this.bearD),
      sBullT: ta.desvioArray(this.bullT), sBearT: ta.desvioArray(this.bearT), sBullD: ta.desvioArray(this.bullD), sBearD: ta.desvioArray(this.bearD),
    })
  }

  /** O `risk.new(...)` que target_percent devolve para este `rank`. */
  risco(baixa: boolean, rank: number) {
    const o = this.ord()
    const e = this.est()
    const P = ta.percentilLinearOrdenado
    return baixa
      ? {
        gain: addPercent(this.entry, P(o.bearT, 100 - rank)),
        drawdown: addPercent(this.entry, P(o.bearD, rank)),
        averageGain: addPercent(this.entry, e.mBearT),
        averageDrawdown: addPercent(this.entry, e.mBearD),
        gainStdev: e.sBearT,
        drawdownStdev: e.sBearD,
        entry: this.entry,
      }
      : {
        gain: addPercent(this.entry, P(o.bullT, rank)),
        drawdown: addPercent(this.entry, P(o.bullD, 100 - rank)),
        averageGain: addPercent(this.entry, e.mBullT),
        averageDrawdown: addPercent(this.entry, e.mBullD),
        gainStdev: e.sBullT,
        drawdownStdev: e.sBullD,
        entry: this.entry,
      }
  }
}

/** Que plots o `show` deixa desenhar (Pine: `show >= k and show > 0 or show <= -(6-k)`). */
export function niveisVisiveis(show: number): Record<`p${PercentilGK}`, boolean> {
  const k: Record<PercentilGK, number> = { 25: 1, 50: 2, 75: 3, 90: 4, 100: 5 }
  const out = {} as Record<`p${PercentilGK}`, boolean>
  for (const p of PERCENTIS_GK) out[`p${p}`] = (show >= k[p] && show > 0) || show <= -(6 - k[p])
  return out
}

/** timeframe.period do Pine: "1", "5", "15", "60", "240", "D"… */
function periodoPine(tfSeg: number): string {
  if (tfSeg % 86400 === 0) return tfSeg === 86400 ? 'D' : `${tfSeg / 86400}D`
  return String(Math.max(1, Math.round(tfSeg / 60)))
}

const vazioNiveis = (N: number): SeriesNivel => ({
  p25: new Array<number>(N).fill(na), p50: new Array<number>(N).fill(na), p75: new Array<number>(N).fill(na),
  p90: new Array<number>(N).fill(na), p100: new Array<number>(N).fill(na),
})

export function calcularGoldKiller(velas: Vela[], parcial: Partial<InputsGoldKiller> = {}, extra: DadosExtraGK = {}): ResultadoGoldKiller {
  const inp: InputsGoldKiller = { ...INPUTS_GOLDKILLER_DEFAULT, ...parcial }
  const N = velas.length
  const tfSeg = inp.tfSegundos ?? (N > 1 ? deduzirTf(velas) : 60)
  const mintick = inp.mintick ?? deduzirMintick(velas)
  const visiveis = niveisVisiveis(inp.show)
  const series: ResultadoGoldKiller['series'] = {
    fonte: [], atr: [], superTrend: [], baixa: [], entrada: new Array<number>(N).fill(na),
    ganho: vazioNiveis(N), perda: vazioNiveis(N),
    ganhoCustom: new Array<number>(N).fill(na), perdaCustom: new Array<number>(N).fill(na),
    ganhoStdev: new Array<number>(N).fill(na), perdaStdev: new Array<number>(N).fill(na),
    variacao: new Array<number>(N).fill(na),
  }
  const res: ResultadoGoldKiller = { inputs: inp, mintick, tfSegundos: tfSeg, visiveis, series, sinais: [], ultima: null }
  if (N === 0) return res

  const confirmada = extra.ultimaConfirmada ?? ultimaVelaFechada(velas, tfSeg, extra.agoraMs)
  // Barras que correm o script por inteiro; a vela aberta (se houver) copia a última fechada.
  const NC = confirmada ? N : N - 1

  const fonte = serieFonte(velas, inp.source)
  const st = supertrendGK(velas, fonte, inp.mult, inp.atr)
  series.fonte = fonte
  series.atr = st.atr
  series.superTrend = st.valor.slice()
  series.baixa = st.baixa.slice()

  const escala = inp.scale / 100
  const ranks = PERCENTIS_GK.map((p) => p * escala)
  const estado = new EstadoPernas(velas[0].c, inp.window, inp.unique)
  const custom = inp.average.includes('Average')
  // value_percent tem o seu próprio `var entry`, que vira nas mesmas barras: é o mesmo valor.

  for (let i = 0; i < NC; i++) {
    const baixa = st.baixa[i]
    // method flag: state != state[1] (falso na barra 0, onde state[1] é na)
    const mudou = i > 0 && baixa !== st.baixa[i - 1]
    const viragemAlta = mudou && !baixa // flag(true)  → BUY
    const viragemBaixa = mudou && baixa // flag(false) → SELL
    const v = velas[i]
    estado.barra(v.h, v.l, v.c, viragemAlta, viragemBaixa)

    const r = ranks.map((rk) => estado.risco(baixa, rk))
    const r50 = r[1]
    PERCENTIS_GK.forEach((p, k) => {
      series.ganho[`p${p}`][i] = r[k].gain
      series.perda[`p${p}`][i] = r[k].drawdown
    })
    series.entrada[i] = estado.entry
    series.variacao[i] = percent(v.c, estado.entry)
    if (inp.average !== 'Disabled') {
      const cr = estado.risco(baixa, inp.rank)
      const g = custom ? r50.averageGain : cr.gain
      const d = custom ? r50.averageDrawdown : cr.drawdown
      series.ganhoCustom[i] = g
      series.perdaCustom[i] = d
      if (inp.average === 'Average + STDEV') {
        series.ganhoStdev[i] = addPercent(g, baixa ? -r50.gainStdev : r50.gainStdev)
        series.perdaStdev[i] = addPercent(d, baixa ? r50.drawdownStdev : -r50.drawdownStdev)
      }
    }

    if (viragemAlta || viragemBaixa) {
      const lado = viragemAlta ? 'BUY' : 'SELL'
      const s = {
        entry: estado.entry, sl: series.perda.p50[i], tp1: series.ganho.p50[i], tp2: series.ganho.p75[i], tp3: series.ganho.p100[i],
      }
      const valido = [s.entry, s.sl, s.tp1, s.tp2, s.tp3].every(Number.isFinite)
      const alerta: AlertaGK | null = inp.alertsOn && valido
        ? {
          strategy: 'GoldKiller', ticker: inp.simbolo, timeframe: periodoPine(tfSeg), action: lado === 'BUY' ? 'buy' : 'sell',
          ...s, confirmations: { Supertrend: !baixa, Momentum: Math.abs(series.variacao[i]) > 0 },
        }
        : null
      res.sinais.push({ barra: i, t: v.t, lado, ...s, valido, alerta } satisfies SinalGoldKiller)
    }
  }

  if (!confirmada && N > 1) {
    // Vela aberta: sem viragem, os mesmos níveis (a entrada e as pernas só mudam numa viragem).
    const i = N - 1
    const j = N - 2
    series.baixa[i] = series.baixa[j]
    series.superTrend[i] = series.superTrend[j]
    series.entrada[i] = series.entrada[j]
    for (const p of PERCENTIS_GK) {
      series.ganho[`p${p}`][i] = series.ganho[`p${p}`][j]
      series.perda[`p${p}`][i] = series.perda[`p${p}`][j]
    }
    series.ganhoCustom[i] = series.ganhoCustom[j]
    series.perdaCustom[i] = series.perdaCustom[j]
    series.ganhoStdev[i] = series.ganhoStdev[j]
    series.perdaStdev[i] = series.perdaStdev[j]
    series.variacao[i] = percent(velas[i].c, series.entrada[i])
  }

  // ── estado da última barra ──
  const u = N - 1
  const sinal = res.sinais.length ? res.sinais[res.sinais.length - 1] : null
  let slTocado = false
  const tpTocado: [boolean, boolean, boolean] = [false, false, false]
  if (sinal) {
    const compra = sinal.lado === 'BUY'
    for (let i = sinal.barra + 1; i < N; i++) {
      const { h, l } = velas[i]
      if (compra ? l <= sinal.sl : h >= sinal.sl) slTocado = true
      ;[sinal.tp1, sinal.tp2, sinal.tp3].forEach((tp, k) => { if (compra ? h >= tp : l <= tp) tpTocado[k] = true })
    }
  }
  const nivel = (s: SeriesNivel) => ({ p25: s.p25[u], p50: s.p50[u], p75: s.p75[u], p90: s.p90[u], p100: s.p100[u] })
  res.ultima = {
    barra: u,
    provisoria: !confirmada && N > 1,
    baixa: series.baixa[u],
    entrada: series.entrada[u],
    superTrend: series.superTrend[u],
    ganho: nivel(series.ganho),
    perda: nivel(series.perda),
    variacao: series.variacao[u],
    pernasAlta: estado.bullT.length,
    pernasBaixa: estado.bearT.length,
    sinal,
    slTocado,
    tpTocado,
  }
  return res
}

export { deduzirMintick, deduzirTf }
