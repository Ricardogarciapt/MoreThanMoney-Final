/**
 * FILTRO DE ENTRADA TARDIA — GoldKiller, EM SOMBRA (26/10/2026).
 *
 * O backtest de 30 dias (/mnt/project-files/sinais/goldkiller-entradas.md) mostrou que o GoldKiller
 * entra depois de o movimento já ter acontecido: em 31 de 34 entradas o preço tinha andado ~120
 * pips a favor nas 4 h anteriores. Tirar as que andaram mais de 100 pips passava de −1 323 para
 * +238 pips — mas em 16 trades e com o limite escolhido sobre os mesmos dados.
 *
 * Por isso corre em SOMBRA: o sinal sai como sempre, e a entrada fica só marcada em
 * `tradingview_signals.raw_payload.filtro_sombra` com quanto o preço andou e se teria sido
 * filtrada. Nada aqui bloqueia, atrasa ou altera um sinal.
 */
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'
import { velasDoSinal } from '@/lib/sinais/grafico-velas'

export const FILTRO_TARDIO_LIMITE_PIPS = 100
export const FILTRO_TARDIO_JANELA_SEG = 4 * 3600

export interface VelaFecho {
  t: number
  c: number
}

export interface AvaliacaoTardia {
  /** Pips que o preço andou A FAVOR da direção na janela antes do sinal (negativo = contra). */
  andou_pips: number
  limite_pips: number
  janela_h: number
  teria_filtrado: boolean
}

/**
 * Puro. Fecho da última vela FECHADA antes do sinal contra o fecho de há `janelaSeg`.
 * `tfSeg` é a duração da vela; null quando faltam velas para a janela.
 */
export function avaliarEntradaTardia(
  velas: VelaFecho[],
  direcao: string,
  simbolo: string,
  emSeg: number,
  tfSeg = 900,
  janelaSeg = FILTRO_TARDIO_JANELA_SEG,
  limitePips = FILTRO_TARDIO_LIMITE_PIPS,
): AvaliacaoTardia | null {
  const d = String(direcao).toLowerCase() === 'buy' ? 1 : String(direcao).toLowerCase() === 'sell' ? -1 : 0
  if (!d) return null
  const fechadas = velas.filter((v) => v.t + tfSeg <= emSeg + 60)
  const agora = fechadas[fechadas.length - 1]
  if (!agora) return null
  const antes = [...fechadas].reverse().find((v) => v.t <= agora.t - janelaSeg)
  if (!antes || agora.t - antes.t > janelaSeg + 2 * tfSeg) return null
  const andou = (d * (agora.c - antes.c)) / pipSizeForSymbol(simbolo)
  return {
    andou_pips: Math.round(andou),
    limite_pips: limitePips,
    janela_h: janelaSeg / 3600,
    teria_filtrado: andou > limitePips,
  }
}

/** Avaliação com as velas da referência (as mesmas do gráfico). Nunca lança; null sem velas. */
export async function avaliarEntradaTardiaAoVivo(
  simbolo: string,
  direcao: string,
  entrada: number | null,
  emSeg = Math.floor(Date.now() / 1000),
): Promise<AvaliacaoTardia | null> {
  try {
    const dir = String(direcao).toLowerCase() === 'sell' ? 'sell' : 'buy'
    const velas = await velasDoSinal({ ticker: simbolo, timeframe: '15', direcao: dir, entry: entrada, sl: null, tps: [], emSeg })
    return avaliarEntradaTardia(velas, direcao, simbolo, emSeg)
  } catch {
    return null
  }
}
