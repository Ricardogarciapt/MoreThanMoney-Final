/**
 * MTM Scanner — motor (porte linha-a-linha do Pine v5 OFICIAL «MoreThanMoney - Scanner V3.5»,
 * docs/pine/mtm-scanner-v3.5.pine).
 *
 * Sem DOM, sem dependências. `calcularMTMScanner(velas, inputs, extra)` corre o script barra a barra
 * como o TradingView em histórico. O que o estudo faz, em português:
 *
 *  1. DEMA 15 / 50 / 238 do fecho (azul, verde, amarelo).
 *  2. Um «POC» (linha laranja): o fecho da vela com MAIS volume numa janela que vai crescendo.
 *  3. B = o fecho cruza o POC para cima; S = cruza para baixo. O alerta leva entrada = fecho
 *     arredondado ao tick, SL = ATR 14 × 1 e TP1/2/3 = 1:2 / 1:4 / 1:6 (ou percentagens).
 *  4. Contador de fases de momentum (1…9) e estrutura de mercado (CHoCH/BOS/IDM/sweeps, swings 50/3).
 *
 * Particularidades do Pine replicadas de propósito (não são erros do porte):
 *  · POC: `highestVol`/`highestVolPrice` são `var` e só voltam a zero quando `bar_index % lengthPOC == 0`;
 *    em TODAS as barras o `for i = 0 to lengthPOC-1` compara `volume[i] > highestVol` (estrito, de i=0
 *    para trás). Logo o POC é o fecho da vela de maior volume de TODAS as velas vistas desde o último
 *    reset (até lengthPOC−1 para trás dele), e o reset depende do bar_index — isto é, de onde começa o
 *    histórico carregado. `volume[i]` fora do histórico é na (comparação falsa).
 *  · `ta.crossover(close, POC)`: POC na → sem sinal.
 *  · `var string position` nunca volta a na: depois do 1.º sinal o bloco dos níveis corre em TODAS as
 *    barras, por isso a caixa de barstate.islast usa o fecho e o ATR da ÚLTIMA vela com a direção do
 *    último sinal (não os níveis do sinal). Os níveis do sinal são os do alerta (guardados em cada sinal).
 *  · round_price = int(x / mintick) · mintick — trunca (não arredonda), com a vírgula flutuante do Pine.
 *  · Fases: `trb.new()` deixa bSC/sSC a na; `na + 1` é na, por isso cada contador fica na até o outro
 *    ramo o pôr a 0. `con = close < close[4]` é falso nas 4 primeiras barras.
 *  · swings(): cada chamada tem os seus `var`; `os[1]` na barra 0 é na (comparações falsas).
 *  · `stopy != topy` / `sbtmy != btmy` são falsos se algum for na.
 *  · Limite de desenhos do Pine (max_lines_count/max_labels_count = 50 por defeito): ficam as linhas
 *    de estrutura mais recentes (50 − 5 da caixa − 3 das extensões).
 *  · As entradas «Bollinger», «Exaustão», «Configuração de Trade», risk/reward e TP4/TP5 existem no Pine
 *    mas não desenham nada (ou só calculam); não se portam como UI.
 *
 * Anti-repaint: sinais, fases, estrutura e caixa só com velas FECHADAS. A vela aberta repete o POC
 * da última fechada e não tem contador; DEMAs/ATR seguem o preço (como os plot() no TradingView).
 */
import * as ta from '../comum/ta'
import { deduzirMintick, deduzirTf, ultimaVelaFechada } from '../comum/velas'
import { INPUTS_MTMSCANNER_DEFAULT } from './inputs'
import type {
  AlertaMS,
  CaixaPosicaoMS,
  DadosExtraMS,
  EventoEstruturaMS,
  InputsMTMScanner,
  LadoMS,
  ResultadoMTMScanner,
  SinalMTMScanner,
  SwingMS,
  Vela,
} from './tipos'

const { na, isNa, diferente } = ta

/** Linhas de estrutura que cabem no max_lines_count = 50 (5 da caixa + 3 extensões). */
export const MAX_ESTRUTURA_MS = 42

/** round_price(x) do Pine: int(x / syminfo.mintick) * syminfo.mintick */
export const roundPrice = (x: number, mintick: number): number => (Number.isNaN(x) ? na : Math.trunc(x / mintick) * mintick)

/** timeframe.period do Pine: "1", "5", "15", "60", "240", "D"… */
function periodoPine(tfSeg: number): string {
  if (tfSeg % 86400 === 0) return tfSeg === 86400 ? 'D' : `${tfSeg / 86400}D`
  return String(Math.max(1, Math.round(tfSeg / 60)))
}

/** POC do script, à letra (ver cabeçalho). */
export function pocMTMScanner(c: ArrayLike<number>, vol: ArrayLike<number>, lengthPOC: number, ate = c.length): number[] {
  const out = new Array<number>(c.length).fill(na)
  let highestVolPrice = na
  let highestVol = 0
  for (let n = 0; n < ate; n++) {
    if (n % lengthPOC === 0) {
      highestVol = 0
      highestVolPrice = na
    }
    for (let i = 0; i <= lengthPOC - 1; i++) {
      if (n - i < 0) continue // volume[i] = na → comparação falsa
      if (vol[n - i] > highestVol) {
        highestVol = vol[n - i]
        highestVolPrice = c[n - i]
      }
    }
    out[n] = highestVolPrice
  }
  return out
}

/** Contador das fases de momentum (S.bSC / S.sSC), à letra. */
export function fasesMTMScanner(c: ArrayLike<number>, ate = c.length): { bSC: number[]; sSC: number[] } {
  const bSC = new Array<number>(c.length).fill(na)
  const sSC = new Array<number>(c.length).fill(na)
  let b = na
  let s = na
  for (let n = 0; n < ate; n++) {
    const con = n >= 4 && c[n] < c[n - 4]
    if (con) {
      b = b === 9 ? 1 : b + 1
      s = 0
    } else {
      s = s === 9 ? 1 : s + 1
      b = 0
    }
    bSC[n] = b
    sSC[n] = s
  }
  return { bSC, sSC }
}

/** swings(len) do script — cada chamada com os seus `var`. */
export function swingsMTMScanner(h: number[], l: number[], len: number) {
  const N = h.length
  const up = ta.highest(h, len)
  const dn = ta.lowest(l, len)
  const top = new Array<number>(N).fill(na)
  const btm = new Array<number>(N).fill(na)
  const topx = new Array<number>(N).fill(na)
  const btmx = new Array<number>(N).fill(na)
  let os = na
  let tx = na
  let bx = na
  for (let i = 0; i < N; i++) {
    const osAnt = i > 0 ? os : na
    const hs = ta.ref(h, i, len)
    const ls = ta.ref(l, i, len)
    os = hs > up[i] ? 0 : ls < dn[i] ? 1 : osAnt
    if (os === 0 && diferente(osAnt, 0)) { top[i] = hs; tx = i - len }
    if (os === 1 && diferente(osAnt, 1)) { btm[i] = ls; bx = i - len }
    topx[i] = tx
    btmx[i] = bx
  }
  return { top, topx, btm, btmx }
}

function serieEntrada(v: Vela, fonte: InputsMTMScanner['entry_source']): number {
  switch (fonte) {
    case 'open': return v.o
    case 'high': return v.h
    case 'low': return v.l
    case 'hl2': return ta.hl2(v.h, v.l)
    case 'hlc3': return ta.hlc3(v.h, v.l, v.c)
    case 'ohlc4': return ta.ohlc4(v.o, v.h, v.l, v.c)
    case 'close':
    default: return v.c
  }
}

/** `if top` do Pine v5: float → bool (na e 0 são falsos). */
const verdade = (x: number) => !Number.isNaN(x) && x !== 0

export function calcularMTMScanner(velas: Vela[], parcial: Partial<InputsMTMScanner> = {}, extra: DadosExtraMS = {}): ResultadoMTMScanner {
  const inp: InputsMTMScanner = { ...INPUTS_MTMSCANNER_DEFAULT, ...parcial }
  const N = velas.length
  const tfSeg = inp.tfSegundos ?? (N > 1 ? deduzirTf(velas) : 60)
  const mintick = inp.mintick ?? deduzirMintick(velas)
  const vazio = () => new Array<number>(N).fill(na)
  const res: ResultadoMTMScanner = {
    inputs: inp, mintick, tfSegundos: tfSeg,
    series: { dema15: vazio(), dema50: vazio(), dema238: vazio(), poc: vazio(), atr: vazio(), bSC: vazio(), sSC: vazio() },
    sinais: [], estrutura: [], swings: [], caixa: null, ultima: null,
  }
  if (N === 0) return res

  const confirmada = extra.ultimaConfirmada ?? ultimaVelaFechada(velas, tfSeg, extra.agoraMs)
  const NC = confirmada ? N : N - 1

  const h = velas.map((v) => v.h)
  const l = velas.map((v) => v.l)
  const c = velas.map((v) => v.c)
  const vol = velas.map((v) => (v.v == null || Number.isNaN(v.v) ? na : v.v))

  const dema15 = ta.dema(c, 15)
  const dema50 = ta.dema(c, 50)
  const dema238 = ta.dema(c, 238)
  const atr = ta.atr(h, l, c, inp.atrPeriod)
  const poc = pocMTMScanner(c, vol, inp.lengthPOC, NC)
  const fases = fasesMTMScanner(c, NC)
  if (!confirmada && N > 1) poc[N - 1] = poc[N - 2]
  res.series = { dema15, dema50, dema238, poc, atr, bSC: fases.bSC, sSC: fases.sSC }

  const sw = swingsMTMScanner(h, l, inp.len)
  const ssw = swingsMTMScanner(h, l, inp.shortLen)

  // ── estado `var` ──
  let position: LadoMS | null = null
  let tp1 = na, tp2 = na, tp3 = na, sl = na, entry1 = na
  let et = na

  let os = 0
  let osAnt = na
  let top_crossed = false
  let btm_crossed = false
  let max = na, min = na
  let maxAnt = na, minAnt = na
  let max_x1 = na, min_x1 = na
  let topy = na, btmy = na
  let stop_crossed = false
  let sbtm_crossed = false
  let stopy = na, sbtmy = na // fixnan(stop) / fixnan(sbtm)

  const hist: EventoEstruturaMS[] = []
  const ext: EventoEstruturaMS[] = []
  const media = (a: number, b: number) => Math.trunc((a + b) / 2)
  const periodo = periodoPine(tfSeg)

  for (let n = 0; n < NC; n++) {
    const v = velas[n]
    const high = h[n], low = l[n], close = c[n]
    const isLast = n === NC - 1

    // ── sinais ──
    const isBuySignal = ta.crossover(c, poc, n)
    const isSellSignal = ta.crossunder(c, poc, n)
    if (isBuySignal) position = 'BUY'
    else if (isSellSignal) position = 'SELL'

    if (position === 'BUY' || position === 'SELL') {
      const priceIn = inp.use_cstm_entry ? inp.custom_entry : serieEntrada(v, inp.entry_source)
      entry1 = roundPrice(priceIn, mintick)
      et = n - inp.box_length2 >= 0 ? n - inp.box_length2 : na
      if (inp.useATR) {
        const d = atr[n] * inp.atrMultiplierSL
        if (position === 'BUY') {
          sl = roundPrice(entry1 - d, mintick)
          tp1 = roundPrice(entry1 + d * inp.tp1RR, mintick)
          tp2 = roundPrice(entry1 + d * inp.tp2RR, mintick)
          tp3 = roundPrice(entry1 + d * inp.tp3RR, mintick)
        } else {
          sl = roundPrice(entry1 + d, mintick)
          tp1 = roundPrice(entry1 - d * inp.tp1RR, mintick)
          tp2 = roundPrice(entry1 - d * inp.tp2RR, mintick)
          tp3 = roundPrice(entry1 - d * inp.tp3RR, mintick)
        }
      } else if (inp.use_TPs) {
        const k = position === 'BUY' ? 1 : -1
        tp1 = roundPrice(entry1 * (1 + k * (inp.tp1x / 100)), mintick)
        tp2 = roundPrice(entry1 * (1 + k * (inp.tp2x / 100)), mintick)
        tp3 = roundPrice(entry1 * (1 + k * (inp.tp3x / 100)), mintick)
        sl = roundPrice(entry1 * (1 - k * (inp.slx / 100)), mintick)
      }
    }

    if (isBuySignal || isSellSignal) {
      const lado: LadoMS = isBuySignal ? 'BUY' : 'SELL'
      const valido = !isNa(entry1) && !isNa(sl) && !isNa(tp1) && !isNa(tp2) && !isNa(tp3)
      const permite = isBuySignal ? inp.long_alert : inp.short_alert
      const alerta: AlertaMS | null = inp.alertsOn && permite && valido
        ? {
          strategy: 'MTMScanner', ticker: inp.simbolo, timeframe: periodo, action: isBuySignal ? 'buy' : 'sell', order_type: inp.order_type,
          entry: entry1, sl, tp1, tp2, tp3,
          confirmations: { 'DEMA 15>50': dema15[n] > dema50[n], 'DEMA 50>238': dema50[n] > dema238[n], 'Acima POC': close > poc[n] },
        }
        : null
      res.sinais.push({ barra: n, t: v.t, lado, entry: entry1, sl, tp1, tp2, tp3, valido, alerta } satisfies SinalMTMScanner)
    }

    // ── barstate.islast: a caixa da posição ──
    if (isLast && !isNa(entry1) && position) {
      const dt = n - inp.box_length >= 0 ? v.t - velas[n - inp.box_length].t : na
      const emBarras = (seg: number) => n + seg / tfSeg
      const tps: CaixaPosicaoMS['tps'] = []
      const f = (x: number) => fmt(x, mintick)
      const rr = (x: number) => String(Number(x.toFixed(4)))
      if (inp.useATR) {
        if (inp.showTP1) tps.push({ k: 1, preco: tp1, texto: `TP1 (RR 1:${rr(inp.tp1RR)}):${f(tp1)}`, fill: 85 })
        if (inp.showTP2) tps.push({ k: 2, preco: tp2, texto: `TP2 (RR 1:${rr(inp.tp2RR)}):${f(tp2)}`, fill: 90 })
        if (inp.showTP3) tps.push({ k: 3, preco: tp3, texto: `TP3 (RR 1:${rr(inp.tp3RR)}):${f(tp3)}`, fill: 95 })
      } else {
        if (inp.useTp1) tps.push({ k: 1, preco: tp1, texto: `TP1:${f(tp1)}`, fill: 85 })
        if (!inp.use_RR && inp.useTp2) tps.push({ k: 2, preco: tp2, texto: `TP2:${f(tp2)}`, fill: null })
        if (!inp.use_RR && inp.useTp3) tps.push({ k: 3, preco: tp3, texto: `TP3:${f(tp3)}`, fill: null })
      }
      res.caixa = {
        lado: position,
        barraInicio: et,
        barraFim: emBarras(dt * 2),
        barraEtiqueta: emBarras(dt * 4),
        entry: entry1,
        sl,
        tps,
      }
    }

    // ── ESTRUTURAS DE MERCADO ──
    const top = sw.top[n], topx = sw.topx[n], btm = sw.btm[n], btmx = sw.btmx[n]
    const stop = ssw.top[n], stopx = ssw.topx[n], sbtm = ssw.btm[n], sbtmx = ssw.btmx[n]

    if (verdade(top)) { topy = top; top_crossed = false }
    if (verdade(btm)) { btmy = btm; btm_crossed = false }
    if (close > topy && !top_crossed) { os = 1; top_crossed = true }
    if (close < btmy && !btm_crossed) { os = 0; btm_crossed = true }

    if (diferente(os, osAnt)) {
      max = high; min = low; max_x1 = n; min_x1 = n
      stop_crossed = false; sbtm_crossed = false
      if (os === 1 && inp.showChoch) {
        hist.push({ tipo: 'CHoCH', lado: 'bull', barra: n, barraInicio: topx, barraFim: n, preco: topy, texto: 'CHoCH', cor: inp.bullCss, estilo: 'dashed', etiqueta: 'acima', barraEtiqueta: media(n, topx) })
      } else if (inp.showChoch) {
        hist.push({ tipo: 'CHoCH', lado: 'bear', barra: n, barraInicio: btmx, barraFim: n, preco: btmy, texto: 'CHoCH', cor: inp.bearCss, estilo: 'dashed', etiqueta: 'abaixo', barraEtiqueta: media(n, btmx) })
      }
    }

    if (!Number.isNaN(stop)) stopy = stop
    if (!Number.isNaN(sbtm)) sbtmy = sbtm

    if (low < sbtmy && !sbtm_crossed && os === 1 && diferente(sbtmy, btmy)) {
      if (inp.showIdm) hist.push({ tipo: 'IDM', lado: 'bull', barra: n, barraInicio: sbtmx, barraFim: n, preco: sbtmy, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'abaixo', barraEtiqueta: media(n, sbtmx) })
      sbtm_crossed = true
    }
    if (close > max && sbtm_crossed && os === 1) {
      if (inp.showBos) hist.push({ tipo: 'BOS', lado: 'bull', barra: n, barraInicio: max_x1, barraFim: n, preco: max, texto: 'BOS', cor: inp.bullCss, estilo: 'solid', etiqueta: 'acima', barraEtiqueta: media(n, max_x1) })
      sbtm_crossed = false
    }
    if (high > stopy && !stop_crossed && os === 0 && diferente(stopy, topy)) {
      // Pine: aqui a cor é color.gray fixa (não idmCss)
      if (inp.showIdm) hist.push({ tipo: 'IDM', lado: 'bear', barra: n, barraInicio: stopx, barraFim: n, preco: stopy, texto: 'IDM', cor: '#787B86', estilo: 'dotted', etiqueta: 'acima', barraEtiqueta: media(n, stopx) })
      stop_crossed = true
    }
    if (close < min && stop_crossed && os === 0) {
      if (inp.showBos) hist.push({ tipo: 'BOS', lado: 'bear', barra: n, barraInicio: min_x1, barraFim: n, preco: min, texto: 'BOS', cor: inp.bearCss, estilo: 'solid', etiqueta: 'abaixo', barraEtiqueta: media(n, min_x1) })
      stop_crossed = false
    }
    if (high > max && close < max && os === 1 && n - max_x1 > 1 && inp.showSweeps) {
      hist.push({ tipo: 'SWEEP', lado: 'bull', barra: n, barraInicio: max_x1, barraFim: n, preco: max, texto: 'x', cor: inp.sweepsCss, estilo: 'dotted', etiqueta: 'acima', barraEtiqueta: media(n, max_x1) })
    }
    if (low < min && close > min && os === 0 && n - min_x1 > 1 && inp.showSweeps) {
      hist.push({ tipo: 'SWEEP', lado: 'bear', barra: n, barraInicio: min_x1, barraFim: n, preco: min, texto: 'x', cor: inp.sweepsCss, estilo: 'dotted', etiqueta: 'abaixo', barraEtiqueta: media(n, min_x1) })
    }

    max = Math.max(high, max)
    min = Math.min(low, min)
    if (max > maxAnt) max_x1 = n
    if (min < minAnt) min_x1 = n

    if (isLast) {
      if (os === 1) {
        if (inp.showChoch) ext.push({ tipo: 'CHoCH', lado: 'bear', barra: n, barraInicio: btmx, barraFim: n, preco: btmy, texto: 'CHoCH', cor: inp.bearCss, estilo: 'dashed', etiqueta: 'abaixo', barraEtiqueta: n, extensao: true })
        if (inp.showBos) ext.push({ tipo: 'BOS', lado: 'bull', barra: n, barraInicio: max_x1, barraFim: n, preco: max, texto: 'BOS', cor: inp.bullCss, estilo: 'solid', etiqueta: 'acima', barraEtiqueta: n, extensao: true })
        if (!sbtm_crossed && inp.showIdm) ext.push({ tipo: 'IDM', lado: 'bull', barra: n, barraInicio: sbtmx, barraFim: n + 15, preco: sbtmy, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'abaixo', barraEtiqueta: n + 15, extensao: true })
      } else {
        if (inp.showChoch) ext.push({ tipo: 'CHoCH', lado: 'bull', barra: n, barraInicio: topx, barraFim: n, preco: topy, texto: 'CHoCH', cor: inp.bullCss, estilo: 'dashed', etiqueta: 'acima', barraEtiqueta: n, extensao: true })
        if (inp.showBos) ext.push({ tipo: 'BOS', lado: 'bear', barra: n, barraInicio: min_x1, barraFim: n, preco: min, texto: 'BOS', cor: inp.bearCss, estilo: 'solid', etiqueta: 'abaixo', barraEtiqueta: n, extensao: true })
        if (!stop_crossed && inp.showIdm) ext.push({ tipo: 'IDM', lado: 'bear', barra: n, barraInicio: stopx, barraFim: n + 15, preco: stopy, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'acima', barraEtiqueta: n + 15, extensao: true })
      }
    }

    // plot(showCircles ? top : na, offset = -len)
    if (inp.showCircles) {
      if (!Number.isNaN(top) && n - inp.len >= 0) res.swings.push({ barra: n - inp.len, preco: top, alto: true })
      if (!Number.isNaN(btm) && n - inp.len >= 0) res.swings.push({ barra: n - inp.len, preco: btm, alto: false })
    }

    osAnt = os
    maxAnt = max
    minAnt = min
  }

  const valida = (e: EventoEstruturaMS) => [e.barraInicio, e.barraFim, e.preco].every(Number.isFinite)
  res.estrutura = [...hist.filter(valida).slice(-MAX_ESTRUTURA_MS), ...ext.filter(valida)]

  // ── estado da última barra ──
  const u = NC - 1
  const sinal = res.sinais.length ? res.sinais[res.sinais.length - 1] : null
  let slTocado = false
  const tpTocado: [boolean, boolean, boolean] = [false, false, false]
  if (sinal && sinal.valido) {
    const compra = sinal.lado === 'BUY'
    for (let i = sinal.barra + 1; i < N; i++) {
      const { h: hi, l: lo } = velas[i]
      if (compra ? lo <= sinal.sl : hi >= sinal.sl) slTocado = true
      ;[sinal.tp1, sinal.tp2, sinal.tp3].forEach((tp, k) => { if (compra ? hi >= tp : lo <= tp) tpTocado[k] = true })
    }
  }
  if (u >= 0) {
    res.ultima = {
      barra: u,
      provisoria: !confirmada,
      dema15: dema15[N - 1], dema50: dema50[N - 1], dema238: dema238[N - 1],
      poc: poc[N - 1], atr: atr[u],
      bSC: fases.bSC[u], sSC: fases.sSC[u],
      os, position, sinal, slTocado, tpTocado,
    }
  }
  return res
}

/** str.tostring(preço) — com as casas do mintick e sem a poeira da vírgula flutuante. */
export function fmt(x: number, mintick: number): string {
  if (!Number.isFinite(x)) return 'NaN'
  const casas = Math.max(0, Math.round(-Math.log10(mintick)))
  return String(Number(x.toFixed(casas)))
}

export { deduzirMintick, deduzirTf }
