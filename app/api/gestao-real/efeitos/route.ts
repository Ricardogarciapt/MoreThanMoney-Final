import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { encerrarRegisto, registarSaida } from '@/lib/mtmcopy/premium-price-monitor'
import { mirrorPremiumExit, type PremiumMirrorAction } from '@/lib/mtmcopy/premium-subscriber-exits'

/**
 * EFEITOS DO MOTOR EM TEMPO REAL (VPS, só em LIVE) que vivem no site — exactamente as funções que o
 * monitor Premium chama: anúncio do fecho no chat/T2T (encerrarRegisto), registo da saída para a
 * prova (registarSaida) e espelho aos subscritores (mirrorPremiumExit). O motor decide; aqui só se
 * executa. Bearer CRON_SECRET. Em sombra nunca é chamado.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.tipo !== 'string') return NextResponse.json({ error: 'pedido inválido' }, { status: 400 })
  try {
    if (b.tipo === 'premium_espelhar') {
      const direction = b.direction === 'sell' ? 'sell' : 'buy'
      const r = await mirrorPremiumExit(String(b.symbol ?? ''), direction, b.acao as PremiumMirrorAction)
      return NextResponse.json({ success: true, acted: r.acted, skipped: r.skipped })
    }
    const rowId = String(b.rowId ?? '')
    if (!rowId) return NextResponse.json({ error: 'rowId em falta' }, { status: 400 })
    const admin = getSupabaseAdmin()
    const { data: row, error } = await admin.from('mtmcopy_premium_active').select('*').eq('id', rowId).maybeSingle()
    if (error || !row) return NextResponse.json({ error: error?.message ?? 'linha não encontrada' }, { status: 404 })
    if (b.tipo === 'premium_encerrar') {
      const evento = b.evento === 'target_final' ? 'target_final' : 'closed'
      await encerrarRegisto(admin, row as never, evento, (b.patch as Record<string, unknown>) ?? {})
      return NextResponse.json({ success: true })
    }
    if (b.tipo === 'premium_saida') {
      const a = (b.args ?? {}) as { positionId: string; nivel: number; fraccao: number; preco: number; fechouTudo: boolean }
      await registarSaida(admin, row as never, { accountId: String(b.accountId ?? row.account_id), ...a })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: `tipo desconhecido: ${b.tipo}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
