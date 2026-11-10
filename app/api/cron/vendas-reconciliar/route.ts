/**
 * Cron diário — O LIVRO DE VENDAS FECHA COM O STRIPE.
 *
 * Regista no livro (`vendas_vendas`) os pagamentos que o Stripe diz que entraram e que o webhook
 * não gravou, e preenche o código do agente nas primeiras faturas com valor que ficaram sem ele.
 * A lógica está em `lib/vendas/reconciliar-stripe.ts`.
 *
 *   ?dias=N   janela em dias (omissão 3, máx. 90) — para a recuperação do histórico usa-se 45
 *   ?ensaio=1 devolve o que faria sem gravar
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { reconciliarStripe } from '@/lib/vendas/reconciliar-stripe'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dias = Number(req.nextUrl.searchParams.get('dias') ?? 3)
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  try {
    const r = await reconciliarStripe(getStripeClient(), getSupabaseAdmin(), { dias, ensaio })
    if (r.registadas || r.codigosPreenchidos) {
      console.log(`[vendas-reconciliar] ${r.registadas} vendas registadas, ${r.codigosPreenchidos} códigos preenchidos (${r.dias} d)`)
    }
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[vendas-reconciliar] falhou:', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
