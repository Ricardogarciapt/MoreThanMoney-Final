/**
 * Cron diário — O LIVRO DE VENDAS FECHA COM O STRIPE.
 *
 * Regista no livro (`vendas_vendas`) os pagamentos que o Stripe diz que entraram e que o webhook
 * não gravou, e preenche o código do agente nas primeiras faturas com valor que ficaram sem ele.
 * A lógica está em `lib/vendas/reconciliar-stripe.ts`.
 *
 *   ?dias=N   janela em dias (omissão 3, máx. 90; a primeira corrida de sempre usa 45)
 *   ?ensaio=1 devolve o que faria sem gravar
 *
 * Corre duas vezes por dia (06:20 e 13:20 UTC): é idempotente, e a 11/11 a base deu 503 às 06:20.
 *
 * Depois de fechar o livro, PAGA o que já foi aprovado (23/11/2026; aqui e não num cron novo porque
 * o vercel.json está no tecto de 100 crons): acerta o estado das contas Stripe Connect por acabar,
 * transfere as comissões da equipa aprovadas e fora da janela de 30 dias, e as do MLM aprovadas
 * cujo beneficiário já tem conta completa. Interruptor: `site_settings.comissoes_pagamento.auto`.
 * Com `?ensaio=1` só mostra o plano. O resumo fica em `site_settings.comissoes_pagamento.ultima`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { reconciliarStripe } from '@/lib/vendas/reconciliar-stripe'
import { sincronizarContasPorAcabar } from '@/lib/pagamentos/connect'
import { pagamentoAutomaticoLigado, pagarComissoesAprovadas, CHAVE_DEFINICOES } from '@/lib/pagamentos/comissoes-stripe'
import { payApprovedCommissions } from '@/lib/mlm-commission-payout'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CHAVE_ULTIMA = 'vendas_reconciliar_ultima'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  // A PRIMEIRA corrida recupera o histórico (45 dias) sozinha — ninguém tem de se lembrar de a
  // lançar à mão. As seguintes olham só para os últimos 3 dias.
  const { data: marca } = await db.from('site_settings').select('value').eq('key', CHAVE_ULTIMA).maybeSingle()
  const pedido = req.nextUrl.searchParams.get('dias')
  const dias = pedido ? Number(pedido) : marca ? 3 : 45
  try {
    const r = await reconciliarStripe(getStripeClient(), db, { dias, ensaio })
    // Só marca quando tudo entrou: se alguma escrita falhou (base lenta), a próxima corrida volta
    // a olhar para a mesma janela — na primeira de sempre, os 45 dias outra vez.
    if (!ensaio && r.falhadas === 0) {
      await db
        .from('site_settings')
        .upsert({ key: CHAVE_ULTIMA, value: { em: new Date().toISOString(), dias, registadas: r.registadas } }, { onConflict: 'key' })
    }
    if (r.registadas || r.codigosPreenchidos || r.falhadas) {
      console.log(`[vendas-reconciliar] ${r.registadas} vendas registadas, ${r.codigosPreenchidos} códigos preenchidos, ${r.falhadas} por gravar (${r.dias} d)`)
    }
    const pagamentos = await pagarAprovadas(db, ensaio)
    return NextResponse.json({ ok: true, ...r, pagamentos })
  } catch (e) {
    console.error('[vendas-reconciliar] falhou:', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

async function pagarAprovadas(db: ReturnType<typeof getSupabaseAdmin>, ensaio: boolean) {
  const stripe = getStripeClient()
  try {
    const contas = ensaio ? null : await sincronizarContasPorAcabar(db, stripe)
    const auto = await pagamentoAutomaticoLigado(db)
    const equipa = await pagarComissoesAprovadas(db, stripe, { ensaio: ensaio || !auto })

    let mlm: { transferred: number; failed: number } | null = null
    if (auto && !ensaio) {
      const { data: prontas } = await db
        .from('mlm_commissions')
        .select('id, beneficiary:profiles!mlm_commissions_beneficiary_id_fkey(stripe_connect_status, user_type)')
        .eq('status', 'approved')
        .limit(500)
      const ids = (prontas ?? [])
        .filter((c: Record<string, unknown>) => {
          const b = (Array.isArray(c.beneficiary) ? c.beneficiary[0] : c.beneficiary) as { stripe_connect_status?: string; user_type?: string } | null
          return b?.stripe_connect_status === 'complete' && b?.user_type !== 'admin'
        })
        .map((c: Record<string, unknown>) => String(c.id))
      if (ids.length) {
        const r = await payApprovedCommissions(db, stripe, ids)
        mlm = { transferred: r.transferred, failed: r.failed }
      }
    }

    const resumo = {
      em: new Date().toISOString(),
      auto,
      contas,
      equipa: { pagos: equipa.pagos.length, falhados: equipa.falhados, espera: equipa.espera.length, totalPagoCents: equipa.pagos.reduce((t, p) => t + p.totalCents, 0) },
      mlm,
    }
    if (!ensaio) {
      const { data: atual } = await db.from('site_settings').select('value').eq('key', CHAVE_DEFINICOES).maybeSingle()
      await db
        .from('site_settings')
        .upsert({ key: CHAVE_DEFINICOES, value: { ...((atual?.value as object) ?? {}), ultima: resumo } }, { onConflict: 'key' })
    }
    if (equipa.pagos.length || equipa.falhados.length || mlm?.transferred) {
      console.log(`[comissoes-pagar] equipa ${equipa.pagos.length} pagos, ${equipa.falhados.length} falhados; mlm ${mlm?.transferred ?? 0}`)
    }
    return { ...resumo, plano: ensaio ? equipa : undefined }
  } catch (e) {
    console.error('[comissoes-pagar] falhou:', e)
    return { erro: e instanceof Error ? e.message : String(e) }
  }
}
