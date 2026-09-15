import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { criarRota, lerConfig } from '@/lib/copia-contas/servidor/rotas'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * CÓPIA ENTRE AS MINHAS CONTAS — o lado do cliente, só leitura + pedido.
 *
 *   GET                                        → as minhas rotas (estado, modo, config) e os últimos
 *                                                eventos (símbolo, direcção, lote — nunca valores em dinheiro)
 *   POST { origem_ref, destino_ref, modo_lote?, valor?, filtro_simbolos?, ... }
 *                                              → PEDIDO (estado 'pedido', inactivo, sombra). O admin aprova.
 *
 * Nesta entrega o cliente não liga nem desliga nada: sem interruptores do lado dele.
 */

const db = getSupabaseAdmin()
const MAX_PEDIDOS_PENDENTES = 3

async function autenticar(request: NextRequest) {
  const h = request.headers.get('Authorization')
  if (!h?.startsWith('Bearer ')) return null
  const { data: { user }, error } = await db.auth.getUser(h.replace('Bearer ', ''))
  return error || !user ? null : user
}

export async function GET(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const { data: rotas, error } = await db
    .from('copia_rotas')
    .select('id, origem_tipo, origem_ref, destino_tipo, destino_ref, rotulo, modo_lote, valor, filtro_simbolos, filtro_direcao, lote_max, max_abertas, copiar_sl, copiar_tp, copiar_parciais, fechar_com_origem, ativa, modo, estado, notas, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ rotas: [], eventos: [], disponivel: false })
  const ids = (rotas ?? []).map((r) => r.id)
  const { data: eventos } = ids.length
    ? await db.from('copia_eventos').select('rota_id, tipo, payload, resultado, criado_em').in('rota_id', ids).order('criado_em', { ascending: false }).limit(20)
    : { data: [] }
  return NextResponse.json({
    disponivel: true,
    rotas: rotas ?? [],
    eventos: (eventos ?? []).map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>
      return { rotaId: e.rota_id, tipo: e.tipo, simbolo: p.symbol ?? null, direcao: p.direcao ?? null, volume: p.volume ?? null, resultado: e.resultado ?? 'pendente', em: e.criado_em }
    }),
  })
}

export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const { count } = await db.from('copia_rotas').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('estado', 'pedido')
  if ((count ?? 0) >= MAX_PEDIDOS_PENDENTES) {
    return NextResponse.json({ error: `Já tens ${count} pedidos à espera de aprovação.` }, { status: 429 })
  }
  // O cliente escolhe as contas e o lote; o resto fica com os valores prudentes por omissão.
  const permitido: Record<string, unknown> = {}
  for (const k of ['rotulo', 'modo_lote', 'valor', 'filtro_simbolos', 'filtro_direcao', 'lote_max', 'max_abertas', 'notas']) if (corpo[k] !== undefined) permitido[k] = corpo[k]
  const c = lerConfig(permitido)
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: c.status })
  const r = await criarRota({
    origemRef: String(corpo.origem_ref ?? ''), destinoRef: String(corpo.destino_ref ?? ''), config: c.config,
    criadoPor: user.id, pedidoPeloCliente: true, exigirDono: user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true, rota: { id: r.rota.id, estado: r.rota.estado }, message: 'Pedido enviado. A equipa revê e aprova — começa sempre em modo de teste (sem ordens).' })
}
