import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { RELAYS_CONHECIDOS } from '@/lib/telegram/painel-logica'
import { rotaParaRelay, type RotaGuardada } from '@/lib/telegram/rotas'

export const dynamic = 'force-dynamic'

/**
 * As rotas que o relay da VPS deve correr, tal como estão em Gestão → Telegram → Forwarder.
 * Mesmo segredo do relay-post (CRON_SECRET). Se a leitura falhar devolve ok:false, e o relay fica
 * com as rotas que já tinha — uma falha aqui nunca pode desligar uma rota.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const relay = req.nextUrl.searchParams.get('relay') ?? 'gmi-relay'
  if (!RELAYS_CONHECIDOS.includes(relay)) return NextResponse.json({ ok: false, error: 'relay desconhecido' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().from('telegram_rotas').select('*').eq('relay', relay).order('criado_em')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rotas: (data as RotaGuardada[]).map(rotaParaRelay) })
}
