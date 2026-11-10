import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { sincronizarPeriodoGratis } from '@/lib/periodos-gratis'

/**
 * GET/POST /api/admin/periodos-gratis — trial de 3 dias e campanha 90 dias.
 *
 * Lê o espelho `periodos_gratis` (migração 237) com o perfil e o patrocinador MLM, e actua no
 * Stripe (a fonte de verdade): prorrogar muda o `trial_end`, cancelar cancela a subscrição.
 * O webhook volta a escrever o espelho; aqui sincroniza-se logo para o ecrã não esperar.
 *
 * Abre com `bo.gestao_comercial` (o admin entra sempre): é o mesmo acesso dos cupões.
 */

const DIA = 86_400

export async function GET(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado
  const db = getSupabaseAdmin()
  const estado = request.nextUrl.searchParams.get('estado')
  const origem = request.nextUrl.searchParams.get('origem')

  let q = db
    .from('periodos_gratis')
    .select('stripe_subscription_id, user_id, origem, inicio, fim, estado, tem_metodo_pagamento, atualizado_em')
    .order('fim', { ascending: true, nullsFirst: false })
    .limit(500)
  if (estado) q = q.eq('estado', estado)
  if (origem) q = q.eq('origem', origem)
  const { data, error } = await q
  if (error) {
    // Tabela ainda por criar (migração 237 por aplicar): ecrã vazio com aviso, não 500.
    return NextResponse.json({ linhas: [], aviso: 'Tabela periodos_gratis indisponível: aplicar a migração 237.' })
  }

  const ids = [...new Set((data ?? []).map((l) => l.user_id).filter(Boolean))] as string[]
  const { data: perfis } = ids.length
    ? await db
        .from('profiles')
        .select('id, full_name, email, username, mlm_sponsor_username, member_category, subscription_plan, is_active')
        .in('id', ids)
    : { data: [] as Array<Record<string, unknown>> }
  const porId = new Map((perfis ?? []).map((p) => [String(p.id), p]))

  const agora = Date.now()
  const linhas = (data ?? []).map((l) => {
    const p = (l.user_id ? porId.get(l.user_id) : undefined) as Record<string, unknown> | undefined
    const fimMs = l.fim ? new Date(l.fim).getTime() : null
    return {
      ...l,
      nome: (p?.full_name as string) || (p?.username as string) || null,
      email: (p?.email as string) || null,
      patrocinador: (p?.mlm_sponsor_username as string) || null,
      plano: (p?.subscription_plan as string) || null,
      ativo: p?.is_active !== false,
      dias_restantes: fimMs && l.estado === 'a_decorrer' ? Math.max(0, Math.ceil((fimMs - agora) / (DIA * 1000))) : null,
    }
  })

  const contagem = {
    a_decorrer: linhas.filter((l) => l.estado === 'a_decorrer').length,
    convertido: linhas.filter((l) => l.estado === 'convertido').length,
    terminado_sem_pagamento: linhas.filter((l) => l.estado === 'terminado_sem_pagamento').length,
    cancelado: linhas.filter((l) => l.estado === 'cancelado').length,
  }
  return NextResponse.json({ linhas, contagem })
}

export async function POST(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado
  const body = (await request.json().catch(() => ({}))) as { subscriptionId?: string; acao?: string; dias?: number }
  const subscriptionId = String(body.subscriptionId ?? '')
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    return NextResponse.json({ error: 'subscriptionId inválido' }, { status: 400 })
  }
  const stripe = getStripeClient()
  const sub = await stripe.subscriptions.retrieve(subscriptionId)

  if (body.acao === 'prorrogar') {
    const dias = Math.round(Number(body.dias))
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
      return NextResponse.json({ error: 'dias tem de estar entre 1 e 365' }, { status: 400 })
    }
    if (sub.status !== 'trialing' || !sub.trial_end) {
      return NextResponse.json({ error: 'Só se prorroga um período grátis que ainda está a decorrer.' }, { status: 409 })
    }
    const atualizada = await stripe.subscriptions.update(subscriptionId, {
      trial_end: sub.trial_end + dias * DIA,
      proration_behavior: 'none',
    })
    await sincronizarPeriodoGratis(atualizada)
    return NextResponse.json({ ok: true, fim: new Date((atualizada.trial_end ?? 0) * 1000).toISOString() })
  }

  if (body.acao === 'cancelar') {
    if (sub.status === 'canceled') return NextResponse.json({ ok: true, jaEstava: true })
    // O webhook customer.subscription.deleted fecha o acesso (com a página /ativar-premium).
    const cancelada = await stripe.subscriptions.cancel(subscriptionId)
    await sincronizarPeriodoGratis(cancelada)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acao tem de ser prorrogar ou cancelar' }, { status: 400 })
}
