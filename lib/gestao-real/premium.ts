/**
 * GESTÃO PREMIUM — a decisão por posição, sem IO. Fonte ÚNICA para dois chamadores:
 *
 *  · `lib/mtmcopy/premium-price-monitor.ts` (Vercel, chamado ~1×/s pelo loop do VPS) — passa as
 *    operações reais (RPC MetaApi, Supabase, espelho aos subscritores, anúncio no chat);
 *  · `services/motor-real` (VPS, tick a tick) — em SOMBRA passa operações que só registam; em live
 *    passa as operações por REST /trade.
 *
 * Este ficheiro é o corpo do ciclo do monitor tal como estava a 2026-09-15 (commit 8a81044),
 * com cada chamada de IO trocada por `ops.*`. Nada nas regras mudou — a prova é
 * `lib/gestao-real/__tests__/paridade-premium.check.ts`, que corre o monitor ORIGINAL (tirado do
 * git) e o actual contra os mesmos cenários e exige o mesmo registo de chamadas.
 *
 * Particularidade preservada de propósito: `modifyPositionSlTp` nunca lança (devolve
 * `{success:false}`), por isso o monitor sempre tratou as modificações como feitas — a tranca de
 * lucro marca `profit_locked` mesmo que a corretora recuse. Os `try/catch` à volta ficam iguais.
 * Mudar isto é uma decisão de gestão, não de migração.
 */
import {
  premiumTrailingAfterTp1Hit,
  PREMIUM_WIDE_ZONE_SL_PIPS,
  PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS,
} from '../mtmcopy/premium-trade-active'
import type { TrailingDistance } from '../mtmcopy/pip-points'
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'
import { symbolMatchesCanonical } from '../mtmcopy/symbol-resolver'
import { trailingArrancaPips } from '../mtmcopy/source-risk-rules'

/** Linha de `mtmcopy_premium_active` (as colunas que a gestão lê). */
export interface LinhaPremium {
  id: string
  account_id: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tp1: number | null
  tp2: number | null
  tp3: number | null
  exit_pct_tp1: number
  exit_pct_tp2: number
  exit_pct_tp3: number
  original_lot: number
  small_account: boolean
  exits_done: number
  trailing_started: boolean
  early_trail_started: boolean
  peak_profit_pips: number
  profit_locked: boolean
  profile: string | null
  telegram_message_id: number | null
  chat_message_id: string | null
  source_key: string | null
  created_at: string
}

/** A posição como a MetaApi a devolve (subconjunto usado). */
export interface PosicaoGestao {
  id: string
  symbol: string
  type: string
  openPrice: number
  currentPrice?: number
  stopLoss?: number
  takeProfit?: number
  volume?: number
  comment?: string
  time?: string
}

export type AcaoEspelhoPremium =
  | { kind: 'close_frac'; frac: number }
  | { kind: 'close_all' }
  | { kind: 'be_trailing'; beSl: number; trailing: TrailingDistance }

export interface OperacoesPremium {
  /** Resultado ignorado pelas regras (ver cabeçalho). */
  modificar(sl: number | undefined, tp: number | undefined | null, trailing?: TrailingDistance): Promise<unknown>
  fechar(volume?: number): Promise<{ success: boolean }>
  /** Só é chamado quando `cfg.espelhar` (conta mestre). */
  espelhar(acao: AcaoEspelhoPremium): Promise<{ acted: number; skipped: number } | null>
  /** Patch parcial da linha (sem updated_at — quem grava acrescenta). */
  gravar(patch: Record<string, unknown>): Promise<void>
  encerrar(evento: 'target_final' | 'closed', patch?: Record<string, unknown>): Promise<void>
  registarSaida(args: { positionId: string; nivel: number; fraccao: number; preco: number; fechouTudo: boolean }): Promise<void>
  /** Preço ao vivo (só com trailing em tempo real). null = usa o da posição. */
  precoVivo(): Promise<number | null>
}

export interface ConfigPremium {
  earlyBeRatio: number
  lockProfitPips: number
  beBufferPips: number
  trailingTempoReal: boolean
  /** A linha é da conta MESTRE (só aí se espelha aos subscritores). */
  espelhar: boolean
}

/** Os mesmos valores por omissão e as mesmas validações do monitor. */
export function configPremiumDoAmbiente(env: Record<string, string | undefined> = process.env): Omit<ConfigPremium, 'trailingTempoReal' | 'espelhar'> {
  const ratio = Number(env.PREMIUM_EARLY_BE_RATIO)
  const lock = Number(env.PREMIUM_LOCK_PROFIT_PIPS)
  const buf = Number(env.PREMIUM_BE_BUFFER_PIPS)
  return {
    earlyBeRatio: Number.isFinite(ratio) && ratio > 0 && ratio <= 2 ? ratio : 0.4,
    lockProfitPips: Number.isFinite(lock) && lock > 0 ? lock : 12,
    beBufferPips: Number.isFinite(buf) && buf >= 0 ? buf : 5,
  }
}

/** Quanto tempo depois do sinal uma posição sem comentário ainda conta como sendo dele. */
export const JANELA_CASAMENTO_MS = 10 * 60 * 1000

/** Preço de referência: o PREENCHIMENTO REAL, não o nível escrito no sinal. */
export function precoDeReferencia(row: Pick<LinhaPremium, 'entry'>, pos: Pick<PosicaoGestao, 'openPrice'>): number {
  const fill = pos.openPrice
  if (Number.isFinite(fill) && fill > 0) return fill
  return row.entry && row.entry > 0 ? row.entry : 0
}

/** Preço-alvo do BE = entrada + buffer a FAVOR (nunca na entrada seca). */
export function beTargetPrice(entry: number, direction: 'buy' | 'sell', symbol: string, bufferPips: number): number {
  const buf = bufferPips * pipSizeForSymbol(symbol)
  return direction === 'buy' ? entry + buf : entry - buf
}

export function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

export function positionDir(p: Pick<PosicaoGestao, 'type'>): 'buy' | 'sell' {
  return /buy/i.test(p.type) ? 'buy' : 'sell'
}

/** A posição desta linha na lista da conta (comentário → hora de abertura; par canónico). */
export function acharPosicao<P extends PosicaoGestao>(positions: P[], row: Pick<LinhaPremium, 'symbol' | 'direction' | 'created_at'>): P | undefined {
  const candidatas = positions.filter(
    (p) => symbolMatchesCanonical(p.symbol, row.symbol) && positionDir(p) === row.direction,
  )
  return (
    candidatas.find((p) => /prem/i.test(p.comment ?? '') || /gold\s*did/i.test(p.comment ?? '')) ??
    candidatas.find((p) => {
      if (!p.time) return false
      const dt = Math.abs(Date.parse(p.time) - Date.parse(row.created_at))
      return Number.isFinite(dt) && dt <= JANELA_CASAMENTO_MS
    })
  )
}

/**
 * Gere UMA linha com a posição já encontrada. Muta `row` como o monitor sempre fez (o estado da
 * passagem). Devolve o número de acções contadas pelo monitor; as notas vão para `detail`.
 */
export async function gerirLinhaPremium(
  row: LinhaPremium,
  pos: PosicaoGestao,
  cfg: ConfigPremium,
  ops: OperacoesPremium,
  detail: string[],
): Promise<number> {
  let actions = 0
  const pipSizeFor = pipSizeForSymbol
  const beTarget = (entry: number, direction: 'buy' | 'sell', symbol: string) => beTargetPrice(entry, direction, symbol, cfg.beBufferPips)

  let price = pos.currentPrice
  if (cfg.trailingTempoReal) {
    const vivo = await ops.precoVivo()
    // Falhar a leitura NÃO pára a gestão: cai no instantâneo, que é o que havia antes.
    if (vivo != null && vivo > 0) price = vivo
  }
  if (price == null || !Number.isFinite(price)) return actions

  // ── PERFIL TRAILING (Sensei e outras rotas) ───────────────────────────────
  if (row.profile === 'trailing') {
    const ref = precoDeReferencia(row, pos)
    if (ref <= 0 || !row.sl || row.sl <= 0) return actions
    const pip = pipSizeFor(row.symbol)
    const riscoPips = Math.max(1, Math.abs(ref - row.sl) / pip)
    const lucroPips = (row.direction === 'buy' ? price - ref : ref - price) / pip

    const pico = Math.max(row.peak_profit_pips ?? 0, lucroPips)
    if (pico > (row.peak_profit_pips ?? 0)) {
      await ops.gravar({ peak_profit_pips: pico })
      row.peak_profit_pips = pico
    }

    const arranqueDaFonte = trailingArrancaPips(row.source_key)
    const gatilho = arranqueDaFonte ?? cfg.earlyBeRatio * riscoPips
    if (pico < gatilho) return actions

    const spec = premiumTrailingAfterTp1Hit(Math.round(riscoPips))
    const trailPips = spec.mode === 'threshold_pips' ? spec.trailPips : 45
    const piso = beTarget(ref, row.direction, row.symbol)
    const candidato = row.direction === 'buy' ? price - trailPips * pip : price + trailPips * pip
    const novo = row.direction === 'buy' ? Math.max(candidato, piso) : Math.min(candidato, piso)
    const atual = pos.stopLoss ?? null
    const melhora = atual == null
      ? true
      : row.direction === 'buy' ? novo > atual + pip * 0.5 : novo < atual - pip * 0.5
    if (!melhora) return actions
    try {
      await ops.modificar(novo, pos.takeProfit)
      if (!row.trailing_started || !row.profit_locked) {
        await ops.gravar({ trailing_started: true, profit_locked: true })
        row.trailing_started = true
        row.profit_locked = true
      }
      actions++
      detail.push(
        `${row.symbol}: trailing → stop ${novo.toFixed(2)} (${trailPips}p atrás, pico +${pico.toFixed(0)}p de ${riscoPips.toFixed(0)}p de risco)`,
      )
    } catch {
      detail.push(`${row.symbol}: trailing falhou`)
    }
    return actions
  }

  // ── TRANCA DE LUCRO ────────────────────────────────────────────────────────────
  {
    const pip = pipSizeFor(row.symbol)
    const ref = precoDeReferencia(row, pos)
    const lucroPips = ref > 0
      ? (row.direction === 'buy' ? price - ref : ref - price) / pip
      : 0
    const pico = Math.max(row.peak_profit_pips ?? 0, lucroPips)
    if (pico > (row.peak_profit_pips ?? 0)) {
      await ops.gravar({ peak_profit_pips: pico })
      row.peak_profit_pips = pico
    }
    if (!row.profit_locked && ref > 0 && pico >= cfg.lockProfitPips) {
      try {
        await ops.modificar(beTarget(ref, row.direction, row.symbol), undefined)
        await ops.gravar({ profit_locked: true })
        row.profit_locked = true
        actions++
        detail.push(`${row.symbol}: lucro trancado — stop em BE (pico +${pico.toFixed(0)}p)`)
      } catch {
        detail.push(`${row.symbol}: tranca de lucro falhou`)
      }
    }
  }

  // ── TRAILING A PARTIR DO TP1 (ratchet no nosso lado) ───────────────────────────
  if ((row.exits_done >= 1 || row.trailing_started) && precoDeReferencia(row, pos) > 0) {
    const pip = pipSizeFor(row.symbol)
    const ref = precoDeReferencia(row, pos)
    const riskPips = row.sl && row.sl > 0
      ? Math.max(1, Math.round(Math.abs(ref - row.sl) / pip))
      : null
    const spec = premiumTrailingAfterTp1Hit(riskPips)
    const trailPips = spec.mode === 'threshold_pips' ? spec.trailPips : 45
    const distancia = trailPips * pip
    const piso = beTarget(ref, row.direction, row.symbol)
    const atual = pos.stopLoss ?? null
    const candidato = row.direction === 'buy' ? price - distancia : price + distancia
    const novo = row.direction === 'buy' ? Math.max(candidato, piso) : Math.min(candidato, piso)
    const melhora = atual == null
      ? true
      : row.direction === 'buy' ? novo > atual + pip * 0.5 : novo < atual - pip * 0.5
    if (melhora) {
      try {
        await ops.modificar(novo, undefined)
        actions++
        detail.push(`${row.symbol}: trailing pós-TP1 → stop ${novo.toFixed(2)} (${trailPips}p atrás do preço)`)
      } catch {
        detail.push(`${row.symbol}: trailing pós-TP1 falhou`)
      }
    }
  }

  // ── BE PROTETOR CEDO (price-based) ──────────────────────────────────────────────
  if (
    row.exits_done === 0 &&
    !row.trailing_started &&
    !row.early_trail_started &&
    precoDeReferencia(row, pos) > 0 &&
    row.sl && row.sl > 0
  ) {
    const ref = precoDeReferencia(row, pos)
    const riskDist = Math.abs(ref - row.sl)
    const profitDist = row.direction === 'buy' ? price - ref : ref - price
    if (riskDist > 0 && profitDist >= cfg.earlyBeRatio * riskDist) {
      try {
        await ops.modificar(beTarget(ref, row.direction, row.symbol), undefined)
        await ops.gravar({ early_trail_started: true })
        actions++
        const pp = pipSizeFor(row.symbol)
        detail.push(
          `${row.symbol}: BE protetor a +${(profitDist / pp).toFixed(0)}p (≥${(cfg.earlyBeRatio * 100).toFixed(0)}% do risco ${(riskDist / pp).toFixed(0)}p)`,
        )
        return actions
      } catch {
        detail.push(`${row.symbol}: BE protetor falhou`)
      }
    }
  }

  // ── Regra ZONA LARGA (SL ~100 pips): arranca trailing a +40.5 pips, ANTES do Exit 1 ──
  if (
    row.exits_done === 0 &&
    !row.trailing_started &&
    !row.early_trail_started &&
    row.entry && row.entry > 0 &&
    row.sl && row.sl > 0
  ) {
    const pipSize = pipSizeFor(row.symbol)
    const riskPips = Math.max(1, Math.round(Math.abs(row.entry - row.sl) / pipSize))
    const isWideZone = riskPips >= PREMIUM_WIDE_ZONE_SL_PIPS - 10
    if (isWideZone) {
      const profitPips = (row.direction === 'buy' ? price - row.entry : row.entry - price) / pipSize
      if (profitPips >= PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS) {
        try {
          const trailing = premiumTrailingAfterTp1Hit(riskPips)
          await ops.modificar(row.sl, undefined, trailing)
          await ops.gravar({ early_trail_started: true })
          actions++
          detail.push(
            `${row.symbol}: zona larga (${riskPips}p SL) → trailing a +${PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS}p (pré-Exit 1)`,
          )
        } catch {
          detail.push(`${row.symbol}: trailing zona larga falhou`)
        }
      }
    }
  }

  if (row.small_account && row.exits_done >= 1) return actions

  const nextLevel = row.exits_done + 1
  if (nextLevel > 3) return actions
  const tps = [row.tp1, row.tp2, row.tp3]
  const pcts = [row.exit_pct_tp1, row.exit_pct_tp2, row.exit_pct_tp3]
  const tpPrice = tps[nextLevel - 1]
  if (tpPrice == null || tpPrice <= 0) return actions

  const hit = row.direction === 'buy' ? price >= tpPrice : price <= tpPrice
  if (!hit) return actions

  const currentVol = pos.volume ?? 0
  if (currentVol <= 0) {
    await ops.encerrar('closed')
    return actions
  }

  // ── CONTA PEQUENA: NÃO FECHA NO EXIT 1 — PASSA A TRAILING ────────────────────
  if (row.small_account) {
    const ref = precoDeReferencia(row, pos)
    let arrancou = false
    try {
      const tpFinal = (row.tp3 && row.tp3 > 0 ? row.tp3 : null) ?? (row.tp2 && row.tp2 > 0 ? row.tp2 : null) ?? undefined
      await ops.modificar(beTarget(ref, row.direction, row.symbol), tpFinal)
      arrancou = true
      actions++
      detail.push(`${row.symbol}: conta pequena → Exit 1 sem fechar, BE + trailing pelo motor`)
    } catch {
      detail.push(`${row.symbol}: conta pequena → BE do Exit 1 falhou`)
    }
    const pct1 = pcts[0] ?? 33
    const m = cfg.espelhar && await ops.espelhar({ kind: 'close_frac', frac: pct1 / 100 })
    if (m && (m.acted || m.skipped)) detail.push(`${row.symbol}: subs Exit 1 → ${m.acted} escalaram, ${m.skipped} seguraram`)
    await ops.gravar({ exits_done: 1, trailing_started: arrancou })
    return actions
  }

  const pct = pcts[nextLevel - 1] ?? 0
  const wanted = roundLot(row.original_lot * (pct / 100))
  const closeAll = wanted >= currentVol - 1e-9 || nextLevel === 3
  let ok = false
  if (closeAll) {
    const r = await ops.fechar()
    ok = r.success
    if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha tudo (${currentVol})`)
    if (ok) {
      const m = cfg.espelhar && await ops.espelhar({ kind: 'close_all' })
      if (m && m.acted) detail.push(`${row.symbol}: Exit ${nextLevel} → ${m.acted} subs fechados`)
    }
  } else {
    const r = await ops.fechar(wanted)
    ok = r.success
    if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha ${pct}% (${wanted})`)
    if (ok && currentVol > 0) {
      const m = cfg.espelhar && await ops.espelhar({ kind: 'close_frac', frac: wanted / currentVol })
      if (m && (m.acted || m.skipped)) detail.push(`${row.symbol}: Exit ${nextLevel} subs → ${m.acted} escalaram, ${m.skipped} seguraram`)
    }
  }
  if (!ok) {
    detail.push(`${row.symbol}: fecho Exit ${nextLevel} falhou`)
    return actions
  }
  actions++
  await ops.registarSaida({
    positionId: String(pos.id),
    nivel: nextLevel,
    fraccao: closeAll ? Math.max(0, 1 - (pcts.slice(0, nextLevel - 1).reduce((x, y) => x + y, 0) / 100)) : pct / 100,
    preco: price,
    fechouTudo: closeAll,
  })

  const patch: Record<string, unknown> = { exits_done: nextLevel }
  if (closeAll && nextLevel >= 3) patch.status = 'closed'

  // Exit 1 → break-even + trailing ancorado ao risco (na % que fica a correr)
  if (nextLevel === 1 && !row.trailing_started && row.entry && row.entry > 0 && !closeAll) {
    try {
      const pipSize = pipSizeForSymbol(row.symbol)
      const riskPips =
        row.entry && row.sl && row.sl > 0
          ? Math.max(1, Math.round(Math.abs(row.entry - row.sl) / pipSize))
          : null
      const trailing = premiumTrailingAfterTp1Hit(riskPips)
      const runnerTp = (row.tp3 && row.tp3 > 0 ? row.tp3 : null) ?? (row.tp2 && row.tp2 > 0 ? row.tp2 : null) ?? (row.tp1 && row.tp1 > 0 ? row.tp1 : null) ?? undefined
      const beSl = beTarget(row.entry, row.direction, row.symbol)
      await ops.modificar(beSl, runnerTp, trailing)
      patch.trailing_started = true
      detail.push(`${row.symbol}: BE (+${cfg.beBufferPips}p) + trailing + TP runner (${runnerTp ?? '—'}) após Exit 1`)
      const m = cfg.espelhar && await ops.espelhar({ kind: 'be_trailing', beSl, trailing })
      if (m && m.acted) detail.push(`${row.symbol}: BE+trailing em ${m.acted} subs`)
    } catch {
      detail.push(`${row.symbol}: trailing falhou`)
    }
  }

  if (patch.status === 'closed') {
    await ops.encerrar('target_final', patch)
  } else {
    await ops.gravar(patch)
  }
  return actions
}
