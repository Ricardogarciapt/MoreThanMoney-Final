/**
 * RocketNova — o estudo calculado no gráfico do WebTrader (Lightweight), como o TrendShot.
 *
 * Até 22/11/2026 o botão «RocketNova» do WebTrader só desenhava as setas dos alertas que chegavam
 * pelo webhook: sem alerta recente o gráfico ficava vazio e parecia que o estudo não fazia nada
 * (o Ricardo notou-o). Este motor segue docs/pine/rocketnova.pine (v6), o mesmo que os vídeos
 * reproduzem (video/bootcamp/rocketnova.js):
 *
 *   · EMA 20 (rápida, vermelha), EMA 50 (lenta, azul) e EMA 238 (longa, laranja grossa) do fecho;
 *   · estrelas ✦: pivots Depth 34 / Backstep 8, com Deviation de 1,3 ATR(14) face à estrela contrária;
 *   · sinal no cruzamento confirmado (vela fechada) da 20 com a 50, dentro do Trade Clock (08–21 h,
 *     hora UTC da abertura da vela, como o TrendShot) e com estrela de lançamento do mesmo lado nas
 *     últimas 40 velas (estrela verde nos mínimos para BUY, vermelha nos máximos para SELL);
 *   · Rocket Candle: corpo ≥ 1,2 ATR a fechar no extremo (sombra do lado do fecho ≤ 30 % do range);
 *   · entrada = fecho da vela do cruzamento; SL e TP1–TP4 com a MESMA função do servidor
 *     (niveisRocketnova) — o gráfico e o Telegram dizem o mesmo.
 *
 * Puro: sem DOM, sem rede. Testes em __tests__/rocketnova.check.ts.
 */
import { atr, ema } from '../comum/ta'
import type { Vela } from '../comum/velas'
import { niveisRocketnova, type NiveisRocketnova } from '@/lib/sinais/rocketnova'

export const EMA_RAPIDA = 20
export const EMA_LENTA = 50
export const EMA_LONGA = 238
export const DEPTH = 34
export const BACKSTEP = 8
export const DEVIATION = 1.3
export const LOOKBACK_ESTRELA = 40
export const ROCKET_ATR = 1.2

export interface InputsRocketNova {
  simbolo: string
  sessaoInicio: number
  sessaoFim: number
  incluirVelaAberta: boolean
}

export const INPUTS_ROCKETNOVA: Omit<InputsRocketNova, 'simbolo'> = { sessaoInicio: 8, sessaoFim: 21, incluirVelaAberta: false }

export interface EstrelaRocketNova {
  /** Vela do pivot (onde se desenha) e o tempo dela. */
  i: number
  t: number
  alto: boolean
  nivel: number
}

export interface SinalRocketNova extends NiveisRocketnova {
  i: number
  t: number
  direcao: 'buy' | 'sell'
  entrada: number
}

export interface ResultadoRocketNova {
  emaRapida: number[]
  emaLenta: number[]
  emaLonga: number[]
  estrelas: EstrelaRocketNova[]
  /** Índices das Rocket Candles (para pintar a vela). */
  rockets: number[]
  sinais: SinalRocketNova[]
  ultima: { sinal: SinalRocketNova; slTocado: boolean; tpTocado: [boolean, boolean, boolean, boolean] } | null
}

export function naSessao(t: number, inicio: number, fim: number): boolean {
  const h = new Date(t * 1000).getUTCHours()
  return inicio < fim ? h >= inicio && h < fim : h >= inicio || h < fim
}

// ta.pivothigh/pivotlow(esq, dir): o valor na vela j = i − dir, confirmado na vela i.
function pivo(velas: Vela[], i: number, esq: number, dir: number, alto: boolean): number | null {
  const j = i - dir
  if (j - esq < 0) return null
  const ref = alto ? velas[j].h : velas[j].l
  for (let q = j - esq; q <= j + dir; q++) {
    if (q === j) continue
    const v = alto ? velas[q].h : velas[q].l
    if (alto ? v > ref || (q > j && v === ref) : v < ref || (q > j && v === ref)) return null
  }
  return ref
}

export function calcularRocketNova(velas: Vela[], parcial: Partial<InputsRocketNova> & { simbolo: string }): ResultadoRocketNova {
  const inp: InputsRocketNova = { ...INPUTS_ROCKETNOVA, ...parcial }
  const n = velas.length
  const fechos = velas.map((v) => v.c)
  const emaRapida = ema(fechos, EMA_RAPIDA)
  const emaLenta = ema(fechos, EMA_LENTA)
  const emaLonga = ema(fechos, EMA_LONGA)
  const a = atr(velas.map((v) => v.h), velas.map((v) => v.l), fechos, 14)

  // estrelas (só confirmadas: a vela i já fechou, por isso até n − 2)
  const estrelas: EstrelaRocketNova[] = []
  const ultimaEstrelaBaixa: number[] = new Array(n).fill(-1)
  const ultimaEstrelaAlta: number[] = new Array(n).fill(-1)
  let lastH: number | null = null, lastL: number | null = null, idxB = -1, idxA = -1
  for (let i = 0; i < n; i++) {
    if (i <= n - 2) {
      const ph = pivo(velas, i, DEPTH, BACKSTEP, true)
      const pl = pivo(velas, i, DEPTH, BACKSTEP, false)
      const dev = Number.isNaN(a[i]) ? 0 : DEVIATION * a[i]
      if (ph != null && (lastL == null || ph - lastL >= dev)) { lastH = ph; idxA = i; estrelas.push({ i: i - BACKSTEP, t: velas[i - BACKSTEP].t, alto: true, nivel: ph }) }
      if (pl != null && (lastH == null || lastH - pl >= dev)) { lastL = pl; idxB = i; estrelas.push({ i: i - BACKSTEP, t: velas[i - BACKSTEP].t, alto: false, nivel: pl }) }
    }
    ultimaEstrelaBaixa[i] = idxB
    ultimaEstrelaAlta[i] = idxA
  }

  const rockets: number[] = []
  velas.forEach((v, i) => {
    const r = v.h - v.l, x = a[i]
    if (!(r > 0) || Number.isNaN(x)) return
    if (v.c > v.o && v.c - v.o >= ROCKET_ATR * x && v.h - v.c <= r * 0.3) rockets.push(i)
    else if (v.c < v.o && v.o - v.c >= ROCKET_ATR * x && v.c - v.l <= r * 0.3) rockets.push(i)
  })

  const sinais: SinalRocketNova[] = []
  const fimSinais = inp.incluirVelaAberta ? n - 1 : n - 2
  for (let i = 1; i <= fimSinais; i++) {
    const a0 = emaRapida[i - 1], b0 = emaLenta[i - 1], f = emaRapida[i], s = emaLenta[i]
    if ([a0, b0, f, s].some(Number.isNaN)) continue
    const direcao = f > s && !(a0 > b0) ? 'buy' : f < s && !(a0 < b0) ? 'sell' : null
    if (!direcao || !naSessao(velas[i].t, inp.sessaoInicio, inp.sessaoFim)) continue
    const estrela = direcao === 'buy' ? ultimaEstrelaBaixa[i] : ultimaEstrelaAlta[i]
    if (estrela < 0 || i - estrela > LOOKBACK_ESTRELA) continue
    const entrada = velas[i].c
    sinais.push({ i, t: velas[i].t, direcao, entrada, ...niveisRocketnova(inp.simbolo, direcao, entrada) })
  }

  const ultimo = sinais[sinais.length - 1]
  let ultima: ResultadoRocketNova['ultima'] = null
  if (ultimo) {
    const compra = ultimo.direcao === 'buy'
    let slTocado = false
    const tpTocado: [boolean, boolean, boolean, boolean] = [false, false, false, false]
    for (let j = ultimo.i + 1; j < n && !slTocado; j++) {
      const v = velas[j]
      if (compra ? v.l <= ultimo.sl : v.h >= ultimo.sl) { slTocado = true; break }
      ultimo.tps.forEach((tp, k) => { if (compra ? v.h >= tp : v.l <= tp) tpTocado[k] = true })
    }
    ultima = { sinal: ultimo, slTocado, tpTocado }
  }
  return { emaRapida, emaLenta, emaLonga, estrelas, rockets, sinais, ultima }
}
