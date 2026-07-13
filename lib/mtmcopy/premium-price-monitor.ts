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
import { premiumTrailingAfterTp1Hit } from './premium-trade-active'

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
          /prem/i.test(p.comment ?? ''),
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
      } else {
        const r = await closePositionById(accountId, pos.id, wanted)
        ok = r.success
        if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha ${pct}% (${wanted})`)
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
        } catch {
          detail.push(`${row.symbol}: trailing falhou`)
        }
      }

      await admin.from('mtmcopy_premium_active').update(patch).eq('id', row.id)
    }
  }

  return { ran: true, checked, actions, detail }
}
