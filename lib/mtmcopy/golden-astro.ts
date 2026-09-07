/**
 * GOLDEN ASTRO — Time · Price · Volume.
 *
 * Regras do próprio trader, tal como as publica no grupo:
 *
 *   Janelas    08:00–09:30, 13:00–14:00, 14:30–15:30
 *   Gatilho    "Gold Buy" / "Gold sell"
 *   Stop       FIXO de 100 pips, salvo indicação no próprio setup
 *   Alvos      TP1 25 · TP2 50 · TP3 75 · TP4 100 · TP5 150 pips
 *   Gestão     no TP2 fecha 50% e reduz a exposição do stop a metade;
 *              do TP2 em diante fica ao critério do trader
 *
 * O sinal não traz preços — traz uma direção. Os níveis nascem todos do preço a que a ordem
 * abriu, em PIPS. É por isso que este ficheiro conta em pips e converte no fim: 100 pips no ouro
 * são 10,00 no preço, não 100 nem 1,00. Confundir as duas coisas põe o stop a 1 dólar da
 * entrada ou a 100 — e nos dois casos a trade morre por razões que nada têm a ver com o mercado.
 *
 * A parte "discricionária" do trader não se pode copiar como discrição: o que se copia é a
 * consequência. Garante-se o TP2 (parcial + stop encurtado) e o resto passa a trailing pelo
 * monitor de preço, que é a leitura em tempo real que aqui substitui o olho dele.
 */

import { pipSizeForSymbol } from './trade-outcome'

export const GOLDENASTRO_SIMBOLO = 'XAUUSD'

/** Stop fixo da estratégia, em pips. O setup pode trazer outro — este é o que vale sem isso. */
export const GOLDENASTRO_STOP_PIPS = 100

/** Alvos em pips, na ordem publicada. */
export const GOLDENASTRO_ALVOS_PIPS = [25, 50, 75, 100, 150] as const

/** Os alvos que o trader marca como prioritários — TP2, TP3, TP4. */
export const GOLDENASTRO_ALVOS_PRIORITARIOS = [2, 3, 4] as const

/**
 * Saídas: o grosso sai no TP2, o resto corre.
 *
 * O trader fecha 50% no TP2 e deixa o resto ao critério dele. Como não se copia critério, o
 * resto fica com o trailing. O TP1 vai a zero de propósito: fechar metade aos 25 pips era
 * cortar a trade antes do alvo que o próprio trader chama prioritário.
 */
export const GOLDENASTRO_SAIDAS = { tp1: 0, tp2: 50, tp3: 0 } as const

/** Janelas de negociação, hora de Londres. Fora delas não se abre nada. */
export const GOLDENASTRO_JANELAS: Array<[string, string]> = [
  ['08:00', '09:30'],
  ['13:00', '14:00'],
  ['14:30', '15:30'],
]

export const GOLDENASTRO_FUSO = 'Europe/London'

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Minutos desde a meia-noite em Londres, para um instante qualquer. */
export function minutosEmLondres(quando: Date = new Date()): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: GOLDENASTRO_FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const partes = f.formatToParts(quando)
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

/**
 * O sinal chegou dentro de uma das janelas?
 *
 * A hora é a de Londres e não a do servidor. Um servidor em UTC e Londres em BST são a mesma
 * hora meio ano e uma hora de diferença no outro meio — a janela das 08:00 abriria às 09:00 de
 * Londres durante todo o verão, que é precisamente quando a sessão já começou.
 */
export function dentroDaJanela(quando: Date = new Date()): boolean {
  const agora = minutosEmLondres(quando)
  return GOLDENASTRO_JANELAS.some(([de, ate]) => agora >= minutosDe(de) && agora <= minutosDe(ate))
}

/** «Gold Buy» / «Gold sell» — o gatilho, e mais nada. */
export function direcaoGoldenAstro(texto: string): 'buy' | 'sell' | null {
  const t = (texto ?? '').toLowerCase()
  if (!/\bgold\b/.test(t)) return null
  if (/\bgold\s+buy\b/.test(t)) return 'buy'
  if (/\bgold\s+sell\b/.test(t)) return 'sell'
  return null
}

export interface PlanoGoldenAstro {
  symbol: string
  direction: 'buy' | 'sell'
  entrada: number
  sl: number
  tp: number[]
  /** Stop encurtado a metade do risco, para aplicar quando o TP2 for atingido. */
  slAposTp2: number
}

/**
 * Os níveis, a partir do preço a que a ordem abriu.
 *
 * `stopPips` existe porque o próprio trader diz «unless otherwise specified within the trade
 * setup»: quando o setup traz um stop, é esse que manda.
 */
export function planoGoldenAstro(
  direction: 'buy' | 'sell',
  entrada: number,
  opts?: { symbol?: string; stopPips?: number },
): PlanoGoldenAstro | null {
  if (!Number.isFinite(entrada) || entrada <= 0) return null
  const symbol = opts?.symbol ?? GOLDENASTRO_SIMBOLO
  const stopPips = opts?.stopPips ?? GOLDENASTRO_STOP_PIPS
  if (!Number.isFinite(stopPips) || stopPips <= 0) return null

  const pip = pipSizeForSymbol(symbol)
  const sinal = direction === 'buy' ? 1 : -1
  const arred = (n: number) => Math.round(n * 100) / 100

  return {
    symbol,
    direction,
    entrada: arred(entrada),
    sl: arred(entrada - sinal * stopPips * pip),
    tp: GOLDENASTRO_ALVOS_PIPS.map((p) => arred(entrada + sinal * p * pip)),
    // «Reduce stop loss exposure by 50%»: o stop passa a metade da distância, do mesmo lado.
    // Não é break-even — o trader não diz break-even, diz metade do risco.
    slAposTp2: arred(entrada - sinal * (stopPips / 2) * pip),
  }
}
