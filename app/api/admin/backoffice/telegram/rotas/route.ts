import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { PALAVRA_PREMIUM, tocaPremium, validarRota, type RotaGuardada } from '@/lib/telegram/rotas'

export const dynamic = 'force-dynamic'

/**
 * GESTÃO → TELEGRAM → FORWARDER: criar, editar, pausar e apagar as rotas do gmi-relay.
 * O relay apanha a mudança em até 2 min (ver services/gmi-relay/relay.py, ROTAS_SEC).
 * Mexer numa rota que publica na Premium pede a palavra PREMIUM: esse destino executa nas contas
 * dos clientes.
 */
const TABELA = 'telegram_rotas'

export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const { data, error } = await getSupabaseAdmin().from(TABELA).select('*').order('criado_em')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rotas: data as RotaGuardada[] })
}

const semPalavra = () => NextResponse.json({ error: `Esta rota publica na Premium, que executa nas contas dos clientes. Confirma com ${PALAVRA_PREMIUM}.` }, { status: 409 })

export async function POST(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarRota(body)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  if (tocaPremium(v.rota.destino) && body.palavra !== PALAVRA_PREMIUM) return semPalavra()
  const { data, error } = await getSupabaseAdmin()
    .from(TABELA)
    .insert({ ...v.rota, relay: 'gmi-relay', so_novas: true, criado_por: g.userId })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Já há uma rota com esse nome.' : error.message }, { status: 400 })
  return NextResponse.json({ rota: data })
}

export async function PATCH(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id ?? '')
  const db = getSupabaseAdmin()
  const { data: actual } = await db.from(TABELA).select('*').eq('id', id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Rota não encontrada.' }, { status: 404 })
  // O nome é a chave do state no relay (last_id): mudá-lo republicava o histórico. Fica fixo.
  const v = validarRota({ ...actual, ...body, nome: actual.nome })
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  if ((tocaPremium(v.rota.destino) || tocaPremium(actual.destino)) && body.palavra !== PALAVRA_PREMIUM) return semPalavra()
  const { data, error } = await db.from(TABELA).update({ ...v.rota, actualizado_em: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ rota: data })
}

export async function DELETE(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const palavra = request.nextUrl.searchParams.get('palavra')
  const db = getSupabaseAdmin()
  const { data: actual } = await db.from(TABELA).select('destino').eq('id', id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Rota não encontrada.' }, { status: 404 })
  if (tocaPremium(actual.destino) && palavra !== PALAVRA_PREMIUM) return semPalavra()
  const { error } = await db.from(TABELA).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
