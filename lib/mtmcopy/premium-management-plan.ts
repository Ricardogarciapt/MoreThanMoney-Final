/**
 * MTM Auto Premium — lógica de decisão PURA (sem MetaApi, sem I/O).
 *
 * Traduz uma mensagem de gestão do canal Telegram + o estado da posição na conta
 * mestre num conjunto ordenado de ACÇÕES. É a única fonte de verdade do comportamento
 * Premium e é 100% testável. O executor (premium-management-exec) limita-se a aplicar
 * estas acções via MetaApi — não decide nada.
 *
 * Regras (acordadas com o Ricardo, derivadas de "The Signal Guide"):
 *
 *  Entrada: 1 posição a mercado com o SL do trader, SEM TP fixo, SEM trailing à abertura.
 *
 *  «Trade active and running … Close all now. If hold set BE»
 *     - entrada em ZONA VANTAJOSA (risco real ≤ 60% do risco da zona completa, por PREÇO)
 *         → BE (SL=entrada) + fechar 70% dos lotes; resto fica em BE
 *     - entrada normal → BE apenas (segura a posição risk-free até aos TPs)
 *
 *  «Trade active and running … Close half»
 *     → fechar 33% + BE + iniciar trailing
 *
 *  «HIT TP1 ✅ +Xpips»                → fechar 33%
 *     + «If hold set BE»             → BE + iniciar trailing
 *
 *  «HIT TP2 ✅ +Xpips»                → SL no preço do Exit1 (TP1) + fechar 33% + manter trailing
 *
 *  «HIT TP3 / HIT ALL TP ✅»          → fechar a posição
 *
 *  «Breakeven»                       → BE
 *  «SL»                              → fechar (defensivo; o broker já terá fechado no SL)
 */

export type PremiumMessageKind =
  | 'take_partials'
  | 'trade_active_close_all'
  | 'trade_active_close_half'
  | 'hit_tp1'
  | 'hit_tp2'
  | 'hit_tp3'
  | 'hit_all'
  | 'breakeven'
  | 'sl_hit'

export interface PremiumMessageCtx {
  kind: PremiumMessageKind
  /** «If hold set BE» / «Hold risk with Breakeven» presente na mensagem. */
  setBE: boolean
}

export interface PremiumPositionCtx {
  openPrice: number
  volume: number
  stopLoss: number | null
  direction: 'buy' | 'sell'
  /** Preço atual da posição (para decidir se está em LUCRO no "take partials"). */
  currentPrice?: number | null
}

export interface PremiumSignalCtx {
  /** Zona de entrada [low, high] do sinal original (se existir). */
  zone: [number, number] | null
  /** SL do sinal original. */
  sl: number | null
  /** TPs do sinal original [tp1, tp2, tp3, …]. */
  tp: number[]
}

export type PremiumActionType =
  | 'set_be'
  | 'set_sl_price'
  | 'close_pct'
  | 'close_all'
  | 'start_trailing'

export interface PremiumAction {
  type: PremiumActionType
  /** close_pct: percentagem do lote ORIGINAL a fechar. */
  pct?: number
  /** set_sl_price: preço alvo do SL. */
  slPrice?: number
  reason: string
}

/** Percentagens fixas acordadas. */
export const PREMIUM_CLOSE_HALF_PCT = 33
export const PREMIUM_TP1_CLOSE_PCT = 33
export const PREMIUM_TP2_CLOSE_PCT = 33
export const PREMIUM_CLOSE_ALL_IN_PROFIT_PCT = 70
/** Limiar (fracção do risco da zona) abaixo do qual a entrada é "vantajosa". */
export const PREMIUM_ADVANTAGEOUS_ZONE_RATIO = 0.6

/**
 * Entrada vantajosa, validada por PREÇO (não pips — varia por corretora).
 * risco real  = |entrada − SL|
 * risco zona  = |extremo pior da zona − SL|   (maior risco possível dentro da zona)
 * vantajosa se  risco real ≤ 60% do risco da zona.
 */
export function isAdvantageousZoneEntry(
  pos: Pick<PremiumPositionCtx, 'openPrice'>,
  signal: PremiumSignalCtx,
): boolean {
  if (!signal.zone || signal.sl == null) return false
  const [low, high] = signal.zone
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(signal.sl)) return false

  // Extremo da zona que produz o MAIOR risco face ao SL (pior entrada possível).
  const riskLow = Math.abs(low - signal.sl)
  const riskHigh = Math.abs(high - signal.sl)
  const fullZoneRisk = Math.max(riskLow, riskHigh)
  if (fullZoneRisk <= 0) return false

  const actualRisk = Math.abs(pos.openPrice - signal.sl)
  return actualRisk <= PREMIUM_ADVANTAGEOUS_ZONE_RATIO * fullZoneRisk
}

/** Preço do Exit1 (TP1) a partir do sinal. */
export function exit1Price(signal: PremiumSignalCtx): number | null {
  const tp1 = signal.tp?.[0]
  return tp1 != null && Number.isFinite(tp1) && tp1 > 0 ? tp1 : null
}

/**
 * Decide as acções a aplicar na posição mestre para uma mensagem de gestão.
 * Função pura — devolve as acções por ordem de execução.
 */
export function decidePremiumActions(
  msg: PremiumMessageCtx,
  pos: PremiumPositionCtx,
  signal: PremiumSignalCtx,
): PremiumAction[] {
  switch (msg.kind) {
    // "Trade active and running … TAKE PARTIALS" — instrução EXPLÍCITA do canal para realizar
    // parcial. Fecha a % do Exit 1 SE a posição estiver em LUCRO (pedido Ricardo: nunca realizar
    // parcial em perda). Se não estiver em lucro, protege com BE quando a mensagem o pedir.
    case 'take_partials': {
      const emLucro =
        pos.currentPrice != null &&
        (pos.direction === 'buy' ? pos.currentPrice > pos.openPrice : pos.currentPrice < pos.openPrice)
      if (!emLucro) {
        return msg.setBE ? [{ type: 'set_be', reason: 'Take partials sem lucro → só BE' }] : []
      }
      const actions: PremiumAction[] = [
        { type: 'close_pct', pct: PREMIUM_TP1_CLOSE_PCT, reason: 'Take partials → realiza parcial' },
      ]
      if (msg.setBE) {
        actions.push({ type: 'set_be', reason: 'Take partials + set BE → BE' })
        actions.push({ type: 'start_trailing', reason: 'Take partials + set BE → trailing' })
      }
      return actions
    }

    case 'trade_active_close_all': {
      // "Trade active and running… Close all now. If hold set BE" — a própria mensagem dá a
      // OPÇÃO de segurar. Modo HOLD (default, PREMIUM_HOLD_RUNNERS≠"false"): confia no sistema
      // para apanhar o MÁXIMO → põe BE + trailing e NÃO fecha os 70%, deixando o runner correr
      // até Exit 2/Exit 3 (onde os parciais HIT TP2/HIT TP3 fazem as saídas). Risco limitado:
      // BE + trailing tornam o runner à prova de perda (pior caso = BE / lucro trailado).
      const holdRunners = process.env.PREMIUM_HOLD_RUNNERS !== 'false'
      if (holdRunners) {
        return [
          { type: 'set_be', reason: 'Trade active → BE (segura até Exit 2/3)' },
          { type: 'start_trailing', reason: 'Trade active → trailing protege o runner até Exit 2/3' },
        ]
      }
      // Modo antigo (de-risk): zona vantajosa fecha 70%; entrada normal segura só com BE.
      if (isAdvantageousZoneEntry(pos, signal)) {
        return [
          { type: 'set_be', reason: 'Trade active (zona vantajosa) → BE' },
          {
            type: 'close_pct',
            pct: PREMIUM_CLOSE_ALL_IN_PROFIT_PCT,
            reason: 'Trade active (zona vantajosa) → fecha 70%',
          },
        ]
      }
      return [{ type: 'set_be', reason: 'Trade active (entrada normal) → BE, segura até aos TPs' }]
    }

    case 'trade_active_close_half': {
      return [
        { type: 'close_pct', pct: PREMIUM_CLOSE_HALF_PCT, reason: 'Close half → fecha 33%' },
        { type: 'set_be', reason: 'Close half → BE' },
        { type: 'start_trailing', reason: 'Close half → inicia trailing' },
      ]
    }

    case 'hit_tp1': {
      const actions: PremiumAction[] = [
        { type: 'close_pct', pct: PREMIUM_TP1_CLOSE_PCT, reason: 'HIT TP1 → fecha 33%' },
      ]
      if (msg.setBE) {
        actions.push({ type: 'set_be', reason: 'HIT TP1 + set BE → BE' })
        actions.push({ type: 'start_trailing', reason: 'HIT TP1 + set BE → inicia trailing' })
      }
      return actions
    }

    case 'hit_tp2': {
      const e1 = exit1Price(signal)
      const actions: PremiumAction[] = []
      if (e1 != null) {
        actions.push({ type: 'set_sl_price', slPrice: e1, reason: 'HIT TP2 → SL no preço do Exit1' })
      } else {
        actions.push({ type: 'set_be', reason: 'HIT TP2 (Exit1 indisponível) → BE' })
      }
      actions.push({ type: 'close_pct', pct: PREMIUM_TP2_CLOSE_PCT, reason: 'HIT TP2 → fecha 33%' })
      actions.push({ type: 'start_trailing', reason: 'HIT TP2 → mantém trailing' })
      return actions
    }

    case 'hit_tp3':
    case 'hit_all':
      return [{ type: 'close_all', reason: 'HIT TP3 / HIT ALL → fecha a posição' }]

    case 'breakeven':
      return [{ type: 'set_be', reason: 'Breakeven → BE' }]

    case 'sl_hit':
      return [{ type: 'close_all', reason: 'SL → fecha (defensivo)' }]

    default:
      return []
  }
}
