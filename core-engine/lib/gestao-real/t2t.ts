/**
 * GESTÃO T2T de uma posição JÁ PREENCHIDA — sem IO. Fonte única do monitor T2T do site
 * (`lib/mtmcopy/t2t-price-monitor.ts`) e do motor em tempo real do VPS (`services/motor-real`).
 *
 * É o bloco «posição aberta» do monitor tal como estava a 2026-09-15 (commit 8a81044): entry hit,
 * parciais por preço, BE no Exit 1, BE protetor cedo e o ratchet do trailing. Pendentes e posições
 * desaparecidas continuam no monitor (são contabilidade e anúncios, não decisões por preço).
 * Prova: `lib/gestao-real/__tests__/paridade-t2t.check.ts` (monitor original do git vs actual).
 *
 * Preservado: no Exit 1 o resultado da modificação para BE não é verificado (o BE e o trailing
 * ficam marcados na mesma), ao contrário do BE cedo e do trailing, que só marcam com sucesso.
 */
import { parseSignal } from '../mtmcopy/signal-parser'
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'
import type { LifecycleContext, SignalEvent } from '../mtmcopy/signal-lifecycle'
import type { PosicaoGestao } from './premium'

/** Split dos parciais quando o sinal traz vários TPs. */
export const SPLIT_T2T = [50, 30, 20]

export interface EstadoT2T {
  exitsDone: number
  beDone: boolean
  trailing: boolean
  /** Stop mais alto (compra) / mais baixo (venda) que o motor já colocou — o ratchet. */
  trailSl?: number
  /** Já anunciámos o ENTRY HIT? (= a ordem chegou a encher) */
  announced: boolean
}

export interface LinhaT2T {
  id: string
  connection_id: string
  chat_message_id: string | null
  channel_key: string | null
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  lot: number | null
  raw_message: string | null
  broker_position_id: string | null
  created_at?: string | null
}

export interface ConfigT2T {
  beBufferPips: number
  earlyBeRatio: number
  /** `t2tUsaTrailing(channel_key, raw_message)` */
  podeTrailing: boolean
}

export function configT2TDoAmbiente(env: Record<string, string | undefined> = process.env): Omit<ConfigT2T, 'podeTrailing'> {
  return {
    beBufferPips: Number(env.T2T_BE_BUFFER_PIPS) || 5,
    earlyBeRatio: Number(env.T2T_EARLY_BE_RATIO) || 0.4,
  }
}

export interface OperacoesT2T {
  fechar(volume?: number): Promise<{ success: boolean }>
  modificar(sl: number, tp: number | undefined): Promise<{ success: boolean }>
  /** Anúncio no chat/Telegram (texto canónico do ciclo de vida). */
  publicar(event: SignalEvent, ctx: LifecycleContext): Promise<void>
  /** A posição fechou no último alvo: marca a linha fechada. */
  encerrar(nivel: number): Promise<void>
}

export type ResultadoT2T = 'guardar' | 'apagar'

export function roundLotT2T(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

/** Lista de TPs do sinal: raw_message (multi-TP) com fallback ao tp da linha. */
export function tpLevels(row: Pick<LinhaT2T, 'raw_message' | 'tp'>): number[] {
  const fromRaw = row.raw_message ? parseSignal(row.raw_message)?.tp ?? [] : []
  const list = (fromRaw.length ? fromRaw : [row.tp]).filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0,
  )
  return list.slice(0, 3)
}

/**
 * Gere a posição com o preço já lido. Muta `st`. `actions` recebe as notas curtas do monitor.
 * 'apagar' = a linha terminou (o chamador apaga o estado); 'guardar' = `state[row.id] = st`.
 */
export async function gerirPosicaoT2T(
  row: LinhaT2T & { symbol: string },
  pos: PosicaoGestao,
  price: number,
  st: EstadoT2T,
  cfg: ConfigT2T,
  ops: OperacoesT2T,
  actions: string[],
): Promise<ResultadoT2T> {
  const dir: 'buy' | 'sell' = row.direction === 'sell' ? 'sell' : 'buy'
  const beTarget = (entry: number) => {
    const buf = cfg.beBufferPips * pipSizeForSymbol(row.symbol)
    return dir === 'buy' ? entry + buf : entry - buf
  }
  const evCtx = {
    symbol: row.symbol,
    direction: dir,
    source: row.channel_key,
    entry: row.entry ?? pos?.openPrice ?? null,
  }

  const entry = row.entry ?? pos.openPrice ?? null
  const sl = row.sl ?? null
  const podeTrailing = cfg.podeTrailing
  const tps = tpLevels(row)
  const pip = pipSizeForSymbol(row.symbol)

  // ── ENTRY HIT: 1ª vez que vemos a posição preenchida → confirma no chat.
  if (!st.announced) {
    st.announced = true
    await ops.publicar('entry_hit', { ...evCtx, entry: null, price: entry })
    actions.push(`entry_hit ${row.symbol}`)
  }

  // ── PARCIAIS por PREÇO: fecha a % do split ao tocar cada TP.
  const nextLevel = st.exitsDone + 1
  const nextTp = tps[nextLevel - 1]
  const reached = nextTp != null && (dir === 'buy' ? price >= nextTp : price <= nextTp)
  if (reached && pos.volume && pos.volume > 0) {
    const pct = SPLIT_T2T[nextLevel - 1] ?? 100
    const isLast = nextLevel >= tps.length
    const vol = isLast ? pos.volume : roundLotT2T((row.lot ?? pos.volume) * (pct / 100))
    const closeAll = isLast || vol >= pos.volume
    const r = await ops.fechar(closeAll ? undefined : vol)
    if (r.success) {
      st.exitsDone = nextLevel
      actions.push(`exit${nextLevel} ${row.symbol}`)
      let outcomeTxt: string | null = null
      if (entry && entry > 0 && nextTp != null) {
        const move = dir === 'buy' ? nextTp - entry : entry - nextTp
        const pips = Math.round((move / pip) * 10) / 10
        const pctMove = Math.round(((move / entry) * 100) * 100) / 100
        outcomeTxt = `${pips >= 0 ? '+' : ''}${pips} pips (${pctMove >= 0 ? '+' : ''}${pctMove}%).`
      }
      await ops.publicar(closeAll ? 'target_final' : 'partial', { ...evCtx, level: nextLevel, pct, price, reason: outcomeTxt })
      if (closeAll) {
        await ops.encerrar(nextLevel)
        return 'apagar'
      }
      if (nextLevel === 1 && entry && !st.trailing) {
        await ops.modificar(beTarget(entry), undefined)
        st.beDone = true
        st.trailing = podeTrailing
        st.trailSl = beTarget(entry)
        await ops.publicar('break_even', evCtx)
        if (podeTrailing) await ops.publicar('trailing', evCtx)
        actions.push(`${podeTrailing ? 'be_trail' : 'be'} ${row.symbol}`)
      }
      return 'guardar'
    }
  }

  // ── BE PROTETOR CEDO (antes do Exit 1): lucro ≥ ratio × risco → SL para entrada +buffer.
  if (!st.beDone && st.exitsDone === 0 && entry && sl) {
    const riskDist = Math.abs(entry - sl)
    const profit = dir === 'buy' ? price - entry : entry - price
    if (riskDist > 0 && profit >= cfg.earlyBeRatio * riskDist) {
      const r = await ops.modificar(beTarget(entry), undefined)
      if (r.success) {
        st.beDone = true
        actions.push(`early_be ${row.symbol}`)
        await ops.publicar('break_even', evCtx)
      }
    }
  }
  // ── TRAILING PELO MOTOR (ratchet a cada passagem) ────────────────────────────
  if (podeTrailing && st.beDone && entry && sl) {
    const riskPips = Math.max(1, Math.abs(entry - sl) / pip)
    const distancia = riskPips * pip
    const piso = beTarget(entry)
    const candidato = dir === 'buy' ? price - distancia : price + distancia
    const alvo = dir === 'buy' ? Math.max(candidato, piso) : Math.min(candidato, piso)
    const atual = st.trailSl ?? pos.stopLoss ?? null
    const melhora = atual == null
      ? true
      : dir === 'buy' ? alvo > atual + pip * 0.5 : alvo < atual - pip * 0.5
    if (melhora) {
      const r = await ops.modificar(alvo, pos.takeProfit)
      if (r.success) {
        st.trailSl = alvo
        st.trailing = true
        actions.push(`trail ${row.symbol} → ${alvo.toFixed(2)}`)
      }
    }
  }

  return 'guardar'
}
