/**
 * MTM Sensei — motor (porte linha-a-linha do Pine v6 «MTM Sensei v3»).
 *
 * Sem DOM, sem dependências. `calcularSensei(velas, inputs, extra)` corre o script barra a barra
 * como o TradingView corre em histórico: cada vela é uma execução, as variáveis `var` guardam
 * estado e `x[1]` é o valor com que a barra anterior TERMINOU. Os comentários `// Pine:` apontam a
 * secção equivalente em docs/pine/MTM-Sensei-X-ajustado.txt para quem precisar de comparar.
 *
 * Anti-repaint: um sinal só nasce em vela confirmada (confirmClose = true por defeito). A última
 * vela, se ainda estiver aberta, entra no cálculo (checklist/confirmações ao vivo) mas nunca gera
 * sinal — exatamente o `bar_ok = not confirmClose or barstate.isconfirmed` do script.
 */
import { INPUTS_SENSEI_DEFAULT, corPine, paletaSensei } from './inputs'
import * as ta from '../comum/ta'
import { deduzirMintick, deduzirTf } from '../comum/velas'
import type {
  ConfirmacoesLado,
  DadosExtra,
  EstadoUltimaBarra,
  EventoEstrutura,
  InputsSensei,
  Lado,
  MarcaSensei,
  ModoFase,
  NiveisTrade,
  ResultadoSensei,
  SinalSensei,
  Vela,
  ZonaOB,
} from './tipos'

const { na, isNa, diferente } = ta

/** Pine guarda no máximo 500 linhas/labels; os mais antigos desaparecem. */
const MAX_DESENHOS = 500

// ─────────────────────────────────────────────────────────────────────────────
// Contexto: timeframe, mintick, sessão, HTF, LTF
// ─────────────────────────────────────────────────────────────────────────────

// deduzirTf / deduzirMintick vivem em ../comum/velas (partilhados com o GoldKiller); reexportados.
export { deduzirTf, deduzirMintick }

/** Minutos desde a meia-noite e dia da semana (1 = domingo, como no Pine) num fuso IANA. */
function relogioLocal(tSeg: number, fuso: string): { min: number; dia: number } {
  if (fuso === 'UTC' || fuso === 'Etc/UTC') {
    const d = new Date(tSeg * 1000)
    return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), dia: d.getUTCDay() + 1 }
  }
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(new Date(tSeg * 1000))
  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '0'
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { min: (Number(get('hour')) % 24) * 60 + Number(get('minute')), dia: dias.indexOf(get('weekday')) + 1 }
}

/**
 * `not na(time(timeframe.period, sessStr))`: a abertura da vela cai na sessão?
 * Formato Pine: "HHMM-HHMM" com dias opcionais ":1234567" (1 = domingo). Várias sessões com ",".
 */
export function dentroDaSessao(tSeg: number, sessStr: string, fuso: string): boolean {
  const { min, dia } = relogioLocal(tSeg, fuso)
  for (const bruto of sessStr.split(',')) {
    const [faixa, dias] = bruto.trim().split(':')
    const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(faixa ?? '')
    if (!m) continue
    const ini = Number(m[1]) * 60 + Number(m[2])
    const fim = Number(m[3]) * 60 + Number(m[4])
    const diasOk = !dias || dias.includes(String(dia))
    if (!diasOk) continue
    const dentro = ini === fim ? true : ini < fim ? min >= ini && min < fim : min >= ini || min < fim
    if (dentro) return true
  }
  return false
}

/** Agrupa velas num timeframe maior (fallback do request.security sem velas HTF). */
export function reamostrar(velas: Vela[], tfSeg: number): Vela[] {
  const out: Vela[] = []
  for (const v of velas) {
    const b = Math.floor(v.t / tfSeg) * tfSeg
    const u = out[out.length - 1]
    if (u && u.t === b) {
      u.h = Math.max(u.h, v.h); u.l = Math.min(u.l, v.l); u.c = v.c; u.v = (u.v ?? 0) + (v.v ?? 0)
    } else out.push({ t: b, o: v.o, h: v.h, l: v.l, c: v.c, v: v.v ?? 0 })
  }
  return out
}

/**
 * request.security(tickerid, htfTF, ta.ema(close, htfEmaLen)) com lookahead off, em histórico:
 * cada vela do gráfico vê a EMA da última vela HTF que já FECHOU até ao fecho dela.
 * Numa última vela ainda aberta, o TradingView usa o valor em formação — idem aqui.
 */
function htfEmaPorBarra(velas: Vela[], tfSeg: number, htf: Vela[], htfSeg: number, len: number, ultimaAberta: boolean): number[] {
  const e = ta.ema(htf.map((v) => v.c), len)
  const out = new Array<number>(velas.length).fill(na)
  let j = -1
  for (let i = 0; i < velas.length; i++) {
    const fecho = velas[i].t + tfSeg
    while (j + 1 < htf.length && htf[j + 1].t + htfSeg <= fecho) j++
    out[i] = j >= 0 ? e[j] : na
    if (ultimaAberta && i === velas.length - 1) {
      // barra em tempo real: valor da vela HTF em curso (a que contém a abertura desta vela)
      let k = j
      while (k + 1 < htf.length && htf[k + 1].t <= velas[i].t) k++
      out[i] = k >= 0 ? e[k] : na
    }
  }
  return out
}

/** request.security_lower_tf → soma de volume das velas LTF de alta e de baixa por vela do gráfico. */
function deltaLtfPorBarra(velas: Vela[], tfSeg: number, ltf: Vela[] | undefined) {
  const up = new Array<number>(velas.length).fill(0)
  const dn = new Array<number>(velas.length).fill(0)
  const sz = new Array<number>(velas.length).fill(0)
  if (!ltf || ltf.length === 0) return { up, dn, sz }
  let j = 0
  for (let i = 0; i < velas.length; i++) {
    const ini = velas[i].t
    const fim = ini + tfSeg
    while (j < ltf.length && ltf[j].t < ini) j++
    let k = j
    while (k < ltf.length && ltf[k].t < fim) {
      const v = ltf[k].v ?? 0
      if (ltf[k].c >= ltf[k].o) up[i] += v
      else dn[i] += v
      sz[i]++
      k++
    }
    j = k
  }
  return { up, dn, sz }
}

// ─────────────────────────────────────────────────────────────────────────────
// Matriz «Sensei Otimizado» (walk-forward) — Pine: AUTO OPTIMIZED
// ─────────────────────────────────────────────────────────────────────────────

interface ConfigAuto {
  valid: boolean
  phase: ModoFase
  minScore: number
  adx: number
  sl: number
  cd: number
  be: InputsSensei['beMoveMode']
  rr: [number, number, number, number]
}

export function configAuto(simbolo: string, tfSeg: number): ConfigAuto {
  const s = simbolo
  const is15 = tfSeg === 900
  const is60 = tfSeg === 3600
  const isBTC = s.includes('BTC')
  const isETH = s.includes('ETH')
  const isXAU = s.includes('XAU') || s.includes('GOLD')
  const isNAS = s.includes('NAS') || s.includes('US100') || s.includes('NDX') || s.includes('USTEC')
  const isJPY = s.includes('USDJPY')
  const isCAD = s.includes('USDCAD')
  let a: ConfigAuto = { valid: false, phase: 'Momentum', minScore: 15, adx: 16, sl: 2.0, cd: 8, be: 'Exit 1', rr: [1.5, 3, 5, 8] }
  // A ordem dos `if` é a do Pine: o último que casar ganha.
  if (is60 && isBTC) a = { valid: true, phase: 'Momentum', adx: 16, minScore: 15, sl: 2.0, cd: 8, be: 'Exit 2', rr: [1.5, 3, 5, 8] }
  if (is60 && isETH) a = { valid: true, phase: 'Momentum', adx: 22, minScore: 15, sl: 2.5, cd: 8, be: 'Exit 2', rr: [1.5, 3, 5, 8] }
  if (is60 && isXAU) a = { valid: true, phase: 'Momentum', adx: 16, minScore: 13, sl: 2.5, cd: 4, be: 'Exit 2', rr: [1.5, 3, 5, 8] }
  if (is60 && isJPY) a = { valid: true, phase: 'Exaustao', adx: 16, minScore: 13, sl: 2.5, cd: 8, be: 'Exit 1', rr: [2, 3, 4.5, 6.5] }
  if (is15 && isNAS) a = { valid: true, phase: 'Momentum', adx: 22, minScore: 13, sl: 2.5, cd: 4, be: 'Exit 2', rr: [1.5, 3, 5, 8] }
  if (is15 && isCAD) a = { valid: true, phase: 'Momentum', adx: 16, minScore: 13, sl: 2.5, cd: 4, be: 'Exit 1', rr: [2, 3, 4.5, 6.5] }
  return a
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor
// ─────────────────────────────────────────────────────────────────────────────

/** str.tostring(preço) — casas do mintick, sem zeros à direita. */
function fmtPreco(x: number, casas: number): string {
  return String(Number(x.toFixed(casas)))
}

export function calcularSensei(velas: Vela[], parcial: Partial<InputsSensei> = {}, extra: DadosExtra = {}): ResultadoSensei {
  const inp: InputsSensei = { ...INPUTS_SENSEI_DEFAULT, ...parcial }
  const N = velas.length
  const tfSeg = inp.tfSegundos ?? (N > 1 ? deduzirTf(velas) : 60)
  const mintick = inp.mintick ?? deduzirMintick(velas)
  const casas = Math.max(0, Math.round(-Math.log10(mintick)))
  const pipUnit = mintick < 0.01 ? mintick * 10 : mintick
  const th = paletaSensei(inp.themeMode)

  const vazio: ResultadoSensei = {
    inputs: inp, mintick, pipUnit, tfSegundos: tfSeg,
    series: { dema15: [], dema50: [], dema238: [], poc: [], bandaU1: [], bandaL1: [], cloudRapida: [], cloudLenta: [], cloudBull: [], atr: [], rsi: [], adx: [], htfEma: [], bullScore: [], bearScore: [], corVela: [] },
    sinais: [], estrutura: [], orderBlocks: [], marcas: [], ultima: null,
  }
  if (N === 0) return vazio

  const agora = extra.agoraMs ?? Date.now()
  const ultimaConfirmada = extra.ultimaConfirmada ?? (velas[N - 1].t + tfSeg) * 1000 <= agora

  const o = velas.map((v) => v.o)
  const h = velas.map((v) => v.h)
  const l = velas.map((v) => v.l)
  const c = velas.map((v) => v.c)
  const vol = velas.map((v) => v.v ?? 0)

  // Pine: AUTO OPTIMIZED + EFFECTIVE PARAMETERS PER STYLE
  const auto = configAuto(inp.simbolo.toUpperCase(), tfSeg)
  const autoOn = inp.autoOpt && auto.valid
  const rrOrd = [inp.tp1RR, inp.tp2RR, inp.tp3RR, inp.tp4RR].sort((a, b) => a - b)
  const rr: [number, number, number, number] = autoOn ? auto.rr : [rrOrd[0], rrOrd[1], rrOrd[2], rrOrd[3]]
  const effBe = autoOn ? auto.be : inp.beMoveMode
  const st = inp.tradeStyle
  const effMinScore = autoOn ? auto.minScore : st === 'Conservador' ? 16 : st === 'Swing' ? 14 : st === 'Intraday' ? 12 : st === 'Agressivo' ? 11 : st === 'Scalp' ? 10 : st === 'Personalizado' ? inp.minScore : 12
  const effCooldown = autoOn ? auto.cd : st === 'Conservador' ? 12 : st === 'Swing' ? 8 : st === 'Intraday' ? 5 : st === 'Agressivo' ? 4 : st === 'Scalp' ? 2 : 5
  const effAdxCont = autoOn ? auto.adx : st === 'Conservador' ? 26 : st === 'Swing' ? 22 : st === 'Intraday' ? 18 : st === 'Agressivo' ? 18 : st === 'Scalp' ? 14 : 18
  const actSlMult = autoOn ? auto.sl : st === 'Conservador' ? 2.5 : st === 'Swing' ? 2.0 : st === 'Intraday' ? 1.3 : st === 'Agressivo' ? 1.5 : st === 'Scalp' ? 1.0 : st === 'Personalizado' ? inp.slMult : 1.5
  const phaseMode: ModoFase = autoOn ? auto.phase : st === 'Scalp' || st === 'Agressivo' || st === 'Intraday' ? 'Momentum' : st === 'Swing' || st === 'Conservador' ? 'Exaustao' : inp.phaseModeInput

  // Pine: DEMAs
  const dema15 = ta.dema(c, 15)
  const dema50 = ta.dema(c, 50)
  const dema238 = ta.dema(c, 238)

  // Pine: POC (var pocPrice / pocVol, recalcula a cada lengthPOC barras)
  const poc = new Array<number>(N).fill(na)
  {
    let pocPrice = na
    let pocVol = 0
    for (let i = 0; i < N; i++) {
      if (i % inp.lengthPOC === 0) {
        pocVol = 0
        pocPrice = na
        for (let k = 0; k < inp.lengthPOC; k++) {
          if (i - k < 0) break
          if (vol[i - k] > pocVol) { pocVol = vol[i - k]; pocPrice = c[i - k] }
        }
      }
      poc[i] = pocPrice
    }
  }

  // Pine: SENSEI BANDS
  const senseiBasis = ta.sma(c, inp.senseiLen)
  const senseiStdev = ta.stdev(c, inp.senseiLen)
  const senseiU1 = senseiBasis.map((b, i) => b + senseiStdev[i])
  const senseiL1 = senseiBasis.map((b, i) => b - senseiStdev[i])
  const senseiFastLen = inp.senseiType === 'Active' ? Math.round(inp.senseiLen * 0.382) : Math.round(inp.senseiLen * 0.5)
  const senseiCF = ta.ema(c, senseiFastLen)
  const senseiCS = ta.ema(c, inp.senseiLen)
  const cloudBull = senseiCF.map((f, i) => f >= senseiCS[i])

  // Pine: ATR / VOLUME / RSI / ADX
  const atrVal = ta.atr(h, l, c, inp.atrPer)
  const volMA = ta.sma(vol, 20)
  const atrMA = ta.sma(atrVal, 20)
  const rsi14 = ta.rsi(c, 14)
  const adxVal = ta.adxSensei(h, l, c, 14)

  // Pine: ORDER FLOW
  const ltf = deltaLtfPorBarra(velas, tfSeg, inp.useLTFOF ? extra.velasLTF : undefined)
  const ofDeltaProxy = ta.soma(velas.map((v, i) => vol[i] * (v.c > v.o ? 1 : v.c < v.o ? -1 : 0)), 14)

  // Pine: HTF
  const htfSeg = inp.htfTF * 60
  const htfVelas = extra.velasHTF && extra.velasHTF.length > 0 ? extra.velasHTF : reamostrar(velas, htfSeg)
  const htfEma = htfEmaPorBarra(velas, tfSeg, htfVelas, htfSeg, inp.htfEmaLen, !ultimaConfirmada)

  // Pine: SMC — swings(slen) (cada chamada tem o seu próprio estado `var`)
  const swings = (slen: number) => {
    const up = ta.highest(h, slen)
    const dn = ta.lowest(l, slen)
    const top = new Array<number>(N).fill(na)
    const btm = new Array<number>(N).fill(na)
    const topx = new Array<number>(N).fill(na)
    const btmx = new Array<number>(N).fill(na)
    let os = na // var int os_ = 0, mas os_[1] na 1.ª barra é na e a atribuição copia-o
    let tx = na
    let bx = na
    for (let i = 0; i < N; i++) {
      const osAnt = i > 0 ? os : na
      const hs = ta.ref(h, i, slen)
      const ls = ta.ref(l, i, slen)
      os = hs > up[i] ? 0 : ls < dn[i] ? 1 : osAnt
      if (os === 0 && diferente(osAnt, 0)) { top[i] = hs; tx = i - slen }
      if (os === 1 && diferente(osAnt, 1)) { btm[i] = ls; bx = i - slen }
      topx[i] = tx
      btmx[i] = bx
    }
    return { top, topx, btm, btmx }
  }
  const sw = swings(inp.smcLen)
  const ssw = swings(inp.smcShortLen)

  // Saídas
  const estrutura: EventoEstrutura[] = []
  const orderBlocks: ZonaOB[] = []
  const marcas: MarcaSensei[] = []
  const sinais: SinalSensei[] = []
  const bullScoreS = new Array<number>(N).fill(0)
  const bearScoreS = new Array<number>(N).fill(0)
  const corVela: (string | null)[] = new Array(N).fill(null)

  const empurrarEstrutura = (e: EventoEstrutura) => {
    if (isNa(e.barraInicio) || isNa(e.preco)) return
    estrutura.push(e)
  }
  const meio = (a: number, b: number) => Math.trunc((a + b) / 2)

  // Estado `var` (nomes do Pine)
  let os_ms = 0
  let os_ms_ant = na
  // max_ms[1] / min_ms[1]: valores com que a barra anterior terminou
  let maxMsFim = na
  let minMsFim = na
  let top_crossed = false
  let btm_crossed = false
  let max_ms = na
  let min_ms = na
  let max_x1 = na
  let min_x1 = na
  let topy = na
  let btmy = na
  let stop_crossed = false
  let sbtm_crossed = false
  let choch_bull_bar = na
  let choch_bear_bar = na
  let bos_bull_bar = na
  let bos_bear_bar = na
  let stopy_ = na
  let sbtmy_ = na
  let ob_bull: { top: number; bot: number; bar: number } | null = null
  let ob_bear: { top: number; bot: number; bar: number } | null = null

  let buySetup = 0
  let sellSetup = 0
  let buyCD = 0
  let sellCD = 0
  let buyCDact = false
  let sellCDact = false
  let last_phase_buy = na
  let last_phase_sell = na

  let last_sig_bar = na
  let last_sig_type: 'CON' | 'REV' = 'CON'
  let position: Lado | null = null
  let fix: NiveisTrade | null = null
  let fix_pos: Lado | null = null
  let be_trig = false
  let be_lvl = na
  let trail_sl = na
  const tpHit: [boolean, boolean, boolean, boolean] = [false, false, false, false]
  let trade_done = false
  let st_wins = 0
  let st_losses = 0
  let st_sumR = 0

  let ultima: EstadoUltimaBarra | null = null

  for (let n = 0; n < N; n++) {
    const close = c[n]
    const high = h[n]
    const low = l[n]
    const volume = vol[n]
    const isLast = n === N - 1
    const confirmada = !isLast || ultimaConfirmada

    // ── ORDER FLOW ──
    const ltfDelta = ltf.up[n] - ltf.dn[n]
    const ltfTot = ltf.up[n] + ltf.dn[n]
    const ltfValid = inp.useLTFOF && ltf.sz[n] > 0 && ltfTot > 0
    const ofBull = ltfValid ? ltfDelta > 0 : ofDeltaProxy[n] > 0
    const ofBear = ltfValid ? ltfDelta < 0 : ofDeltaProxy[n] < 0
    const ofImbalanceBull = ltfValid && ltfDelta > 0 && ltfDelta >= ltfTot * inp.ofImbThr
    const ofImbalanceBear = ltfValid && ltfDelta < 0 && -ltfDelta >= ltfTot * inp.ofImbThr
    const cBody = Math.abs(close - o[n])
    const cRange = high - low
    const cBrat = cRange > 0 ? cBody / cRange : 0
    const cCpct = cRange > 0 ? (close - low) / cRange : 0.5
    const buyPressure = cCpct > 0.55 && ofBull
    const sellPressure = cCpct < 0.45 && ofBear
    const absorption = volume > volMA[n] * 1.5 && cBrat < 0.4
    const volaSafe = atrVal[n] > 0 && atrVal[n] <= atrMA[n] * 2.5
    const volaExpand = atrVal[n] > ta.ref(atrVal, n, 3)
    const volOnSignal = volume >= volMA[n] * 0.9

    // ── FILTROS ──
    const htfBull = !isNa(htfEma[n]) && close > htfEma[n]
    const htfBear = !isNa(htfEma[n]) && close < htfEma[n]
    const htfBuyOK = !inp.useHTF || htfBull
    const htfSellOK = !inp.useHTF || htfBear
    const inSess = !inp.useSession || dentroDaSessao(velas[n].t, inp.sessStr, inp.fusoSessao)
    const chopOK = !inp.useChop || adxVal[n] > inp.adxChopMin
    const barOk = !inp.confirmClose || confirmada

    // ── FASE ──
    const flipDown = close < ta.ref(c, n, 4)
    const flipUp = close > ta.ref(c, n, 4)
    buySetup = flipDown ? buySetup + 1 : 0
    sellSetup = flipUp ? sellSetup + 1 : 0
    const momBuyComplete = buySetup === inp.momCount
    const momSellComplete = sellSetup === inp.momCount
    if (momBuyComplete) { buyCDact = true; buyCD = 0 }
    if (momSellComplete) { sellCDact = true; sellCD = 0 }
    if (buyCDact && close <= ta.ref(l, n, 2)) buyCD++
    if (sellCDact && close >= ta.ref(h, n, 2)) sellCD++
    const exhBuyComplete = buyCDact && buyCD === inp.exhCount
    const exhSellComplete = sellCDact && sellCD === inp.exhCount
    if (exhBuyComplete) { buyCDact = false; buyCD = 0 }
    if (exhSellComplete) { sellCDact = false; sellCD = 0 }
    if (momSellComplete) buyCDact = false
    if (momBuyComplete) sellCDact = false
    const phaseBuyTrigger = phaseMode === 'Momentum' ? momBuyComplete : exhBuyComplete
    const phaseSellTrigger = phaseMode === 'Momentum' ? momSellComplete : exhSellComplete
    if (phaseBuyTrigger) last_phase_buy = n
    if (phaseSellTrigger) last_phase_sell = n
    const phaseBuyRecent = !isNa(last_phase_buy) && n - last_phase_buy <= 6
    const phaseSellRecent = !isNa(last_phase_sell) && n - last_phase_sell <= 6
    if (inp.showPhaseLbls) {
      if (momBuyComplete) marcas.push({ barra: n, t: velas[n].t, tipo: 'momBuy', cor: corPine(inp.bullCss, 30) })
      if (momSellComplete) marcas.push({ barra: n, t: velas[n].t, tipo: 'momSell', cor: corPine(inp.bearCss, 30) })
      if (exhBuyComplete) marcas.push({ barra: n, t: velas[n].t, tipo: 'exhBuy', cor: corPine(inp.bullCss, 0) })
      if (exhSellComplete) marcas.push({ barra: n, t: velas[n].t, tipo: 'exhSell', cor: corPine(inp.bearCss, 0) })
    }

    // ── SMC STRUCTURE ENGINE ──
    const top = sw.top[n]
    const btm = sw.btm[n]
    const topx = sw.topx[n]
    const btmx = sw.btmx[n]
    if (!isNa(top)) { topy = top; top_crossed = false }
    if (!isNa(btm)) { btmy = btm; btm_crossed = false }
    if (close > topy && !top_crossed) { os_ms = 1; top_crossed = true; choch_bull_bar = n }
    if (close < btmy && !btm_crossed) { os_ms = 0; btm_crossed = true; choch_bear_bar = n }
    if (diferente(os_ms, os_ms_ant)) {
      max_ms = high; min_ms = low; max_x1 = n; min_x1 = n
      stop_crossed = false; sbtm_crossed = false
      if (os_ms === 1 && inp.showChoch) {
        empurrarEstrutura({ tipo: 'CHoCH', lado: 'bull', barra: n, barraInicio: topx, barraFim: n, preco: topy, texto: 'CHoCH', cor: inp.bullCss, estilo: 'dashed', etiqueta: 'acima' })
      } else if (os_ms === 0 && inp.showChoch) {
        empurrarEstrutura({ tipo: 'CHoCH', lado: 'bear', barra: n, barraInicio: btmx, barraFim: n, preco: btmy, texto: 'CHoCH', cor: inp.bearCss, estilo: 'dashed', etiqueta: 'abaixo' })
      }
    }
    if (!isNa(ssw.top[n])) stopy_ = ssw.top[n]
    if (!isNa(ssw.btm[n])) sbtmy_ = ssw.btm[n]
    const stopx_ = ssw.topx[n]
    const sbtmx_ = ssw.btmx[n]
    if (low < sbtmy_ && !sbtm_crossed && os_ms === 1 && diferente(sbtmy_, btmy)) {
      if (inp.showIdm) empurrarEstrutura({ tipo: 'IDM', lado: 'bull', barra: n, barraInicio: sbtmx_, barraFim: n, preco: sbtmy_, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'abaixo' })
      sbtm_crossed = true
    }
    if (close > max_ms && sbtm_crossed && os_ms === 1) {
      if (inp.showBos) empurrarEstrutura({ tipo: 'BOS', lado: 'bull', barra: n, barraInicio: max_x1, barraFim: n, preco: max_ms, texto: 'BOS', cor: inp.bullCss, estilo: 'solid', etiqueta: 'acima' })
      bos_bull_bar = n
      sbtm_crossed = false
    }
    if (high > stopy_ && !stop_crossed && os_ms === 0 && diferente(stopy_, topy)) {
      if (inp.showIdm) empurrarEstrutura({ tipo: 'IDM', lado: 'bear', barra: n, barraInicio: stopx_, barraFim: n, preco: stopy_, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'acima' })
      stop_crossed = true
    }
    if (close < min_ms && stop_crossed && os_ms === 0) {
      if (inp.showBos) empurrarEstrutura({ tipo: 'BOS', lado: 'bear', barra: n, barraInicio: min_x1, barraFim: n, preco: min_ms, texto: 'BOS', cor: inp.bearCss, estilo: 'solid', etiqueta: 'abaixo' })
      bos_bear_bar = n
      stop_crossed = false
    }
    if (high > max_ms && close < max_ms && os_ms === 1 && n - max_x1 > 1 && inp.showSweeps) {
      empurrarEstrutura({ tipo: 'SWEEP', lado: 'bull', barra: n, barraInicio: max_x1, barraFim: n, preco: max_ms, texto: 'x', cor: inp.sweepsCss, estilo: 'dotted', etiqueta: 'acima' })
    }
    if (low < min_ms && close > min_ms && os_ms === 0 && n - min_x1 > 1 && inp.showSweeps) {
      empurrarEstrutura({ tipo: 'SWEEP', lado: 'bear', barra: n, barraInicio: min_x1, barraFim: n, preco: min_ms, texto: 'x', cor: inp.sweepsCss, estilo: 'dotted', etiqueta: 'abaixo' })
    }
    max_ms = Math.max(high, max_ms)
    min_ms = Math.min(low, min_ms)
    // max_ms[1] é o valor com que a barra anterior terminou (não o de antes do reset desta barra)
    if (max_ms > (n > 0 ? maxMsFim : na)) max_x1 = n
    if (min_ms < (n > 0 ? minMsFim : na)) min_x1 = n

    // ── ORDER BLOCKS ──
    if (os_ms === 1 && os_ms_ant === 0) {
      for (let k = 1; k <= 6; k++) {
        if (n - k < 0) break
        if (c[n - k] < o[n - k]) { ob_bull = { top: h[n - k], bot: l[n - k], bar: n - k }; break }
      }
    }
    if (os_ms === 0 && os_ms_ant === 1) {
      for (let k = 1; k <= 6; k++) {
        if (n - k < 0) break
        if (c[n - k] > o[n - k]) { ob_bear = { top: h[n - k], bot: l[n - k], bar: n - k }; break }
      }
    }

    // ── 20 CONFIRMAÇÕES ──
    const chochBullRecent = !isNa(choch_bull_bar) && n - choch_bull_bar <= 25
    const chochBearRecent = !isNa(choch_bear_bar) && n - choch_bear_bar <= 25
    const bosBullRecent = !isNa(bos_bull_bar) && n - bos_bull_bar <= 35
    const bosBearRecent = !isNa(bos_bear_bar) && n - bos_bear_bar <= 35
    const d15 = dema15[n]
    const d50 = dema50[n]
    const d238 = dema238[n]
    const pocN = poc[n]
    const bull: ConfirmacoesLado = {
      A1: d15 > d50,
      A2: d50 > d238,
      A3: d15 > ta.ref(dema15, n, 1) && d15 > ta.ref(dema15, n, 2),
      A4: d50 > ta.ref(dema50, n, 3),
      A5: close > d15,
      B1: volOnSignal,
      B2: volaExpand,
      B3: adxVal[n] > effAdxCont,
      B4: rsi14[n] > 38 && rsi14[n] < 72,
      B5: ofBull,
      C1: os_ms === 1,
      C2: chochBullRecent,
      C3: bosBullRecent,
      C4: !isNa(pocN) && close > pocN,
      C5: ofImbalanceBull,
      D1: cloudBull[n],
      D2: close > senseiL1[n] && close < senseiU1[n] + senseiStdev[n],
      D3: phaseBuyRecent,
      D4: buyPressure,
      D5: volaSafe,
    }
    const bear: ConfirmacoesLado = {
      A1: d15 < d50,
      A2: d50 < d238,
      A3: d15 < ta.ref(dema15, n, 1) && d15 < ta.ref(dema15, n, 2),
      A4: d50 < ta.ref(dema50, n, 3),
      A5: close < d15,
      B1: volOnSignal,
      B2: volaExpand,
      B3: adxVal[n] > effAdxCont,
      B4: rsi14[n] > 28 && rsi14[n] < 62,
      B5: ofBear,
      C1: os_ms === 0,
      C2: chochBearRecent,
      C3: bosBearRecent,
      C4: !isNa(pocN) && close < pocN,
      C5: ofImbalanceBear,
      // Pine: `not senseiCloudBull` — com CF/CS na a comparação é falsa, logo isto é true
      D1: !cloudBull[n],
      D2: close < senseiU1[n] && close > senseiL1[n] - senseiStdev[n],
      D3: phaseSellRecent,
      D4: sellPressure,
      D5: volaSafe,
    }
    const grupo = (x: ConfirmacoesLado, g: 'A' | 'B' | 'C' | 'D') =>
      [1, 2, 3, 4, 5].reduce((s, k) => s + (x[`${g}${k}` as keyof ConfirmacoesLado] ? 1 : 0), 0)
    const gBull: [number, number, number, number] = [grupo(bull, 'A'), grupo(bull, 'B'), grupo(bull, 'C'), grupo(bull, 'D')]
    const gBear: [number, number, number, number] = [grupo(bear, 'A'), grupo(bear, 'B'), grupo(bear, 'C'), grupo(bear, 'D')]
    const bull_score = gBull[0] + gBull[1] + gBull[2] + gBull[3]
    const bear_score = gBear[0] + gBear[1] + gBear[2] + gBear[3]
    bullScoreS[n] = bull_score
    bearScoreS[n] = bear_score

    // ── GATILHOS ──
    const poc_up = !isNa(pocN) && ta.crossover(c, poc, n)
    const poc_dn = !isNa(pocN) && ta.crossunder(c, poc, n)
    const base_buy = poc_up || (phaseBuyTrigger && (isNa(pocN) || close >= pocN))
    const base_sell = poc_dn || (phaseSellTrigger && (isNa(pocN) || close <= pocN))
    const cooldown = isNa(last_sig_bar) || n - last_sig_bar >= effCooldown
    const buy_conf = volaSafe && volOnSignal && !ofBear && !(absorption && ofBear)
    const sell_conf = volaSafe && volOnSignal && !ofBull && !(absorption && ofBull)
    const validOK = !inp.strictAuto || auto.valid
    const isBuySignal = inp.allowBuy && base_buy && bull_score >= effMinScore && buy_conf && cooldown && inSess && chopOK && barOk && htfBuyOK && validOK
    const isSellSignal = inp.allowSell && base_sell && bear_score >= effMinScore + inp.sellExtra && sell_conf && cooldown && inSess && chopOK && barOk && htfSellOK && validOK
    const cooldownRestante = effCooldown - (n - (isNa(last_sig_bar) ? n - effCooldown : last_sig_bar))
    if (isBuySignal || isSellSignal) last_sig_bar = n
    const new_signal = isBuySignal || isSellSignal
    if (isBuySignal) last_sig_type = phaseMode === 'Exaustao' && exhBuyComplete ? 'REV' : 'CON'
    else if (isSellSignal) last_sig_type = phaseMode === 'Exaustao' && exhSellComplete ? 'REV' : 'CON'
    const sig_type = last_sig_type

    // ── NÍVEIS ──
    // round_p(): múltiplo do mintick, limpo do ruído de vírgula flutuante (4446.1050000000005)
    const roundP = (x: number) => Number((Math.round(x / mintick) * mintick).toFixed(casas))
    const calcLvl = (pos: Lado, atrV: number): NiveisTrade => {
      const e = roundP(close)
      const d = inp.riskMode === 'ATR' ? atrV * actSlMult : e * (inp.slPct / 100)
      const s = pos === 'BUY' ? 1 : -1
      const sl = roundP(e - s * d)
      return {
        entry: e, sl,
        tp1: roundP(e + s * d * rr[0]), tp2: roundP(e + s * d * rr[1]),
        tp3: roundP(e + s * d * rr[2]), tp4: roundP(e + s * d * rr[3]),
        slPips: Math.round(Math.abs(e - sl) / pipUnit),
      }
    }
    if (isBuySignal) position = 'BUY'
    else if (isSellSignal) position = 'SELL'
    if (new_signal && position) {
      fix = calcLvl(position, atrVal[n])
      fix_pos = position
    }
    const cur_pos = inp.dynLevels ? position : fix_pos
    const entry_lvl = inp.dynLevels ? roundP(close) : fix ? fix.entry : na
    const lv: NiveisTrade | null = inp.dynLevels && cur_pos ? calcLvl(cur_pos, atrVal[n]) : fix
    const sl_lvl = lv ? lv.sl : na
    const tp1 = lv ? lv.tp1 : na
    const tp2 = lv ? lv.tp2 : na
    const tp3 = lv ? lv.tp3 : na
    const tp4 = lv ? lv.tp4 : na

    // ── BREAKEVEN + TRAILING ──
    const be_target = isNa(tp1) ? na
      : effBe === 'Exit 1' ? tp1 : effBe === 'Exit 2' ? tp2 : effBe === 'Exit 3' ? tp3
      : cur_pos === 'BUY' ? entry_lvl + inp.bePoints * mintick : cur_pos === 'SELL' ? entry_lvl - inp.bePoints * mintick : na
    const be_hit = !isNa(be_target) && !be_trig && ((cur_pos === 'BUY' && high >= be_target) || (cur_pos === 'SELL' && low <= be_target))
    if (new_signal) { be_trig = false; be_lvl = na }
    if (be_hit && !be_trig) { be_trig = true; be_lvl = entry_lvl }
    if (new_signal) trail_sl = na
    const trail_cand = cur_pos === 'BUY' ? close - atrVal[n] * inp.trailMult : cur_pos === 'SELL' ? close + atrVal[n] * inp.trailMult : na
    if (inp.trailMode === 'ATR' && cur_pos && !new_signal) {
      trail_sl = isNa(trail_sl) ? trail_cand : cur_pos === 'BUY' ? Math.max(trail_sl, trail_cand) : Math.min(trail_sl, trail_cand)
    }
    const base_sl2 = be_trig ? be_lvl : sl_lvl
    const eff_sl = inp.trailMode === 'ATR' && !isNa(trail_sl) && !isNa(base_sl2)
      ? (cur_pos === 'BUY' ? Math.max(base_sl2, trail_sl) : Math.min(base_sl2, trail_sl))
      : base_sl2

    // ── TOQUES / FECHO / ESTATÍSTICAS ──
    if (new_signal) { tpHit[0] = tpHit[1] = tpHit[2] = tpHit[3] = false; trade_done = false }
    const after_entry = !new_signal && !!cur_pos
    const toca = (lvl: number) => !isNa(lvl) && ((cur_pos === 'BUY' && high >= lvl) || (cur_pos === 'SELL' && low <= lvl))
    const tpNow = [tp1, tp2, tp3, tp4].map((lvl, k) => after_entry && !trade_done && !tpHit[k] && toca(lvl))
    tpNow.forEach((x, k) => { if (x) tpHit[k] = true })
    const sl_now = after_entry && !trade_done && !isNa(eff_sl) && ((cur_pos === 'BUY' && low <= eff_sl) || (cur_pos === 'SELL' && high >= eff_sl))
    const lastTP_now = inp.showTP4 ? tpNow[3] : inp.showTP3 ? tpNow[2] : inp.showTP2 ? tpNow[1] : tpNow[0]
    const done_now = (lastTP_now || sl_now || (inp.beCompletes && be_hit)) && !trade_done
    if (done_now && fix) {
      trade_done = true
      const risk = Math.abs(fix.entry - fix.sl)
      const exitP = sl_now ? eff_sl : tpHit[3] ? tp4 : tpHit[2] ? tp3 : tpHit[1] ? tp2 : tpHit[0] ? tp1 : close
      const r = risk > 0 ? (cur_pos === 'BUY' ? exitP - fix.entry : fix.entry - exitP) / risk : 0
      if (r > 0) st_wins++
      else if (r < 0) st_losses++
      st_sumR += r
    }
    const st_total = st_wins + st_losses
    const st_wr = st_total > 0 ? (st_wins / st_total) * 100 : 0
    const st_avgR = st_total > 0 ? st_sumR / st_total : 0
    const act_score = cur_pos === 'BUY' ? bull_score : cur_pos === 'SELL' ? bear_score : 0
    const trade_active = !!cur_pos && !isNa(entry_lvl) && !trade_done

    // ── VISUAIS ──
    if (isBuySignal || isSellSignal) corVela[n] = corPine(isBuySignal ? th.hex.bull : th.hex.bear, 45)
    const emitir = (lado: Lado, score: number) => {
      if (!fix) return
      const pipsTxt = !isNa(fix.slPips) ? `  SL:${fix.slPips}p` : ''
      sinais.push({
        barra: n, t: velas[n].t, lado, tipo: sig_type, score, niveis: { ...fix },
        texto: `${sig_type}  +${score}/20${pipsTxt}`,
        precoEtiqueta: lado === 'BUY' ? low - atrVal[n] * 1.8 : high + atrVal[n] * 1.8,
        cor: lado === 'BUY' ? th.buyBadge : th.sellBadge,
      })
    }
    if (isBuySignal) emitir('BUY', bull_score)
    if (isSellSignal) emitir('SELL', bear_score)

    if (inp.signalDisplay === 'Mostrar Tudo') {
      const ev = (preco: number, texto: string, cor: string) => marcas.push({ barra: n, t: velas[n].t, tipo: 'evento', preco, texto, cor: corPine(cor, 10) })
      if (tpNow[0] && inp.showTP1) ev(tp1, 'E1 ✔', th.tp1Line)
      if (tpNow[1] && inp.showTP2) ev(tp2, 'E2 ✔', th.tp2Line)
      if (tpNow[2] && inp.showTP3) ev(tp3, 'E3 ✔', th.tp3Line)
      if (tpNow[3] && inp.showTP4) ev(tp4, 'E4 🏆', th.tp4Line)
      if (be_hit) ev(entry_lvl, 'BE ⭕', th.beLine)
      if (sl_now) ev(eff_sl, be_trig ? 'BE ⭕' : 'SL ❌', be_trig ? th.beLine : th.slLine)
    }

    // plot(top, offset = -smcLen): o círculo aparece na vela do swing
    if (inp.showCircles) {
      if (!isNa(top) && n - inp.smcLen >= 0) marcas.push({ barra: n - inp.smcLen, t: velas[n - inp.smcLen].t, tipo: 'swingHigh', preco: top, cor: corPine(inp.bearCss, 50) })
      if (!isNa(btm) && n - inp.smcLen >= 0) marcas.push({ barra: n - inp.smcLen, t: velas[n - inp.smcLen].t, tipo: 'swingLow', preco: btm, cor: corPine(inp.bullCss, 50) })
    }

    // ── barstate.islast: extensões SMC, order blocks, estado dos painéis ──
    if (isLast) {
      if (os_ms === 1) {
        if (inp.showChoch) empurrarEstrutura({ tipo: 'CHoCH', lado: 'bear', barra: n, barraInicio: btmx, barraFim: n, preco: btmy, texto: 'CHoCH', cor: inp.bearCss, estilo: 'dashed', etiqueta: 'abaixo', extensao: true })
        if (inp.showBos) empurrarEstrutura({ tipo: 'BOS', lado: 'bull', barra: n, barraInicio: max_x1, barraFim: n, preco: max_ms, texto: 'BOS', cor: inp.bullCss, estilo: 'solid', etiqueta: 'acima', extensao: true })
        if (!sbtm_crossed && inp.showIdm) empurrarEstrutura({ tipo: 'IDM', lado: 'bull', barra: n, barraInicio: sbtmx_, barraFim: n + 15, preco: sbtmy_, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'abaixo', extensao: true })
      } else {
        if (inp.showChoch) empurrarEstrutura({ tipo: 'CHoCH', lado: 'bull', barra: n, barraInicio: topx, barraFim: n, preco: topy, texto: 'CHoCH', cor: inp.bullCss, estilo: 'dashed', etiqueta: 'acima', extensao: true })
        if (inp.showBos) empurrarEstrutura({ tipo: 'BOS', lado: 'bear', barra: n, barraInicio: min_x1, barraFim: n, preco: min_ms, texto: 'BOS', cor: inp.bearCss, estilo: 'solid', etiqueta: 'abaixo', extensao: true })
        if (!stop_crossed && inp.showIdm) empurrarEstrutura({ tipo: 'IDM', lado: 'bear', barra: n, barraInicio: stopx_, barraFim: n + 15, preco: stopy_, texto: 'IDM', cor: inp.idmCss, estilo: 'dotted', etiqueta: 'acima', extensao: true })
      }
      if (inp.showOB) {
        if (ob_bull) orderBlocks.push({ lado: 'bull', barraInicio: ob_bull.bar, barraFim: n + 25, topo: ob_bull.top, fundo: ob_bull.bot, texto: 'OB Bull', cor: inp.bullCss })
        if (ob_bear) orderBlocks.push({ lado: 'bear', barraInicio: ob_bear.bar, barraFim: n + 25, topo: ob_bear.top, fundo: ob_bear.bot, texto: 'OB Bear', cor: inp.bearCss })
      }
      ultima = {
        barra: n,
        bullScore: bull_score, bearScore: bear_score,
        grupos: { bull: gBull, bear: gBear },
        bull, bear,
        htfBuyOK, htfSellOK, inSess, chopOK, ltfValid, ltfDelta, ofBull, ofBear,
        baseBuy: base_buy, baseSell: base_sell,
        cooldown, cooldownRestante,
        effMinScore, effCooldown, effAdx: effAdxCont, actSlMult, phaseMode, autoOn,
        adx: adxVal[n], rsi: rsi14[n], atr: atrVal[n], sigType: sig_type,
        tradeAtiva: trade_active, curPos: cur_pos, entry: entry_lvl, effSl: eff_sl,
        niveis: lv ? { ...lv, entry: entry_lvl } : null,
        tpHit: [tpHit[0], tpHit[1], tpHit[2], tpHit[3]],
        beTrig: be_trig, trailAtivo: inp.trailMode === 'ATR' && !isNa(trail_sl),
        actScore: act_score, rr, pct: [inp.pct1, inp.pct2, inp.pct3, inp.pct4],
        stWins: st_wins, stLosses: st_losses, stTotal: st_total, stWr: st_wr, stAvgR: st_avgR,
      }
    }

    // fim da barra: guardar os valores que a próxima vê como x[1]
    os_ms_ant = os_ms
    maxMsFim = max_ms
    minMsFim = min_ms
  }

  // Limite de desenhos do Pine (max_lines_count = 500): ficam os mais recentes + as extensões.
  const hist = estrutura.filter((e) => !e.extensao)
  const ext = estrutura.filter((e) => e.extensao)
  const estruturaFinal = [...hist.slice(-MAX_DESENHOS), ...ext]

  return {
    inputs: inp, mintick, pipUnit, tfSegundos: tfSeg,
    series: {
      dema15, dema50, dema238, poc,
      bandaU1: senseiU1, bandaL1: senseiL1, cloudRapida: senseiCF, cloudLenta: senseiCS, cloudBull,
      atr: atrVal, rsi: rsi14, adx: adxVal, htfEma, bullScore: bullScoreS, bearScore: bearScoreS, corVela,
    },
    sinais: sinais.slice(-MAX_DESENHOS),
    estrutura: estruturaFinal,
    orderBlocks,
    marcas,
    ultima,
  }
}

export { fmtPreco }
