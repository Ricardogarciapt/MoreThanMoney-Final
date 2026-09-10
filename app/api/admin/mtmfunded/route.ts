import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmFundedConfig, setMtmFundedConfig } from '@/lib/mtmfunded/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Estado do MTM Funded e dos torneios, para o painel de admin. */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const config = await getMtmFundedConfig()

  const { data: torneios } = await db
    .from('mtm_tournaments')
    .select('id, slug, nome, estado, publicado, comeca_em, acaba_em')
    .order('comeca_em', { ascending: false })

  const contagens = new Map<string, number>()
  for (const t of torneios ?? []) {
    const { count } = await db
      .from('mtm_tournament_participants')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
    contagens.set(t.id as string, count ?? 0)
  }

  const contarContas = async (estado?: string) => {
    let q = db.from('mtm_trading_accounts').select('id', { count: 'exact', head: true })
    if (estado) q = q.eq('estado', estado)
    const { count } = await q
    return count ?? 0
  }
  const contarFila = async (estado: string) => {
    const { count } = await db
      .from('mtm_account_requests').select('id', { count: 'exact', head: true }).eq('estado', estado)
    return count ?? 0
  }
  const { count: certificados } = await db
    .from('mtm_certificates').select('id', { count: 'exact', head: true })

  return NextResponse.json({
    config,
    torneios: (torneios ?? []).map((t) => ({ ...t, participantes: contagens.get(t.id as string) ?? 0 })),
    contas: {
      total: await contarContas(),
      porEmitir: await contarContas('pedida'),
      ativas: await contarContas('ativa'),
      quebradas: await contarContas('quebrada'),
    },
    fila: { emFila: await contarFila('em_fila'), erro: await contarFila('erro') },
    certificados: certificados ?? 0,
  })
}

/**
 * Acções do painel.
 *
 * Cada uma é explícita: nada de um patch genérico que aceite qualquer campo. Um endpoint de
 * admin que escreve o que lhe mandarem é um endpoint que um dia escreve o que não devia.
 */
export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const b = await request.json().catch(() => ({}))
  const db = getSupabaseAdmin()

  // ── interruptores ────────────────────────────────────────────────────────
  if (typeof b?.ativo === 'boolean' || typeof b?.vendas_abertas === 'boolean') {
    const config = await setMtmFundedConfig({
      ...(typeof b.ativo === 'boolean' ? { ativo: b.ativo } : {}),
      ...(typeof b.vendas_abertas === 'boolean' ? { vendas_abertas: b.vendas_abertas } : {}),
    })
    return NextResponse.json({ ok: true, config })
  }

  const torneioId = String(b?.torneioId ?? '').trim()
  if (!torneioId) return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })

  // ── publicar ─────────────────────────────────────────────────────────────
  if (b?.publicar === true) {
    await db.from('mtm_tournaments').update({ publicado: true, updated_at: new Date().toISOString() }).eq('id', torneioId)
    return NextResponse.json({ ok: true })
  }

  // ── mudar de estado ──────────────────────────────────────────────────────
  const ESTADOS = ['draft', 'inscricoes', 'a_decorrer', 'terminado', 'cancelado']
  if (typeof b?.estado === 'string' && ESTADOS.includes(b.estado)) {
    await db.from('mtm_tournaments').update({ estado: b.estado, updated_at: new Date().toISOString() }).eq('id', torneioId)
    return NextResponse.json({ ok: true })
  }

  // ── certificados ─────────────────────────────────────────────────────────
  if (b?.emitirCertificados === true) {
    const { emitirCertificadosDoTorneio } = await import('@/lib/mtmfunded/emitir-certificados')
    const r = await emitirCertificadosDoTorneio(torneioId, { enviarEmail: true })
    return NextResponse.json({ ok: true, ...r })
  }

  return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
}
