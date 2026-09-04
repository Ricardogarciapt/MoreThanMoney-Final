import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { parseTelegramGroups } from '@/lib/mtmcopy/copy-methods'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * SAÚDE DAS LIGAÇÕES — o painel que teria apanhado os problemas de 20/08/2026 antes de custarem
 * dinheiro. Cada regra aqui nasceu de um defeito real:
 *
 *  · lote por MULTIPLICADOR sem risco definido → abria 1 lote inteiro (449.000 USD em ouro)
 *  · conta de Tap to Trade com grupos → executava sozinha o que o dono não aceitou
 *  · sem grupos NEM estratégia → o default silencioso punha-a a copiar Premium
 *  · conta financiada sem baseline → as guardas de drawdown não conseguem medir nada
 *  · MT5 em erro → o cliente pensa que está a copiar e não está
 */

type Gravidade = 'grave' | 'aviso'
interface Problema { gravidade: Gravidade; texto: string }

interface Ligacao {
  id: string
  user_id: string
  account_label: string | null
  purpose: string | null
  copy_method: string | null
  copyfactory_strategy_pick: string | null
  telegram_groups: string[] | null
  telegram_group: string | null
  lot_mode: string | null
  lot_value: number | null
  max_risk_percent: number | null
  t2t_enabled: boolean | null
  t2t_lot_mode: string | null
  t2t_lot_value: number | null
  prop_firm_type: string | null
  baseline_balance: number | null
  mt5_status: string | null
  is_active: boolean | null
  metrics_excluded: boolean | null
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const admin = getSupabaseAdmin()
  const { data: conns } = await admin
    .from('mtmcopy_connections')
    .select(
      'id, user_id, account_label, purpose, copy_method, copyfactory_strategy_pick, telegram_groups, telegram_group, ' +
      'lot_mode, lot_value, max_risk_percent, t2t_enabled, t2t_lot_mode, t2t_lot_value, prop_firm_type, ' +
      'baseline_balance, mt5_status, is_active, metrics_excluded',
    )
    .returns<Ligacao[]>()
  // Nota: inclui também as PAUSADAS (is_active=false) — sem elas o admin não tinha
  // onde as retomar. Os problemas só se avaliam nas ativas; pausada não copia nada.

  const userIds = [...new Set((conns ?? []).map((c) => c.user_id))]
  const { data: perfis } = await admin.from('profiles').select('id, email, full_name').in('id', userIds)
  const porUser = new Map((perfis ?? []).map((p) => [p.id as string, p]))

  const linhas = (conns ?? []).map((c) => {
    const problemas: Problema[] = []
    const ativa = c.is_active !== false
    const grupos = parseTelegramGroups(c as never)
    const temGruposGravados = Array.isArray(c.telegram_groups) && c.telegram_groups.length > 0
    const risco = Number(c.max_risk_percent) || 0

    if (ativa) {
      if (c.lot_mode === 'multiplier' && risco <= 0) {
        problemas.push({ gravidade: 'grave', texto: 'Lote por multiplicador sem risco definido — não consegue dimensionar' })
      }
      if (c.purpose === 'tap_to_trade' && temGruposGravados) {
        problemas.push({ gravidade: 'grave', texto: 'Conta de Tap to Trade com grupos — só deve abrir o que o dono aceitar' })
      }
      if (c.purpose !== 'tap_to_trade' && !temGruposGravados && !c.copyfactory_strategy_pick) {
        problemas.push({ gravidade: 'grave', texto: 'Sem grupos nem estratégia — copia Premium por defeito, sem ninguém ter escolhido' })
      }
      if (c.prop_firm_type && !(Number(c.baseline_balance) > 0)) {
        problemas.push({ gravidade: 'grave', texto: 'Conta financiada sem saldo inicial — as guardas de drawdown não conseguem medir' })
      }
      if (c.mt5_status === 'error') {
        problemas.push({ gravidade: 'aviso', texto: 'MT5 em erro — o cliente pensa que está a copiar e não está' })
      }
      if (c.mt5_status === 'disconnected') {
        problemas.push({ gravidade: 'aviso', texto: 'MT5 desligado' })
      }
      if (c.t2t_enabled && !c.t2t_lot_mode) {
        problemas.push({ gravidade: 'aviso', texto: 'Tap to Trade ligado sem sizing próprio — usa o da cópia' })
      }
    }

    const p = porUser.get(c.user_id)
    return {
      id: c.id,
      label: c.account_label ?? '(sem nome)',
      email: (p as { email?: string } | undefined)?.email ?? null,
      nome: (p as { full_name?: string } | undefined)?.full_name ?? null,
      purpose: c.purpose,
      metodo: c.copy_method,
      estrategia: c.copyfactory_strategy_pick,
      grupos: temGruposGravados ? grupos : [],
      lote: `${c.lot_mode ?? '—'} ${c.lot_value ?? ''}`.trim(),
      risco,
      propFirm: c.prop_firm_type,
      mt5: c.mt5_status,
      ativa,
      problemas,
    }
  })

  // Os problemas graves primeiro — é o que precisa de mão. Pausadas no fim.
  linhas.sort((a, b) => {
    if (a.ativa !== b.ativa) return a.ativa ? -1 : 1
    const ga = a.problemas.filter((x) => x.gravidade === 'grave').length
    const gb = b.problemas.filter((x) => x.gravidade === 'grave').length
    if (ga !== gb) return gb - ga
    return b.problemas.length - a.problemas.length
  })

  return NextResponse.json({
    ok: true,
    total: linhas.length,
    graves: linhas.filter((l) => l.problemas.some((p) => p.gravidade === 'grave')).length,
    avisos: linhas.filter((l) => l.problemas.some((p) => p.gravidade === 'aviso')).length,
    saudaveis: linhas.filter((l) => l.ativa && !l.problemas.length).length,
    linhas,
  })
}

/**
 * Pausar/retomar um SUBSCRIBER (pedido Ricardo 2026-09-04: controlar os subscritores
 * do CopyFactory e das estratégias a partir do admin).
 *  · pause  → is_active=false + unsubscribe CopyFactory JÁ (posições abertas ficam);
 *             o reconcile horário respeita is_active, por isso não religa sozinho.
 *  · resume → is_active=true + re-sync da subscrição CopyFactory da ligação.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const connectionId = String(body.connectionId ?? '').trim()
  const action = body.action === 'resume' ? 'resume' : body.action === 'pause' ? 'pause' : null
  if (!connectionId || !action) {
    return NextResponse.json({ error: 'connectionId e action (pause|resume) obrigatórios' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: conn, error } = await admin
    .from('mtmcopy_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle()
  if (error || !conn) return NextResponse.json({ error: 'ligação não encontrada' }, { status: 404 })

  const isActive = action === 'resume'
  const { error: upErr } = await admin
    .from('mtmcopy_connections')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', connectionId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  let copyfactory: string = 'skipped'
  try {
    if (action === 'pause') {
      const { removeConnectionCopyFactory } = await import('@/lib/mtmcopy/connection-sync')
      const r = await removeConnectionCopyFactory(conn.metaapi_account_id)
      copyfactory = r?.ok === false ? 'unsubscribe_failed' : 'unsubscribed'
    } else {
      const { syncConnectionCopyFactory } = await import('@/lib/mtmcopy/connection-sync')
      const r = await syncConnectionCopyFactory({ ...conn, is_active: true } as never)
      copyfactory = (r as { ok?: boolean } | undefined)?.ok === false ? 'sync_failed' : 'synced'
    }
  } catch (e) {
    copyfactory = `error: ${e instanceof Error ? e.message : String(e)}`
  }

  return NextResponse.json({ ok: true, connectionId, is_active: isActive, copyfactory })
}
