/**
 * Monitor de preço Premium — fecha os parciais por PREÇO (não por mensagem Telegram).
 * Uma posição por sinal na conta provider; o CopyFactory replica os fechos aos slaves.
 * Quando o preço toca cada Exit: fecha a % do split (>70% no Exit 1) e, no Exit 1,
 * move o SL para break-even + arranca o trailing ancorado ao risco.
 * Idempotente por `exits_done`. Default DESLIGADO (exec-switch premium_price_monitor).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import {
  listOpenPositions,
  closePositionById,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import {
  premiumTrailingAfterTp1Hit,
  PREMIUM_WIDE_ZONE_SL_PIPS,
  PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS,
} from './premium-trade-active'
import { mirrorPremiumExit } from './premium-subscriber-exits'

interface ActiveRow {
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
  /** null = Premium normal · 'golddid' = perfil Gold Did (BE @ +5.0 sem trailing, fecho no TP2). */
  profile: string | null
}

/** Gold Did: BE quando o preço avança este tanto (guia GMI: 50 pips = +5.0 no ouro, 1 pip = 0.1). */
const GOLDDID_BE_PRICE_MOVE = 5.0

/** Tamanho de pip por símbolo (ouro 0.1, JPY 0.01, resto 0.0001). */
function pipSizeFor(symbol: string): number {
  return /xau|gold/i.test(symbol) ? 0.1 : /jpy/i.test(symbol) ? 0.01 : 0.0001
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

function positionDir(p: MetaApiPosition): 'buy' | 'sell' {
  return /buy/i.test(p.type) ? 'buy' : 'sell'
}

export async function runPremiumPriceMonitor(): Promise<{
  ran: boolean
  checked: number
  actions: number
  detail: string[]
}> {
  const sw = await getExecSwitches()
  if (!sw.premium_price_monitor) return { ran: false, checked: 0, actions: 0, detail: ['monitor desligado'] }

  const admin = getSupabaseAdmin()
  const { data: rows } = await admin
    .from('mtmcopy_premium_active')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(200)

  const list = (rows ?? []) as ActiveRow[]
  if (!list.length) return { ran: true, checked: 0, actions: 0, detail: ['sem trades ativas'] }

  const byAccount = new Map<string, ActiveRow[]>()
  for (const r of list) {
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, [])
    byAccount.get(r.account_id)!.push(r)
  }

  const detail: string[] = []
  let actions = 0
  let checked = 0

  for (const [accountId, accRows] of byAccount) {
    let positions: MetaApiPosition[] = []
    try {
      positions = await listOpenPositions(accountId)
    } catch {
      continue
    }

    for (const row of accRows) {
      checked++
      const pos = positions.find(
        (p) =>
          p.symbol?.toUpperCase() === row.symbol.toUpperCase() &&
          positionDir(p) === row.direction &&
          (/prem/i.test(p.comment ?? '') || /gold\s*did/i.test(p.comment ?? '')),
      )
      if (!pos) {
        // Posição já não existe (fechada por trailing/SL/TP) → encerra o registo.
        await admin
          .from('mtmcopy_premium_active')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        continue
      }

      const price = pos.currentPrice
      if (price == null || !Number.isFinite(price)) continue

      // ── PERFIL GOLD DID ────────────────────────────────────────────────────────
      // Gestão SIMPLES da conta do Alcy: BE aos +5.0 (50 pips, sem trailing) e fecha no TP2.
      // (usa trailing_started como marcador de "BE feito" — Gold Did não faz trailing.)
      if (row.profile === 'golddid') {
        if (row.entry && row.entry > 0 && !row.trailing_started) {
          const move = row.direction === 'buy' ? price - row.entry : row.entry - price
          if (move >= GOLDDID_BE_PRICE_MOVE) {
            try {
              await modifyPositionSlTp(accountId, pos.id, row.entry, undefined, undefined, row.symbol)
              await admin
                .from('mtmcopy_premium_active')
                .update({ trailing_started: true, updated_at: new Date().toISOString() })
                .eq('id', row.id)
              actions++
              detail.push(`${row.symbol}: Gold Did → BE a +${GOLDDID_BE_PRICE_MOVE}`)
            } catch {
              detail.push(`${row.symbol}: Gold Did BE falhou`)
            }
          }
        }
        const tp2 = row.tp2
        if (tp2 && tp2 > 0 && (row.direction === 'buy' ? price >= tp2 : price <= tp2)) {
          try {
            const r = await closePositionById(accountId, pos.id)
            if (r?.success) {
              await admin
                .from('mtmcopy_premium_active')
                .update({ status: 'closed', exits_done: 2, updated_at: new Date().toISOString() })
                .eq('id', row.id)
              actions++
              detail.push(`${row.symbol}: Gold Did → fechou no TP2 ${tp2}`)
            }
          } catch {
            detail.push(`${row.symbol}: Gold Did fecho TP2 falhou`)
          }
        }
        continue // Gold Did NÃO corre a gestão Premium (parciais/trailing/BE-no-TP1)
      }

      // ── Regra ZONA LARGA (SL ~100 pips): arranca trailing a +40.5 pips, ANTES do Exit 1 ──
      // Se a entrada veio da zona mais larga (SL grande) e a trade já tem +40.5 pips de lucro,
      // arma o trailing para proteger o lucro caso o preço reverta sem tocar o TP1. O BE
      // continua a ser colocado no Exit 1 (regras existentes, abaixo).
      if (
        row.exits_done === 0 &&
        !row.trailing_started &&
        !row.early_trail_started &&
        row.entry && row.entry > 0 &&
        row.sl && row.sl > 0
      ) {
        const pipSize = pipSizeFor(row.symbol)
        const riskPips = Math.max(1, Math.round(Math.abs(row.entry - row.sl) / pipSize))
        const isWideZone = riskPips >= PREMIUM_WIDE_ZONE_SL_PIPS - 10 // tolerância: ≥90 conta como ~100
        if (isWideZone) {
          const profitPips = (row.direction === 'buy' ? price - row.entry : row.entry - price) / pipSize
          if (profitPips >= PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS) {
            try {
              const trailing = premiumTrailingAfterTp1Hit(riskPips)
              // Mantém o SL original como piso e arma o trailing (aperta à medida que corre).
              await modifyPositionSlTp(accountId, pos.id, row.sl, undefined, trailing, row.symbol)
              await admin
                .from('mtmcopy_premium_active')
                .update({ early_trail_started: true, updated_at: new Date().toISOString() })
                .eq('id', row.id)
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

      const nextLevel = row.exits_done + 1
      if (nextLevel > 3) continue
      const tps = [row.tp1, row.tp2, row.tp3]
      const pcts = [row.exit_pct_tp1, row.exit_pct_tp2, row.exit_pct_tp3]
      const tpPrice = tps[nextLevel - 1]
      if (tpPrice == null || tpPrice <= 0) continue

      const hit = row.direction === 'buy' ? price >= tpPrice : price <= tpPrice
      if (!hit) continue

      const currentVol = pos.volume ?? 0
      if (currentVol <= 0) {
        await admin
          .from('mtmcopy_premium_active')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        continue
      }

      // Conta pequena → fecha tudo no Exit 1
      if (row.small_account) {
        const r = await closePositionById(accountId, pos.id)
        if (r.success) {
          actions++
          detail.push(`${row.symbol}: conta pequena → fecha tudo no Exit 1`)
          // Subscritores escalam o seu Exit 1 (cada um conforme o seu lote), mesmo com a mestre pequena.
          const pct1 = pcts[0] ?? 33
          const m = await mirrorPremiumExit(row.symbol, row.direction, { kind: 'close_frac', frac: pct1 / 100 })
          if (m.acted || m.skipped) detail.push(`${row.symbol}: subs Exit 1 → ${m.acted} escalaram, ${m.skipped} seguraram`)
        }
        await admin
          .from('mtmcopy_premium_active')
          .update({ status: 'closed', exits_done: 3, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        continue
      }

      const pct = pcts[nextLevel - 1] ?? 0
      const wanted = roundLot(row.original_lot * (pct / 100))
      const closeAll = wanted >= currentVol - 1e-9 || nextLevel === 3
      let ok = false
      if (closeAll) {
        const r = await closePositionById(accountId, pos.id)
        ok = r.success
        if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha tudo (${currentVol})`)
        // Espelha o fecho total aos subscritores (CopyFactory não replica parciais).
        if (ok) {
          const m = await mirrorPremiumExit(row.symbol, row.direction, { kind: 'close_all' })
          if (m.acted) detail.push(`${row.symbol}: Exit ${nextLevel} → ${m.acted} subs fechados`)
        }
      } else {
        const r = await closePositionById(accountId, pos.id, wanted)
        ok = r.success
        if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha ${pct}% (${wanted})`)
        // Espelha a MESMA fração aos subscritores; cada um escala conforme o seu lote.
        if (ok && currentVol > 0) {
          const m = await mirrorPremiumExit(row.symbol, row.direction, { kind: 'close_frac', frac: wanted / currentVol })
          if (m.acted || m.skipped) detail.push(`${row.symbol}: Exit ${nextLevel} subs → ${m.acted} escalaram, ${m.skipped} seguraram`)
        }
      }
      if (!ok) {
        detail.push(`${row.symbol}: fecho Exit ${nextLevel} falhou`)
        continue
      }
      actions++

      const patch: Record<string, unknown> = { exits_done: nextLevel, updated_at: new Date().toISOString() }
      if (closeAll && nextLevel >= 3) patch.status = 'closed'

      // Exit 1 → break-even + trailing ancorado ao risco (na % que fica a correr)
      if (nextLevel === 1 && !row.trailing_started && row.entry && row.entry > 0 && !closeAll) {
        try {
          const pipSize = /xau|gold/i.test(row.symbol) ? 0.1 : /jpy/i.test(row.symbol) ? 0.01 : 0.0001
          const riskPips =
            row.entry && row.sl && row.sl > 0
              ? Math.max(1, Math.round(Math.abs(row.entry - row.sl) / pipSize))
              : null
          const trailing = premiumTrailingAfterTp1Hit(riskPips)
          await modifyPositionSlTp(accountId, pos.id, row.entry, undefined, trailing, row.symbol)
          patch.trailing_started = true
          detail.push(`${row.symbol}: BE + trailing após Exit 1`)
          // Espelha BE + trailing aos subscritores (protege o runner deles até Exit 2/3).
          const m = await mirrorPremiumExit(row.symbol, row.direction, { kind: 'be_trailing', beSl: row.entry, trailing })
          if (m.acted) detail.push(`${row.symbol}: BE+trailing em ${m.acted} subs`)
        } catch {
          detail.push(`${row.symbol}: trailing falhou`)
        }
      }

      await admin.from('mtmcopy_premium_active').update(patch).eq('id', row.id)
    }
  }

  return { ran: true, checked, actions, detail }
}
