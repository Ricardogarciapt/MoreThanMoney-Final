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
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { reconciliarStripe } from '@/lib/vendas/reconciliar-stripe'

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
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[vendas-reconciliar] falhou:', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
