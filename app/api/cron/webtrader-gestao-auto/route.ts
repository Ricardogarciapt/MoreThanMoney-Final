import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correrGestaoAutoDeTodas } from '@/lib/webtrader/gestao-auto-servidor'

/**
 * CRON: gestão automática (Auto BE / Auto Trailing) das posições em contas de CORRETORA do WebTrader.
 *
 * Porque é preciso uma cron: o browser não pode ser o motor de um SL de dinheiro real — fecha-se o
 * separador e a gestão parava a meio. Com o WebTrader aberto a gestão já corre à conta da leitura de
 * posições (a segundos); isto é o que a mantém viva quando ninguém está a olhar.
 *
 * Só mexe em SLs de posições com configuração gravada pelo dono. Ver lib/webtrader/gestao-auto-real.ts.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ success: true, ...(await correrGestaoAutoDeTodas()) })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}
