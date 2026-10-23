import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cancelarOrdem, darOrdem, listarOrdens } from '@/lib/agentes/ordens'

/**
 * AS ORDENS DO DONO — o painel (Gestão → Agentes → Ordens). O chat IA da Gestão usa a mesma
 * camada pela ferramenta `dar_ordem_agente`; o motor do AIOS lê-as e responde pela rota do motor.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const agenteId = request.nextUrl.searchParams.get('agente') || undefined
  const [{ data: agentes, error }, ordens] = await Promise.all([
    db.from('agentes_equipa').select('id, nome, pilar, estado, pausado').order('pilar').order('criado_em'),
    listarOrdens(db, { agenteId, limite: 200 }),
  ])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (ordens.erro) return NextResponse.json({ ok: false, error: `${ordens.erro} (a migração 207 já foi aplicada?)` }, { status: 500 })
  return NextResponse.json({ ok: true, agentes: agentes ?? [], ordens: ordens.ordens })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.acao === 'dar') {
    const r = await darOrdem(db, { agente: String(body.agente ?? ''), texto: String(body.texto ?? ''), origem: 'painel', por: 'dono' })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 })
    return NextResponse.json({ ok: true, ordem: r.ordem, porque: `Ordem enviada a «${r.agente}». Chega-lhe no próximo ciclo.` })
  }
  if (body.acao === 'cancelar') {
    const r = await cancelarOrdem(db, String(body.id ?? ''))
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 })
    return NextResponse.json({ ok: true, porque: 'Ordem cancelada.' })
  }
  return NextResponse.json({ ok: false, error: 'Acção desconhecida.' }, { status: 400 })
}
