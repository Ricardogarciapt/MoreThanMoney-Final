/**
 * AGENTE CRIPTO: gatilhos de SCALPING a partir dos ESTUDOS da casa (MTM Scanner, Sensei, GoldKiller,
 * TrendShot). Puro, sem rede.
 *
 * Cada estudo é um `tipo` de gatilho próprio (`scalp-mtm-scanner`, `scalp-sensei`…), para a tabela
 * de vantagem e a régua os medirem em separado e desligarem sozinhas os que não prestam. O plano
 * (entrada/SL/TP) é o do próprio estudo quando faz sentido em cripto; o TrendShot tem stops fixos de
 * forex/ouro, por isso usa-se só o cruzamento dele e o SL/TP vem do ATR, como nos outros gatilhos.
 *
 * O mesmo código serve o ciclo ao vivo (`gatilhosScalp`, só a última vela fechada) e o backtest
 * (`sinaisScalp` sobre o histórico inteiro + `simularScalp`), para o que se mede ser o que corre.
 */
import { calcularGoldKiller } from '../estudos/goldkiller/motor'
import { calcularMTMScanner } from '../estudos/mtmscanner/motor'
import { calcularSensei } from '../estudos/sensei/motor'
import { calcularTrendShot } from '../estudos/trendshot/motor'
import type { Vela as VelaEstudo } from '../estudos/comum/velas'
import { PLANO_ATR } from './indicadores'
import { CUSTOS } from './papel'
import type { Gatilho, Lado, Retrato, TipoGatilho, Vela } from './tipos'

export const ESTUDOS_SCALP = ['scalp-mtm-scanner', 'scalp-sensei', 'scalp-goldkiller', 'scalp-trendshot'] as const
export type TipoScalp = (typeof ESTUDOS_SCALP)[number]

export function eScalp(tipo: TipoGatilho | string): tipo is TipoScalp {
  return (ESTUDOS_SCALP as readonly string[]).includes(tipo)
}

/** Um sinal de estudo já em linguagem do agente. `i` = índice da vela do sinal. */
export interface SinalScalp {
  tipo: TipoScalp
  i: number
  lado: Lado
  entrada: number
  sl: number
  tp: number
}

/** As velas do agente têm `t` em ms (Bybit); os estudos portados do Pine querem segundos. */
const paraEstudo = (velas: Vela[]): VelaEstudo[] => velas.map((v) => ({ t: Math.floor(v.t / 1000), o: v.o, h: v.h, l: v.l, c: v.c, v: v.v }))
const lado = (x: string): Lado => (x === 'BUY' || x === 'buy' ? 'long' : 'short')

/** ATR em cada vela (Wilder, 14), para os planos que não vêm do estudo. */
function atrSerie(velas: Vela[], periodo = 14): (number | null)[] {
  const out: (number | null)[] = velas.map(() => null)
  if (velas.length < periodo + 1) return out
  let a = 0
  for (let i = 1; i < velas.length; i++) {
    const v = velas[i]
    const ant = velas[i - 1].c
    const tr = Math.max(v.h - v.l, Math.abs(v.h - ant), Math.abs(v.l - ant))
    if (i <= periodo) {
      a += tr / periodo
      if (i === periodo) out[i] = a
    } else {
      a = (a * (periodo - 1) + tr) / periodo
      out[i] = a
    }
  }
  return out
}

/** Um plano só serve se o SL está do lado certo e o TP também. */
function planoValido(s: SinalScalp): boolean {
  const k = s.lado === 'long' ? 1 : -1
  return [s.entrada, s.sl, s.tp].every((x) => Number.isFinite(x) && x > 0) && k * (s.entrada - s.sl) > 0 && k * (s.tp - s.entrada) > 0
}

/** Todos os sinais de UM estudo sobre o histórico dado. */
export function sinaisDoEstudo(tipo: TipoScalp, velas: Vela[], simbolo: string): SinalScalp[] {
  const ve = paraEstudo(velas)
  const out: SinalScalp[] = []
  switch (tipo) {
    case 'scalp-mtm-scanner':
      for (const s of calcularMTMScanner(ve, { simbolo }).sinais) {
        if (s.valido) out.push({ tipo, i: s.barra, lado: lado(s.lado), entrada: s.entry, sl: s.sl, tp: s.tp1 })
      }
      break
    case 'scalp-sensei':
      for (const s of calcularSensei(ve, { simbolo }).sinais) {
        out.push({ tipo, i: s.barra, lado: lado(s.lado), entrada: s.niveis.entry, sl: s.niveis.sl, tp: s.niveis.tp1 })
      }
      break
    case 'scalp-goldkiller':
      for (const s of calcularGoldKiller(ve, { simbolo }).sinais) {
        if (s.valido) out.push({ tipo, i: s.barra, lado: lado(s.lado), entrada: s.entry, sl: s.sl, tp: s.tp1 })
      }
      break
    case 'scalp-trendshot': {
      // Cripto negoceia 24 h: a sessão de Londres/NY do TrendShot não se aplica.
      const atrs = atrSerie(velas)
      for (const s of calcularTrendShot(ve, { simbolo, sessaoInicio: 0, sessaoFim: 0 }).sinais) {
        const a = atrs[s.i]
        if (a == null || !(a > 0)) continue
        const k = s.direcao === 'buy' ? 1 : -1
        out.push({ tipo, i: s.i, lado: lado(s.direcao), entrada: s.entrada, sl: s.entrada - k * PLANO_ATR.sl * a, tp: s.entrada + k * PLANO_ATR.tp * a })
      }
      break
    }
  }
  return out.filter(planoValido)
}

/** Todos os estudos ligados, sobre o mesmo histórico. */
export function sinaisScalp(velas: Vela[], simbolo: string, tipos: readonly TipoScalp[] = ESTUDOS_SCALP): SinalScalp[] {
  return tipos.flatMap((t) => {
    try {
      return sinaisDoEstudo(t, velas, simbolo)
    } catch {
      return []
    }
  })
}

/**
 * AO VIVO: gatilhos dos estudos que dispararam NA ÚLTIMA VELA FECHADA. A entrada passa a ser o preço
 * actual, e o SL/TP desloca-se com ela (mantém as distâncias do estudo), porque a ordem entra agora
 * e não ao fecho da vela do sinal.
 */
export function gatilhosScalp(r: Retrato, velas: Vela[], tipos: readonly TipoScalp[] = ESTUDOS_SCALP): Gatilho[] {
  if (velas.length < 260 || !(r.preco > 0)) return []
  const ultima = velas.length - 1
  const out: Gatilho[] = []
  for (const s of sinaisScalp(velas, r.ativo, tipos)) {
    if (s.i !== ultima) continue
    const dSl = s.entrada - s.sl
    const dTp = s.tp - s.entrada
    out.push({
      tipo: s.tipo,
      lado: s.lado,
      ativo: r.ativo,
      mercado: r.mercado,
      id: r.id,
      entrada: r.preco,
      sl: r.preco - dSl,
      tp: r.preco + dTp,
      porque: `${NOME[s.tipo]} deu ${s.lado === 'long' ? 'COMPRA' : 'VENDA'} ao fecho da vela (SL a ${pct(dSl, s.entrada)}, TP a ${pct(dTp, s.entrada)}).`,
    })
  }
  return out
}

const NOME: Record<TipoScalp, string> = {
  'scalp-mtm-scanner': 'MTM Scanner',
  'scalp-sensei': 'Sensei',
  'scalp-goldkiller': 'GoldKiller',
  'scalp-trendshot': 'TrendShot',
}
const pct = (d: number, ref: number) => `${((Math.abs(d) / ref) * 100).toFixed(2)}%`

/* ───────────────────────── BACKTEST ───────────────────────── */

export interface TradeSimulado {
  tipo: TipoScalp
  lado: Lado
  iEntrada: number
  iSaida: number
  entrada: number
  saida: number
  motivo: 'sl' | 'tp' | 'tempo'
  /** Resultado em R (múltiplos do risco até ao SL), já com custos. */
  r: number
  /** Resultado em % do nocional, já com custos. */
  pct: number
}

export interface OpcoesSimulacao {
  mercado: 'perp' | 'spot'
  /** Máximo de velas numa posição antes de fechar ao preço. */
  velasMax: number
  /** Uma posição de cada vez por estudo (como o agente faz: mesmo gatilho não reabre por cima). */
  umaDeCadaVez: boolean
}

/**
 * Simula os sinais sobre as velas, com as regras do papel do agente:
 *  · entra na ABERTURA da vela seguinte ao sinal (o sinal só existe com a vela fechada);
 *  · SL/TP mantêm as distâncias do estudo a partir dessa entrada;
 *  · na mesma vela, SL antes de TP (o pior caso);
 *  · custos: taxa taker nos dois lados + escorregamento no spot, como `pnlUsd` em papel.ts.
 */
export function simularScalp(velas: Vela[], sinais: SinalScalp[], o: OpcoesSimulacao): TradeSimulado[] {
  const custoPct = 2 * (o.mercado === 'perp' ? CUSTOS.perpTaxaPct : CUSTOS.spotTaxaPct + CUSTOS.spotEscorregamentoPct)
  const ocupadoAte = new Map<TipoScalp, number>()
  const trades: TradeSimulado[] = []
  for (const s of [...sinais].sort((a, b) => a.i - b.i)) {
    const ie = s.i + 1
    if (ie >= velas.length) continue
    if (o.umaDeCadaVez && (ocupadoAte.get(s.tipo) ?? -1) >= ie) continue
    const entrada = velas[ie].o
    const dSl = Math.abs(s.entrada - s.sl)
    const dTp = Math.abs(s.tp - s.entrada)
    const k = s.lado === 'long' ? 1 : -1
    const sl = entrada - k * dSl
    const tp = entrada + k * dTp
    let saida = NaN
    let motivo: TradeSimulado['motivo'] = 'tempo'
    let is = ie
    for (let j = ie; j < velas.length && j <= ie + o.velasMax; j++) {
      const v = velas[j]
      is = j
      if (k > 0 ? v.l <= sl : v.h >= sl) { saida = sl; motivo = 'sl'; break }
      if (k > 0 ? v.h >= tp : v.l <= tp) { saida = tp; motivo = 'tp'; break }
      saida = v.c
    }
    if (!Number.isFinite(saida)) continue
    const brutoPct = (k * (saida - entrada) / entrada) * 100
    const liquidoPct = brutoPct - custoPct
    const riscoPct = (dSl / entrada) * 100
    trades.push({ tipo: s.tipo, lado: s.lado, iEntrada: ie, iSaida: is, entrada, saida, motivo, pct: liquidoPct, r: riscoPct > 0 ? liquidoPct / riscoPct : 0 })
    ocupadoAte.set(s.tipo, is)
  }
  return trades
}

export interface ResumoBacktest {
  tipo: TipoScalp
  n: number
  acerto: number | null
  /** Expectativa por trade, em R e em % do nocional (já com custos). */
  rMedio: number | null
  pctMedio: number | null
  /** Soma dos % por trade (nocional fixo, sem juros compostos). */
  pctTotal: number
  /** Pior sequência acumulada (em R), do pico ao vale. */
  drawdownR: number
  /** Factor de lucro: soma dos ganhos / soma das perdas (em %). */
  factorLucro: number | null
}

export function resumirBacktest(trades: TradeSimulado[], tipo: TipoScalp): ResumoBacktest {
  const t = trades.filter((x) => x.tipo === tipo)
  const n = t.length
  let acc = 0
  let pico = 0
  let dd = 0
  for (const x of t) {
    acc += x.r
    pico = Math.max(pico, acc)
    dd = Math.max(dd, pico - acc)
  }
  const ganhos = t.filter((x) => x.pct > 0).reduce((s, x) => s + x.pct, 0)
  const perdas = -t.filter((x) => x.pct < 0).reduce((s, x) => s + x.pct, 0)
  return {
    tipo,
    n,
    acerto: n ? t.filter((x) => x.pct > 0).length / n : null,
    rMedio: n ? t.reduce((s, x) => s + x.r, 0) / n : null,
    pctMedio: n ? t.reduce((s, x) => s + x.pct, 0) / n : null,
    pctTotal: t.reduce((s, x) => s + x.pct, 0),
    drawdownR: dd,
    factorLucro: perdas > 0 ? ganhos / perdas : null,
  }
}
