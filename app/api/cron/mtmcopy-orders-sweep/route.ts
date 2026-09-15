import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sweepStalePendingOrders } from '@/lib/mtmcopy/metaapi'
import { CANONICAL_TRADE_IDEAS_ACCOUNT_ID } from '@/lib/mtmcopy/provider-constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * CRON — Limpeza de ordens pendentes do MTM Auto Forex (Trade Ideas).
 *
 * O forex entra por LIMIT (pullback à entrada). Quando o preço nunca volta à entrada,
 * a ordem fica pendurada indefinidamente. Este cron RETIRA as pendentes que:
 *   - passaram X tempo sem encher  (env TRADEIDEAS_ORDER_TTL_MIN, default 240min = 4h), ou
 *   - o preço já atingiu o TP (movimento aconteceu sem a entrada encher), ou o SL (invalidado).
 *
 * Agendado a cada 10 min no vercel.json. Idempotente.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // A conta Forex (fbeeafeb) foi apagada na MetaApi: sem conta não há ordens para varrer, e pedir
  // uma conta inexistente de 10 em 10 min ajudou a estrangular o token (15/09).
  if (!CANONICAL_TRADE_IDEAS_ACCOUNT_ID) {
    return NextResponse.json({ ok: true, skipped: 'sem_conta_forex' })
  }
  const maxAgeMinutes = Number(process.env.TRADEIDEAS_ORDER_TTL_MIN || 240)
  const nowMs = Date.now()

  try {
    const res = await sweepStalePendingOrders(CANONICAL_TRADE_IDEAS_ACCOUNT_ID, {
      maxAgeMinutes,
      nowMs,
      cancelOnTpHit: true,
      cancelOnSlHit: true,
    })
    console.log(
      `🧹 [orders-sweep] forex: scanned=${res.scanned} cancelled=${res.cancelled} kept=${res.kept}`,
      res.details.length ? res.details : '',
      res.errors.length ? `errors=${JSON.stringify(res.errors)}` : '',
    )
    return NextResponse.json({ ok: true, account: 'trade-ideas', maxAgeMinutes, ...res })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro no sweep'
    console.error('❌ [orders-sweep] falhou:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
