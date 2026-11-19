/**
 * Cron diário — CUPÕES ↔ STRIPE (regras em lib/cupoes-sync.ts).
 *
 * Desliga na base os cupões com data de fim passada, cria no Stripe os que faltam, recria os que
 * mudaram de termos no painel e desativa os promotion codes de cupões mortos. O resumo fica em
 * `site_settings.cupoes_sync`. `?ensaio=1` só mostra o que está fora de sítio.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sincronizarTodosOsCupoes } from '@/lib/cupoes-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const db = getSupabaseAdmin()
  try {
    const resumo = await sincronizarTodosOsCupoes(db, { ensaio })
    if (!ensaio) {
      await db.from('site_settings').upsert({ key: 'cupoes_sync', value: resumo }, { onConflict: 'key' })
    }
    return NextResponse.json({ ok: true, ensaio, ...resumo })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cupoes-sincronizar]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
