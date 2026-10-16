import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { processarBot } from '@/lib/crm/worker'
import { segredoValido } from '@/lib/crm/contrato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Autenticação obrigatória mesmo em dev. A VPS usa a mesma rota; não recebe service role. */
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null
  if (!segredoValido(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const resultado = await processarBot(getSupabaseAdmin())
    return NextResponse.json({ ok: true, ...resultado }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Worker indisponível.' }, { status: 503 })
  }
}
