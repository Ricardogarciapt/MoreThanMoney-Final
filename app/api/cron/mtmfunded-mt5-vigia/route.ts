import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * VIGIA DAS CONTAS MT5 DO MTM FUNDED — de 10 em 10 minutos.
 *
 * Por conta: `positions` (50 créditos); com posições abertas, `account-information` e as regras de
 * perda diária/máxima; leitura completa (com histórico) a cada `minutos_entre_leituras`; contas
 * paradas há 48 h sem posições → undeploy; deploy quando o dono volta ou na varredura diária.
 * Regras e custos: lib/mtmfunded/leitura-mt5.ts. As contas simuladas não passam por aqui.
 */
function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET
  if (!esperado) return false
  const dado =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ??
    request.nextUrl.searchParams.get('secret')
  const a = Buffer.from(String(dado ?? ''))
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const { getMtmFundedConfig } = await import('@/lib/mtmfunded/config')
  const { vigiarContasMt5 } = await import('@/lib/mtmfunded/leitura-mt5-servidor')
  const notas: string[] = []
  const cfg = await getMtmFundedConfig()
  const r = await vigiarContasMt5(getSupabaseAdmin(), notas, cfg.minutos_entre_leituras)
  return NextResponse.json({ ok: true, ...r, notas })
}
