/**
 * Cron diário (08:00 UTC) — pagamentos do Stripe por faturar.
 * Copia os pagamentos dos últimos 35 dias para `financas_por_faturar` e manda ao admin, por Telegram,
 * a lista dos que ainda não têm fatura, cada um com o link «marcar faturado».
 * Não emite faturas nem fala com a AT. `?ensaio=1` devolve a lista sem gravar nem avisar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import { mensagem, pendentes, sincronizar } from '@/lib/financas/por-faturar'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo) return NextResponse.json({ error: 'CRON_SECRET em falta' }, { status: 500 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://www.morethanmoney.pt'
  try {
    const lidos = ensaio ? 0 : await sincronizar(getStripeClient(), db)
    const lista = await pendentes(db)
    const texto = mensagem(lista, base, segredo)
    if (texto && !ensaio) await avisarAdmin(db, texto)
    return NextResponse.json({ lidos, por_faturar: lista.length })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    if (!ensaio) await avisarAdmin(db, `⚠️ Lista de pagamentos por faturar falhou: ${erro}`)
    return NextResponse.json({ error: erro }, { status: 500 })
  }
}
