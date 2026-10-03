import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { grantBrokerAccess, MIN_DEPOSIT } from '@/lib/telegram-broker-gate'

/**
 * Writer do `broker_clients` (peça que faltava para o funil broker-gate fechar sozinho).
 * Recebe o export de IB da PU Prime (linhas com uid/depósitos/saldo), faz upsert, e depois
 * faz um "sweep": reavalia os leads Telegram em espera cujo UID passou a validar (≥ $300
 * depósito E saldo) e concede-lhes acesso automaticamente (grantBrokerAccess).
 *
 * Bearer CRON_SECRET. body: { rows: [{uid, first_name?, last_name?, email?, deposits_usd, balance_usd}], source?, sweep? }
 */
export const dynamic = 'force-dynamic'

interface Row {
  uid?: string | number
  first_name?: string
  last_name?: string
  email?: string
  deposits_usd?: number | string
  balance_usd?: number | string
}

const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : 0)

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { rows?: Row[]; source?: string; sweep?: boolean }
  const supabase = getSupabaseAdmin()

  // 1) Upsert das linhas do export (chave = uid).
  const rows = (body.rows ?? [])
    .filter((r) => r.uid != null && String(r.uid).trim())
    .map((r) => ({
      uid: String(r.uid).trim(),
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      email: r.email ?? null,
      deposits_usd: num(r.deposits_usd),
      balance_usd: num(r.balance_usd),
      source: body.source ?? 'ib_import',
      updated_at: new Date().toISOString(),
    }))
  if (rows.length) {
    const { error } = await supabase.from('broker_clients').upsert(rows, { onConflict: 'uid' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // 2) Sweep: leads em espera com broker_uid que agora validam → auto-grant.
  const granted: string[] = []
  if (body.sweep !== false) {
    const { data: leads } = await supabase
      .from('telegram_leads')
      .select('chat_id, broker_uid, stage, username')
      .not('broker_uid', 'is', null)
      .not('stage', 'in', '(granted,revoked,rejected)')
    for (const l of leads ?? []) {
      const { data: bc } = await supabase
        .from('broker_clients')
        .select('deposits_usd, balance_usd')
        .eq('uid', String(l.broker_uid))
        .maybeSingle()
      if (bc && num(bc.deposits_usd) >= MIN_DEPOSIT && num(bc.balance_usd) >= MIN_DEPOSIT) {
        try {
          await grantBrokerAccess(supabase, String(l.chat_id))
          granted.push(String(l.username || l.chat_id))
        } catch (e) {
          console.error('[broker-ingest] grant falhou', l.chat_id, e instanceof Error ? e.message : e)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, upserted: rows.length, granted: granted.length, grantedList: granted })
}
