/**
 * Resumo mínimo de uma sessão de checkout — alimenta o evento 'purchase'
 * CLIENT-SIDE na página /success (mesmo externalEventId = session.id que o
 * webhook usa server-side → os dois dedupem para um único evento no Opinly).
 * Só expõe valor/moeda/estado; o session id (cs_…) é um bearer não-adivinhável
 * que o próprio Stripe põe no URL de retorno.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe-client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim()
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'session_id inválido' }, { status: 400 })
  }
  try {
    const session = await getStripeClient().checkout.sessions.retrieve(sessionId)
    return NextResponse.json({
      paid: session.payment_status === 'paid',
      value: session.amount_total != null ? session.amount_total / 100 : null,
      currency: (session.currency ?? 'eur').toUpperCase(),
    })
  } catch {
    return NextResponse.json({ error: 'sessão não encontrada' }, { status: 404 })
  }
}
