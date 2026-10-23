import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { RELAYS_CONHECIDOS, servicoDoRelay } from '@/lib/telegram/painel-logica'

/**
 * O PULSO dos relays MTProto da VPS (gmi-relay, fs-relay, pv-relay).
 *
 * Os relays não têm a chave do Supabase — e não devem ter: correm com a sessão PESSOAL do dono.
 * Falam com o site pelo mesmo segredo do relay-post (CRON_SECRET), e é o site que grava o pulso em
 * `servicos_pulso` (`telegram:<relay>`), a mesma tabela do mtm-vigias e do motor. O backoffice lê-a
 * em Gestão → Telegram. De 5 em 5 minutos, não a cada passagem, para não pagar invocações à toa.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { relay?: string; versao?: string; host?: string; rotas?: unknown; erro?: string }
  const relay = String(body.relay ?? '')
  if (!RELAYS_CONHECIDOS.includes(relay)) return NextResponse.json({ ok: false, error: 'relay desconhecido' }, { status: 400 })

  const rotas = (Array.isArray(body.rotas) ? body.rotas : []).slice(0, 30).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    return {
      nome: String(o.nome ?? '').slice(0, 60),
      fonte: String(o.fonte ?? '').slice(0, 40),
      destino: String(o.destino ?? '').slice(0, 40),
      lastId: Number(o.last_id) || 0,
      publicadas: Number(o.publicadas) || 0,
      erro: o.erro ? String(o.erro).slice(0, 300) : null,
      activa: o.activa !== false,
    }
  })
  const { error } = await getSupabaseAdmin()
    .from('servicos_pulso')
    .upsert(
      {
        servico: servicoDoRelay(relay),
        host: body.host ? String(body.host).slice(0, 80) : null,
        versao: body.versao ? String(body.versao).slice(0, 40) : null,
        estado: { rotas, erro: body.erro ? String(body.erro).slice(0, 300) : null },
        em: new Date().toISOString(),
      },
      { onConflict: 'servico' },
    )
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
